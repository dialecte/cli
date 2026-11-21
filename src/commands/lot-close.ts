/**
 * `dialecte lot close <hand-over name|lot id|index>... [--json]`: see `closeHandovers`; `lot close --feature <name>`:
 * see `runLotCloseFeature`.
 */
import { dirname, join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { mainCheckoutOf } from '../lib/git.ts'
import { closeHandovers } from '../lib/handover/close-handovers.ts'
import { closeTargetsOf, settleCloseTargets } from '../lib/handover/close-targets.ts'
import {
	LOT_CLOSE_ALREADY_CLOSED,
	LOT_CLOSE_LANDED_INDENT,
} from '../lib/handover/handover.constants.ts'
import { machineScratchRoots } from '../lib/handover/rehearse-handover.ts'
import { createHost } from '../lib/host/select-host.ts'
import { jsonOf } from '../lib/print/print.ts'
import { WORKTREES_FOLDER } from '../lib/workspace.constants.ts'
import { listWorktrees } from '../lib/worktree/add-worktree.ts'
import { syncBaseBranch } from '../lib/worktree/base-sync.ts'
import { isParked, spawnDetached } from '../lib/worktree/trash.ts'
import { TRASH_FOLDER } from '../lib/worktree/worktree.constants.ts'
import { FEATURE_FLAG } from './lot-close-feature.constants.ts'
import { runLotCloseFeature } from './lot-close-feature.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { CloseResult } from '../lib/handover/handover.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'
import type { BackgroundSpawner, ProcessFolder } from '../lib/worktree/worktree.types.ts'

export function runLotClose(params: {
	cwd: string
	argv: string[]
	now?: Date
	/** Starts the background removals (the tests stand in for it); default: a detached process. */
	spawner?: BackgroundSpawner
	/** Lists the processes and their working folders (the tests stand in for it); a throw is "not known". */
	listProcesses?: () => ProcessFolder[] | string
	/**
	 * Where rehearsal clones are made, and were made by earlier cli versions: a link there may reach a worktree.
	 * Default: this machine's (`machineScratchRoots`).
	 */
	scratchRoots?: readonly string[]
	/** Where lots land through pull requests; default: the repository's host, asked for each lot the close reaches. */
	host?: HostAdapter
	/** Reads a pid's start time (a rehearsal marker's owner, `--feature` only); default `processStartTime`. */
	readStartTime?: (pid: number) => string | undefined
}): CommandResult {
	// a feature's close is its own run: the feature's lots, never named ones
	if (params.argv.some((word) => word === FEATURE_FLAG || word.startsWith(`${FEATURE_FLAG}=`)))
		return runLotCloseFeature(params)
	const names = positionalArguments({ argv: params.argv, valueOptions: [] })
	if (names.length === 0) return { exitCode: 2, output: renderLotUsage() }
	let main: string
	try {
		main = mainCheckoutOf(params.cwd)
	} catch {
		return resultOf({ exitCode: 2, lines: [`lot close: ${params.cwd} is in no git repository`] })
	}
	// the base branch is the host's first (a queue merges there): the landed reading and the main checkout follow it
	const synced = syncBaseBranch({ root: main })
	// what each argument names, then the landing of every lot the arguments reach, read once with the host before any
	// decision: a merged lot is committed; a worktree in the trash or the pool is on its way out, never a target again
	const now = params.now ?? new Date()
	const worktrees = listWorktrees(main).filter(
		(worktree) => !isParked({ path: worktree.path, main }),
	)
	const targets = closeTargetsOf({ main, names, worktrees })
	const settled = settleCloseTargets({
		main,
		targets,
		host: params.host ?? createHost(),
		now,
	})
	const closed = closeHandovers({
		cwd: main,
		runFrom: params.cwd,
		settled,
		now,
		spawner: params.spawner ?? spawnDetached,
		listProcesses: params.listProcesses,
		scratchRoots: params.scratchRoots ?? Object.values(machineScratchRoots()),
	})
	// each outcome with the lines of the lots it reached that landed
	const results = closed.map(function withLanded(result, index): CloseResult {
		const { landed } = settled[index]
		return landed.length === 0
			? result
			: { ...result, outcome: { ...result.outcome, landed: landed.join('; ') } }
	})
	const outcomes = results.map((result) => result.outcome)
	// an argument naming nothing is a usage error; the others still closed
	const exitCode = targets.some((target) => target.kind === 'unknown')
		? 2
		: outcomes.every((outcome) => 'closed' in outcome)
			? 0
			: 1
	if (hasFlag(params.argv, 'json')) return { exitCode, output: jsonOf(outcomes, 2) }
	// each line names what moved and where node_modules went; a landed lot's line under it, indented, then the
	// commits only its branch's reflog holds now
	const lines = results.flatMap(function closeLines(result) {
		const { outcome } = result
		const dropped = 'closed' in outcome ? outcome.dropped : undefined
		return [
			closeLineOf({ result }),
			...[outcome.landed, dropped].flatMap((line) =>
				line === undefined ? [] : [`${LOT_CLOSE_LANDED_INDENT}${line}`],
			),
		]
	})
	const trash = join(dirname(main), WORKTREES_FOLDER, TRASH_FOLDER)
	if (outcomes.some((outcome) => 'closed' in outcome && !outcome.already))
		lines.push(
			`the closed worktrees wait in ${trash}, removed in the background; their branches are kept`,
			`the deletion is git's own git worktree remove, without --force: git may refuse a worktree written into since the check, and a refused one stays registered in ${trash} for you to look at`,
		)
	return resultOf({ exitCode, lines: [...synced, ...lines] })
}

/** The line of one outcome: what moved and where node_modules went, or why it was kept. */
function closeLineOf(params: { result: CloseResult }): string {
	const { outcome, moved, nodeModules } = params.result
	if (!('closed' in outcome)) return `kept    ${outcome.handover}  (${outcome.kept})`
	if (outcome.already) return LOT_CLOSE_ALREADY_CLOSED.replace('{handover}', outcome.handover)
	return `closed  ${outcome.handover}: ${moved.join(', ')}${nodeModules ? `; node_modules ${nodeModules}` : ''}`
}
