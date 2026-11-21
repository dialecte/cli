/**
 * `dialecte lot close --feature <name> [--json]` (design 3.8): a pipeline's last step. Refused while a lot of the
 * feature, in any store of the list, is neither committed nor canceled; else `lot prune`'s plan without branches,
 * acted at once by `lot-close`: every lot worktree and recorded throwaway of the feature closed on its own proof, then
 * the feature's dead rehearsal clones moved to their trash. A lot kept on purpose keeps every item. Exit 0 when
 * every item of the feature went, 1 when one was kept or the feature has no lot, 2 for a usage error or an open lot.
 */
import { basename, dirname } from 'node:path'

import { actLotPrune } from '../lib/cleanup/act-lot-prune.ts'
import { readLotPruneFacts, storeLotsOf } from '../lib/cleanup/lot-prune-facts.ts'
import { planLotPrune } from '../lib/cleanup/plan-lot-prune.ts'
import { readLinkScanSet } from '../lib/cleanup/read-link-scan-set.ts'
import { moveClone, ownersReadAgain, readFeatureClones } from '../lib/cleanup/rehearsal-clones.ts'
import { resultOf } from '../lib/command-result.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { realPathOf } from '../lib/file-system.ts'
import { readStoreEntries } from '../lib/handover/handover-store-read.ts'
import { machineScratchRoots } from '../lib/handover/rehearse-handover.ts'
import { createHost } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { jsonOf } from '../lib/print/print.ts'
import { lotsOfFeature } from '../lib/store/feature-lots.ts'
import { keptOfChecked } from '../lib/store/lot-keep.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { findWorkspace } from '../lib/workspace.ts'
import { syncBaseBranch } from '../lib/worktree/base-sync.ts'
import { spawnDetached } from '../lib/worktree/trash.ts'
import {
	CLOSABLE_STATES,
	LOT_CLOSE_FEATURE_TEXTS,
	LOT_CLOSE_FEATURE_USAGE,
} from './lot-close-feature.constants.ts'
import { itemWordOf, lotsOutputOf, repositoryOf } from './lot-prune.ts'

import type { LotPrunePlan } from '../lib/cleanup/plan-lot-prune.types.ts'
import type { CloneOwner, FeatureClone, MovedClone } from '../lib/cleanup/rehearsal-clones.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { BackgroundSpawner, FolderLink } from '../lib/worktree/worktree.types.ts'
import type {
	FeatureLot,
	LotCloseFeatureOutput,
	LotCloseFeatureParams,
} from './lot-close-feature.types.ts'
import type { LotPruneLotOutput } from './lot-prune.types.ts'

/**
 * Runs `lot close --feature`.
 *
 * @intent close every terminal lot of a feature at a pipeline's last step, its branches left to lot prune
 * @internal
 */
export function runLotCloseFeature(params: LotCloseFeatureParams): CommandResult {
	const { argv, cwd } = params
	const feature = getArg(argv, 'feature')
	const names = positionalArguments({ argv, valueOptions: ['feature'] })
	// a flag right after --feature is no feature name (`--feature --json`)
	if (feature === undefined || feature.startsWith('-') || names.length > 0)
		return resultOf({ exitCode: 2, lines: [LOT_CLOSE_FEATURE_USAGE] })
	const json = hasFlag(argv, 'json')
	const lots = lotsOfFeature({ feature, cwd })
		.map((lotFolder) => readFeatureLot(lotFolder))
		.filter((lot) => !lot.simulated)
	if (lots.length === 0)
		return printed({
			exitCode: 1,
			json,
			output: { open: [], lots: [], clones: [] },
			lines: [fillMessage({ template: LOT_CLOSE_FEATURE_TEXTS.noLot, values: { feature } })],
		})
	const open = lots
		.filter((lot) => !CLOSABLE_STATES.includes(lot.state))
		.map((lot) => ({ lot: lot.name, state: lot.state }))
	if (open.length > 0)
		return printed({
			exitCode: 2,
			json,
			output: { open, lots: [], clones: [] },
			lines: [
				fillMessage({ template: LOT_CLOSE_FEATURE_TEXTS.open, values: { feature } }),
				...open.map((one) =>
					fillMessage({ template: LOT_CLOSE_FEATURE_TEXTS.openLot, values: one }),
				),
			],
		})
	return closeFeatureLots({ ...params, lots, json })
}

