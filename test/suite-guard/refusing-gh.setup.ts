/**
 * Suite guard (vitest `setupFiles`): a `gh` that refuses every call is first on the PATH of every test and of the
 * commands it spawns, so a test that would run the real `gh` (a verb built without a fake host) fails on its refusal,
 * which names the test. A test that needs a `gh` puts its own fake in front of it.
 */
import { delimiter } from 'node:path'

import {
	REFUSING_GH_FOLDER,
	REFUSING_GH_TEXT,
	REFUSING_GH_VARIABLE,
	SUITE_TEST_VARIABLE,
} from './refusing-gh.constants.ts'

import { beforeEach, expect } from 'vitest'

process.env.PATH = `${REFUSING_GH_FOLDER}${delimiter}${process.env.PATH ?? ''}`
process.env[REFUSING_GH_VARIABLE] = REFUSING_GH_TEXT

beforeEach(function nameTheTest() {
	process.env[SUITE_TEST_VARIABLE] = expect.getState().currentTestName ?? ''
})
