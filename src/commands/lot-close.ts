/** `dialecte lot close <hand-over name|index>... [--json]`: see `closeHandovers`. */
import { dirname, join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { mainCheckoutOf } from '../lib/git.ts'
import { closeHandovers } from '../lib/handover/close-handovers.ts'
import { WORKTREES_FOLDER } from '../lib/workspace.constants.ts'
import { spawnDetached } from '../lib/worktree/trash.ts'
import { TRASH_FOLDER } from '../lib/worktree/worktree.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { BackgroundSpawner, ProcessFolder } from '../lib/worktree/worktree.types.ts'

export function runLotClose(params: {
	cwd: string
	argv: string[]
	now?: Date
	/** Starts the background removals (the tests stand in for it); default: a detached process. */
	spawner?: BackgroundSpawner
	/** Lists the processes and their working folders (the tests stand in for it); a throw is "not known". */
	listProcesses?: () => ProcessFolder[] | string
}): CommandResult {
	const names = positionalArguments({ argv: params.argv, valueOptions: [] })
	if (names.length === 0) return { exitCode: 2, output: renderLotUsage() }
	let main: string
	try {
		main = mainCheckoutOf(params.cwd)
	} catch {
		return { exitCode: 2, output: `lot close: ${params.cwd} is in no git repository` }
	}
	const results = closeHandovers({
		cwd: main,
		runFrom: params.cwd,
		names,
		now: params.now ?? new Date(),
		spawner: params.spawner ?? spawnDetached,
		listProcesses: params.listProcesses,
	})
	if ('unknown' in results)
		return {
			exitCode: 2,
			output: `lot close: the registry holds no hand-over named or indexed ${results.unknown.join(', ')}: nothing closed`,
		}
	const outcomes = results.map((result) => result.outcome)
	const exitCode = outcomes.every((outcome) => 'closed' in outcome) ? 0 : 1
	if (hasFlag(params.argv, 'json')) return { exitCode, output: JSON.stringify(outcomes, null, 2) }
	// each line names what moved and where node_modules went
	const lines = results.map(({ outcome, moved, nodeModules }) =>
		'closed' in outcome
			? `closed  ${outcome.handover}: ${moved.join(', ')}${nodeModules ? `; node_modules ${nodeModules}` : ''}`
			: `kept    ${outcome.handover}  (${outcome.kept})`,
	)
	if (outcomes.some((outcome) => 'closed' in outcome))
		lines.push(
			`the closed worktrees wait in ${join(dirname(main), WORKTREES_FOLDER, TRASH_FOLDER)}, removed in the background; their branches are kept`,
		)
	return { exitCode, output: lines.join('\n') }
}
