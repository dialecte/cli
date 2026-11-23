/**
 * A lot's `review.jsonl` (33CI CI2a): the public rows of its review, what a change request may render. Derived from its
 * sources and written whole by each verb that changes one - the findings ledger (`lot finding`, `lot decide`), the
 * review stations' ends in `events.jsonl` (`lot station`), `verify.jsonl` (`lot verify`), `approvals.jsonl`
 * (`lot approve`) - so a ledger edited by hand
 * is read again at the next verb, and a write cut short heals then. Nothing private is copied: no finding text, note,
 * reason or where, no path git does not list in the lot's tree; a source missing or unreadable is left out, never
 * guessed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { viewDeclaredHighOf } from '../design/declared-sources.ts'
import { lotDesignStandingOf } from '../design/design-standing.ts'
import { DESIGN_STATES } from '../design/design.constants.ts'
import { readEvents } from '../events/read-events.ts'
import { STATION_VERDICTS } from '../events/station-event.constants.ts'
import { tryReadGit } from '../git.ts'
import { readIdentity } from '../store/identity.ts'
import { AGAIN_VERDICTS } from '../store/next-station.constants.ts'
import { folderPlanEntryIds, publicWordTestOf } from '../store/public-text.ts'
import { replaceWhole } from '../store/publish.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { findLedgerTable, tableCells, unescapeCell } from './findings-ledger.ts'
import {
	APPROVE_VERDICT,
	BASE_FILES_ARGUMENTS,
	NON_BLOCKING_SEVERITY,
	OPEN_STATE_WORDS,
	CURRENT_FOLDER_PREFIX,
	LEDGER_ROW_CELLS,
	LINE_SUFFIX_PATTERN,
	REVIEW_RECORD_SCHEMA,
	REVIEW_STATIONS,
	ROW_ID_PATTERN,
	STATE_CELL_PATTERN,
	VERDICT_WORD_PATTERN,
	VERIFY_VERDICT,
	WORKTREE_FILES_ARGUMENTS,
} from './review-record.constants.ts'
import { LEDGER_FILE, ROUND_PATTERN, SEVERITY_SPELLINGS } from './review-rounds.constants.ts'

import type { LotEvent } from '../events/event.types.ts'
import type {
	DesignRow,
	FindingRow,
	ReviewRecord,
	PublicWordTest,
	ReviewRow,
	TreeFileTest,
	VerdictRow,
} from './review-record.types.ts'

/** The rows of the folder's `review.jsonl`, by kind; a line that is no row is skipped. Undefined without the file. */
export function readReviewRecord(params: { folder: string }): ReviewRecord | undefined {
	const file = join(params.folder, STORE_FILES.review)
	if (!existsSync(file)) return undefined
	const record: ReviewRecord = { findings: [], verdicts: [] }
	let design: DesignRow | undefined
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const row = rowOfLine(line)
		if (row?.kind === 'finding') record.findings.push(row)
		else if (row?.kind === 'verdict') record.verdicts.push(row)
		else if (row?.kind === 'design') design = row
	}
	return design === undefined ? record : { ...record, design }
}

/**
 * Derives the folder's rows from its sources and writes `review.jsonl` whole: the findings in ledger order, then the
 * verdicts by time. A folder with no row and no file yet is left without one.
 */
export function writeReviewRecord(params: { folder: string }): void {
	const { folder } = params
	const isPublicWord = publicWordTestOf({
		root: worktreeOf(folder),
		ids: folderPlanEntryIds({ folder }),
	})
	const verdicts = [
		...stationVerdictRowsOf({ folder, isPublicWord }),
		...verifyVerdictRowsOf({ folder, isPublicWord }),
		...approvalVerdictRowsOf({ folder, isPublicWord }),
	].sort(function byTime(left, right) {
		return left.at.localeCompare(right.at)
	})
	const rows: ReviewRow[] = [
		...findingRowsOf({ folder, inTree: treeFileTestOf(folder) }),
		...verdicts,
		...designRowsOf({ folder }),
	]
	const path = join(folder, STORE_FILES.review)
	if (rows.length === 0 && !existsSync(path)) return
	replaceWhole({
		path,
		text: rows
			.map(function lineOfRow(row) {
				return `${JSON.stringify(row)}\n`
			})
			.join(''),
	})
}

