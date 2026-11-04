/**
 * The hand-over card's gate lines, from records, never from prose. The gate steps: one per step (the latest record of
 * each step across the gate's two modes and the commit hook's record, which a newer gate record supersedes whole).
 * The gate records are the worktree's last runs and the records of the tree the card checks that any worktree
 * of the repository stored, their tdd steps left out (a tdd verdict is the worktree's own, not the tree's).
 * A line from a record made at a commit outside HEAD's history (a branch commit's hook record read for a
 * merge on main) ends `· from <commit>`, a rehearsal's `· rehearsal`. A stored record counts only when it
 * ran against what is installed now (the same `node_modules`, the same `file:` dependencies) with the
 * command of its mode now. A record of another tree than the one checked is marked stale: it warns, or stays
 * failed. Beside them, each line the card composes: the rules (the recap's), what the package owes its mutation
 * runs (read from the mutation store when the card is built), the review from the hand-over folder's findings
 * ledger and round snapshots, and a contributor's contrib rows from the contrib record of the checked tree.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { findContribRecord } from '../contrib/contrib-key.ts'
import { counted } from '../counted.ts'
import { resolveGateSteps } from '../gate/gate-config.ts'
import { isAncestorCommit, readGit } from '../git.ts'
import { MUTATION_GATE_NAME } from '../mutation/pending-verdict.constants.ts'
import { lotModeOf, pendingVerdict } from '../mutation/pending-verdict.ts'
import { readPackageJson } from '../package-json.ts'
import { findLedgerTable, tableCells } from '../review-rounds/findings-ledger.ts'
import { LEDGER_FILE, SEVERITY_SPELLINGS } from '../review-rounds/review-rounds.constants.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'
import { gateCommandHash, hashHookCommand, readInstalledKey } from './check-key.ts'
import { isSameKey, readTreeRecords } from './check-store.ts'
import {
	CONTRIB_HEAD_MOVED_SUFFIX,
	CONTRIB_KEY_CHANGED_SUFFIX,
	CONTRIB_LINE_NAME,
	CONTRIB_NEVER_RUN_DETAIL,
	DETAIL_SEPARATOR,
	GATE_LINE_NAME,
	HOOK_RECORD_DETAIL,
	HOOK_RECORD_MODE,
	HOOK_REUSED_DETAIL,
	MISSING_SCRIPT_DETAIL,
	MISSING_SCRIPT_PATTERN,
	NEVER_RUN_DETAIL,
	NIT_SEVERITY,
	NO_FINDINGS_DETAIL,
	NO_LEDGER_DETAIL,
	NOT_RUN_DETAIL,
	NOT_RUN_HERE_DETAIL,
	OPEN_LEDGER_STATES,
	RECORD_FROM_DETAIL,
	REHEARSAL_ORIGIN,
	REHEARSAL_RECORD_DETAIL,
	REVIEW_APPROVED_DETAIL,
	REVIEW_LINE_NAME,
	ROUND_FOLDER_PATTERN,
	RULES_LINE_NAME,
	SHORT_SHA_LENGTH,
	TREE_CHANGED_SUFFIX,
} from './gate-records.constants.ts'
import { readContribRecord, readGateRecords, readRulesRecord } from './gate-records.ts'
import { hashStateTree } from './state-hash.ts'

import type { StepCounts } from '../gate/gate.types.ts'
import type { CardGateLine, GateRecord, RecordedStep } from './gate-records.types.ts'

export function buildCardGateLines(params: {
	/** The worktree the records are of. */
	root: string
	/**
	 * The tree the hand-over commits (the worktree's, or the tree its last merge lot leaves): a gate record of
	 * another tree is stale.
	 */
	tree: string
}): CardGateLine[] {
	const { root, tree } = params
	const own = readGateRecords(root)
	const others = readTreeRecords({ root, tree }).filter(
		(record) => !own.some((ownRecord) => isSameRun({ record, other: ownRecord })),
	)
	// what a run here would hold now is read only when another run's record is there to compare with
	const stored = others.length
		? others.filter(currentStoredRecord({ root, tree })).map(withoutTddStep)
		: []
	const records = [...own, ...stored]
	return gateStepLines({
		records,
		stateHash: hashStateTree(tree),
		outsideHistory: commitsOutsideHistory({ root, records }),
	})
}

/**
 * A contributor's contrib rows: the rules, the package steps and release from the contrib record of the checked
 * tree, then the live `mutation` row (`pendingVerdict`). The record counts when its key is the one the `contrib`
 * guard asks for: a contrib run at `head` (the lots file's HEAD) on that tree, against what is installed now, with
 * the package's contrib rows. Without one, the worktree's last contrib record, each row stale and saying what
 * changed since (the tree, HEAD, or the install and the rows); without either, one failed `contrib` line saying to
 * run it.
 */
