/**
 * The hand-over card's gate lines, from records, never from prose. The gate steps: one per step (the latest record of
 * each step across the gate's two modes and the commit hook's record, which a newer gate record supersedes whole).
 * The other way round, a hook record of the tree the card checks, not dropped by a newer gate record of the checked
 * tree, supersedes every gate record of another tree: a merge hand-over's rehearsal (or commit) hook ran on the
 * merged tree, so each step of the worktree's gate of its tree before the merge that the hook answers (a step of
 * the same name, or a test step when the hook counts tests) leaves the card, even when the worktree gated its own
 * tree again after the rehearsal. No check is dropped silently: a step the hook did not run reads
 * `! <step>  not run on the merged tree` (a warning, not stale; `not run by the commit hook on this tree` when
 * the tree checked is the worktree's own), a failed one stays `✗ ... (the tree changed since)`, and the tdd step
 * stays. The worktree's own hook record counts, like a stored one, only when it ran against what is installed now.
 * The gate records are the worktree's last runs and the records of the tree the card checks that any worktree
 * of the repository stored, their tdd steps left out (a tdd verdict is the worktree's own, not the tree's).
 * So the tdd line is the worktree's: stale only when its record is of another tree than the worktree's now, never
 * because the tree checked is a merge's.
 * A line from a record made at a commit outside HEAD's history (a branch commit's hook record read for a
 * merge on main) ends `· from <commit>`, a rehearsal's `· rehearsal`. A stored record counts only when it
 * ran against what is installed now (the same `node_modules`, the same `file:` dependencies) with the
 * command of its mode now. A record of another tree than the one checked is marked stale: it warns, or stays
 * failed. Beside them, each line the card composes: the rules (the recap's), what the package owes its mutation
 * runs (read from the mutation store when the card is built), the review from the hand-over folder's findings
 * ledger and round snapshots, and a contributor's contrib rows from the contrib record of the checked tree.
 */
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'

