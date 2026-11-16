/**
 * What `ask verdict` does with the reports of the open round: the setup and documents reloaded as the ask read them,
 * each report checked against what its reader was given (section 7), each accepted nonce claimed (D7), and what the
 * round came to at the ask's effort (section 8, 18).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { adjudicatorOutcomeOf } from '../lib/knowledge/ask/adjudicator-outcome-of.ts'
import { askPoolOf } from '../lib/knowledge/ask/ask-pool-of.ts'
import { AskRefusal } from '../lib/knowledge/ask/ask-refusal.ts'
import {
	ADJUDICATOR_READER,
	NAME_SEPARATOR,
	READER_LINE_BUDGET,
	REPORT_REFUSAL_FAULTS,
	USED_NONCES_FOLDER,
} from '../lib/knowledge/ask/ask.constants.ts'
import { boundaryOf } from '../lib/knowledge/ask/boundary-of.ts'
import { briefSubjectOf } from '../lib/knowledge/ask/brief-subject-of.ts'
import { checkReport } from '../lib/knowledge/ask/check-report.ts'
import { claimNonce } from '../lib/knowledge/ask/claim-nonce.ts'
import { givenIdsOf, givenSliceOf } from '../lib/knowledge/ask/given-ranges-of.ts'
import { ladderRequestOf } from '../lib/knowledge/ask/ladder-request-of.ts'
import { loadAskSetup } from '../lib/knowledge/ask/load-ask-setup.ts'
import { outsideOutcomeOf } from '../lib/knowledge/ask/outside-outcome-of.ts'
import { rangeTextOf } from '../lib/knowledge/ask/range-text-of.ts'
import { isRecord } from '../lib/knowledge/ask/read-report-fields.ts'
import { readerSlicesOf } from '../lib/knowledge/ask/reader-slices-of.ts'
import { readAnsweringMarker } from '../lib/knowledge/ask/recorded-fact-of-ask.ts'
import { reportBodyHashOf } from '../lib/knowledge/ask/report-body-of.ts'
import { reportRefusal } from '../lib/knowledge/ask/report-refusal.ts'
import { roundOutcomeOf } from '../lib/knowledge/ask/round-outcome-of.ts'
import { readLadderQuestion } from '../lib/knowledge/ask/run-ladder.ts'
import { verifiedAnglesOf } from '../lib/knowledge/ask/verified-angles-of.ts'
import { vocabularyOfSetup } from '../lib/knowledge/ask/vocabulary-of-setup.ts'
import { factsFolderRefusal } from '../lib/knowledge/facts/data-folder.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { holdingClause } from '../lib/knowledge/standard/holding-clause.ts'
import { VERDICT_MESSAGES } from './ask.constants.ts'

import type {
	AcceptanceContext,
	AcceptedReport,
	CiteContext,
	GivenSlice,
	PoolSlice,
	PreviousRound,
	RangeText,
	RoundOutcome,
} from '../lib/knowledge/ask/ask.types.ts'
import type { StandardFileIndex } from '../lib/knowledge/standard/standard-index.types.ts'
import type {
	CheckedReportFile,
	RunAskVerdictParams,
	VerdictRound,
	VerdictSetup,
} from './ask.types.ts'

/**
 * The setup a verdict checks with (facts read: an answer is recorded), the documents rebuilt as the ask read them
 * (its pool, refused when a file changed since the ask), the question as the ladder reads it and the definition's
 * live answer on its subject and kind (D10, D29: the boundary of a `--decision` ask); or the refusal.
 */
export async function verdictSetupOf(params: {
	cwd: string
	environment: NodeJS.ProcessEnv
	opened: VerdictRound
	reindexPool?: RunAskVerdictParams['reindexPool']
}): Promise<VerdictSetup | { refused: string; exitCode: 1 | 2 }> {
	const { cwd, environment, opened } = params
	const { request } = opened
	const loaded = await loadAskSetup({
		cwd,
		environment,
		...(request.package === null ? {} : { packageName: request.package }),
		facts: true,
	})
	if ('refused' in loaded) return { refused: loaded.refused, exitCode: 2 }
	const factsRefusal = factsFolderRefusal({ folder: loaded.setup.factsFolder })
	if (factsRefusal !== undefined) return { refused: factsRefusal, exitCode: 2 }
	const pool = request.documents
		? await askPoolOf({ cwd, environment, request, record: opened.record, base: loaded.setup })
		: null
	if (pool !== null && 'refused' in pool) return pool
	const setup = {
		...loaded.setup,
		standard:
			pool === null
				? {
						kind: 'none' as const,
						name: request.standard?.name ?? null,
						key: request.standard?.key ?? null,
					}
				: pool.standard,
	}
	let read: VerdictSetup['read'] = null
	try {
		read = readLadderQuestion({ request: ladderRequestOf({ request }), setup }).read
	} catch (error) {
		if (!(error instanceof AskRefusal)) throw error
	}
	// the definition read live, whatever the flag: an outside agreement is held against it too (D10)
	const definition = read === null ? null : boundaryOf({ request: { decision: true }, read, setup })
	// the test seam: the pool as a search of another order would rebuild it (the pack's recorded ranges must not care)
	const reordered =
		pool === null || params.reindexPool === undefined
			? pool
			: { ...pool, pool: params.reindexPool(pool.pool) }
	return { setup, pool: reordered, read, definition }
}