export function buildContribLines(params: {
	root: string
	folder: string
	tree: string
	branch: string
	mergedBranches: readonly string[]
	/** The commit the contrib run must have been made at: the lots file's HEAD. Default: HEAD. */
	head?: string
}): CardGateLine[] {
	const { root, tree } = params
	const head = readGit({ root, args: ['rev-parse', `${params.head ?? 'HEAD'}^{commit}`] }).trim()
	const current = findStoredContribRecord({ root, tree, head })
	const record = current ?? readContribRecord(root)
	if (!record)
		return [
			{ name: CONTRIB_LINE_NAME, status: 'failed', detail: CONTRIB_NEVER_RUN_DETAIL },
			...buildMutationLines(params),
		]
	const outsideHistory = commitsOutsideHistory({ root, records: [record] })
	const source = recordSourceOf({ record, outsideHistory })
	const staleSuffix = current
		? undefined
		: record.stateHash !== hashStateTree(tree)
			? TREE_CHANGED_SUFFIX
			: record.head !== head
				? CONTRIB_HEAD_MOVED_SUFFIX
				: CONTRIB_KEY_CHANGED_SUFFIX
	return [
		...record.steps.map(function contribLine(step): CardGateLine {
			const line = {
				...withRecordSource({ line: lineOfStep(step), record, outsideHistory }),
				...(source && { source }),
			}
			return staleSuffix === undefined ? line : staleLine({ line, suffix: staleSuffix })
		}),
		...buildMutationLines(params),
	]
}

/**
 * The `mutation` line: what the package still owes, read from the mutation store now (`pendingVerdict`); none
 * when the package declares no mutation scope.
 */
export function buildMutationLines(params: {
	root: string
	folder: string
	tree: string
	branch: string
	mergedBranches: readonly string[]
}): CardGateLine[] {
	const { root, folder, tree, branch, mergedBranches } = params
	const verdict = pendingVerdict({
		root,
		branch,
		mergedBranches,
		lotMode: lotModeOf({ root, folder }),
		tree,
	})
	return verdict
		? [{ name: MUTATION_GATE_NAME, status: verdict.status, detail: verdict.detail }]
		: []
}

/** The stored contrib record of `tree` keyed as the guard asks; none when the package's contrib rows cannot be read. */
function findStoredContribRecord(params: {
	root: string
	tree: string
	head: string
}): GateRecord | undefined {
	try {
		return findContribRecord(params)
	} catch {
		// a package.json contrib itself would refuse: nothing stored can be told current (the card still prints)
		return undefined
	}
}

/** The commits of `records` outside HEAD's history: a line of such a record says which. */
function commitsOutsideHistory(params: {
	root: string
	records: readonly GateRecord[]
}): ReadonlySet<string> {
	const heads = new Set(params.records.map((record) => record.head))
	return new Set(
		[...heads].filter(
			(head) => !isAncestorCommit({ root: params.root, ancestor: head, descendant: 'HEAD' }),
		),
	)
}

/**
 * Which stored records of `tree` count for the worktree `root`: those whose key is the key a run there would
 * have now - what is installed, the `file:` dependencies, the command of the record's mode.
 */
function currentStoredRecord(params: {
	root: string
	tree: string
}): (record: GateRecord) => boolean {
	const { root, tree } = params
	const installed = readInstalledKey(root)
	const commands = readCommandHashes(root)
	return function isCurrent(record) {
		const commandHash = commands[record.mode]
		return (
			commandHash !== undefined &&
			isSameKey({ key: { tree, ...installed, commandHash }, other: record.key })
		)
	}
}

/**
 * The command hash of each record mode in the worktree `root`; none when the package's gate steps cannot be
 * read (a `dialecte.gate` that is no list of steps): no stored record counts then, and the card still prints.
 */
function readCommandHashes(root: string): Record<string, string> {
	try {
		const packageJson = readPackageJson(root)
		return {
			fast: gateCommandHash({ root, steps: resolveGateSteps({ packageJson, mode: 'fast' }) }),
			full: gateCommandHash({ root, steps: resolveGateSteps({ packageJson, mode: 'full' }) }),
			[HOOK_RECORD_MODE]: hashHookCommand(root),
		}
	} catch {
		// a package.json the gate itself would refuse: nothing stored can be told current
		return {}
	}
}

/** The same run: a worktree's record and its copy in the store. */
function isSameRun(params: { record: GateRecord; other: GateRecord }): boolean {
	const { record, other } = params
	return record.mode === other.mode && record.at === other.at && record.head === other.head
}

/** A record another worktree (or a rehearsal) made: its tdd step judged that worktree's receipts, not these. */
function withoutTddStep(record: GateRecord): GateRecord {
	return { ...record, steps: record.steps.filter((step) => step.name !== TDD_STEP.name) }
}