/**
 * `writeReviewRecord` after a verb wrote one of its sources: the `!` line a verb adds when the record could not be
 * written (its own write stands; the next verb writes the record again), undefined when it was.
 */
export function refreshReviewRecord(params: { folder: string }): string | undefined {
	try {
		writeReviewRecord(params)
		return undefined
	} catch (error) {
		return `! ${STORE_FILES.review} not written: ${(error as Error).message}`
	}
}

/** The finding rows of the folder's ledger, in its order; none without a ledger. */
function findingRowsOf(params: { folder: string; inTree: TreeFileTest }): FindingRow[] {
	const ledger = join(params.folder, LEDGER_FILE)
	if (!existsSync(ledger)) return []
	const lines = readFileSync(ledger, 'utf8').split('\n')
	const rows: FindingRow[] = []
	for (const { line } of findLedgerTable(lines)?.rows ?? []) {
		const row = findingRowOf({ cells: tableCells(lines[line]) ?? [], inTree: params.inTree })
		if (row) rows.push(row)
	}
	return rows
}

/**
 * One ledger row (`| id | round | severity | file:line | finding | state |`) as a public row: the finding's cell never
 * read, the state from the last cell (`lot decide` writes it there; an unescaped `|` in the finding moves it); undefined
 * for a row without a readable id.
 */
function findingRowOf(params: { cells: string[]; inTree: TreeFileTest }): FindingRow | undefined {
	const { cells } = params
	const [id, round, severity, at] = cells
	if (!ROW_ID_PATTERN.test(id ?? '')) return undefined
	const state = cells.length >= LEDGER_ROW_CELLS ? stateOf(cells.at(-1)) : {}
	const rowSeverity = severityOf(severity)
	const file = fileOf({ cell: at, inTree: params.inTree })
	return {
		schema: REVIEW_RECORD_SCHEMA,
		kind: 'finding',
		id,
		...(ROUND_PATTERN.test(round ?? '') && { round: Number(round) }),
		...(rowSeverity !== undefined && { severity: rowSeverity }),
		...(file !== undefined && { file }),
		...state,
	}
}

/**
 * The option form (`should-fix`) of a severity cell as `lot finding` takes or writes it (`should fix`); undefined for a
 * cell `SEVERITY_SPELLINGS` does not name.
 */
function severityOf(cell: string | undefined): string | undefined {
	if (cell === undefined) return undefined
	const written = Object.hasOwn(SEVERITY_SPELLINGS, cell)
		? SEVERITY_SPELLINGS[cell]
		: Object.values(SEVERITY_SPELLINGS).find(function isWritten(spelling) {
				return spelling === cell
			})
	return written?.replaceAll(' ', '-')
}

/** The state of a state cell and, for `fixed <round>`, the round that closed it; nothing for a cell it cannot read. */
function stateOf(cell: string | undefined): Pick<FindingRow, 'state' | 'closedBy'> {
	const match = STATE_CELL_PATTERN.exec(cell ?? '')
	if (!match) return {}
	const state = match[1].replaceAll(' ', '-')
	if (state !== 'fixed' || match[2] === undefined) return { state }
	return { state, closedBy: { round: Number(match[2]) } }
}

/** The path of a `file:line` cell (`./` dropped) when git lists it as a file of the lot's tree; undefined otherwise. */
function fileOf(params: { cell: string | undefined; inTree: TreeFileTest }): string | undefined {
	if (params.cell === undefined || params.inTree === undefined) return undefined
	const path = unescapeCell(params.cell)
		.replace(LINE_SUFFIX_PATTERN, '')
		.replace(CURRENT_FOLDER_PREFIX, '')
	return params.inTree(path) ? path : undefined
}

/**
 * Whether a path is a file of the folder's lot: git lists it in its worktree (tracked, or untracked and not ignored)
 * or at its base (a file the lot deleted); a file git ignores or a link out of the tree is none. Both lists are read
 * once, at the first path asked. Undefined for a folder whose identity names no worktree.
 */
function treeFileTestOf(folder: string): TreeFileTest {
	const identity = readIdentity({ lotFolder: folder })
	const worktree = identity?.worktree
	if (identity === undefined || worktree === undefined || worktree === null) return undefined
	let files: Set<string> | undefined
	return function isTreeFile(path) {
		files ??= new Set(
			[
				tryReadGit({ root: worktree, args: [...WORKTREE_FILES_ARGUMENTS] }),
				tryReadGit({ root: worktree, args: [...BASE_FILES_ARGUMENTS, identity.base.commit] }),
			]
				.join('\0')
				.split('\0'),
		)
		return path !== '' && files.has(path)
	}
}

