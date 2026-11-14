import { explainCode } from '../../run/explain-code.ts'
import { factKeyOf } from '../facts/fact-key.ts'
import { recordFact } from '../facts/record-fact.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { anglesOf } from './angles-of.ts'
import { answerFromDialecte } from './answer-from-dialecte.ts'
import { answerFromFacts } from './answer-from-facts.ts'
import { answerRungOne, rungOneRefusalOf } from './answer-rung-one.ts'
import { AskRefusal } from './ask-refusal.ts'
import {
	NAME_SEPARATOR,
	NO_STANDARD_WITH_DOCUMENTS,
	RUNG_ONE_FACT_SOURCE,
	RUNG_TWO_FACT_SOURCE,
} from './ask.constants.ts'
import { boundaryOf, boundedAnswerOf } from './boundary-of.ts'
import { ladderCheckOf } from './ladder-check-of.ts'
import { aboutOf, parseSubject } from './parse-subject.ts'
import { readQuestion } from './read-question.ts'
import { slicesOf } from './slices-of.ts'
import { vocabularyOfSetup } from './vocabulary-of-setup.ts'

import type { ExplainedCode } from '../../run/explain-code.types.ts'
import type {
	FactCheck,
	FactSourceKind,
	FactSubject,
	HistoryLineContext,
} from '../facts/facts.types.ts'
import type {
	AskCandidate,
	AskOutcome,
	AskSubject,
	ReadQuestion,
	RungAnswer,
	RungTiming,
	RunLadderParams,
} from './ask.types.ts'

/**
 * Runs the answer ladder: rung 0 (a fact of the key), rung 1 (the definition), rung 2 (the catalogues and the api
 * indexes), then angles and slices over the documents (rung 3) when nothing answered. A rung-1 or rung-2 answer is
 * recorded as a fact at the ask's effort unless `noFacts`. Past rung 2: `personOnly` goes to the person
 * (`needs-person`); without documents the ladder stops at rung 2 on the outside route (`needs-readers`, `source:
 * 'outside'`, the angles kept, no slice). On a `--decision` ask the definition is read live as the boundary (D29): a
 * schema fact of the key is a candidate only, a prose fact answers within the boundary, and one naming what the
 * boundary rejects is restricted to it (or takes its answer) with a standard-vs-XSD conflict. Throws an `AskRefusal` when the question cannot be read, or when
 * `noStandard` is asked while the dialecte's documents are readable (what failed, where, the fix).
 */
export function runLadder(params: RunLadderParams): AskOutcome {
	const { request, setup } = params
	const { standard } = setup
	const { subject, read } = readLadderQuestion({ request, setup })
	const { kind, context } = read
	// D29: the definition read live as the boundary of a --decision ask (a read, never an answer: Q5)
	const boundary = boundaryOf({ request, read, setup })
	// the rung timing seam (D24): each rung run is reported once it ends, with the time since the previous one ended
	let rungStarted = performance.now()
	function rungRan(rung: RungTiming['rung']): void {
		const ended = performance.now()
		params.onRung?.({ rung, durationMs: Math.round(ended - rungStarted) })
		rungStarted = ended
	}
	const factSubject = factSubjectOf({ subject, read })
	const check = ladderCheckOf({ setup })
	const history: HistoryLineContext = {
		at: (setup.now ?? currentTime)().toISOString(),
		lot: params.lot,
		ask: params.ask,
	}
	function outcomeOf(
		changes: Pick<AskOutcome, 'rung' | 'state' | 'answer' | 'fact'> & Partial<AskOutcome>,
	): AskOutcome {
		return {
			subject: factSubject,
			kind,
			decision: context.decision,
			context,
			candidates: [],
			methods: [],
			angles: [],
			slices: [],
			source: null,
			boundary,
			conflict: null,
			...changes,
		}
	}

	let candidates: AskCandidate[] = []
	if (!request.noFacts) {
		const reused = answerFromFacts({
			folder: setup.factsFolder,
			key: factKeyOf({
				question: request.question,
				subject: factSubject,
				kind,
				package: factSubject.package,
			}),
			effort: request.effort,
			check,
			context: history,
			decision: request.decision,
		})
		rungRan(0)
		if (reused.answer !== undefined) {
			const bounded =
				boundary === null
					? { answer: reused.answer.answer, conflict: null }
					: boundedAnswerOf({ fact: reused.answer, read, boundary })
			return outcomeOf({
				rung: 0,
				state: 'answered',
				answer: bounded.answer,
				fact: reused.answer.id,
				conflict: bounded.conflict,
			})
		}
		candidates = reused.candidates
	}

	const rungOne = answerRungOne({ read, setup })
	if (rungOne !== undefined && 'refused' in rungOne) throw new AskRefusal(rungOne.refused)
	if (rungOne !== undefined) {
		const fact = recordedFactOf({ params, read, factSubject, answered: rungOne, rung: 1, check })
		rungRan(1)
		return outcomeOf({ rung: 1, state: 'answered', answer: rungOne.answer, fact, candidates })
	}
	rungRan(1)

	const rungTwo = answerFromDialecte({
		kind,
		slots: read.slots,
		request: {
			question: request.question,
			packageName: context.package ?? request.packageName,
		},
		setup,
	})
	if (rungTwo !== undefined && 'answer' in rungTwo) {
		const fact = recordedFactOf({ params, read, factSubject, answered: rungTwo, rung: 2, check })
		rungRan(2)
		return outcomeOf({ rung: 2, state: 'answered', answer: rungTwo.answer, fact, candidates })
	}
	const methods = rungTwo?.methods ?? []
	rungRan(2)
	if (request.personOnly)
		return outcomeOf({
			rung: 2,
			state: 'needs-person',
			answer: null,
			fact: null,
			candidates,
			methods,
		})

	// without documents (or with --no-standard and none) the angles read no index: the outside readers get them
	const indexes = standard.kind === 'documents' ? standard.indexes : []
	const angles = anglesOf({
		subject,
		context,
		kind,
		question: request.question,
		dialecte: read.dialecte,
		methods,
		explained: explainedOf({ read, setup }),
		standard: indexes,
	})
	if (standard.kind === 'none')
		return outcomeOf({
			rung: 2,
			state: 'needs-readers',
			answer: null,
			fact: null,
			candidates,
			methods,
			angles,
			source: 'outside',
		})

	const slices = slicesOf({
		question: request.question,
		angles,
		indexes: standard.indexes,
		about: factSubject.tags[0]?.tag,
		questionAbout: aboutOf({ about: request.about }).tag?.tag,
		limit: request.limit,
	})
	rungRan(3)
	return outcomeOf({
		rung: 3,
		state: 'needs-readers',
		answer: null,
		fact: null,
		candidates,
		methods,
		angles,
		slices,
		source: 'documents',
	})
}

