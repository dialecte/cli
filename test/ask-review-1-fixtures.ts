/**
 * Shared by the review round 1 cases of the ask readers: the answer hook's input, a claim another process releases, a
 * documents ask kept with a lot and packed, an ask whose second round is open after a first that kept reports, the
 * fact an earlier crashed run left, and the report of a reader from what its brief holds.
 */
import { spawn } from 'node:child_process'
import { utimesSync } from 'node:fs'
import { join } from 'node:path'

import { factKeyOf } from '../src/lib/knowledge/facts/fact-key.ts'
import { recordFact } from '../src/lib/knowledge/facts/record-fact.ts'
import { CITED_FILE, CLAUSE_LINES, CLAUSE_SENTENCES } from './ask-answer-fixtures.constants.ts'
import { askedInLot, askedOverClausesInRounds } from './ask-answer-fixtures.ts'
import { FIRST_ASK, SECOND_ASK, SEMANTIC_QUESTION } from './ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	createDocumentsWorkspace,
	createLotAskWorkspace,
} from './ask-command-workspace.ts'
import { workspaceFactsFolder } from './ask-fix-1-fixtures.ts'
import { SETUP_NOW } from './ask-ladder-fixtures.constants.ts'
import {
	HAND_WRITTEN_AT,
	HAND_WRITTEN_NONCES,
	PACK_FILE,
	ROUND_ONE,
	ROUND_TWO,
} from './ask-pack-fixtures.constants.ts'
import {
	asksFolderOf,
	packedWith,
	rangesOfIds,
	roundFolderOf,
	writeRoundOne,
} from './ask-pack-fixtures.ts'
import {
	ANSWERING_FILE,
	FIRST_QUESTION,
	HOOK_STATION,
	RELEASE_CLAIM_PROGRAM,
} from './ask-review-1-fixtures.constants.ts'
import {
	CITED_LINE_MARKER,
	CLAIM_TEXT,
	SECOND_CLAUSE_MARKER,
	VERDICT_STANDARDS,
} from './ask-verdict-fixtures.constants.ts'
import { briefOf, briefsOf, reportOf } from './ask-verdict-fixtures.ts'
import { LOT_NAME } from './lot-stores.constants.ts'
import { DECLARED_NAME } from './standard-selection.constants.ts'
import { writeTextFile } from './standard-workspace.ts'