/** Each step's line from its latest record; `gate never run` when there is no record. */
function gateStepLines(params: {
	records: GateRecord[]
	stateHash: string
	/** The commits of records outside HEAD's history: a line of such a record says which. */
	outsideHistory: ReadonlySet<string>
}): CardGateLine[] {
	if (params.records.length === 0)
		return [{ name: GATE_LINE_NAME, status: 'failed', detail: NEVER_RUN_DETAIL }]
	const latest = new Map<string, { step: RecordedStep; record: GateRecord }>()
	const oldestFirst = currentRecords(params.records).sort((first, second) =>
		first.at.localeCompare(second.at),
	)
	for (const record of oldestFirst)
		for (const step of record.steps) latest.set(step.name, { step, record })
	return [...latest.values()].map(function stepLine(entry) {
		const line = lineOfStep(entry.step)
		return withTreeCheck({
			line: withRecordSource({
				line: entry.record.mode === HOOK_RECORD_MODE ? fromHook(line) : line,
				record: entry.record,
				outsideHistory: params.outsideHistory,
			}),
			current: entry.record.stateHash === params.stateHash,
		})
	})
}

/**
 * The records the card reads: a commit hook's record only when no gate record is newer. The hook names its
 * own scripts (`test:run`, `lint:check`), never the gate's steps, so a later gate run could not replace its
 * lines one by one: it replaces the whole record.
 */
function currentRecords(records: readonly GateRecord[]): GateRecord[] {
	const newestGate = records
		.filter((record) => record.mode !== HOOK_RECORD_MODE)
		.reduce((newest, record) => (record.at > newest ? record.at : newest), '')
	return records.filter((record) => record.mode !== HOOK_RECORD_MODE || record.at > newestGate)
}

/** A line read from a commit hook's record: its detail ends saying so (`✓ test:run  1214/1214 · commit hook`). */
function fromHook(line: CardGateLine): CardGateLine {
	return {
		...line,
		detail: [line.detail, HOOK_RECORD_DETAIL].filter(Boolean).join(DETAIL_SEPARATOR),
	}
}

/**
 * A line of a rehearsal's record ends `· rehearsal`; a line of a record made at a commit outside HEAD's
 * history ends `· from <commit>`, whichever worktree made it. A record made at HEAD, or at a commit HEAD
 * holds (the gate before the lots were committed), carries no suffix.
 */
function withRecordSource(params: {
	line: CardGateLine
	record: GateRecord
	outsideHistory: ReadonlySet<string>
}): CardGateLine {
	const { line } = params
	const source = recordSourceOf(params)
	if (!source) return line
	return { ...line, detail: [line.detail, source].filter(Boolean).join(DETAIL_SEPARATOR) }
}

/** `rehearsal` for a rehearsal's record, `from <commit>` for one made outside HEAD's history; else none. */
function recordSourceOf(params: {
	record: GateRecord
	outsideHistory: ReadonlySet<string>
}): string | undefined {
	const { record } = params
	if (record.origin === REHEARSAL_ORIGIN) return REHEARSAL_RECORD_DETAIL
	if (!params.outsideHistory.has(record.head)) return undefined
	return RECORD_FROM_DETAIL.replace('{head}', record.head.slice(0, SHORT_SHA_LENGTH))
}

function lineOfStep(step: RecordedStep): CardGateLine {
	const { name } = step
	if (step.status === 'not-run') return { name, status: 'warning', detail: NOT_RUN_DETAIL }
	if (step.status === 'skipped')
		return {
			name,
			status: 'warning',
			detail: NOT_RUN_HERE_DETAIL.replace('{reason}', shortReason(step.reason ?? '')),
		}
	// a hook's test step answered from a green `gate --full` record ran no test: it says so instead of counts
	if (step.status === 'passed' && step.reused)
		return { name, status: 'passed', detail: HOOK_REUSED_DETAIL }
	const counts = renderCardCounts(step.counts)
	if (step.status === 'failed')
		return {
			name,
			status: 'failed',
			detail: [counts, step.reason ?? ''].filter(Boolean).join(DETAIL_SEPARATOR),
		}
	return { name, status: 'passed', detail: counts || (step.note ?? '') }
}

/** A gate reason in a few words: a missing npm script named by itself. */
function shortReason(reason: string): string {
	return reason.replace(MISSING_SCRIPT_PATTERN, MISSING_SCRIPT_DETAIL)
}

