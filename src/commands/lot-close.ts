/** `dialecte lot close <hand-over name|index>... [--json]`: see `closeHandovers`. */
import { dirname, join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { mainCheckoutOf } from '../lib/git.ts'
import { closeHandovers } from '../lib/handover/close-handovers.ts'
import {
	LOT_CLOSE_ALREADY_CLOSED,
	LOT_CLOSE_LANDED_INDENT,
} from '../lib/handover/handover.constants.ts'
import { machineScratchRoots } from '../lib/handover/rehearse-handover.ts'
import { jsonOf } from '../lib/print/print.ts'
import { WORKTREES_FOLDER } from '../lib/workspace.constants.ts'
import { spawnDetached } from '../lib/worktree/trash.ts'
import { TRASH_FOLDER } from '../lib/worktree/worktree.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { CloseResult } from '../lib/handover/handover.types.ts'
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
}): CommandResult {
	const names = positionalArguments({ argv: params.argv, valueOptions: [] })
	if (names.length === 0) return { exitCode: 2, output: renderLotUsage() }
	let main: string
	try {
		main = mainCheckoutOf(params.cwd)
	} catch {
		return resultOf({ exitCode: 2, lines: [`lot close: ${params.cwd} is in no git repository`] })
	}
	const results = closeHandovers({
		cwd: main,
		runFrom: params.cwd,
		names,
		now: params.now ?? new Date(),
		spawner: params.spawner ?? spawnDetached,
		listProcesses: params.listProcesses,
		scratchRoots: params.scratchRoots ?? Object.values(machineScratchRoots()),
	})
	if ('unknown' in results)
		return resultOf({
			exitCode: 2,
			lines: [
				`lot close: the registry holds no hand-over named or indexed ${results.unknown.join(', ')}: nothing closed`,
			],
		})
	const outcomes = results.map((result) => result.outcome)
	const exitCode = outcomes.every((outcome) => 'closed' in outcome) ? 0 : 1
	if (hasFlag(params.argv, 'json')) return { exitCode, output: jsonOf(outcomes, 2) }
	// each line names what moved and where node_modules went; a landed lot's line under it, indented
	const lines = results.flatMap(function closeLines(result) {
		const { landed } = result.outcome
		const line = closeLineOf({ result })
		return landed === undefined ? [line] : [line, `${LOT_CLOSE_LANDED_INDENT}${landed}`]
	})
	const trash = join(dirname(main), WORKTREES_FOLDER, TRASH_FOLDER)
	if (outcomes.some((outcome) => 'closed' in outcome && !outcome.already))
		lines.push(
			`the closed worktrees wait in ${trash}, removed in the background; their branches are kept`,
			`the deletion is git's own git worktree remove, without --force: git may refuse a worktree written into since the check, and a refused one stays registered in ${trash} for you to look at`,
		)
	return resultOf({ exitCode, lines })
}

/** The line of one outcome: what moved and where node_modules went, or why it was kept. */
function closeLineOf(params: { result: CloseResult }): string {
	const { outcome, moved, nodeModules } = params.result
	if (!('closed' in outcome)) return `kept    ${outcome.handover}  (${outcome.kept})`
	if (outcome.already) return LOT_CLOSE_ALREADY_CLOSED.replace('{handover}', outcome.handover)
	return `closed  ${outcome.handover}: ${moved.join(', ')}${nodeModules ? `; node_modules ${nodeModules}` : ''}`
}
