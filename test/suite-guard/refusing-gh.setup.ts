/**
 * Suite guard (vitest `setupFiles`): a `gh` that refuses every call is first on the PATH of every test and of the
 * commands it spawns. Each call appends the running test's name to a file in the suite's temporary folder, and after
 * each test any call recorded fails that test, naming it: a verb built without a fake host fails even when it reads
 * the refusal as the host's silence. A test that needs a `gh` puts its own fake in front of it.
 */
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { fillMessage } from '../../src/lib/knowledge/standard/fill-message.ts'
import {
	REFUSING_GH_CALLS_PREFIX,
	REFUSING_GH_CALLS_VARIABLE,
	REFUSING_GH_FAILURE,
	REFUSING_GH_FOLDER,
	REFUSING_GH_TEXT,
	REFUSING_GH_VARIABLE,
	SUITE_TEST_VARIABLE,
	VITEST_WORKER_STATE,
} from './refusing-gh.constants.ts'
import { takeRefusingGhCalls } from './refusing-gh.ts'

import { afterEach, beforeEach, expect } from 'vitest'

process.env.PATH = `${REFUSING_GH_FOLDER}${delimiter}${process.env.PATH ?? ''}`
process.env[REFUSING_GH_VARIABLE] = REFUSING_GH_TEXT
process.env[REFUSING_GH_CALLS_VARIABLE] = join(
	tmpdir(),
	`${REFUSING_GH_CALLS_PREFIX}${randomUUID()}`,
)

// the hooks need vitest's runner: a script that imports the setup files to check their side effects (the git
// environment test does) runs outside any worker, where there is no test to fail, and must not throw at import
if (VITEST_WORKER_STATE in globalThis) {
	beforeEach(function nameTheTest() {
		process.env[SUITE_TEST_VARIABLE] = expect.getState().currentTestName ?? ''
	})

	afterEach(function failOnGh() {
		const calls = takeRefusingGhCalls()
		if (calls.length > 0)
			throw new Error(
				fillMessage({
					template: REFUSING_GH_FAILURE,
					values: { test: calls[0] ?? '', count: String(calls.length) },
				}),
			)
	})
}