/** The worktree the folder's identity names; undefined for a hand-over folder or a lot without one. */
function worktreeOf(folder: string): string | undefined {
	return readIdentity({ lotFolder: folder })?.worktree ?? undefined
}

/**
 * The verdict rows of the review stations' ends in the folder's events: a station run again (`failed`, `limit`) gives
 * none, nor a verdict outside the station vocabulary (a line edited by hand). The vendor and model are the end's,
 * else those of the start it pairs with, each kept only when it is a public word.
 */
function stationVerdictRowsOf(params: {
	folder: string
	isPublicWord: PublicWordTest
}): VerdictRow[] {
	const { folder, isPublicWord } = params
	const file = join(folder, STORE_FILES.events)
	if (!existsSync(file)) return []
	const { events } = readEvents({ file })
	const starts = new Map<string, LotEvent>()
	for (const event of events) if (event.kind === 'station.start') starts.set(event.id, event)
	const rows: VerdictRow[] = []
	for (const end of events) {
		const { station, verdict, round } = end
		if (end.kind !== 'station.end' || typeof station !== 'string') continue
		if (!REVIEW_STATIONS.includes(station) || typeof verdict !== 'string') continue
		if (!STATION_VERDICTS.includes(verdict)) continue
		if ((AGAIN_VERDICTS as readonly string[]).includes(verdict)) continue
		const start = typeof end.run === 'string' ? starts.get(end.run) : undefined
		rows.push({
			schema: REVIEW_RECORD_SCHEMA,
			kind: 'verdict',
			at: end.at,
			by: { kind: 'station', station, ...(typeof round === 'number' && { round }) },
			...wordOf({ key: 'vendor', end, start, isPublicWord }),
			...wordOf({ key: 'model', end, start, isPublicWord }),
			verdict,
		})
	}
	return rows
}

/**
 * `{ [key]: word }` of the end, else of its start, when it is one plain word (`VERDICT_WORD_PATTERN`) that passes the
 * public-text check; nothing otherwise.
 */
function wordOf(params: {
	key: 'vendor' | 'model'
	end: LotEvent
	start: LotEvent | undefined
	isPublicWord: PublicWordTest
}): Partial<Record<'vendor' | 'model', string>> {
	const word = [params.end[params.key], params.start?.[params.key]].find(function isGiven(value) {
		return typeof value === 'string'
	})
	return typeof word === 'string' && VERDICT_WORD_PATTERN.test(word) && params.isPublicWord(word)
		? { [params.key]: word }
		: {}
}

/** The verdict rows of the folder's `verify.jsonl`, one per line read: by its name when it is a public word, never its note. */
function verifyVerdictRowsOf(params: {
	folder: string
	isPublicWord: PublicWordTest
}): VerdictRow[] {
	const { folder, isPublicWord } = params
	const file = join(folder, STORE_FILES.verify)
	if (!existsSync(file)) return []
	const rows: VerdictRow[] = []
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const parsed = parsedLine(line)
		if (typeof parsed?.at !== 'string' || typeof parsed.by !== 'string') continue
		rows.push({
			schema: REVIEW_RECORD_SCHEMA,
			kind: 'verdict',
			at: parsed.at,
			// `lot verify` checks its `--by`; a line written by hand or by an older cli keeps its name only when it passes
			// the same check
			by: { kind: 'verify', ...(isPublicWord(parsed.by) && { name: parsed.by }) },
			verdict: VERIFY_VERDICT,
		})
	}
	return rows
}

/**
 * The verdict rows of the folder's `approvals.jsonl`: a person's approve with the head approved, once per approver and
 * head. A line whose `--by` the public-text check refuses (one written by hand) gives none: a person's verdict names
 * who. Which head a render shows is `verdictsAt`'s.
 */
