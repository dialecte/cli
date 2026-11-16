/**
 * Scratch mixed packages for the progress tests of `tdd red` and `tdd green`: a vitest package (the cli's own vitest
 * linked in) that also holds `node:test` and pytest files, the production stubs committed and the test files written
 * in the working tree; and a live output that keeps the lines the run writes.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'
import { ADD_ONE_TEST_TEXT, ADD_TEST_FILE } from './tdd-runners-node-workspace.constants.ts'
import {
	MIXED_STUB_FILES,
	PYTHON_CONFIG_FILES,
	SUM_VITEST_TEST_TEXT,
	SUM_TEST_FILE,
} from './tdd-runners-progress-workspace.constants.ts'
import { ADD_ONE_PYTEST_TEXT, ADD_PYTEST_FILE } from './tdd-runners-python-workspace.constants.ts'
import { requirePytest } from './tdd-runners-python-workspace.ts'

import type { LiveOutput } from '../src/lib/progress/step-progress.types.ts'
import type { MixedPackageParts } from './tdd-runners-progress-workspace.types.ts'

/** A package with the production stubs committed and the test files of the runners asked written (red material). */
export function createMixedPackage(parts: MixedPackageParts): string {
	if (parts.pytest) requirePytest()
	const root = createVitestPackage({ files: { ...PYTHON_CONFIG_FILES, ...MIXED_STUB_FILES } })
	writeFiles({
		root,
		files: {
			...(parts.vitest && { [SUM_TEST_FILE]: SUM_VITEST_TEST_TEXT }),
			...(parts.node && { [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT }),
			...(parts.pytest && { [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT }),
			...parts.extra,
		},
	})
	return root
}

/** Writes `text` at `file` under the root (a production file made real, or a config). */
export function writeText(params: { root: string; file: string; text: string }): void {
	writeFileSync(join(params.root, params.file), params.text)
}

/** A live output that is no terminal and keeps every line it is asked to write, in order. */
export function recordingLiveOutput(): { live: LiveOutput; lines: string[] } {
	const lines: string[] = []
	return {
		lines,
		live: {
			tty: false,
			writeLine: (line) => void lines.push(line),
			rewriteLines: () => undefined,
		},
	}
}

/** The progress lines with the run's duration cut (`✓ tdd red: vitest ran 1 test file(s)  0.4 s` becomes `... ran 1 test file(s)`). */
export function withoutDurations(lines: readonly string[]): string[] {
	return lines.map((line) => line.trimEnd().replace(/ {2}\d+(\.\d)? (s|m \d+ s|h \d+ m)$/u, ''))
}
