/** `dialecte lot close <hand-over name|lot id|index>... [--json]`: see `closeHandovers`. */
import { dirname, join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { mainCheckoutOf } from '../lib/git.ts'
import { closeHandovers, settleCloseLandings } from '../lib/handover/close-handovers.ts'
import {
	LOT_CLOSE_ALREADY_CLOSED,
	LOT_CLOSE_LANDED_INDENT,
} from '../lib/handover/handover.constants.ts'
import { machineScratchRoots } from '../lib/handover/rehearse-handover.ts'
import { createGithubHost } from '../lib/host/github-host.ts'
import { jsonOf } from '../lib/print/print.ts'
import { WORKTREES_FOLDER } from '../lib/workspace.constants.ts'
import { syncBaseBranch } from '../lib/worktree/base-sync.ts'
import { spawnDetached } from '../lib/worktree/trash.ts'
import { TRASH_FOLDER } from '../lib/worktree/worktree.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { CloseResult } from '../lib/handover/handover.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'
import type { CloseLandings } from '../lib/landing/lot-landing.types.ts'
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
	/** Where lots land through pull requests; default: GitHub through `gh`, asked for each lot the close reaches. */
	host?: HostAdapter
}): CommandResult {
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
	// the landing of every lot the arguments reach, read with the host before any decision: a merged lot is committed
	const now = params.now ?? new Date()
	const settled = settleCloseLandings({
		main,
		names,
		host: params.host ?? createGithubHost(),
		now,
	})
	const closed = closeHandovers({
		cwd: main,
		runFrom: params.cwd,
		names: settled.names,
		now,
		spawner: params.spawner ?? spawnDetached,
		listProcesses: params.listProcesses,
		scratchRoots: params.scratchRoots ?? Object.values(machineScratchRoots()),
	})
	if ('unknown' in closed)
		return resultOf({
			exitCode: 2,
			lines: [
				`lot close: the registry holds no hand-over named, no lot named or indexed ${closed.unknown.join(', ')}: nothing closed`,
			],
		})
	const results = resultsInOrder({ names, settled, closed })
	const outcomes = results.map((result) => result.outcome)
	const exitCode = outcomes.every((outcome) => 'closed' in outcome) ? 0 : 1
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

/**
 * One result per argument, in the order given: a lot kept before the close (not merged) with why, else the close's
 * next result, with the line naming how its lot landed.
 */
function resultsInOrder(params: {
	names: readonly string[]
	settled: CloseLandings
	closed: readonly CloseResult[]
}): CloseResult[] {
	const { settled, closed } = params
	return params.names.reduce<{ results: CloseResult[]; next: number }>(
		function inOrder(sofar, name) {
			const kept = settled.kept.get(name)
			if (kept !== undefined)
				return {
					results: [...sofar.results, { outcome: { handover: name, kept }, moved: [] }],
					next: sofar.next,
				}
			const result = closed[sofar.next] ?? {
				outcome: { handover: name, kept: 'not decided' },
				moved: [],
			}
			const landed = settled.landed.get(settled.names[sofar.next])
			return {
				results: [
					...sofar.results,
					landed === undefined ? result : { ...result, outcome: { ...result.outcome, landed } },
				],
				next: sofar.next + 1,
			}
		},
		{ results: [], next: 0 },
	).results
}

/** The line of one outcome: what moved and where node_modules went, or why it was kept. */
function closeLineOf(params: { result: CloseResult }): string {
	const { outcome, moved, nodeModules } = params.result
	if (!('closed' in outcome)) return `kept    ${outcome.handover}  (${outcome.kept})`
	if (outcome.already) return LOT_CLOSE_ALREADY_CLOSED.replace('{handover}', outcome.handover)
	return `closed  ${outcome.handover}: ${moved.join(', ')}${nodeModules ? `; node_modules ${nodeModules}` : ''}`
}
