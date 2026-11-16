/**
 * The default npm runner of a new checkout's `node_modules` (`npm install` after a near take, `npm ci` on a miss):
 * spawns `npm` in the checkout and waits, unless `DIALECTE_NPM_INSTALL=off` switches it off (the test suite does), then
 * answers a failure without spawning, and a miss falls back to the copy.
 */
import { spawnSync } from 'node:child_process'

import {
	NPM_INSTALL_OFF,
	NPM_INSTALL_OFF_ANSWER,
	NPM_INSTALL_SWITCH,
} from './worktree.constants.ts'

import type { NpmSpawn } from './worktree.types.ts'

/**
 * Runs `npm <args>` in `checkout` and waits: its exit status and its output (stdout then stderr); with
 * `DIALECTE_NPM_INSTALL=off` in `environment`, a failure answered without spawning.
 *
 * @intent let a miss install with npm, and let a suite switch npm off for every worker and child
 * @internal
 */
export function runNpm(params: {
	checkout: string
	args: string[]
	/** Spawns npm and waits (the tests stand in for it); default: `spawnSync`. */
	spawn?: NpmSpawn
	/** Where the switch is read; default: `process.env`. */
	environment?: NodeJS.ProcessEnv
}): { status: number; output: string } {
	const off = npmSwitchedOff({ environment: params.environment })
	if (off !== undefined) return off
	const spawn = params.spawn ?? spawnNpm
	const ran = spawn({ command: 'npm', args: params.args, cwd: params.checkout })
	// a signal or a missing npm leaves no exit status: a failure all the same
	return { status: ran.status ?? 1, output: `${ran.stdout}${ran.stderr}` }
}

/**
 * What npm answers with `DIALECTE_NPM_INSTALL=off` in `environment` (default: `process.env`): a failure, given without
 * spawning; undefined when npm runs. Every npm the cli spawns asks it first.
 *
 * @intent hold the npm switch for every install the cli starts, whatever runs it
 * @internal
 */
export function npmSwitchedOff(
	params: { environment?: NodeJS.ProcessEnv } = {},
): { status: number; output: string } | undefined {
	const environment = params.environment ?? process.env
	return environment[NPM_INSTALL_SWITCH] === NPM_INSTALL_OFF
		? { ...NPM_INSTALL_OFF_ANSWER }
		: undefined
}

/** `spawnSync` of the command in `cwd`, its output read as text (an npm that cannot start answers its error). */
function spawnNpm(params: Parameters<NpmSpawn>[0]): ReturnType<NpmSpawn> {
	const ran = spawnSync(params.command, params.args, { cwd: params.cwd, encoding: 'utf8' })
	return {
		status: ran.status,
		stdout: ran.stdout ?? '',
		stderr: `${ran.stderr ?? ''}${ran.error === undefined ? '' : ran.error.message}`,
	}
}