/**
 * The question read as the ladder reads it, before any rung runs: its subject, kind and context. Throws the
 * `AskRefusal` the ladder would (an unreadable question, an attribute the element lacks, `noStandard` while the
 * dialecte's documents are readable), so a command refuses before it makes the ask's folder.
 */
export function readLadderQuestion(params: Pick<RunLadderParams, 'request' | 'setup'>): {
	subject: AskSubject
	read: ReadQuestion
} {
	const { request, setup } = params
	const { standard } = setup
	if (request.noStandard && standard.kind === 'documents')
		throw new AskRefusal(
			fillMessage({
				template: NO_STANDARD_WITH_DOCUMENTS,
				values: { folders: standard.folders.map((folder) => folder.id).join(NAME_SEPARATOR) },
			}),
		)
	const subject = parseSubject({
		question: request.question,
		vocabulary: vocabularyOfSetup({ setup }),
		about: request.about,
		code: request.code,
		method: request.method,
	})
	const read = readQuestion({
		question: request.question,
		subject,
		kind: request.kind,
		packageName: request.packageName,
		decision: request.decision,
		setup,
	})
	if ('refused' in read) throw new AskRefusal(read.refused)
	// rung 1's own refusal is read here, before rung 0: a fact keyed to a question rung 1 refuses never answers it
	const rungOneRefusal = rungOneRefusalOf({ read })
	if (rungOneRefusal !== undefined) throw new AskRefusal(rungOneRefusal)
	return { subject, read }
}

/** The subject the fact key and the outcome name: the context's placed tags (parents folded, D5b) and its package. */
function factSubjectOf(params: { subject: AskSubject; read: ReadQuestion }): FactSubject {
	const { subject, read } = params
	const { context } = read
	return {
		package: context.package,
		tags:
			context.tags.length > 0
				? context.tags.map((entry) => ({ tag: entry.tag, parent: entry.parent }))
				: subject.tags,
		attributes: subject.attributes,
		codes: subject.codes,
		methods: subject.methods,
	}
}

/** The id of the fact a rung's answer is recorded as, at the ask's effort; null when the ask records nothing. */
function recordedFactOf(params: {
	params: RunLadderParams
	read: ReadQuestion
	factSubject: FactSubject
	answered: RungAnswer
	rung: 1 | 2
	check: FactCheck
}): string | null {
	const { request, setup, ask, lot } = params.params
	if (request.noFacts) return null
	const source: FactSourceKind = params.rung === 1 ? RUNG_ONE_FACT_SOURCE : RUNG_TWO_FACT_SOURCE
	return recordFact({
		folder: setup.factsFolder,
		draft: {
			question: request.question,
			subject: params.factSubject,
			kind: params.read.kind,
			answer: params.answered.answer,
			source,
			effort: request.effort,
			evidence: [],
			by: { rung: params.rung },
			sources: params.answered.sources,
		},
		lot,
		ask,
		check: params.check,
		now: setup.now,
	}).id
}

/** The catalogue entries of the code a code question names (the `code` angle reads their messages). */
function explainedOf(params: {
	read: ReadQuestion
	setup: RunLadderParams['setup']
}): ExplainedCode[] {
	const { code } = params.read.slots
	if (params.read.kind !== 'code' || code === undefined) return []
	return explainCode({ code, catalogues: params.setup.catalogues })
}

/** The clock of a real ask. */
function currentTime(): Date {
	return new Date()
}
