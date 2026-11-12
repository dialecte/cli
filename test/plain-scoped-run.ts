/**
 * The scoped tests step run as a case reads it: its output without terminal escapes. vitest colours what it prints
 * whenever the environment does not turn colour off (a `TERM` other than `dumb`, `CI`, no agent detected), so a
 * case matching vitest's lines reads them as the gate does, escapes left out.
 */
import { stripVTControlCharacters } from 'node:util'

import { runScopedTests } from '../src/lib/gate/scoped-tests.ts'

import type { ScopedTestsRun } from '../src/lib/gate/scoped-tests.types.ts'

export function plainScopedRun(params: Parameters<typeof runScopedTests>[0]): ScopedTestsRun {
	const run = runScopedTests(params)
	return { ...run, output: stripVTControlCharacters(run.output) }
}
