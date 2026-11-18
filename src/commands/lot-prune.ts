/**
 * `dialecte lot prune [<id>...] [--feature <name>] [--all] [--yes] [--json]`: per terminal lot, its worktree, review
 * throwaways and branches, each decided by its own proof, the plan printed; `--yes` acts, each proof read again at the
 * move. Every stale lot (its worktree gone, its landing not proven) is listed with the person's command.
 */
import { join } from 'node:path'

import { ACT_TEXTS } from '../lib/cleanup/act-lot-prune.constants.ts'
import { actLotPrune, outcomeKeyOf } from '../lib/cleanup/act-lot-prune.ts'
import {
	leftInTrashOf,
	readLotPruneFacts,
	statusTextOf,
	storeLotsOf,
	trashedWorktreesOf,
} from '../lib/cleanup/lot-prune-facts.ts'
import { planLotPrune } from '../lib/cleanup/plan-lot-prune.ts'
import { resultOf } from '../lib/command-result.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { realPathOf } from '../lib/file-system.ts'
import { mainCheckoutOf } from '../lib/git.ts'
import { machineScratchRoots } from '../lib/handover/rehearse-handover.ts'
import { createHost } from '../lib/host/select-host.ts'
import { jsonOf } from '../lib/print/print.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { allStoreLots, lotsOfFeature } from '../lib/store/feature-lots.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { listLotFolderNames, locateStore } from '../lib/store/store-folder.ts'
import { listWorktrees } from '../lib/worktree/add-worktree.ts'
import { syncBaseBranch } from '../lib/worktree/base-sync.ts'
import { spawnDetached, trashedAtOf } from '../lib/worktree/trash.ts'
import { LOT_PRUNE_TEXTS, LOT_PRUNE_USAGE, REFUSED_TRASH_AGE_MS } from './lot-prune.constants.ts'

import type { ActedItem, LotPruneOutcomes } from '../lib/cleanup/act-lot-prune.types.ts'
import type { LotPrunePlan } from '../lib/cleanup/plan-lot-prune.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	LotPruneLotOutput,
	LotPruneOutput,
	LotPruneParams,
	RefusedTrashOutput,
} from './lot-prune.types.ts'

/**
 * Runs `lot prune`: exit 0 when the plan is printed or every item meant to go went, 1 when an act kept one, 2 for a
 * usage error or an id that names no lot.
 *
 * @intent remove what a terminal lot leaves behind, each item on its own proof
 * @internal
 */
export function runLotPrune(params: LotPruneParams): CommandResult {
	const { argv } = params
	const names = positionalArguments({ argv, valueOptions: ['feature'] })
	const feature = getArg(argv, 'feature')
	const all = hasFlag(argv, 'all')
	// ids, --feature and --all exclude each other
	if ([names.length > 0, feature !== undefined, all].filter(Boolean).length > 1)
		return resultOf({ exitCode: 2, lines: [LOT_PRUNE_USAGE] })
	const selected = selectLots({ cwd: params.cwd, names, feature, all })
	if ('unknown' in selected)
		return resultOf({
			exitCode: 2,
			lines: [
				...selected.refusals,
				LOT_PRUNE_TEXTS.unknown.replace('{names}', selected.unknown.join(', ')),
			],
		})
	const now = params.now ?? new Date()
	const synced = [
		...new Set(selected.lotFolders.flatMap((folder) => repositoryOf(folder) ?? [])),
	].flatMap((root) => syncBaseBranch({ root }))
	const scratchRoots = params.scratchRoots ?? Object.values(machineScratchRoots())
	const facts = readLotPruneFacts({
		lotFolders: selected.lotFolders,
		host: params.host ?? createHost(),
		now,
		runFrom: params.cwd,
		listProcesses: params.listProcesses,
		scratchRoots,
	})
	const plan = planLotPrune(facts)
	params.onPlanned?.(plan)
	const acting = hasFlag(argv, 'yes')
	const outcomes: LotPruneOutcomes = acting
		? actLotPrune({
				plan,
				facts,
				by: 'lot-prune',
				runFrom: params.cwd,
				now,
				spawner: params.spawner ?? spawnDetached,
				listProcesses: params.listProcesses,
				scratchRoots,
				afterThrowawayMove: params.afterThrowawayMove,
				readStoreLots: storeLotsOf,
			})
		: new Map()
	const output: LotPruneOutput = {
		lots: lotsOutputOf({ plan, outcomes, acting }),
		refused: plan.repositories.flatMap((repository) =>
			refusedTrashOf({ main: repository.main, now }),
		),
	}
	const failed = acting && output.lots.some((lot) => lot.items.some((item) => wentWrong(item)))
	const exitCode = failed ? 1 : 0
	if (hasFlag(argv, 'json')) return { exitCode, output: jsonOf(output, 2) }
	return resultOf({ exitCode, lines: [...synced, ...linesOf(output)] })
}

/** An item meant to go that the acts kept; one another run removed since the plan is no failure. */
function wentWrong(item: LotPruneLotOutput['items'][number]): boolean {
	return (
		!('kept' in item.decision) &&
		item.outcome !== undefined &&
		'kept' in item.outcome &&
		item.outcome.kept !== ACT_TEXTS.gone
	)
}

/**
 * The lot folders the run reaches: the ids named, else the lots of `--feature` in every store of the list, else every
 * lot of every store (`--all`), else every lot of the store of `cwd`; the ids that name no lot.
 */