/**
 * Each report file checked in the order given (section 7): against the slices its reader was given this round (the
 * adjudicator: its brief's ranges), the nonces issued and those already claimed, the sessions and bodies accepted
 * before it in this run. A file that does not read as JSON is refused `schema`.
 */
export function checkedReportsOf(params: {
	files: string[]
	opened: VerdictRound
	setup: VerdictSetup
	/** The nonces an earlier run of this round claimed under its `answering` marker (R1-4): this run's own. */
	own: string[]
}): CheckedReportFile[] {
	const { opened, setup } = params
	const acceptance = acceptanceOf({ opened, own: params.own })
	const subject = briefSubjectOf({
		request: opened.request,
		record: setup.pool?.record ?? opened.record,
	})
	const vocabulary = vocabularyOfSetup({ setup: setup.setup })
	return params.files.map(function checkedFileOf(file): CheckedReportFile {
		const value = reportValueOf({ file })
		if (value === undefined)
			return {
				file,
				letter: '',
				checked: reportRefusal({
					refused: 'schema',
					templates: [VERDICT_MESSAGES.unreadableReport],
					values: { file },
				}),
			}
		const letter = isRecord(value) && typeof value.reader === 'string' ? value.reader : ''
		const checked = checkReport({
			value,
			outside: !opened.request.documents,
			question: opened.request.question,
			subject,
			vocabulary,
			cites: citeContextOf({ opened, setup, letter }),
			acceptance,
		})
		if (checked.accepted)
			acceptance.accepted.push({
				session: checked.report.session,
				bodyHash: reportBodyHashOf({ report: checked.report }),
			})
		return { file, letter, checked }
	})
}

/** The parsed JSON of a report file; undefined when it cannot be read or does not parse. */
function reportValueOf(params: { file: string }): unknown {
	try {
		return JSON.parse(readFileSync(params.file, 'utf8')) as unknown
	} catch {
		return undefined
	}
}

/**
 * What a report of the round is accepted against: the ask, the round, the nonces issued and those claimed (less the
 * ones an earlier run of this round claimed before its `answering` marker, R1-4: its retry counts them as its own),
 * and the session and body of every report accepted in an earlier round of the ask (R1-7).
 */
function acceptanceOf(params: { opened: VerdictRound; own: string[] }): AcceptanceContext {
	const { opened, own } = params
	return {
		ask: opened.ask,
		round: opened.round.round,
		issued: issuedOf({ opened }).map((entry) => ({ reader: entry.letter, nonce: entry.nonce })),
		used: usedNoncesOf({ folder: opened.round.folder }).filter((nonce) => !own.includes(nonce)),
		accepted: earlierAcceptedOf({ opened }),
		web: opened.pack?.web ?? false,
	}
}

/** The letters and nonces the round issued: each reader's of its pack, or the adjudicator's of its brief. */
function issuedOf(params: { opened: VerdictRound }): { letter: string; nonce: string }[] {
	const { opened } = params
	const brief = opened.adjudicator
	if (brief !== null) return [{ letter: ADJUDICATOR_READER, nonce: brief.nonce }]
	return (opened.pack?.readers ?? []).map((reader) => ({
		letter: reader.letter,
		nonce: reader.nonce,
	}))
}

/**
 * The nonces an earlier run of this round claimed under the round's `answering` marker (R1-4), read before this run
 * writes its own: a retry counts them as its own, never as replayed.
 */
export function ownNoncesOf(params: { opened: VerdictRound }): string[] {
	const marker = readAnsweringMarker({ roundFolder: params.opened.round.folder })
	return marker?.ask === params.opened.ask ? marker.nonces : []
}

