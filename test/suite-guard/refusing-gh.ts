/** The calls the suite's refusing `gh` recorded: read and cleared, so the next test starts with none. */
import { existsSync, readFileSync, rmSync } from 'node:fs'

import { REFUSING_GH_CALLS_VARIABLE } from './refusing-gh.constants.ts'

/** The tests that ran the refusing `gh` since the last read, one name per call; the record removed. */
export function takeRefusingGhCalls(): string[] {
	const file = process.env[REFUSING_GH_CALLS_VARIABLE]
	if (file === undefined || !existsSync(file)) return []
	const calls = readFileSync(file, 'utf8').split('\n').filter(Boolean)
	rmSync(file, { force: true })
	return calls
}