import type {
	DocumentReport,
	PackRecord,
	PoolSlice,
	VerdictReport,
} from '../src/lib/knowledge/ask/ask.types.ts'
import type { FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'
import type { AnswerHookInput } from '../src/lib/store/answer-hooks.types.ts'
import type { PackedInLot } from './ask-answer-fixtures.types.ts'
import type { AskedForPack } from './ask-pack-fixtures.types.ts'
import type {
	AcceptedEntryOfParams,
	HandReportOfParams,
	HookInputOfParams,
	PackedRoundTwo,
	PackedRoundTwoAfterParams,
	PartialRoundOne,
	ReaskedOverClausesParams,
	ReaskedPacked,
	RecordFactOfAskParams,
	ReleaseClaimLaterParams,
	WriteClaimWithStartParams,
} from './ask-review-1-fixtures.types.ts'
import type { ReportOfParams } from './ask-verdict-fixtures.types.ts'

/** What `lot answer` hands the answer hook once the person answered the question raised for an ask of the lot. */
export function hookInputOf(params: HookInputOfParams): AnswerHookInput {
	const { asked } = params
	return {
		lotFolder: asked.lotFolder,
		lot: LOT_NAME,
		question: {
			id: FIRST_QUESTION,
			audience: 'person',
			station: HOOK_STATION,
			text: `${asked.ask}: ${SEMANTIC_QUESTION}`,
			ask: asked.ask,
		},
		answer: {
			question: FIRST_QUESTION,
			answer: params.text,
			by: params.by,
			at: SETUP_NOW.toISOString(),
		},
	}
}

/** When this process started (ms since the epoch), as a claim of it records it. */
export function processStartMs(): number {
	return Date.now() - process.uptime() * 1000
}

/**
 * A claim as a process of `pid` that started at `startedAt` left it (the pid, then the start time in ms, one per
 * line), last written `ageMs` ago.
 */
export function writeClaimWithStart(params: WriteClaimWithStartParams): void {
	writeTextFile({ path: params.path, text: `${params.pid}\n${params.startedAt}\n` })
	const written = new Date(Date.now() - params.ageMs)
	utimesSync(params.path, written, written)
}

/** The same slices as a search of another order rebuilds them: the first two exchange their ids. */
export function swapPoolIds(pool: PoolSlice[]): PoolSlice[] {
	const [first, second, ...rest] = pool
	if (first === undefined || second === undefined) return pool
	return [{ ...first, id: second.id }, { ...second, id: first.id }, ...rest]
}

/** Starts a process that removes the claim file after `afterMs`; the process ends when it has. */
export function releaseClaimLater(params: ReleaseClaimLaterParams): void {
	spawn(process.execPath, ['-e', RELEASE_CLAIM_PROGRAM, params.path, String(params.afterMs)], {
		stdio: 'ignore',
	})
}

/** An ask over the documents of a store lot whose first round is open: asked, packed, each brief read. */
export async function packedInLot(): Promise<PackedInLot> {
	const asked = await askedInLot({ documents: true, exitCode: 3 })
	await packedWith({
		workspace: asked.workspace,
		argv: [asked.ask, ...asked.lotArgv],
		exitCode: 0,
	})
	return { ...asked, briefs: briefsOf({ asked }) }
}

/** The report of a verdict that kept an accepted report: its letter, its session and the hash of its body. */
export function acceptedEntryOf(params: AcceptedEntryOfParams): VerdictReport {
	return {
		letter: params.letter,
		accepted: true,
		claims: [],
		session: params.session,
		bodyHash: params.bodyHash,
	}
}

/**
 * An ask over two clauses whose first round gave the first slice only and kept `reports` in its verdict (written by
 * hand), and whose second round is open (packed for real): the briefs of the second round read.
 */
export async function packedRoundTwoAfter(
	params: PackedRoundTwoAfterParams,
): Promise<PackedRoundTwo> {
	const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })
	writeRoundOne({ asked, given: 'first', reports: params.reports })
	return { packed: { ...asked, briefs: briefsOf({ asked, round: ROUND_TWO }) }, roundOneClause }
}

/** The clause a reader's slices of the open round hold: the second when a line of them says so, else the first. */
export function clauseHeldBy(params: ReportOfParams): 'first' | 'second' {
	const brief = briefOf({ packed: params.packed, letter: params.letter })
	const holdsSecond = brief.slices.some((slice) =>
		slice.lines.some(
			(line) => line.text.includes(SECOND_CLAUSE_MARKER) && line.text.includes(CITED_LINE_MARKER),
		),
	)
	return holdsSecond ? 'second' : 'first'
}

/** The report of a reader that cites the clause its own brief holds (a reader given one clause only cites it). */
export function reportOfHeldClause(params: ReportOfParams): DocumentReport {
	return reportOf({ ...params, clause: clauseHeldBy(params) })
}

/** The marker a person's answer publishes before it records (`<ask>/answering.json`), naming the key of the draft. */
export function writePersonMarker(params: RecordFactOfAskParams): void {
	const { draft, asked } = params
	writeTextFile({
		path: join(asked.asksFolder, asked.ask, ANSWERING_FILE),
		text: `${JSON.stringify({
			schema: 1,
			ask: asked.ask,
			key: factKeyOf({
				question: draft.question,
				subject: draft.subject,
				kind: draft.kind,
				package: draft.subject.package,
			}),
		})}\n`,
	})
}

/** The marker a verdict publishes in its round before it records, naming the key of the draft (none claimed yet). */
export function writeRoundMarker(params: { packed: AskedForPack; draft: FactDraft }): void {
	const { packed, draft } = params
	writeTextFile({
		path: join(roundFolderOf({ asked: packed, round: ROUND_ONE }), ANSWERING_FILE),
		text: `${JSON.stringify({
			schema: 1,
			ask: packed.ask,
			round: 1,
			nonces: [],
			key: factKeyOf({
				question: draft.question,
				subject: draft.subject,
				kind: draft.kind,
				package: draft.subject.package,
			}),
		})}\n`,
	})
}

/**
 * The fact an earlier run left for an ask before it crashed: the draft recorded in the ask's ledger with the ask in
 * its history. Answers its id.
 */