import { findContribRecord } from '../contrib/contrib-key.ts'
import { CONTRIB_SKIP_LABEL } from '../contrib/contrib.constants.ts'
import { counted } from '../counted.ts'
import { pairRuns } from '../events/pair-runs.ts'
import { readEvents } from '../events/read-events.ts'
import { STATION_VERDICTS } from '../events/station-event.constants.ts'
import { resolveConfiguredBase } from '../gate/gate-base.ts'
import {
	FLAKY_NOTE,
	GATE_SKIP_LABEL,
	UNWIRED_NOT_RUN_REASON,
} from '../gate/gate-config.constants.ts'
import { GateConfigError } from '../gate/gate-config.ts'
import { isAncestorCommit, readGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { MUTATION_GATE_NAME } from '../mutation/pending-verdict.constants.ts'
import { lotModeOf, pendingVerdict } from '../mutation/pending-verdict.ts'
import { readPackageJson } from '../package-json.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { readLateFixes } from '../review-rounds/late-fixes.ts'
import { independentLedgerRounds, readReviewLedger } from '../review-rounds/ledger-rounds.ts'
import { snapshotRounds } from '../review-rounds/round-names.ts'
import { readIdentity } from '../store/identity.ts'
import { interimEffortOf } from '../store/lot-records.ts'
import { capOf, isEnded } from '../store/next-station.ts'
import { readBeyondCapRows, snapshotTimeOf, writesStepEvents } from '../store/station-records.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'
import { readInstalledKey } from './check-key.ts'
import { findReusableRecord, isGreenRecord, isSameKey, readTreeRecords } from './check-store.ts'
import {
	BASE_MOVED_SUFFIX,
	CONTRIB_HEAD_MOVED_SUFFIX,
	CONTRIB_KEY_CHANGED_SUFFIX,
	CONTRIB_LINE_NAME,
	CONTRIB_NEVER_RUN_DETAIL,
	DETAIL_SEPARATOR,
	FAILING_DETAIL,
	FAILING_MORE,
	FAILING_PATH_SEPARATOR,
	FAILING_PATHS_SHOWN,
	FLAKY_DETAIL,
	FLAKY_PASSED_DETAIL,
	GATE_LINE_NAME,
	GATE_RELEASE_LINE_NAME,
	HOOK_BASE_DETAIL,
	HOOK_RECORD_DETAIL,
	HOOK_RECORD_MODE,
	HOOK_REUSED_DETAIL,
	GATE_BASE_PROBLEM_DETAIL,
	INDEPENDENT_ASKS_FIXES_DETAIL,
	INDEPENDENT_LEDGER_ROUND_DETAIL,
	INDEPENDENT_LEDGER_ROUNDS_DETAIL,
	INDEPENDENT_VERDICT_DETAIL,
	INVALID_GATE_CONFIG_DETAIL,
	MISSING_SCRIPT_DETAIL,
	MISSING_SCRIPT_PATTERN,
	NEVER_RUN_DETAIL,
	NIT_SEVERITY,
	NO_FINDINGS_DETAIL,
	NO_INDEPENDENT_REVIEW_DETAIL,
	NO_LEDGER_DETAIL,
	NOT_RUN_BY_HOOK_DETAIL,
	NOT_RUN_DETAIL,
	LATE_FIXES_LINE_NAME,
	LATE_FIXES_NOT_CHECKED_DETAIL,
	LATE_FIXES_UNVERIFIED_DETAIL,
	LATE_FIXES_VERIFIED_DETAIL,
	LATE_FIXES_VERIFY_COMMAND_DETAIL,
	NO_LATE_FIXES_DETAIL,
	NO_REVIEW_SNAPSHOT_DETAIL,
	NOT_RUN_HERE_DETAIL,
	NOT_RUN_ON_CHECKED_TREE_DETAIL,
	NOT_WIRED_DETAIL,
	NOT_WIRED_FAILED_DETAIL,
	NOTHING_SELECTED_DETAIL,
	OLDER_BASE_SUFFIX,
	OPTED_OUT_DETAIL,
	RECORD_FROM_DETAIL,
	REHEARSAL_ORIGIN,
	REHEARSAL_RECORD_DETAIL,
	RELEASE_FAILED_DETAIL,
	RELEASE_GREEN_DETAIL,
	RELEASE_RECORD_MODE,
	REVIEW_APPROVED_DETAIL,
	REVIEW_APPROVED_PART,
	REVIEW_GO_AHEAD_DETAIL,
	REVIEW_GO_AHEAD_SEPARATOR,
	REVIEW_LINE_NAME,
	REVIEW_ROUND_COUNT,
	REVIEW_ROUNDS_GO_AHEAD_DETAIL,
	REVIEW_ROUNDS_NO_EFFORT_DETAIL,
	REVIEW_ROUNDS_NO_GO_AHEAD_DETAIL,
	REVIEW_ROUNDS_OF_CAP_DETAIL,
	RULES_LINE_NAME,
	SELECTED_DETAIL,
	SELECTED_ID_SEPARATOR,
	SHORT_SHA_LENGTH,
	SLEPT_GATE_RUN,
	SLEPT_LINE_DETAIL,
	SLEPT_LINE_NAME,
	TREE_CHANGED_SUFFIX,
} from './gate-records.constants.ts'
import {
	readContribRecord,
	readGateRecords,
	readReleaseRecord,
	readRulesRecord,
} from './gate-records.ts'
import { readModeCommandHashes } from './mode-command-hashes.ts'
import { computeStateTree, hashStateTree } from './state-hash.ts'

import type { LotEvent } from '../events/event.types.ts'
import type { StepCounts, StepSelection } from '../gate/gate.types.ts'
import type { LateFixes, ReviewLedger } from '../review-rounds/review-rounds.types.ts'
import type { StationName, StationVerdict } from '../store/next-station.types.ts'
import type {
	CardGateConfig,
	CardGateLine,
	ReviewLinePart,
	CheckKey,
	GateRecord,
	GateRecordMode,
	RecordBaseCheck,
	RecordedStep,
} from './gate-records.types.ts'

export function buildCardGateLines(params: {
	/** The worktree the records are of. */
	root: string
	/**
	 * The tree the hand-over commits (the worktree's, or the tree its last merge lot leaves): a gate record of
	 * another tree is stale, but for its tdd step (checked against the worktree's tree, `stateHash`); a hook
	 * record of this tree not dropped by a newer gate record of this tree supersedes the gate records of another
	 * tree: the steps it answers leave the card, the others read `not run on the merged tree`, a failed one and
	 * the tdd step stay.
	 */
	tree: string
	/** The state hash of the worktree now, which the tdd line is checked against. Default: computed from `root`. */
	stateHash?: string
	/**
	 * A committed merge hand-over: the state hash of the worktree's own lot tree (the tree before its first merge
	 * lot), which the worktree's tdd verdict was taken on. While a hook record of `tree` stands (the hook proved
	 * the merge), a tdd line of that tree is current too.
	 */
	ownLotStateHash?: string
	/**
	 * The commit the card resolves its gate base on, as the hand-over will (the lots file's HEAD); default HEAD.
	 * Read only when a gate list holds a scoped step.
	 */
	head?: string
	/** A release hand-over (`"release": true`): the required `gate release` row is added. */
	release?: boolean
}): CardGateLine[] {
	const { root, tree } = params
	const config = readCardGateConfig({ root, head: params.head })
	const own = readGateRecords(root)
	const others = readTreeRecords({ root, tree }).filter(
		(record) => !own.some((ownRecord) => isSameRun({ record, other: ownRecord })),
	)
	const stored = others.filter(currentStoredRecord({ root, tree, config })).map(withoutTddStep)
	const records = [...own.filter(ownHookOfThisInstall(root)), ...stored]
	const stateHash = hashStateTree(tree)
	const worktreeStateHash = params.stateHash ?? hashStateTree(computeStateTree(root))
	return [
		...gateStepLines({
			records,
			stateHash,
			worktreeStateHash,
			notRunDetail:
				stateHash === worktreeStateHash ? NOT_RUN_BY_HOOK_DETAIL : NOT_RUN_ON_CHECKED_TREE_DETAIL,
			ownLotStateHash: params.ownLotStateHash,
			outsideHistory: commitsOutsideHistory({ root, records }),
			baseCheck: recordBaseCheck({ root, base: config.base }),
		}),
		...sleptGateLines({ root, tree }),
		...(config.invalid === undefined
			? []
			: [
					{
						name: GATE_LINE_NAME,
						status: 'failed' as const,
						detail: INVALID_GATE_CONFIG_DETAIL.replace('{message}', () => config.invalid ?? ''),
					},
				]),
		...(config.baseRefusal === undefined
			? []
			: [
					{
						name: GATE_LINE_NAME,
						status: 'failed' as const,
						detail: GATE_BASE_PROBLEM_DETAIL.replace('{message}', () => config.baseRefusal ?? ''),
					},
				]),
		...(params.release ? [releaseLine({ root, tree, config })] : []),
	]
}

/**
 * A warning row for each of the worktree's gate records of the checked tree (`--fast`, `--full`, `--release`) whose
 * run spanned a sleep of the machine; none for a record of another tree.
 */
function sleptGateLines(params: { root: string; tree: string }): CardGateLine[] {
	const stateHash = hashStateTree(params.tree)
	const release = readReleaseRecord(params.root)
	return [...readGateRecords(params.root), ...(release ? [release] : [])].flatMap(
		function sleptLines(record) {
			if (record.sleptMs === undefined || record.stateHash !== stateHash) return []
			return [
				sleptLineOf({
					sleptMs: record.sleptMs,
					run: SLEPT_GATE_RUN.replace('{mode}', record.mode),
				}),
			]
		},
	)
}

/** The warning row of a run that spanned a sleep: `slept <duration> during <run>`. */
export function sleptLineOf(params: { sleptMs: number; run: string }): CardGateLine {
	return {
		name: SLEPT_LINE_NAME,
		status: 'warning',
		detail: SLEPT_LINE_DETAIL.replace('{duration}', formatDuration(params.sleptMs)).replace(
			'{run}',
			params.run,
		),
	}
}

/**
 * The package's gate config as the card reads it, once: the base resolved on `head` when a gate list holds a
 * scoped step, the command hash of each mode at that base; the message of a config the cli cannot run; nothing
 * of a package.json the gate itself could not read (no stored record can be told current then).
 */
function readCardGateConfig(params: { root: string; head: string | undefined }): CardGateConfig {
	const { root } = params
	try {
		const packageJson = readPackageJson(root)
		const base = resolveConfiguredBase({
			root,
			packageJson,
			...(params.head !== undefined && { head: params.head }),
		})
		// a set dialecte.baseBranch naming no branch: no stored record can be told current
		if (base !== undefined && 'refusal' in base) return { baseRefusal: base.refusal }
		return {
			...(base && { base }),
			hashes: readModeCommandHashes({ root, packageJson, gateBase: base?.commit }),
		}
	} catch (error) {
		if (error instanceof GateConfigError) return { invalid: error.message }
		// a package.json that is no JSON: the card still prints
		return {}
	}
}

/**
 * How a record's gate base reads against the card's `base`: undefined when the card has none (no scoped step), the
 * record holds none or is a release record; `same`; `older` when it is an ancestor of the card's; else `moved`. Each base asked once.
 */
function recordBaseCheck(params: {
	root: string
	base: CardGateConfig['base']
}): (record: GateRecord) => RecordBaseCheck | undefined {
	const { root, base } = params
	const answers = new Map<string, RecordBaseCheck>()
	return function checkBase(record) {
		// a release record selected against the empty tree: everything, whatever the card's base
		if (base === undefined || record.base === undefined || record.mode === RELEASE_RECORD_MODE)
			return undefined
		const commit = record.base.commit
		if (commit === base.commit) return 'same'
		const known = answers.get(commit)
		if (known) return known
		const answer = isAncestorCommit({ root, ancestor: commit, descendant: base.commit })
			? 'older'
			: 'moved'
		answers.set(commit, answer)
		return answer
	}
}

/**
 * The `gate release` row of a release hand-over: ✓ when a green release record of `tree` holds the current release
 * key (the worktree's or the store's); else from the worktree's last release record: none or another key → never
 * run on this tree, another tree → stale, failed → the step it failed at.
 */
function releaseLine(params: { root: string; tree: string; config: CardGateConfig }): CardGateLine {
	const { root, tree } = params
	const releaseHash = params.config.hashes?.release
	const key =
		releaseHash === undefined
			? undefined
			: { tree, ...readInstalledKey(root), commandHash: releaseHash }
	const green: CardGateLine = {
		name: GATE_RELEASE_LINE_NAME,
		status: 'passed',
		detail: RELEASE_GREEN_DETAIL,
	}
	if (key && findReusableRecord({ root, mode: RELEASE_RECORD_MODE, key })) return green
	const never: CardGateLine = {
		name: GATE_RELEASE_LINE_NAME,
		status: 'failed',
		detail: NEVER_RUN_DETAIL,
	}
	const record = readReleaseRecord(root)
	if (record === undefined) return never
	if (record.stateHash !== hashStateTree(tree))
		return staleLine({
			line: isGreenRecord(record) ? green : failedReleaseLine(record),
			suffix: TREE_CHANGED_SUFFIX,
		})
	if (key === undefined || !isSameKey({ key, other: record.key })) return never
	return isGreenRecord(record) ? green : failedReleaseLine(record)
}

/** The `gate release` row of a failed release record: the step it failed at. */
function failedReleaseLine(record: GateRecord): CardGateLine {
	const failed = record.steps.find((step) => step.status === 'failed')
	return {
		name: GATE_RELEASE_LINE_NAME,
		status: 'failed',
		detail: RELEASE_FAILED_DETAIL.replace('{step}', failed?.name ?? ''),
	}
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
				...withRecordSource({
					line: lineOfStep({ step, skipLabel: CONTRIB_SKIP_LABEL }),
					record,
					outsideHistory,
				}),
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
 * have now - what is installed, the `file:` dependencies, the command of the record's mode at the card's base
 * (`readCommandHashes`); a release record only when green and its list covers `full`, standing in for a full one.
 */
function currentStoredRecord(params: {
	root: string
	tree: string
	config: CardGateConfig
}): (record: GateRecord) => boolean {
	const { root, tree } = params
	// what a run here would hold now is read only when another run's record is there to compare with
	let installed: Pick<CheckKey, 'lockHash' | 'linked'> | undefined
	const commands = readCommandHashes(params.config)
	return function isCurrent(record) {
		const commandHash = commands[record.mode]
		if (commandHash === undefined) return false
		if (record.mode === RELEASE_RECORD_MODE && !isGreenRecord(record)) return false
		installed ??= readInstalledKey(root)
		return isSameKey({ key: { tree, ...installed, commandHash }, other: record.key })
	}
}

/**
 * Which of the worktree's own records count: every gate record, and a commit hook's record only when it ran against
 * what is installed now (the same `node_modules`, the same `file:` dependencies), as a stored record must; a hook
 * record of another install supersedes nothing and gives no line.
 */
function ownHookOfThisInstall(root: string): (record: GateRecord) => boolean {
	// what is installed is read only when an own hook record is there to compare with
	let installed: Pick<CheckKey, 'lockHash' | 'linked'> | undefined
	return function isOfThisInstall(record) {
		if (record.mode !== HOOK_RECORD_MODE || record.key === undefined) return true
		installed ??= readInstalledKey(root)
		return record.key.lockHash === installed.lockHash && record.key.linked === installed.linked
	}
}

/**
 * The command hash each record mode must hold to count, at the card's base: none when the package's gate config
 * cannot be read (no stored record counts then, and the card still prints); release only when its list covers
 * `full`.
 */
function readCommandHashes(config: CardGateConfig): Partial<Record<GateRecordMode, string>> {
	const { hashes } = config
	if (hashes === undefined) return {}
	return {
		fast: hashes.fast,
		full: hashes.full,
		[HOOK_RECORD_MODE]: hashes.hook,
		...(hashes.releaseCoversFull && { [RELEASE_RECORD_MODE]: hashes.release }),
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

/**
 * Each step's line from its latest record; `gate never run` when there is no record. The tdd line is checked
 * against the worktree's tree, every other line against the tree the card checks.
 */
function gateStepLines(params: {
	records: GateRecord[]
	stateHash: string
	/** The state hash of the worktree's tree now: the tdd line is checked against it. */
	worktreeStateHash: string
	/** What a step the standing hook did not run reads: of the merged tree, or of the worktree's own tree. */
	notRunDetail: string
	/** A committed merge hand-over's own lot tree: its tdd line is current while the hook proved the merge. */
	ownLotStateHash: string | undefined
	/** The commits of records outside HEAD's history: a line of such a record says which. */
	outsideHistory: ReadonlySet<string>
	/** How a record's gate base reads against the card's (`recordBaseCheck`). */
	baseCheck: (record: GateRecord) => RecordBaseCheck | undefined
}): CardGateLine[] {
	if (params.records.length === 0)
		return [{ name: GATE_LINE_NAME, status: 'failed', detail: NEVER_RUN_DETAIL }]
	const latest = new Map<string, { step: RecordedStep; record: GateRecord }>()
	const { stateHash } = params
	const oldestFirst = currentRecords({ records: params.records, stateHash }).sort((first, second) =>
		first.at.localeCompare(second.at),
	)
	const superseded = isSuperseded({ records: oldestFirst, stateHash })
	const tddStateHashes = currentTddStateHashes({ ...params, records: oldestFirst })
	for (const record of oldestFirst)
		for (const step of record.steps) latest.set(step.name, { step, record })
	return [...latest.values()].map(function stepLine(entry) {
		// a step the standing hook did not run: said so, a warning of no tree; a failed one stays as it is
		if (
			superseded(entry.record) &&
			entry.step.name !== TDD_STEP.name &&
			entry.step.status !== 'failed'
		)
			return { name: entry.step.name, status: 'warning', detail: params.notRunDetail }
		// the tdd step judged the worktree's receipts: no base reads it
		const based = entry.step.name === TDD_STEP.name ? undefined : params.baseCheck(entry.record)
		const line = lineOfStep({ step: entry.step, olderBase: based === 'older' })
		const checked = withTreeCheck({
			line: withRecordSource({
				line:
					entry.record.mode === HOOK_RECORD_MODE ? fromHook({ line, record: entry.record }) : line,
				record: entry.record,
				outsideHistory: params.outsideHistory,
			}),
			current:
				entry.step.name === TDD_STEP.name
					? tddStateHashes.has(entry.record.stateHash)
					: entry.record.stateHash === params.stateHash,
		})
		return based === 'moved' && !checked.stale
			? staleLine({ line: checked, suffix: BASE_MOVED_SUFFIX })
			: checked
	})
}

/**
 * The trees a tdd line is current on: the worktree's now; for a committed merge hand-over whose merge a standing
 * hook record of the checked tree proved, the worktree's own lot tree too (its verdict was taken there).
 */
function currentTddStateHashes(params: {
	records: readonly GateRecord[]
	stateHash: string
	worktreeStateHash: string
	ownLotStateHash: string | undefined
}): ReadonlySet<string> {
	const { ownLotStateHash } = params
	const mergeProven =
		ownLotStateHash !== undefined &&
		params.records.some(
			(record) => record.mode === HOOK_RECORD_MODE && record.stateHash === params.stateHash,
		)
	return new Set(
		mergeProven ? [params.worktreeStateHash, ownLotStateHash] : [params.worktreeStateHash],
	)
}

/**
 * The records the card reads: a commit hook's record only when no gate record is newer - for a hook record of
 * `stateHash`'s tree, no gate record of that tree. The hook names its own scripts (`test:run`, `lint:check`),
 * never the gate's steps, so a later gate run could not replace its lines one by one: it replaces the whole
 * record. The mirror: while a hook record of `stateHash`'s tree stands, every gate record of another tree loses
 * the steps that hook answers (a step of the same name, or a test step when the hook counts tests); its tdd step
 * (the worktree's verdict), its failed steps and the steps the hook did not run stay.
 */
function currentRecords(params: {
	records: readonly GateRecord[]
	stateHash: string
}): GateRecord[] {
	const { records, stateHash } = params
	const gates = records.filter((record) => record.mode !== HOOK_RECORD_MODE)
	const newestGate = newestAt(gates)
	const newestCheckedGate = newestAt(gates.filter((record) => record.stateHash === stateHash))
	const standing = records.filter(function stands(record) {
		if (record.mode !== HOOK_RECORD_MODE) return true
		return record.at > (record.stateHash === stateHash ? newestCheckedGate : newestGate)
	})
	const checkedHooks = standing.filter(
		(record) => record.mode === HOOK_RECORD_MODE && record.stateHash === stateHash,
	)
	if (checkedHooks.length === 0) return standing
	const superseded = isSuperseded({ records: standing, stateHash })
	return standing.map(function supersededByHook(record) {
		return superseded(record) ? withoutAnsweredSteps({ record, hooks: checkedHooks }) : record
	})
}

/**
 * Which of `records` a standing hook record of `stateHash`'s tree supersedes: the gate records of another tree,
 * when such a hook record is among them.
 */
function isSuperseded(params: {
	records: readonly GateRecord[]
	stateHash: string
}): (record: GateRecord) => boolean {
	const { stateHash } = params
	const checkedHookStands = params.records.some(
		(record) => record.mode === HOOK_RECORD_MODE && record.stateHash === stateHash,
	)
	return function superseded(record) {
		return checkedHookStands && record.mode !== HOOK_RECORD_MODE && record.stateHash !== stateHash
	}
}

/** The time of the newest of `records`; `''` when there is none. */
function newestAt(records: readonly GateRecord[]): string {
	return records.reduce((newest, record) => (record.at > newest ? record.at : newest), '')
}

/**
 * A gate record a standing hook record of the checked tree superseded, without the steps `hooks` answer: a hook
 * step of the same name, or, for a step counting tests, a hook step counting tests (the hook runs the full gate's
 * test steps). Its tdd step (the worktree's own) and its failed steps always stay.
 */
function withoutAnsweredSteps(params: {
	record: GateRecord
	hooks: readonly GateRecord[]
}): GateRecord {
	const hookSteps = params.hooks.flatMap((hook) => hook.steps)
	const hookCountsTests = hookSteps.some((step) => step.counts.tests !== undefined)
	return {
		...params.record,
		steps: params.record.steps.filter(function unanswered(step) {
			if (step.name === TDD_STEP.name || step.status === 'failed') return true
			if (hookSteps.some((hookStep) => hookStep.name === step.name)) return false
			return !(step.counts.tests !== undefined && hookCountsTests)
		}),
	}
}

/**
 * A line read from a commit hook's record: its detail ends saying so, after the base its hook used when it printed
 * one (`✓ test:run  1214/1214 · base 1a2b3c4d5e6f · commit hook`).
 */
function fromHook(params: { line: CardGateLine; record: GateRecord }): CardGateLine {
	const { line, record } = params
	const base =
		record.base && HOOK_BASE_DETAIL.replace('{base}', record.base.commit.slice(0, SHORT_SHA_LENGTH))
	return {
		...line,
		detail: [line.detail, base, HOOK_RECORD_DETAIL].filter(Boolean).join(DETAIL_SEPARATOR),
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

/**
 * The line of a recorded step; a scoped step's line holds its selection and says, after its counts, what it
 * selected since its base (` (older base)` after it when `olderBase`).
 */
function lineOfStep(params: {
	step: RecordedStep
	olderBase?: boolean
	/** The opt-out key of the record's run: `dialecte.gate.skip` (the default) or `dialecte.contrib.skip`. */
	skipLabel?: string
}): CardGateLine {
	const { step } = params
	const line = lineOfUnscopedStep({ step, skipLabel: params.skipLabel ?? GATE_SKIP_LABEL })
	if (step.selection === undefined) return line
	// a passed scoped step says its counts and its selection, never the note the selection already says
	const selected =
		line.status === 'passed'
			? {
					detail: [renderCardCounts(step.counts), selectionDetail({ selection: step.selection })]
						.filter(Boolean)
						.join(DETAIL_SEPARATOR)
						.concat(params.olderBase ? OLDER_BASE_SUFFIX : ''),
				}
			: {}
	return { ...line, ...selected, selection: step.selection }
}

/** `selected <ids> since <short base>`, or `nothing selected since <short base> (<n> paths)`. */
function selectionDetail(params: { selection: StepSelection }): string {
	const { selection } = params
	const base = selection.base.slice(0, SHORT_SHA_LENGTH)
	return selection.ids.length
		? SELECTED_DETAIL.replace('{ids}', selection.ids.join(SELECTED_ID_SEPARATOR)).replace(
				'{base}',
				base,
			)
		: NOTHING_SELECTED_DETAIL.replace('{base}', base).replace(
				'{paths}',
				counted({ count: selection.changed, noun: 'path' }),
			)
}

/**
 * The line of a recorded step from its status, counts and reason; `skipLabel` the opt-out key of the record's run,
 * named by a failed unwired step's line.
 */
function lineOfUnscopedStep(params: { step: RecordedStep; skipLabel: string }): CardGateLine {
	const { step, skipLabel } = params
	const { name } = step
	// left not run by an unwired step of the list (none ran), not by an earlier failure: the recorded reason says so
	if (step.status === 'not-run')
		return {
			name,
			status: 'warning',
			detail: step.reason === UNWIRED_NOT_RUN_REASON ? UNWIRED_NOT_RUN_REASON : NOT_RUN_DETAIL,
		}
	// an opted-out step warns with the package's reason, never blocks
	const { optedOut } = step
	if (optedOut !== undefined)
		return { name, status: 'warning', detail: OPTED_OUT_DETAIL.replace('{reason}', () => optedOut) }
	// an unwired step failed a full, release or contrib run, and was skipped in a fast one: a warning there
	if (step.unwired)
		return step.status === 'failed'
			? {
					name,
					status: 'failed',
					detail: NOT_WIRED_FAILED_DETAIL.replace('{label}', () => skipLabel),
				}
			: { name, status: 'warning', detail: NOT_WIRED_DETAIL }
	if (step.status === 'skipped')
		return {
			name,
			status: 'warning',
			detail: NOT_RUN_HERE_DETAIL.replace('{reason}', shortReason(step.reason ?? '')),
		}
	// a hook's test step answered from a green `gate --full` record ran no test: it says so instead of counts
	if (step.status === 'passed' && step.reused)
		return { name, status: 'passed', detail: HOOK_REUSED_DETAIL }
	// a test step that failed in parallel and passed serially: flaky, never a failed count beside its check mark
	if (step.status === 'passed' && step.note === FLAKY_NOTE) return flakyLineOf(step)
	const counts = renderCardCounts(step.counts)
	if (step.status === 'failed')
		return {
			name,
			status: 'failed',
			detail: [counts, step.reason ?? '', step.failing && failingDetail(step.failing)]
				.filter(Boolean)
				.join(DETAIL_SEPARATOR),
			...(step.failing && { failing: step.failing }),
		}
	return { name, status: 'passed', detail: counts || (step.note ?? '') }
}

/**
 * The line of a step flaky in parallel: the tests that passed, then `<n> flaky, passed serially` (n the files it
 * named failing in parallel, else the tests that failed there).
 */
function flakyLineOf(step: RecordedStep): CardGateLine {
	const passed = step.counts.tests?.passed
	const flaky = step.failing?.length ?? step.counts.tests?.failed ?? 0
	return {
		name: step.name,
		status: 'passed',
		detail: [
			passed === undefined ? '' : FLAKY_PASSED_DETAIL.replace('{passed}', String(passed)),
			FLAKY_DETAIL.replace('{count}', String(flaky)),
		]
			.filter(Boolean)
			.join(DETAIL_SEPARATOR),
	}
}

/** `failing <n>: <first 3 paths>`, then `, +<k> more` when there are more. */
function failingDetail(failing: readonly string[]): string {
	const shown = failing.slice(0, FAILING_PATHS_SHOWN)
	const more = failing.length - shown.length
	return FAILING_DETAIL.replace('{count}', String(failing.length)).replace(
		'{paths}',
		[...shown, ...(more > 0 ? [FAILING_MORE.replace('{more}', String(more))] : [])].join(
			FAILING_PATH_SEPARATOR,
		),
	)
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
 * The review line (33L1 section 6, 6b; D18, D24). The rounds are the `round-<n>/` snapshots, against the cap of the
 * lot's effort; the independent review is required after the last snapshot: a `station.end` of
 * `independent-reviewer` strictly after the snapshot's time, the last one, ended by the walk's rule with a verdict
 * (R3-1), else, for a folder without step events, the ledger rows of a round above it. None:
 * `✗ no independent review after round <n>`; a last end `fix-then-repass`: `✗ independent review asks for fixes`
 * with the fixer's command; another word than `approve`: a failed part naming it. Then the open findings of
 * the ledger: `✗` when a blocking or should-fix row is open, `!` when only nits are. A release hand-over, a folder
 * holding no review evidence at all (no snapshot, no ledger row, no independent end), and a folder without step events
 * and with no snapshot keep the ledger-only line.
 */
export function buildReviewLine(params: { folder: string; release?: boolean }): CardGateLine {
	const { folder } = params
	const ledger = readReviewLedger({ folder })
	const snapshots = snapshotRounds(folder)
	if (params.release) return ledgerOnlyReviewLine({ ledger, snapshots })
	const lastRound = snapshots.at(-1) ?? 0
	const events = readFolderEvents({ folder })
	const verdict = independentVerdictOf({
		folder,
		events,
		lastRound,
		snapshotted: snapshots.length > 0,
	})
	if (snapshots.length === 0 && ledger.rows.length === 0 && verdict === undefined)
		return ledgerOnlyReviewLine({ ledger, snapshots })
	const ledgerStands = ledgerStandsIn({ folder, events })
	// with no snapshot, a folder without step events keeps the ledger-only line: its rows claim no independent review
	// (R1-6, R2-2); with step events, the ledger never stands in for a review round: no snapshot is no review round
	if (snapshots.length === 0 && ledgerStands) return ledgerOnlyReviewLine({ ledger, snapshots })
	if (snapshots.length === 0)
		return {
			name: REVIEW_LINE_NAME,
			status: 'failed',
			detail: fillMessage({
				template: NO_REVIEW_SNAPSHOT_DETAIL,
				values: { id: basename(folder) },
			}),
		}
	if (verdict === 'fix-then-repass')
		return {
			name: REVIEW_LINE_NAME,
			status: 'failed',
			detail: fillMessage({
				template: INDEPENDENT_ASKS_FIXES_DETAIL,
				values: { id: basename(folder) },
			}),
		}
	const ledgerPart =
		verdict === undefined && ledgerStands ? independentLedgerPart({ ledger, lastRound }) : undefined
	const independent: ReviewLinePart | undefined =
		verdict !== undefined
			? independentVerdictPart({ verdict })
			: ledgerPart
				? { status: 'passed', detail: ledgerPart }
				: undefined
	if (independent === undefined)
		return {
			name: REVIEW_LINE_NAME,
			status: 'failed',
			detail: fillMessage({
				template: NO_INDEPENDENT_REVIEW_DETAIL,
				values: { round: String(lastRound) },
			}),
		}
	const parts: ReviewLinePart[] = [
		roundsPart({ folder, snapshots }),
		independent,
		openFindingsPart({ ledger, approved: REVIEW_APPROVED_PART }),
	]
	return {
		name: REVIEW_LINE_NAME,
		status: worstStatusOf(parts),
		detail: parts.map((part) => part.detail).join(DETAIL_SEPARATOR),
	}
}

/**
 * The card's `late fixes` line (33L1 6b, D19): none when the tree is the last snapshot's or the last verified one's
 * (no line), `! unverified since round <n> (<k> files): dialecte lot verify <lot name> --by <who> --note <text>`,
 * `✓ verified by <who>: <note>`, `! not checked (round <n> has no state)`. A warning only: never a failed line.
 */
export function buildLateFixesLine(params: {
	folder: string
	root: string
	stateHash: string
}): CardGateLine | undefined {
	const lateFixes = readLateFixes(params)
	if (lateFixes.kind === 'none') return undefined
	return {
		name: LATE_FIXES_LINE_NAME,
		status: lateFixes.kind === 'verified' ? 'passed' : 'warning',
		detail: lateFixesDetailOf({ lateFixes, id: basename(params.folder) }),
	}
}

/**
 * The words of a lot's late fixes after `late fixes`: the card's, with the files and the command verifying them for
 * the hand-over folder named `id`; the `verify` guard's without `id`.
 */
export function lateFixesDetailOf(params: { lateFixes: LateFixes; id?: string }): string {
	const { lateFixes } = params
	if (lateFixes.kind === 'none') return NO_LATE_FIXES_DETAIL
	if (lateFixes.kind === 'verified')
		return fillMessage({
			template: LATE_FIXES_VERIFIED_DETAIL,
			values: { by: lateFixes.by, note: lateFixes.note },
		})
	const round = String(lateFixes.round)
	if (lateFixes.kind === 'not-checked')
		return fillMessage({ template: LATE_FIXES_NOT_CHECKED_DETAIL, values: { round } })
	const unverified = fillMessage({ template: LATE_FIXES_UNVERIFIED_DETAIL, values: { round } })
	if (params.id === undefined) return unverified
	return `${unverified}${fillMessage({
		template: LATE_FIXES_VERIFY_COMMAND_DETAIL,
		values: { files: counted({ count: lateFixes.files, noun: 'file' }), id: params.id },
	})}`
}

/**
 * The review line from the findings ledger alone (a release hand-over's, 33L1 Q13): approved when no row is open,
 * `!` when only nits are or the ledger holds no row yet, `✗` when a blocking or should-fix row is; the rounds are
 * the highest of the rows' and the snapshots'.
 */
function ledgerOnlyReviewLine(params: { ledger: ReviewLedger; snapshots: number[] }): CardGateLine {
	const { ledger } = params
	if (!ledger.exists) return { name: REVIEW_LINE_NAME, status: 'warning', detail: NO_LEDGER_DETAIL }
	const rounds = Math.max(0, ...ledger.rows.map((row) => row.round ?? 0), ...params.snapshots)
	const roundsText = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`
	// a ledger made before the reviewer answered approves nothing
	if (ledger.rows.length === 0)
		return {
			name: REVIEW_LINE_NAME,
			status: 'warning',
			detail: `${roundsText}${DETAIL_SEPARATOR}${NO_FINDINGS_DETAIL}`,
		}
	const open = openFindingsPart({ ledger, approved: REVIEW_APPROVED_DETAIL })
	return {
		name: REVIEW_LINE_NAME,
		status: open.status,
		detail: `${roundsText}${DETAIL_SEPARATOR}${open.detail}`,
	}
}

/** Today's open-findings part: `✗` for an open blocking or should-fix row, `!` for open nits, else `approved`. */
function openFindingsPart(params: { ledger: ReviewLedger; approved: string }): ReviewLinePart {
	const openSeverities = params.ledger.rows.flatMap((row) =>
		row.openSeverity === undefined ? [] : [row.openSeverity],
	)
	const nits = openSeverities.filter((severity) => severity === NIT_SEVERITY).length
	const blocking = openSeverities.length - nits
	if (blocking) return { status: 'failed', detail: `${blocking} open: blocking or should fix` }
	if (nits) return { status: 'warning', detail: `${nits} ${nits === 1 ? 'nit' : 'nits'} open` }
	return { status: 'passed', detail: params.approved }
}

/** The lot's events as `readStationRecords` reads them; none without an `events.jsonl`. */
function readFolderEvents(params: { folder: string }): LotEvent[] {
	return pairRuns({ events: readEvents({ file: join(params.folder, STORE_FILES.events) }).events })
		.events
}

/**
 * The verdict of the last `independent-reviewer` end strictly after the last snapshot (33L1 D4, D24.9: a tie is not
 * after; R3-1): only that end counts, and only when it ended by the walk's rule (`isEnded`: exit 0 or none, no
 * `failed` or `limit`) with a verdict; any end counts without a snapshot, none when the last snapshot's time does not
 * read.
 */
function independentVerdictOf(params: {
	folder: string
	events: readonly LotEvent[]
	lastRound: number
	snapshotted: boolean
}): StationVerdict | undefined {
	const snapshotTime = params.snapshotted
		? snapshotTimeOf({ lotFolder: params.folder, round: params.lastRound })
		: undefined
	if (snapshotTime === null) return undefined
	const after = snapshotTime === undefined ? -Infinity : Date.parse(snapshotTime)
	const station: StationName = 'independent-reviewer'
	const last = params.events
		.filter(function isIndependentEndAfter(event) {
			return (
				event.kind === 'station.end' && event.station === station && Date.parse(event.at) > after
			)
		})
		.at(-1)
	if (last === undefined) return undefined
	const end = {
		verdict: STATION_VERDICTS.find((known) => known === last.verdict),
		exit: typeof last.exit === 'number' ? last.exit : undefined,
	}
	return isEnded(end) ? end.verdict : undefined
}

/**
 * The independent review's part of the line from its counted verdict (R3-1): `approve` passes; another word fails with
 * the verdict named (`fix-then-repass` never reaches here: the whole line names the fixer).
 */
function independentVerdictPart(params: { verdict: StationVerdict }): ReviewLinePart {
	return {
		status: params.verdict === 'approve' ? 'passed' : 'failed',
		detail: fillMessage({
			template: INDEPENDENT_VERDICT_DETAIL,
			values: { verdict: params.verdict },
		}),
	}
}

/**
 * Whether the ledger stands in for the independent review's end (33L1 D24.3): a folder without `events.jsonl`, or
 * one whose events say the worktree's cli writes no step events.
 */
function ledgerStandsIn(params: { folder: string; events: readonly LotEvent[] }): boolean {
	return (
		!existsSync(join(params.folder, STORE_FILES.events)) ||
		!writesStepEvents({ events: params.events })
	)
}

/** The independent review as the ledger rows of the rounds above the last snapshot; undefined without one. */
function independentLedgerPart(params: {
	ledger: ReviewLedger
	lastRound: number
}): string | undefined {
	const rounds = independentLedgerRounds(params)
	const first = rounds.at(0)
	const last = rounds.at(-1)
	if (first === undefined || last === undefined) return undefined
	return fillMessage({
		template: first === last ? INDEPENDENT_LEDGER_ROUND_DETAIL : INDEPENDENT_LEDGER_ROUNDS_DETAIL,
		values: { first: String(first), last: String(last) },
	})
}

/**
 * The rounds part: the snapshots against the cap of the lot's effort (the interim read of 33L1 D2), each round above
 * the cap named with its go-ahead row, `!` when one has none.
 */
function roundsPart(params: { folder: string; snapshots: number[] }): ReviewLinePart {
	const { folder, snapshots } = params
	const count = snapshots.length
	const rounds = fillMessage({
		template: count === 1 ? REVIEW_ROUND_COUNT.one : REVIEW_ROUND_COUNT.many,
		values: { count: String(count) },
	})
	const effort = interimEffortOf({
		lotFolder: folder,
		identityEffort: readIdentity({ lotFolder: folder })?.effort,
	})
	if (effort === undefined)
		return {
			status: 'passed',
			detail: fillMessage({ template: REVIEW_ROUNDS_NO_EFFORT_DETAIL, values: { rounds } }),
		}
	const cap = String(capOf({ effort }))
	const beyond = snapshots.filter((round) => round > capOf({ effort }))
	if (beyond.length === 0)
		return {
			status: 'passed',
			detail: fillMessage({ template: REVIEW_ROUNDS_OF_CAP_DETAIL, values: { rounds, cap } }),
		}
	// the first go-ahead row of a round is the one that let its snapshot through (R1-10)
	const byRound = new Map<number, string>()
	for (const row of readBeyondCapRows({ lotFolder: folder }))
		if (!byRound.has(row.round)) byRound.set(row.round, row.by)
	if (beyond.some((round) => !byRound.has(round)))
		return {
			status: 'warning',
			detail: fillMessage({ template: REVIEW_ROUNDS_NO_GO_AHEAD_DETAIL, values: { rounds, cap } }),
		}
	const goAheads = beyond
		.map((round) =>
			fillMessage({
				template: REVIEW_GO_AHEAD_DETAIL,
				values: { round: String(round), by: byRound.get(round) ?? '' },
			}),
		)
		.join(REVIEW_GO_AHEAD_SEPARATOR)
	return {
		status: 'passed',
		detail: fillMessage({
			template: REVIEW_ROUNDS_GO_AHEAD_DETAIL,
			values: { rounds, cap, goAheads },
		}),
	}
}

/** The worst status of the parts: failed, then warning, then passed. */
function worstStatusOf(parts: readonly ReviewLinePart[]): CardGateLine['status'] {
	if (parts.some((part) => part.status === 'failed')) return 'failed'
	return parts.some((part) => part.status === 'warning') ? 'warning' : 'passed'
}
