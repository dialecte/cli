/**
 * What a rehearsal does for each lot, decided before any clone: reuse a green record of the tree the lot's
 * commit will hold, or rehearse the lot in the scratch clone, and why. A plain lot is reused when the
 * repository's store holds a green `gate --full` of its tree, run against what is installed now (the same
 * `node_modules`, the same `file:` dependencies, the same steps), the lot does not change
 * `package-lock.json` and the commit hook stages no files of its own. A merge lot is reused when the tree it
 * leaves is its tip's tree and a green record of that tree (the branch commit's hook, or a `gate --full`)
 * matches what is installed now, under the same conditions. A contributor's last lot also says when the tree the
 * lots leave has no green contrib record: the rehearsal runs `dialecte contrib` on it in the clone. A green
 * `gate --release` record of a release list that covers `full` answers a plain or a merge lot as a full record would.
 * With a scoped step the full and hook records are keyed with the hand-over base, and a record of another base is
 * rehearsed saying the base moved.
 */
import { readFileSync } from 'node:fs'

import { findContribRecord } from '../contrib/contrib-key.ts'
import { readInstalledKey } from '../gate-records/check-key.ts'
import {
	isGreenRecord,
	isSameKey,
	originOfRecord,
	readTreeRecords,
} from '../gate-records/check-store.ts'
import {
	HOOK_RECORD_MODE,
	RELEASE_RECORD_MODE,
	SHORT_SHA_LENGTH,
} from '../gate-records/gate-records.constants.ts'
import { readModeCommandHashes } from '../gate-records/mode-command-hashes.ts'
import { listCommitHookFiles } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { readProfile } from '../profile/profile.ts'
import { HOOK_STAGES_PATTERN, PACKAGE_LOCK_FILE, REHEARSAL_REASONS } from './handover.constants.ts'
import { listLotTrees } from './lot-trees.ts'

import type { CheckKey, GateRecord } from '../gate-records/gate-records.types.ts'
import type {
	HandoverFolder,
	LotDecision,
	LotTree,
	MergeLot,
	RehearsalDecision,
	RehearsalPlanContext,
	ResolvedLot,
} from './handover.types.ts'

/**
 * One decision per lot, in order. `base` is the hand-over base `handover run` resolved once (absent without a
 * scoped step): the full and hook records are keyed with it, a release record with the empty tree.
 */
export function planRehearsal(params: {
	handover: HandoverFolder
	full: boolean
	base?: string
}): RehearsalDecision[] {
	const root = params.handover.lotsFile.repository
	const trees = listLotTrees({ root, lots: params.handover.lots })
	const hookText = listCommitHookFiles(root)
		.map((file) => readFileSync(file, 'utf8'))
		.join('\n')
	const hashes = readModeCommandHashes({
		root,
		packageJson: readPackageJson(root),
		gateBase: params.base,
	})
	const context: RehearsalPlanContext = {
		root,
		branch: params.handover.lotsFile.branch,
		installed: readInstalledKey(root),
		commands: {
			full: hashes.full,
			hook: hashes.hook,
			// a release list that does not cover full answers no lot
			...(hashes.releaseCoversFull && { release: hashes.release }),
		},
		...(params.base !== undefined && { base: params.base }),
		stages: HOOK_STAGES_PATTERN.exec(hookText)?.[0],
	}
	const contribRun = needsContribRun({
		root,
		tree: trees.at(-1)?.tree,
		head: params.handover.lotsFile.head,
	})
	return params.handover.lots.map(function decide(lot, index): RehearsalDecision {
		const { tree } = trees[index]
		const decision = params.full
			? rehearsed(REHEARSAL_REASONS.full)
			: lot.merge
				? decideMerge({ context, merge: lot.merge, lotTree: trees[index] })
				: decidePlain({ context, lot, tree })
		return {
			lot: index + 1,
			tree,
			...decision,
			...(contribRun && index === trees.length - 1 && { contrib: 'run' as const }),
		}
	})
}

/**
 * A contributor's hand-over whose last lot leaves `tree` (the tree the `contrib` guard checks) with no green contrib
 * record of it at the lots file's HEAD (the guard's), against what is installed now: the rehearsal runs
 * `dialecte contrib` on it in the clone.
 */
function needsContribRun(params: {
	root: string
	tree: string | undefined
	/** The lots file's HEAD, as written. */
	head: string
}): boolean {
	const { root, tree } = params
	if (tree === undefined || readProfile(root) !== 'contributor') return false
	const head = readGit({ root, args: ['rev-parse', `${params.head}^{commit}`] }).trim()
	const record = findContribRecord({ root, tree, head })
	return !(record && isGreenRecord(record))
}

function decidePlain(params: {
	context: RehearsalPlanContext
	lot: ResolvedLot
	tree: string
}): LotDecision {
	const { context, lot, tree } = params
	const records = greenRecords({
		context,
		tree,
		modes: answeringModes({ context, modes: ['full'] }),
	})
	if (records.length === 0)
		return rehearsed(fillReason({ template: REHEARSAL_REASONS.noFullGate, values: { tree } }))
	if ([...lot.files, ...lot.deletedFiles].includes(PACKAGE_LOCK_FILE))
		return rehearsed(REHEARSAL_REASONS.lotChangesLock)
	if (context.stages)
		return rehearsed(
			fillReason({ template: REHEARSAL_REASONS.hookStages, values: { match: context.stages } }),
		)
	return reuseOrMismatch({ context, tree, records, reason: REHEARSAL_REASONS.fullGate })
}