function approvalVerdictRowsOf(params: {
	folder: string
	isPublicWord: PublicWordTest
}): VerdictRow[] {
	const file = join(params.folder, STORE_FILES.approvals)
	if (!existsSync(file)) return []
	const rows = new Map<string, VerdictRow>()
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const parsed = parsedLine(line)
		if (typeof parsed?.at !== 'string' || typeof parsed.by !== 'string') continue
		if (typeof parsed.head !== 'string' || !params.isPublicWord(parsed.by)) continue
		const key = `${parsed.by}\n${parsed.head}`
		if (rows.has(key)) continue
		rows.set(key, {
			schema: REVIEW_RECORD_SCHEMA,
			kind: 'verdict',
			at: parsed.at,
			by: { kind: 'person', name: parsed.by },
			verdict: APPROVE_VERDICT,
			head: parsed.head,
		})
	}
	return [...rows.values()]
}

/** The design row `review.jsonl` holds, as a view reads the lot's shared areas (files only); none without one. */
function designRowsOf(params: { folder: string }): DesignRow[] {
	const row = designRowOf({
		folder: params.folder,
		declaredHigh: viewDeclaredHighOf({ lotFolder: params.folder }),
	})
	return row === undefined ? [] : [row]
}

/**
 * The design row of a folder whose `design.jsonl` exists, held to the shared areas `declaredHigh` (a view's, or a
 * refusing verb's): the lot's design state now and who approved or waived it, named only when a public word; never
 * its file, hash or reason. Undefined for a folder that recorded nothing of its design.
 *
 * @intent give the public record of where a lot's design stands
 * @internal
 */
export function designRowOf(params: {
	folder: string
	declaredHigh: readonly string[]
}): DesignRow | undefined {
	const { folder } = params
	if (!existsSync(join(folder, STORE_FILES.design))) return undefined
	const isPublicWord = publicWordTestOf({
		root: worktreeOf(folder),
		ids: folderPlanEntryIds({ folder }),
	})
	const { state, by } = lotDesignStandingOf({
		lotFolder: folder,
		declaredHigh: params.declaredHigh,
	})
	return {
		schema: REVIEW_RECORD_SCHEMA,
		kind: 'design',
		state,
		...(by !== undefined && isPublicWord(by) && { by: { kind: 'person', name: by } }),
	}
}

/**
 * The record as a render of `head` shows it: a verdict given on another head (an approval before a later commit or a
 * rebase) left out, so no text claims an approval of a head nobody approved.
 *
 * @intent show only the approvals of the head a change request carries
 * @internal
 */
export function verdictsAt(params: { record: ReviewRecord; head: string }): ReviewRecord {
	return {
		...params.record,
		verdicts: params.record.verdicts.filter(
			(row) => row.head === undefined || row.head === params.head,
		),
	}
}

/**
 * The folder's findings that block an approval: a row not closed yet (open, a fix still to verify, or a state the
 * ledger parser cannot read) of any severity but a nit (one it cannot read blocks), in ledger order; none without a
 * ledger.
 *
 * @intent tell what blocks a lot's approval
 * @internal
 */
export function openBlockingFindings(params: { folder: string }): FindingRow[] {
	return findingRowsOf({ folder: params.folder, inTree: undefined }).filter(
		function isOpenBlocking(row) {
			return (
				row.severity !== NON_BLOCKING_SEVERITY &&
				(row.state === undefined || OPEN_STATE_WORDS.includes(row.state))
			)
		},
	)
}

/** A line read as a JSON object; undefined for a blank line, a torn one or one that holds no object. */
function parsedLine(line: string): Record<string, unknown> | undefined {
	if (line.trim() === '') return undefined
	try {
		const parsed: unknown = JSON.parse(line)
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined
	} catch {
		return undefined
	}
}

/** A `review.jsonl` line as a row: schema 1, a finding with an id or a verdict with its time, who and verdict. */
function rowOfLine(line: string): ReviewRow | undefined {
	const parsed = parsedLine(line)
	if (parsed?.schema !== REVIEW_RECORD_SCHEMA) return undefined
	if (parsed.kind === 'finding' && typeof parsed.id === 'string') return parsed as FindingRow
	if (parsed.kind === 'design' && (DESIGN_STATES as readonly unknown[]).includes(parsed.state))
		return parsed as DesignRow
	const by = parsed.by as Record<string, unknown> | undefined
	if (
		parsed.kind === 'verdict' &&
		typeof parsed.at === 'string' &&
		typeof parsed.verdict === 'string' &&
		typeof by?.kind === 'string'
	)
		return parsed as VerdictRow
	return undefined
}