/** The session and body hash of each report accepted in an earlier round of the ask, as its verdict kept them (R1-7). */
function earlierAcceptedOf(params: { opened: VerdictRound }): AcceptanceContext['accepted'] {
	const { opened } = params
	return opened.rounds
		.filter((round) => round.round !== opened.round.round)
		.flatMap((round) => round.verdict?.reports ?? [])
		.flatMap(function keptOf(report): AcceptanceContext['accepted'] {
			if (!report.accepted || typeof report.bodyHash !== 'string') return []
			return [{ session: report.session ?? null, bodyHash: report.bodyHash }]
		})
}

/**
 * The refusal of a run that lacks a report file of a letter the round issued (R1-8: one file per letter, accepted or
 * refused, the letter its `reader` names, or declared `--missing`): the missing letters, nothing recorded, and the
 * way out (I-12): the same command with `--missing <L>` per letter; undefined when each letter has one.
 */
export function missingLettersOf(params: {
	opened: VerdictRound
	checked: CheckedReportFile[]
}): string | undefined {
	const { opened } = params
	const given = new Set(params.checked.map((entry) => entry.letter))
	const missing = issuedOf({ opened })
		.map((entry) => entry.letter)
		.filter((letter) => !given.has(letter))
	if (missing.length === 0) return undefined
	return fillMessage({
		template: VERDICT_MESSAGES.missingReports,
		values: {
			ask: opened.ask,
			round: String(opened.round.round),
			letters: missing.join(NAME_SEPARATOR),
			declared: missing
				.map((letter) =>
					fillMessage({ template: VERDICT_MESSAGES.missingFlag, values: { letter } }),
				)
				.join(VERDICT_MESSAGES.missingFlagSeparator),
		},
	})
}

/**
 * The readers declared with `--missing <L>` (I-12), each counted as that reader's report refused `missing`; or the
 * usage refusal of a letter the round gave no brief to, or one whose report file is given too.
 */
export function declaredMissingOf(params: {
	opened: VerdictRound
	checked: CheckedReportFile[]
	missing: string[]
}): CheckedReportFile[] | { usage: string } {
	const { opened } = params
	const issued = issuedOf({ opened }).map((entry) => entry.letter)
	const given = new Set(params.checked.map((entry) => entry.letter))
	const declared: CheckedReportFile[] = []
	for (const letter of new Set(params.missing)) {
		if (!issued.includes(letter))
			return {
				usage: fillMessage({
					template: VERDICT_MESSAGES.missingNotIssued,
					values: {
						letter,
						ask: opened.ask,
						round: String(opened.round.round),
						letters: issued.join(NAME_SEPARATOR),
					},
				}),
			}
		if (given.has(letter))
			return {
				usage: fillMessage({ template: VERDICT_MESSAGES.missingAndGiven, values: { letter } }),
			}
		declared.push({
			file: '',
			letter,
			checked: reportRefusal({
				refused: 'missing',
				templates: [VERDICT_MESSAGES.missingFault],
				values: { letter },
			}),
		})
	}
	return declared
}

/** The nonces claimed below a round's used folder (none while it is absent). */
function usedNoncesOf(params: { folder: string }): string[] {
	const used = join(params.folder, USED_NONCES_FOLDER)
	return existsSync(used) ? readdirSync(used) : []
}

/** What a reader's cites are checked against: the ask's manifest, the files now, the slices given to that reader. */
function citeContextOf(params: {
	opened: VerdictRound
	setup: VerdictSetup
	letter: string
}): CiteContext {
	const { opened, setup } = params
	const files = setup.pool?.files ?? new Map()
	const originals = setup.pool?.originalLines ?? new Map<string, string[]>()
	return {
		manifest: opened.request.standard?.files ?? [],
		current: setup.pool?.manifest ?? [],
		given: givenOf(params),
		rangeOf: function rangeOfCite({ file, from, to }): RangeText {
			const index = files.get(file)
			return index === undefined
				? { lines: [], counted: 0 }
				: rangeTextOf({ file: index, from, to, original: originals.get(file) ?? [] })
		},
	}
}

