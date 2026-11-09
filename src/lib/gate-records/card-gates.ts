/**
 * The hand-over card's gate lines, from records, never from prose. The gate steps: one per step (the latest record of
 * each step across the gate's two modes and the commit hook's record, which a newer gate record supersedes whole).
 * The other way round, a hook record of the tree the card checks, not dropped by a newer gate record of the checked
 * tree, supersedes every gate record of another tree: a merge hand-over's rehearsal (or commit) hook ran on the
 * merged tree, so each step of the worktree's gate of its tree before the merge that the hook answers (a step of
 * the same name, or a test step when the hook counts tests) leaves the card, even when the worktree gated its own
 * tree again after the rehearsal. No check is dropped silently: a step the hook did not run reads
 * `! <step>  not run on the merged tree` (a warning, not stale), a failed one stays `✗ ... (the tree changed
 * since)`, and the tdd step stays.
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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { findContribRecord } from '../contrib/contrib-key.ts'
import { counted } from '../counted.ts'
import { resolveConfiguredBase } from '../gate/gate-base.ts'
import { GateConfigError } from '../gate/gate-config.ts'
import { isAncestorCommit, readGit } from '../git.ts'
import { MUTATION_GATE_NAME } from '../mutation/pending-verdict.constants.ts'
import { lotModeOf, pendingVerdict } from '../mutation/pending-verdict.ts'
import { readPackageJson } from '../package-json.ts'
import { findLedgerTable, tableCells } from '../review-rounds/findings-ledger.ts'
import { LEDGER_FILE, SEVERITY_SPELLINGS } from '../review-rounds/review-rounds.constants.ts'
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
	GATE_LINE_NAME,
	GATE_RELEASE_LINE_NAME,
	HOOK_BASE_DETAIL,
	HOOK_RECORD_DETAIL,
	HOOK_RECORD_MODE,
	HOOK_REUSED_DETAIL,
	INVALID_GATE_CONFIG_DETAIL,
	MISSING_SCRIPT_DETAIL,
	MISSING_SCRIPT_PATTERN,
	NEVER_RUN_DETAIL,
	NIT_SEVERITY,
	NO_FINDINGS_DETAIL,
	NO_LEDGER_DETAIL,
	NOT_RUN_DETAIL,
	NOT_RUN_HERE_DETAIL,
	NOT_RUN_ON_CHECKED_TREE_DETAIL,
	NOTHING_SELECTED_DETAIL,
	OLDER_BASE_SUFFIX,
	OPEN_LEDGER_STATES,
	RECORD_FROM_DETAIL,
	REHEARSAL_ORIGIN,
	REHEARSAL_RECORD_DETAIL,
	RELEASE_FAILED_DETAIL,
	RELEASE_GREEN_DETAIL,
	RELEASE_RECORD_MODE,
	REVIEW_APPROVED_DETAIL,
	REVIEW_LINE_NAME,
	ROUND_FOLDER_PATTERN,
	RULES_LINE_NAME,
	SELECTED_DETAIL,
	SELECTED_ID_SEPARATOR,
	SHORT_SHA_LENGTH,
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

import type { StepCounts, StepSelection } from '../gate/gate.types.ts'
import type {
	CardGateConfig,
	CardGateLine,
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
	const records = [...own, ...stored]
	return [
		...gateStepLines({
			records,
			stateHash: hashStateTree(tree),
			worktreeStateHash: params.stateHash ?? hashStateTree(computeStateTree(root)),
			outsideHistory: commitsOutsideHistory({ root, records }),
			baseCheck: recordBaseCheck({ root, base: config.base }),
		}),
		...(config.invalid === undefined
			? []
			: [
					{
						name: GATE_LINE_NAME,
						status: 'failed' as const,
						detail: INVALID_GATE_CONFIG_DETAIL.replace('{message}', config.invalid),
					},
				]),
		...(params.release ? [releaseLine({ root, tree, config })] : []),
	]
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
				...withRecordSource({ line: lineOfStep({ step }), record, outsideHistory }),
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
	for (const record of oldestFirst)
		for (const step of record.steps) latest.set(step.name, { step, record })
	return [...latest.values()].map(function stepLine(entry) {
		// a step the standing hook did not run: said so, a warning of no tree; a failed one stays as it is
		if (
			superseded(entry.record) &&
			entry.step.name !== TDD_STEP.name &&
			entry.step.status !== 'failed'
		)
			return { name: entry.step.name, status: 'warning', detail: NOT_RUN_ON_CHECKED_TREE_DETAIL }
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
					? entry.record.stateHash === params.worktreeStateHash
					: entry.record.stateHash === params.stateHash,
		})
		return based === 'moved' && !checked.stale
			? staleLine({ line: checked, suffix: BASE_MOVED_SUFFIX })
			: checked
	})
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
function lineOfStep(params: { step: RecordedStep; olderBase?: boolean }): CardGateLine {
	const { step } = params
	const line = lineOfUnscopedStep(step)
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

/** The line of a recorded step from its status, counts and reason. */
function lineOfUnscopedStep(step: RecordedStep): CardGateLine {
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
			detail: [counts, step.reason ?? '', step.failing && failingDetail(step.failing)]
				.filter(Boolean)
				.join(DETAIL_SEPARATOR),
			...(step.failing && { failing: step.failing }),
		}
	return { name, status: 'passed', detail: counts || (step.note ?? '') }
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