export function recordFactOfAsk(params: RecordFactOfAskParams): string {
	return recordFact({
		folder: workspaceFactsFolder({ workspace: params.asked.workspace }),
		draft: params.draft,
		ask: params.asked.ask,
		lot: params.lot ?? null,
		now: () => SETUP_NOW,
	}).id
}

/**
 * A re-ask whose first round is open: the unchecked fact recorded, the first ask made (it re-asks the fact), the
 * re-ask packed, each brief read. The asks live in a store lot when asked.
 */
export async function reaskedOverClauses(params: ReaskedOverClausesParams): Promise<ReaskedPacked> {
	const lot =
		params.inLot === true
			? createLotAskWorkspace({
					place: 'project',
					standards: VERDICT_STANDARDS,
					standardName: DECLARED_NAME,
				})
			: undefined
	const workspace = lot?.workspace ?? createDocumentsWorkspace({ standards: VERDICT_STANDARDS })
	const lotArgv = lot === undefined ? [] : ['--lot', lot.lotFolder]
	const factId = recordFact({
		folder: workspaceFactsFolder({ workspace }),
		draft: params.draft,
		now: () => SETUP_NOW,
	}).id
	await askedWith({ workspace, argv: [SEMANTIC_QUESTION, ...lotArgv], exitCode: 3 })
	const asked: AskedForPack = {
		workspace,
		asksFolder: lot === undefined ? asksFolderOf({ workspace }) : join(lot.lotFolder, 'asks'),
		ask: SECOND_ASK,
		sliceIds: [],
		sliceAngles: [],
		lotArgv,
	}
	await packedWith({ workspace, argv: [asked.ask, ...lotArgv], exitCode: 0 })
	return { ...asked, briefs: briefsOf({ asked }), factId, lotFolder: lot?.lotFolder ?? null }
}

/**
 * An ask over two clauses whose first round (open, no verdict) gave the first slice of the ask only: written by hand
 * with the hand-written nonces, so a verdict of it still has a slice left to give.
 */
export async function partialRoundOne(): Promise<PartialRoundOne> {
	const workspace = createDocumentsWorkspace({ standards: VERDICT_STANDARDS })
	const json = await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })
	const asked: AskedForPack = {
		workspace,
		asksFolder: asksFolderOf({ workspace }),
		ask: FIRST_ASK,
		sliceIds: json.slices.map((slice) => slice.id),
		sliceAngles: json.slices.map((slice) => slice.angles),
		lotArgv: [],
	}
	const [first] = json.slices
	const clause =
		first !== undefined && first.from <= CLAUSE_LINES.first && CLAUSE_LINES.first <= first.to
			? 'first'
			: 'second'
	const pack: PackRecord = {
		schema: 1,
		ask: asked.ask,
		round: 1,
		outside: false,
		web: false,
		readers: (['A', 'B'] as const).map((letter) => ({
			letter,
			nonce: HAND_WRITTEN_NONCES[letter],
			slices: asked.sliceIds.slice(0, 1),
			ranges: rangesOfIds({ asked, ids: asked.sliceIds.slice(0, 1) }),
		})),
		at: HAND_WRITTEN_AT,
	}
	writeTextFile({
		path: join(roundFolderOf({ asked, round: ROUND_ONE }), PACK_FILE),
		text: `${JSON.stringify(pack, null, '\t')}\n`,
	})
	return { packed: { ...asked, briefs: {} }, clause }
}

/** The report of a reader of `partialRoundOne`: it cites the sentence of the clause the round gave. */
export function handReportOf(params: HandReportOfParams): DocumentReport {
	const { partial } = params
	const line = CLAUSE_LINES[partial.clause]
	return {
		ask: partial.packed.ask,
		round: 1,
		reader: params.letter,
		nonce: HAND_WRITTEN_NONCES[params.letter],
		verdict: params.verdict,
		value: params.value,
		answer: params.answer,
		claims:
			params.verdict === 'not-in-text'
				? []
				: [
						{
							text: CLAIM_TEXT,
							supports: params.verdict,
							cites: [
								{
									file: CITED_FILE,
									from: line,
									to: line,
									quote: CLAUSE_SENTENCES[partial.clause],
								},
							],
						},
					],
		notFound: [],
		familiesRead: ['parents'],
		session: `session-${params.letter}`,
	}
}