/** The slices given to a reader this round (the pack's ids in the rebuilt pool), or the adjudicator's ranges. */
function givenOf(params: {
	opened: VerdictRound
	setup: VerdictSetup
	letter: string
}): GivenSlice[] {
	const { opened, setup, letter } = params
	const files = setup.pool?.files ?? new Map()
	if (opened.adjudicator !== null)
		return opened.adjudicator.ranges.map((range) =>
			givenSliceOf({
				range: { id: '', ...range, clause: holdingClauseOf({ files, range }), linked: false },
				file: files.get(range.file),
			}),
		)
	const reader = opened.pack?.readers.find((candidate) => candidate.letter === letter)
	if (reader === undefined) return []
	// the ranges the pack recorded (I-6), never the pool rebuilt now
	return reader.ranges.map((range) => givenSliceOf({ range, file: files.get(range.file) }))
}

/** The number of the clause holding a range's first line in its file's index; null without one. */
function holdingClauseOf(params: {
	files: Map<string, StandardFileIndex>
	range: { file: string; from: number }
}): string | null {
	const file = params.files.get(params.range.file)
	return file === undefined
		? null
		: holdingClause({ headings: file.headings, line: params.range.from })
}

/**
 * The checked reports with each accepted nonce claimed (an exclusive create below the round's used folder, D7): a
 * nonce another run claimed first refuses its report `nonce`, never counted twice.
 */
export function claimedReportsOf(params: {
	opened: VerdictRound
	checked: CheckedReportFile[]
	/** The nonces an earlier run of this round claimed under its marker: already this run's (R1-4). */
	own: string[]
}): CheckedReportFile[] {
	const usedFolder = join(params.opened.round.folder, USED_NONCES_FOLDER)
	const { own } = params
	return params.checked.map(function claimedOf(entry): CheckedReportFile {
		const { checked } = entry
		if (!checked.accepted || own.includes(checked.report.nonce)) return entry
		if (claimNonce({ usedFolder, nonce: checked.report.nonce })) return entry
		return {
			...entry,
			checked: reportRefusal({
				refused: 'nonce',
				templates: [REPORT_REFUSAL_FAULTS.nonce],
				values: { reader: entry.letter },
			}),
		}
	})
}

/** The accepted reports of a run, each with the letter of its reader. */
export function acceptedOf(params: { checked: CheckedReportFile[] }): AcceptedReport[] {
	return params.checked.flatMap(({ checked, letter }) =>
		checked.accepted ? [{ ...checked, letter }] : [],
	)
}

/**
 * What the round came to: the adjudicator's report alone; the one outside round (every reader agrees, the
 * definition not contradicted); a readers' round at the effort, with what a further round would have left to give.
 */
export function verdictOutcomeOf(params: {
	opened: VerdictRound
	setup: VerdictSetup
	checked: CheckedReportFile[]
}): { outcome: RoundOutcome; verifiedAngles: string[] } {
	const { opened, setup, checked } = params
	const { request } = opened
	const accepted = acceptedOf({ checked })
	const verifiedAngles = verifiedAnglesOf({ accepted, slices: setup.pool?.pool ?? [] })
	const [first] = checked
	if (opened.adjudicator !== null && first !== undefined)
		return { outcome: adjudicatorOutcomeOf({ checked: first.checked }), verifiedAngles }
	if (setup.pool === null)
		return {
			outcome: outsideOutcomeOf({
				effort: request.effort,
				accepted,
				definitionAnswer: setup.definition?.answer ?? null,
				kind: request.kind,
			}),
			verifiedAngles,
		}
	const anythingLeft = !(
		'skipped' in
		readerSlicesOf({
			pool: setup.pool.pool,
			effort: request.effort,
			budget: READER_LINE_BUDGET,
			previous: previousRoundsOf({ opened, verifiedAngles, pool: setup.pool.pool }),
		})
	)
	return {
		outcome: roundOutcomeOf({
			effort: request.effort,
			round: opened.round.round,
			accepted,
			anythingLeft,
			outside: false,
			kind: request.kind,
		}),
		verifiedAngles,
	}
}

/** The readers' rounds as a next pack would read them, this one closed with the angles its cites came from. */
function previousRoundsOf(params: {
	opened: VerdictRound
	verifiedAngles: string[]
	pool: PoolSlice[]
}): PreviousRound[] {
	const { opened, pool } = params
	return opened.rounds.flatMap(function previousOf(round): PreviousRound[] {
		if (round.pack === null) return []
		return [
			{
				round: round.round,
				// the recorded ranges as ids of the pool now (I-8): the next pack reads the same
				given: round.pack.readers.map((reader) => ({
					letter: reader.letter,
					slices: givenIdsOf({ reader, pool }),
				})),
				verifiedAngles:
					round.round === opened.round.round
						? params.verifiedAngles
						: (round.verdict?.verifiedAngles ?? []),
			},
		]
	})
}