function decideMerge(params: {
	context: RehearsalPlanContext
	merge: MergeLot
	lotTree: LotTree
}): LotDecision {
	const { context, merge } = params
	const { before, tree } = params.lotTree
	const tipTree = readGit({ root: context.root, args: ['rev-parse', `${merge.tip}^{tree}`] }).trim()
	if (tree !== tipTree)
		return rehearsed(
			fillReason({
				template: REHEARSAL_REASONS.branchMoved,
				values: { branch: context.branch, tree, tip: tipTree },
			}),
		)
	const records = greenRecords({
		context,
		tree,
		modes: answeringModes({ context, modes: [HOOK_RECORD_MODE, 'full'] }),
	})
	if (records.length === 0)
		return rehearsed(fillReason({ template: REHEARSAL_REASONS.noTipRecord, values: { tree } }))
	const lockChanged = readGit({
		root: context.root,
		args: ['diff', '--name-only', before, tree, '--', PACKAGE_LOCK_FILE],
	}).trim()
	if (lockChanged) return rehearsed(REHEARSAL_REASONS.mergeChangesLock)
	if (context.stages)
		return rehearsed(
			fillReason({ template: REHEARSAL_REASONS.hookStages, values: { match: context.stages } }),
		)
	return reuseOrMismatch({ context, tree, records, reason: REHEARSAL_REASONS.tipRecord })
}

/**
 * Reused with the newest record that checked the tree against what is installed now with the command of its
 * mode; else rehearsed, saying what changed since the newest record.
 */
function reuseOrMismatch(params: {
	context: RehearsalPlanContext
	tree: string
	records: readonly GateRecord[]
	reason: string
}): LotDecision {
	const { context, tree, records } = params
	const matching = records.find((record) =>
		isSameKey({ key: expectedKey({ context, tree, record }), other: record.key }),
	)
	if (matching) {
		const { at, head } = originOfRecord(matching)
		return {
			decision: 'reused',
			reason: fillReason({
				template:
					matching.mode === RELEASE_RECORD_MODE ? REHEARSAL_REASONS.releaseGate : params.reason,
				values: { tree, mode: matching.mode },
			}),
			record: { mode: matching.mode, at, head },
		}
	}
	const [newest] = records
	// a record of another base selected another diff; a release record's base is the empty tree, never a lot's
	if (
		context.base !== undefined &&
		newest.mode !== RELEASE_RECORD_MODE &&
		newest.base !== undefined &&
		newest.base.commit !== context.base
	)
		return rehearsed(
			fillReason({
				template: REHEARSAL_REASONS.baseChanged,
				values: {
					record: newest.base.commit.slice(0, SHORT_SHA_LENGTH),
					handover: context.base.slice(0, SHORT_SHA_LENGTH),
				},
			}),
		)
	if (newest.key?.lockHash !== context.installed.lockHash)
		return rehearsed(REHEARSAL_REASONS.installChanged)
	if (newest.key?.linked !== context.installed.linked)
		return rehearsed(REHEARSAL_REASONS.linkedChanged)
	return rehearsed(
		fillReason({ template: REHEARSAL_REASONS.commandChanged, values: { mode: newest.mode } }),
	)
}

/** The key a record of `tree` must hold to be reused now: what is installed, the command of its mode. */
function expectedKey(params: {
	context: RehearsalPlanContext
	tree: string
	record: GateRecord
}): CheckKey {
	const { context, record } = params
	return {
		tree: params.tree,
		...context.installed,
		commandHash:
			record.mode === HOOK_RECORD_MODE
				? context.commands.hook
				: record.mode === RELEASE_RECORD_MODE
					? (context.commands.release ?? '')
					: context.commands.full,
	}
}

/** `modes`, and `release` when the release list covers `full`: a green release record answers as a full one. */
function answeringModes(params: {
	context: RehearsalPlanContext
	modes: readonly string[]
}): string[] {
	return params.context.commands.release === undefined
		? [...params.modes]
		: [...params.modes, RELEASE_RECORD_MODE]
}

/** The green records of `tree` of those modes that hold a key, the newest first. */
function greenRecords(params: {
	context: RehearsalPlanContext
	tree: string
	modes: readonly string[]
}): GateRecord[] {
	return readTreeRecords({ root: params.context.root, tree: params.tree })
		.filter(
			(record) =>
				params.modes.includes(record.mode) && record.key !== undefined && isGreenRecord(record),
		)
		.sort((first, second) => second.at.localeCompare(first.at))
}

function rehearsed(reason: string): LotDecision {
	return { decision: 'rehearsed', reason }
}

/** A reason with its placeholders filled; a tree or tip id shortened. */
function fillReason(params: { template: string; values: Record<string, string> }): string {
	return Object.entries(params.values).reduce(
		(text, [name, value]) =>
			text.replace(
				`{${name}}`,
				name === 'tree' || name === 'tip' ? value.slice(0, SHORT_SHA_LENGTH) : value,
			),
		params.template,
	)
}
