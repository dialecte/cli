/**
 * What `ask verdict` records of an answered round (section 9): the fact drafted from what was agreed, a `--decision`
 * ask's answer held inside the definition's boundary (D29, the conflict flagged), recorded in the ledger.
 */
import { boundedAnswerOf } from '../lib/knowledge/ask/boundary-of.ts'
import { factDraftOf } from '../lib/knowledge/ask/fact-draft-of.ts'
import { ladderCheckOf } from '../lib/knowledge/ask/ladder-check-of.ts'
import { reaskComparisonOf } from '../lib/knowledge/ask/reask-comparison-of.ts'
import {
	readAnsweringMarker,
	recordedFactOfKey,
	writeAnsweringMarker,
} from '../lib/knowledge/ask/recorded-fact-of-ask.ts'
import { requestSubjectOf } from '../lib/knowledge/ask/request-subject-of.ts'
import { factKeyOf } from '../lib/knowledge/facts/fact-key.ts'
import { readFactOrUndefined } from '../lib/knowledge/facts/record-fact.ts'
import { recordFact } from '../lib/knowledge/facts/record-fact.ts'
import { acceptedOf } from './ask-verdict-check.ts'
import { PENDING_FACT_ID, REASK_DIFFERS_REASON } from './ask.constants.ts'

import type {
	Agreed,
	OutsideCite,
	OutsideFactSources,
	RoundOutcome,
} from '../lib/knowledge/ask/ask.types.ts'
import type { Fact, FactDraft, FactSubject } from '../lib/knowledge/facts/facts.types.ts'
import type { ModelTierName } from '../lib/models/model-tiers.types.ts'
import type {
	CheckedReportFile,
	ReaskOutcomeOfParams,
	RecordedAnswer,
	RecordedAnswerOfParams,
	VerdictRound,
	VerdictSetup,
} from './ask.types.ts'

/**
 * Records the agreed answer of a round as a fact (K2b's `recordFact`): a standard fact by the folders' files keys,
 * or an unchecked outside fact by its sources; on a `--decision` ask the answer held by the live boundary, the
 * conflict naming the fact recorded. A fact an earlier run of the round recorded for the ask is answered as it is,
 * nothing recorded anew (R1-4). Answers the fact's id, the conflict and whether this run recorded it.
 */
export function recordedAnswerOf(params: RecordedAnswerOfParams): RecordedAnswer {
	const { opened, setup } = params
	const { request } = opened
	const draft = factDraftOf({
		ask: opened.ask,
		request,
		subject: factSubjectOf({ opened, setup }),
		agreed: params.agreed,
		outside: setup.pool === null ? outsideSourcesOf({ params }) : null,
		standards: setup.pool?.standard.folders ?? [],
		// the readers' rounds only: the adjudicator's round is said by `adjudicator: true` (D39)
		rounds: opened.rounds.filter((round) => round.pack !== null).length,
		adjudicator: opened.adjudicator !== null,
		tiers: agreeingTiersOf({ agreed: params.agreed, checked: params.checked }),
	})
	const bounded = boundedDraftOf({ draft, setup, decision: request.decision })
	const folder = setup.setup.factsFolder
	const roundFolder = opened.round.folder
	// a retry after a crash between the fact and verdict.json closes the round on that fact, found by the round's
	// marker only (R1-4, R2-2)
	const key = readAnsweringMarker({ roundFolder })?.key ?? null
	const earlier =
		key === null
			? undefined
			: recordedFactOfKey({ folder, ask: opened.ask, lot: params.place.lotName, key })
	const fact = earlier ?? recordedFactIdOf({ params, draft: bounded.draft, folder, roundFolder })
	return {
		fact,
		conflict: bounded.conflict === null ? null : { ...bounded.conflict, fact },
		recordedNow: earlier === undefined,
	}
}

/**
 * Records the draft (K2b's `recordFact`) once the round's `answering` marker names its key (R1-4: a crash after the
 * record leaves the marker, and a retry finds the fact by it); answers the fact's id.
 */
