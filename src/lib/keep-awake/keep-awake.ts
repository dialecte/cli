/**
 * Keeps the machine from idle-sleeping while a long run lasts: on macOS, one detached `caffeinate -i -w <pid>`
 * child spawned at the run's start (it ends with the process); nothing elsewhere, nothing when `caffeinate` is no
 * executable on the search path, nothing when `DIALECTE_KEEP_AWAKE=0`.
 */
import { findExecutable } from '../editor/find-executable.ts'
import { spawnDetached } from '../worktree/trash.ts'
import {
	CAFFEINATE_ARGUMENTS,
	CAFFEINATE_PROGRAM,
	KEEP_AWAKE_OFF,
	KEEP_AWAKE_PLATFORM,
	KEEP_AWAKE_VARIABLE,
} from './keep-awake.constants.ts'

import type { BackgroundSpawner } from '../worktree/worktree.types.ts'

/**
 * The production holder a run calls at its start: `holdAwake` over the process's platform, `PATH`, environment and
 * pid, and a detached spawner (stdio ignored, unref'd); each seam can be given (the tests do). The holder answers
 * what `holdAwake` answers.
 */
export function createAwakeHolder(
	params: {
		platform?: NodeJS.Platform
		searchPath?: string
		spawner?: BackgroundSpawner
		environment?: Readonly<NodeJS.ProcessEnv>
		pid?: number
	} = {},
): () => boolean {
	return function holdTheMachineAwake() {
		const environment = params.environment ?? process.env
		return holdAwake({
			platform: params.platform ?? process.platform,
			searchPath: params.searchPath ?? environment.PATH ?? '',
			spawner: params.spawner ?? spawnDetached,
			environment,
			pid: params.pid ?? process.pid,
		})
	}
}

/** True when it started the hold (one child, through the spawner); false when it started nothing. */
export function holdAwake(params: {
	platform: NodeJS.Platform
	/** The PATH as the shell reads it (entries joined by the platform's delimiter). */
	searchPath: string
	/** Starts the child detached, its output ignored, never waited for. */
	spawner: BackgroundSpawner
	environment: Readonly<NodeJS.ProcessEnv>
	/** The pid `caffeinate` waits on: the process holding the run. */
	pid: number
}): boolean {
	if (params.platform !== KEEP_AWAKE_PLATFORM) return false
	if (params.environment[KEEP_AWAKE_VARIABLE] === KEEP_AWAKE_OFF) return false
	const program = findExecutable({
		word: CAFFEINATE_PROGRAM,
		searchPath: params.searchPath,
		cwd: process.cwd(),
	})
	if (program === undefined) return false
	params.spawner({ command: program, args: [...CAFFEINATE_ARGUMENTS, String(params.pid)] })
	return true
}