/** The counts as the card writes them: `397/397` when every test passed, else each count named. */
function renderCardCounts(counts: StepCounts): string {
	const parts: string[] = []
	if (counts.tests) {
		const { passed, failed, skipped, total } = counts.tests
		if (passed === total) parts.push(`${passed}/${total}`)
		else
			parts.push(
				[`${passed} passed`, failed ? `${failed} failed` : '', skipped ? `${skipped} skipped` : '']
					.filter(Boolean)
					.join(DETAIL_SEPARATOR),
			)
	}
	if (counts.errors !== undefined) parts.push(errorsAndWarnings(counts))
	return parts.join(DETAIL_SEPARATOR)
}

/** `<n> error(s) · <m> warning(s)`, each noun singular at 1. */
function errorsAndWarnings(params: { errors?: number; warnings?: number }): string {
	return [
		counted({ count: params.errors ?? 0, noun: 'error' }),
		counted({ count: params.warnings ?? 0, noun: 'warning' }),
	].join(DETAIL_SEPARATOR)
}

/**
 * A line of a record of another tree: said so after its detail; a failed step stays `✗`, any other line
 * turns `!`.
 */
function withTreeCheck(params: { line: CardGateLine; current: boolean }): CardGateLine {
	if (params.current) return params.line
	return staleLine({ line: params.line, suffix: TREE_CHANGED_SUFFIX })
}

/** A line of a record that no longer answers: `suffix` after its detail; a failed step stays `✗`, any other line turns `!`. */
function staleLine(params: { line: CardGateLine; suffix: string }): CardGateLine {
	const { line } = params
	return {
		...line,
		status: line.status === 'failed' ? 'failed' : 'warning',
		detail: `${line.detail}${params.suffix}`,
		stale: true,
	}
}

/** The `rules` line from the worktree's rules record: stale when it is of another tree than `stateHash`'s. */
export function buildRulesLine(params: { root: string; stateHash: string }): CardGateLine {
	const record = readRulesRecord(params.root)
	if (!record) return { name: RULES_LINE_NAME, status: 'warning', detail: NEVER_RUN_DETAIL }
	return withTreeCheck({
		line: {
			name: RULES_LINE_NAME,
			status: record.errors ? 'failed' : 'passed',
			detail: errorsAndWarnings(record),
		},
		current: record.stateHash === params.stateHash,
	})
}

/**
 * The review from the findings ledger: approved when no row is open, `!` when only nits are or the ledger
 * holds no row yet, `✗` when a blocking or should-fix row is; the rounds are the highest of the rows' and
 * the snapshots'.
 */
export function buildReviewLine(folder: string): CardGateLine {
	const ledgerPath = join(folder, LEDGER_FILE)
	if (!existsSync(ledgerPath))
		return { name: REVIEW_LINE_NAME, status: 'warning', detail: NO_LEDGER_DETAIL }
	const lines = readFileSync(ledgerPath, 'utf8').split('\n')
	const rows = findLedgerTable(lines)?.rows ?? []
	const rounds = Math.max(0, ...rows.map((row) => row.round ?? 0), ...snapshotRounds(folder))
	const openSeverities = rows.flatMap(function openSeverity(row) {
		const cells = tableCells(lines[row.line]) ?? []
		const state = cells.at(-1) ?? ''
		if (!OPEN_LEDGER_STATES.includes(state)) return []
		return [SEVERITY_SPELLINGS[cells[2] ?? ''] ?? cells[2] ?? '']
	})
	const roundsText = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`
	// a ledger made before the reviewer answered approves nothing
	if (rows.length === 0)
		return {
			name: REVIEW_LINE_NAME,
			status: 'warning',
			detail: `${roundsText}${DETAIL_SEPARATOR}${NO_FINDINGS_DETAIL}`,
		}
	const nits = openSeverities.filter((severity) => severity === NIT_SEVERITY).length
	const blocking = openSeverities.length - nits
	if (blocking)
		return {
			name: REVIEW_LINE_NAME,
			status: 'failed',
			detail: `${roundsText}${DETAIL_SEPARATOR}${blocking} open: blocking or should fix`,
		}
	if (nits)
		return {
			name: REVIEW_LINE_NAME,
			status: 'warning',
			detail: `${roundsText}${DETAIL_SEPARATOR}${nits} ${nits === 1 ? 'nit' : 'nits'} open`,
		}
	return {
		name: REVIEW_LINE_NAME,
		status: 'passed',
		detail: `${roundsText}${DETAIL_SEPARATOR}${REVIEW_APPROVED_DETAIL}`,
	}
}

/** The rounds of the `round-<n>/` snapshots in the hand-over folder. */
function snapshotRounds(folder: string): number[] {
	return readdirSync(folder, { withFileTypes: true }).flatMap(function roundOf(entry) {
		const match = ROUND_FOLDER_PATTERN.exec(entry.name)
		return entry.isDirectory() && match ? [Number(match[1])] : []
	})
}
