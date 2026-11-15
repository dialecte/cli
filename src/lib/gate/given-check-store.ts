/** The store a rehearsal hands `gate --hook`, read from the environment the cli was given. */
import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

import { CHECK_STORE_VARIABLE } from '../gate-records/gate-records.constants.ts'
import {
	GATE_HOOK_CHECK_STORE_IGNORED_LINE,
	GATE_HOOK_CHECK_STORE_IGNORED_WHY,
} from './gate-config.constants.ts'

import type { GivenCheckStore } from './hook-gate.types.ts'

/**
 * `DIALECTE_CHECK_STORE` in `environment`: honoured only as the absolute path of an existing folder; any other value
 * is ignored with the line saying why (the hook then reads and writes the repository's own store); unset gives nothing.
 */
export function readGivenCheckStore(environment: Readonly<NodeJS.ProcessEnv>): GivenCheckStore {
	const value = environment[CHECK_STORE_VARIABLE]
	if (value === undefined) return {}
	const why = !isAbsolute(value)
		? GATE_HOOK_CHECK_STORE_IGNORED_WHY.notAbsolute
		: statSync(value, { throwIfNoEntry: false })?.isDirectory()
			? undefined
			: GATE_HOOK_CHECK_STORE_IGNORED_WHY.notAFolder
	if (why === undefined) return { checkStore: value }
	return {
		ignored: GATE_HOOK_CHECK_STORE_IGNORED_LINE.replace('{why}', () =>
			why.replace('{value}', () => value),
		),
	}
}