/** The feature's lots, every one terminal: the plan without branches acted on, then the clones. */
function closeFeatureLots(
	params: LotCloseFeatureParams & { lots: readonly FeatureLot[]; json: boolean },
): CommandResult {
	const { lots, cwd } = params
	const now = params.now ?? new Date()
	const lotFolders = lots.map((lot) => lot.lotFolder)
	const synced = [...new Set(lotFolders.flatMap((folder) => repositoryOf(folder) ?? []))].flatMap(
		(root) => syncBaseBranch({ root }),
	)
	const scratchRoots = params.scratchRoots ?? Object.values(machineScratchRoots({ cwd }))
	const spawner = params.spawner ?? spawnDetached
	const facts = readLotPruneFacts({
		lotFolders,
		host: params.host ?? createHost(),
		now,
		runFrom: cwd,
		listProcesses: params.listProcesses,
		scratchRoots,
	})
	const plan = withoutBranches(planLotPrune(facts))
	const outcomes = actLotPrune({
		plan,
		facts,
		by: 'lot-close',
		runFrom: cwd,
		now,
		spawner,
		listProcesses: params.listProcesses,
		scratchRoots,
		readStoreLots: storeLotsOf,
	})
	const { clones, moved } = closeClones({
		lots,
		// the workspace the command runs in; a repository's parent outside every workspace
		workspace: findWorkspace(cwd) ?? dirname(plan.repositories[0]?.main ?? cwd),
		scratchRoots,
		readStartTime: params.readStartTime,
		now,
		spawner,
	})
	const output: LotCloseFeatureOutput = {
		open: [],
		lots: plan.repositories.flatMap((repository) =>
			withClones({
				main: repository.main,
				lots: lotsOutputOf({ plan: { repositories: [repository] }, outcomes, acting: true }),
				clones,
				moved,
			}),
		),
		clones: clones.flatMap((clone) =>
			clone.owner === undefined && 'kept' in clone.decision
				? [{ clone: clone.clone, kept: clone.decision.kept }]
				: [],
		),
	}
	return printed({
		exitCode: anyKept(output) ? 1 : 0,
		json: params.json,
		output,
		lines: [...synced, ...linesOf(output)],
	})
}

/** The feature's rehearsal clones decided, then each one let go moved, its decision read again at the move. */
function closeClones(params: {
	lots: readonly FeatureLot[]
	workspace: string
	scratchRoots: readonly string[]
	readStartTime: LotCloseFeatureParams['readStartTime']
	now: Date
	spawner: BackgroundSpawner
}): { clones: FeatureClone[]; moved: Map<string, MovedClone> } {
	const { workspace } = params
	const owners = ownersOf(params.lots)
	const reads = {
		owners,
		links: linksOf({ workspace, owners, scratchRoots: params.scratchRoots }),
		workspace,
		readStartTime: params.readStartTime,
	}
	const clones = readFeatureClones({ ...reads, scratchRoots: params.scratchRoots })
	// what may change between the plan and the moves read again once: each lot's keep, the links
	const atTheMove = {
		...reads,
		owners: ownersReadAgain(owners),
		links: linksOf({ workspace, owners, scratchRoots: params.scratchRoots }),
	}
	const moved = new Map(
		clones
			.filter((clone) => 'go' in clone.decision)
			.map((planned) => [
				planned.clone,
				moveClone({
					...atTheMove,
					planned,
					by: 'lot-close',
					now: params.now,
					spawner: params.spawner,
				}),
			]),
	)
	return { clones, moved }
}

/**
 * The links that may reach a clone: those of the workspace the command runs in and of every workspace a lot of the
 * feature lives in (a link beside the lot's repository keeps its clone wherever the close is run from).
 */
function linksOf(params: {
	workspace: string
	owners: ReadonlyMap<string, CloneOwner>
	scratchRoots: readonly string[]
}): FolderLink[] {
	const workspaces = new Set([
		realPathOf(params.workspace),
		...[...params.owners.values()].map((owner) => realPathOf(dirname(owner.main))),
	])
	return [...workspaces].flatMap((workspace) =>
		readLinkScanSet({ workspace, scratchRoots: params.scratchRoots }),
	)
}