function selectLots(params: {
	cwd: string
	names: readonly string[]
	feature: string | undefined
	all: boolean
}): { lotFolders: string[] } | { unknown: string[]; refusals: string[] } {
	const { cwd, names } = params
	if (names.length > 0) {
		const resolved = names.map((argument) => requiredLotOf({ argument, cwd, mode: 'write' }))
		const unknown = names.filter((_name, index) => !('lot' in resolved[index]))
		// the resolver's own lines: no lot of that id, or one in more than one store
		const refusals = resolved.flatMap((one) => ('lines' in one ? one.lines : []))
		if (unknown.length > 0) return { unknown, refusals }
		return { lotFolders: resolved.flatMap((one) => ('lot' in one ? [realPathOf(one.lot)] : [])) }
	}
	if (params.feature !== undefined)
		return { lotFolders: lotsOfFeature({ feature: params.feature, cwd }) }
	if (params.all) return { lotFolders: allStoreLots({ cwd }) }
	const store = locateStore({ from: cwd })?.store
	return {
		lotFolders:
			store === undefined ? [] : listLotFolderNames({ store }).map((name) => join(store, name)),
	}
}

/** The main checkout of the repository a lot folder belongs to. */
function repositoryOf(lotFolder: string): string | undefined {
	const repository = readIdentity({ lotFolder })?.repository
	if (repository === undefined) return undefined
	try {
		return mainCheckoutOf(repository)
	} catch {
		return undefined
	}
}

/** Each lot of the plan with its items, every item with its outcome once the acts ran. */
function lotsOutputOf(params: {
	plan: LotPrunePlan
	outcomes: LotPruneOutcomes
	acting: boolean
}): LotPruneLotOutput[] {
	return params.plan.repositories.flatMap((repository) =>
		repository.lots.map((lot): LotPruneLotOutput => ({
			lot: lot.lot,
			state: lot.state,
			landing: lot.landing,
			simulated: lot.simulated,
			...(lot.stale !== undefined && { stale: lot.stale }),
			items: lot.items.map((item) => {
				const acted = params.outcomes.get(outcomeKeyOf({ lot: lot.lot, item }))
				// after the acts, an item the plan kept is kept: its outcome says so
				const outcome: ActedItem | undefined =
					acted ??
					(params.acting && 'kept' in item.decision ? { kept: item.decision.kept } : undefined)
				return { ...item, ...(outcome !== undefined && { outcome }) }
			}),
		})),
	)
}

/**
 * The worktrees still registered under the trash longer than git's background removal takes (ten minutes after the
 * time in their folder name): a deletion git refused, with what `git status` shows and the person's command.
 */
function refusedTrashOf(params: { main: string; now: Date }): RefusedTrashOutput[] {
	const { main } = params
	const leftInTrash = leftInTrashOf(main)
	return trashedWorktreesOf({ main, worktrees: listWorktrees(main) }).flatMap(
		function refusedOf(worktree): RefusedTrashOutput[] {
			// a removal its proof stopped: it holds what no commit holds, so the command moves it back
			const left = leftInTrash.get(realPathOf(worktree))
			if (left !== undefined)
				return [
					{
						worktree,
						status: statusTextOf(worktree),
						command: `cd ${shellQuote(main)} && git worktree move ${shellQuote(worktree)} ${shellQuote(left.path)}`,
						left: left.reason,
					},
				]
			const at = trashedAtOf({ folder: worktree })
			if (at === undefined || !(params.now.getTime() - at.getTime() > REFUSED_TRASH_AGE_MS))
				return []
			return [
				{
					worktree,
					status: statusTextOf(worktree),
					command: `cd ${shellQuote(main)} && git worktree remove --force ${shellQuote(worktree)}`,
				},
			]
		},
	)
}

/** The text of the run: per lot its line, then one line per item; the stale lots; the refused trash deletions. */
function linesOf(output: LotPruneOutput): string[] {
	const lots = output.lots.flatMap((lot) => [
		`${lot.lot} (${lot.simulated ? LOT_PRUNE_TEXTS.simulated : lot.state}, ${lot.landing})`,
		...lot.items.map((item) => `  ${itemWordOf(item)}  ${item.item} ${item.name}`),
		...(lot.stale === undefined ? [] : [`  ${lot.stale}`]),
	])
	const refused = output.refused.flatMap((entry) => [
		entry.left === undefined
			? LOT_PRUNE_TEXTS.refused.replace('{worktree}', entry.worktree)
			: LOT_PRUNE_TEXTS.leftInTrash
					.replace('{worktree}', entry.worktree)
					.replace('{reason}', entry.left),
		`  ${entry.status || LOT_PRUNE_TEXTS.clean}`,
		`  ${entry.command}`,
	])
	return [...lots, ...refused, ...(output.lots.length === 0 ? [LOT_PRUNE_TEXTS.none] : [])]
}

/** An item's word: its outcome after the acts, else its decision. */
function itemWordOf(item: LotPruneLotOutput['items'][number]): string {
	const { outcome, decision } = item
	if (outcome !== undefined) {
		if ('removed' in outcome) return `removed (${outcome.removed})`
		if ('waiting' in outcome) return outcome.waiting
		return `kept (${outcome.kept})`
	}
	if ('go' in decision) return 'go'
	if ('after' in decision) return `after ${decision.after}`
	return `kept (${decision.kept})`
}
