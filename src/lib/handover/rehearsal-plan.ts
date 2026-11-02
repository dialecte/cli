/**
 * What a rehearsal does for each lot, decided before any clone: reuse a green record of the tree the lot's
 * commit will hold, or rehearse the lot in the scratch clone, and why. A plain lot is reused when the
 * repository's store holds a green `gate --full` of its tree, run against what is installed now (the same
 * `node_modules`, the same `file:` dependencies, the same steps), the lot does not change
 * `package-lock.json` and the commit hook stages no files of its own. A merge lot is reused when the tree it
 * leaves is its tip's tree and a green record of that tree (the branch commit's hook, or a `gate --full`)
 * matches what is installed now, under the same conditions.
 */
import { readFileSync } from 'node:fs'

import { gateCommandHash, hashHookCommand, readInstalledKey } from '../gate-records/check-key.ts'
import {
	isGreenRecord,
	isSameKey,
	originOfRecord,
	readTreeRecords,
} from '../gate-records/check-store.ts'
import { HOOK_RECORD_MODE, SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { resolveGateSteps } from '../gate/gate-config.ts'
import { listCommitHookFiles } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
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

/** One decision per lot, in order. */
export function planRehearsal(params: {
	handover: HandoverFolder
	full: boolean
}): RehearsalDecision[] {
	const root = params.handover.lotsFile.repository
	const trees = listLotTrees({ root, lots: params.handover.lots })
	const hookText = listCommitHookFiles(root)
		.map((file) => readFileSync(file, 'utf8'))
		.join('\n')
	const context: RehearsalPlanContext = {
		root,
		branch: params.handover.lotsFile.branch,
		installed: readInstalledKey(root),
		commands: {
			full: gateCommandHash({
				root,
				steps: resolveGateSteps({ packageJson: readPackageJson(root), mode: 'full' }),
			}),
			hook: hashHookCommand(root),
		},
		stages: HOOK_STAGES_PATTERN.exec(hookText)?.[0],
	}
	return params.handover.lots.map(function decide(lot, index): RehearsalDecision {
		const { tree } = trees[index]
		const decision = params.full
			? rehearsed(REHEARSAL_REASONS.full)
			: lot.merge
				? decideMerge({ context, merge: lot.merge, lotTree: trees[index] })
				: decidePlain({ context, lot, tree })
		return { lot: index + 1, tree, ...decision }
	})
}

function decidePlain(params: {
	context: RehearsalPlanContext
	lot: ResolvedLot
	tree: string
}): LotDecision {
	const { context, lot, tree } = params
	const records = greenRecords({ context, tree, modes: ['full'] })
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
	const records = greenRecords({ context, tree, modes: [HOOK_RECORD_MODE, 'full'] })
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
			reason: fillReason({ template: params.reason, values: { tree, mode: matching.mode } }),
			record: { mode: matching.mode, at, head },
		}
	}
	const [newest] = records
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
		commandHash: record.mode === HOOK_RECORD_MODE ? context.commands.hook : context.commands.full,
	}
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