/** Whether an item of the feature stayed: kept by the plan or at the move. */
function anyKept(output: LotCloseFeatureOutput): boolean {
	return output.lots.some((lot) =>
		lot.items.some((item) => 'kept' in (item.outcome ?? item.decision)),
	)
}

/** A lot of the feature read from its records: its state, whether simulated, its keep. */
function readFeatureLot(lotFolder: string): FeatureLot {
	const registry = registryOfLotFolder(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry, entries: readStoreEntries(registry) })
	const name = basename(lotFolder)
	if (checked === undefined || 'damage' in checked)
		return {
			name,
			lotFolder,
			identity: checked?.identity,
			state: 'damaged',
			simulated: checked?.identity?.simulated === true,
		}
	const kept = keptOfChecked({ name, checked })
	return {
		name,
		lotFolder,
		identity: checked.input.identity,
		state: lotState(checked.input).state,
		simulated: checked.input.identity.simulated,
		...(kept !== undefined && { kept }),
	}
}

/**
 * The lot each hand-over folder of the feature belongs to, by real path: its own folder, and the folder of every
 * registry entry naming its worktree and branch.
 */
function ownersOf(lots: readonly FeatureLot[]): Map<string, CloneOwner> {
	const owners = new Map<string, CloneOwner>()
	for (const lot of lots) {
		const main = repositoryOf(lot.lotFolder)
		if (main === undefined) continue
		const owner: CloneOwner = {
			lot: lot.name,
			lotFolder: lot.lotFolder,
			main,
			...(lot.kept !== undefined && { kept: lot.kept }),
		}
		owners.set(realPathOf(lot.lotFolder), owner)
		const worktree = lot.identity?.worktree
		if (typeof worktree !== 'string') continue
		const real = realPathOf(worktree)
		for (const entry of readStoreEntries(registryOfLotFolder(lot.lotFolder)))
			if (entry.branch === lot.identity?.branch && realPathOf(entry.worktree) === real)
				owners.set(realPathOf(entry.folder), owner)
	}
	return owners
}

/** The plan with no branch item: `lot close --feature` leaves branches to `lot prune` and does not list them. */
function withoutBranches(plan: LotPrunePlan): LotPrunePlan {
	return {
		repositories: plan.repositories.map((repository) => ({
			...repository,
			lots: repository.lots.map((lot) => ({
				...lot,
				items: lot.items.filter((item) => item.item !== 'branch'),
			})),
		})),
	}
}

/**
 * Each lot's output with its clones as items: decided, and moved or kept by the act. A clone belongs to the lot of its
 * name in its owner's repository (two stores may hold one lot name).
 */
function withClones(params: {
	main: string
	lots: LotPruneLotOutput[]
	clones: readonly FeatureClone[]
	moved: ReadonlyMap<string, MovedClone>
}): LotPruneLotOutput[] {
	return params.lots.map((lot) => ({
		...lot,
		items: [
			...lot.items,
			...params.clones
				.filter(
					(clone) =>
						clone.owner?.lot === lot.lot &&
						realPathOf(clone.owner.main) === realPathOf(params.main),
				)
				.map((clone) => {
					const outcome =
						params.moved.get(clone.clone) ?? ('kept' in clone.decision ? clone.decision : undefined)
					return {
						item: 'clone' as const,
						name: clone.clone,
						decision: clone.decision,
						...(outcome !== undefined && { outcome }),
					}
				}),
		],
	}))
}

/** The text of the run: per lot its line, then one line per item; then the clones of no lot of the feature. */
function linesOf(output: LotCloseFeatureOutput): string[] {
	return [
		...output.lots.flatMap((lot) => [
			`${lot.lot} (${lot.state}, ${lot.landing})`,
			...lot.items.map((item) => `  ${itemWordOf(item)}  ${item.item} ${item.name}`),
		]),
		...output.clones.map((clone) =>
			fillMessage({ template: LOT_CLOSE_FEATURE_TEXTS.clone, values: clone }),
		),
	]
}

/** The run's answer: its JSON with `--json`, else its lines. */
function printed(params: {
	exitCode: number
	json: boolean
	output: LotCloseFeatureOutput
	lines: string[]
}): CommandResult {
	if (params.json) return { exitCode: params.exitCode, output: jsonOf(params.output, 2) }
	return resultOf({ exitCode: params.exitCode, lines: params.lines })
}
