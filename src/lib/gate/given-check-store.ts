/** The store a rehearsal hands `gate --hook`, read from the environment the cli was given. */
import { statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { CHECK_STORE_VARIABLE } from '../gate-records/gate-records.constants.ts'
import {
	GATE_HOOK_CHECK_STORE_IGNORED_LINE,
	GATE_HOOK_CHECK_STORE_IGNORED_WHY,
} from './gate-config.constants.ts'

import type { GivenCheckStore } from './hook-gate.types.ts'

/**
 * `DIALECTE_CHECK_STORE` in `environment`: honoured only as the absolute path of a git common dir (a folder holding a `HEAD` file and an `objects` folder); any other value
 * is ignored with the line saying why (the hook then reads and writes the repository's own store); unset gives nothing.
 */
export function readGivenCheckStore(environment: Readonly<NodeJS.ProcessEnv>): GivenCheckStore {
	const value = environment[CHECK_STORE_VARIABLE]
	if (value === undefined) return {}
	const why = !isAbsolute(value)
		? GATE_HOOK_CHECK_STORE_IGNORED_WHY.notAbsolute
		: isGitCommonDir(value)
			? undefined
			: GATE_HOOK_CHECK_STORE_IGNORED_WHY.noGitCommonDir
	if (why === undefined) return { checkStore: value }
	return {
		ignored: GATE_HOOK_CHECK_STORE_IGNORED_LINE.replace('{why}', () =>
			why.replace('{value}', () => value),
		),
	}
}

/** A folder holding a `HEAD` file and an `objects` folder. */
function isGitCommonDir(folder: string): boolean {
	return (
		statSync(join(folder, 'HEAD'), { throwIfNoEntry: false })?.isFile() === true &&
		statSync(join(folder, 'objects'), { throwIfNoEntry: false })?.isDirectory() === true
	)
}