function recordedFactIdOf(params: {
	params: RecordedAnswerOfParams
	draft: FactDraft
	folder: string
	roundFolder: string
}): string {
	const { draft, folder } = params
	const { opened, setup, place, now } = params.params
	writeAnsweringMarker({
		roundFolder: params.roundFolder,
		ask: opened.ask,
		round: opened.round.round,
		nonces: [],
		key: factKeyOf({
			question: draft.question,
			subject: draft.subject,
			kind: draft.kind,
			package: draft.subject.package,
		}),
	})
	return recordFact({
		folder,
		draft,
		lot: place.lotName,
		ask: opened.ask,
		check: ladderCheckOf({ setup: setup.setup }),
		now: now ?? setup.setup.now,
	}).id
}

/**
 * A re-ask's agreed answer held against the unchecked fact it re-asks (R2-1, D43 1): `agrees` leaves the round
 * answered (its fact supersedes the unchecked one); `shown` (another answer, or the fact is a person's) records
 * nothing: the person is next (`reask-differs`), the readers' answer kept in the outcome (the re-asked fact's stays
 * in the ledger; neither goes in the person's question, J-9). Any other round, or a re-asked fact the ledger no longer
 * holds, is left as it is.
 */
export function reaskOutcomeOf(params: ReaskOutcomeOfParams): RoundOutcome {
	const { opened, outcome } = params
	const reask = opened.record.reask
	if (outcome.state !== 'answered' || reask === undefined) return outcome
	const current = readFactOrUndefined({ folder: params.setup.setup.factsFolder, id: reask })
	if (current === undefined) return outcome
	const comparison = reaskComparisonOf({
		current: current.answer,
		agreed: outcome.agreed,
		kind: opened.request.kind,
	})
	if (comparison === 'agrees') return outcome
	return { state: 'needs-person', reason: REASK_DIFFERS_REASON, agreed: outcome.agreed }
}

/** The tiers of the agreeing readers' models (R1-19): each named once, sorted; none when no report names one. */
function agreeingTiersOf(params: {
	agreed: Agreed
	checked: CheckedReportFile[]
}): ModelTierName[] {
	const tiers = acceptedOf({ checked: params.checked })
		.filter((report) => params.agreed.letters.includes(report.letter))
		.flatMap((report) => (report.report.tier === undefined ? [] : [report.report.tier]))
	return [...new Set(tiers)].sort()
}

/**
 * The draft of a `--decision` ask held inside the definition's boundary read live (D29): a list restricted to it, a
 * yes/no or a value the boundary rejects replaced by its own, the conflict flagged; any other draft as it is.
 */
function boundedDraftOf(params: { draft: FactDraft; setup: VerdictSetup; decision: boolean }): {
	draft: FactDraft
	conflict: RecordedAnswer['conflict']
} {
	const { draft, setup } = params
	const { read, definition } = setup
	if (!params.decision || read === null || definition === null) return { draft, conflict: null }
	// the fact is not numbered yet: the conflict names it once recorded
	const fact: Fact = {
		...draft,
		id: PENDING_FACT_ID,
		key: '',
		at: '',
		state: 'valid',
		supersedes: null,
		supersededBy: null,
	}
	const bounded = boundedAnswerOf({ fact, read, boundary: definition })
	return { draft: { ...draft, answer: bounded.answer }, conflict: bounded.conflict }
}

/** The subject the fact is keyed by: the ask's recorded subject (a re-ask's rebuilt one), else its request's. */
function factSubjectOf(params: { opened: VerdictRound; setup: VerdictSetup }): FactSubject {
	const { opened, setup } = params
	return requestSubjectOf({
		request: opened.request,
		recorded: setup.pool?.record.subject ?? opened.record.subject,
	})
}

/** What the agreeing outside readers rested on: each one's source with the urls it cited, and the web cites. */
function outsideSourcesOf(params: {
	params: { agreed: Agreed; checked: CheckedReportFile[] }
}): OutsideFactSources {
	const { agreed, checked } = params.params
	const agreeing = acceptedOf({ checked }).filter((report) =>
		agreed.letters.includes(report.letter),
	)
	const sources: OutsideFactSources['sources'] = []
	const cites: OutsideCite[] = []
	for (const { report } of agreeing) {
		if (!('source' in report)) continue
		const reportCites = report.claims.flatMap((claim) => claim.cites)
		sources.push({ source: report.source, urls: reportCites.map((cite) => cite.url) })
		cites.push(...reportCites)
	}
	return { sources, cites }
}
