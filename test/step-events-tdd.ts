/** A lot whose worktree holds a vitest package with a stub and its test, for the tdd step-event cases. */
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, writeFiles } from './scratch-repository.ts'
import { VITEST_FOLDER } from './scratch-vitest-package.constants.ts'
import { capturedStandardErrorLines, resetCapturedStandardError } from './standard-error-capture.ts'
import { createStepLot } from './step-events-lot.ts'
import {
	ADD_CODE,
	ADD_FILE,
	ADD_STUB,
	ADD_TEST,
	ADD_TEST_FILE,
	NOT_RECORDED_PREFIX,
} from './step-events-tdd.constants.ts'

import type { StepLot } from './step-events-lot.types.ts'

/** Links the cli's own vitest into `root/node_modules` (ignored by git), so `npx --no-install vitest` runs offline. */
export function linkVitest(root: string): void {
	mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
	symlinkSync(VITEST_FOLDER, join(root, 'node_modules', 'vitest'))
	symlinkSync(join('..', 'vitest', 'vitest.mjs'), join(root, 'node_modules', '.bin', 'vitest'))
}

/**
 * A step lot (a store lot and its real worktree) whose package commits the stub; in the worktree, vitest is linked
 * and the test file is new (the uncommitted work of the lot).
 */
export function createTddLot(params: { implemented?: boolean } = {}): StepLot {
	const lot = createStepLot({
		extraPackage: { type: 'module' },
		files: { [ADD_FILE]: params.implemented ? ADD_CODE : ADD_STUB },
	})
	linkVitest(lot.worktree)
	writeFiles({ root: lot.worktree, files: { [ADD_TEST_FILE]: ADD_TEST } })
	return lot
}

/** A plain checkout (no lot, no store): the same package and test, a repository of its own. */
export function createPlainTddCheckout(): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', type: 'module' })}\n`,
		'.gitignore': 'node_modules\n',
		[ADD_FILE]: ADD_STUB,
	})
	linkVitest(root)
	writeFiles({ root, files: { [ADD_TEST_FILE]: ADD_TEST } })
	return root
}

/**
 * Collects the warning lines the step recorder writes to standard error while the test runs (the default channel of
 * the in-process entries); the spy goes with `vi.restoreAllMocks`.
 */
export function spyOnWarnings(): { lines: string[] } {
	resetCapturedStandardError()
	return {
		get lines() {
			return capturedStandardErrorLines().filter((line) => line.startsWith(NOT_RECORDED_PREFIX))
		},
	}
}
