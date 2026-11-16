/**
 * A shared file keeps its direct tests on the machine: a changed file whose far reach (through helper modules) is over
 * the share and the floor leaves that far reach to CI, but the test files importing it themselves still run, its own
 * unit test among them. Only a file the test files import directly past the share and the floor goes to CI whole. Run
 * in a scratch vitest package.
 */
import { join } from 'node:path'

import { plainScopedRun } from '../../../test/plain-scoped-run.ts'
import { scopeRunOf } from '../../../test/scope-run.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import { BASE, TREE } from '../../../test/step4-cases.constants.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../../test/test-timing.constants.ts'
import {
	LEFT_TO_CI_LINE_START,
	SHARED_FILE_FLOOR,
	SHARED_FILE_SHARE,
} from './scoped-tests.constants.ts'
import { judgeSelection } from './selection.ts'

import { describe, expect, it } from 'vitest'

/** A test file importing `value` from `from` (a path relative to it), expecting `expected`. */
function testOf(params: { from: string; expected: string; name: string }): string {
	return `import { expect, it } from 'vitest'\nimport { value } from '${params.from}'\n\nit('${params.name}', () => {\n\texpect(value).toBe('${params.expected}')\n})\n`
}

/** `count` test files `src/<prefix>-<n>.test.ts`, each importing `value` from `from` and expecting `expected`. */
function testsOf(params: {
	prefix: string
	count: number
	from: string
	expected: string
}): Record<string, string> {
	return Object.fromEntries(
		Array.from({ length: params.count }, (_unused, index) => [
			`src/${params.prefix}-${index + 1}.test.ts`,
			testOf({
				from: params.from,
				expected: params.expected,
				name: `${params.prefix} ${index + 1}`,
			}),
		]),
	)
}

/** `src/core.ts`, the helper `src/helper.ts` re-exporting it, and `src/core.test.ts` importing it directly. */
const CORE_FILES = {
	'src/core.ts': "export const value = 'core'\n",
	'src/helper.ts': "export { value } from './core.ts'\n",
	'src/core.test.ts': testOf({ from: './core.ts', expected: 'core', name: 'core' }),
}

/** What the gate hands the step for `changed` paths. */
function handedFor(changed: readonly string[]) {
	const folder = temporaryFolder('dialecte-scoped-direct-')
	writeFiles({ root: folder, files: { changed: changed.map((path) => `${path}\0`).join('') } })
	const selection = join(folder, 'selection.json')
	return {
		environment: { base: BASE, tree: TREE, changed: join(folder, 'changed'), selection },
		selection,
		scopeRun: scopeRunOf({ base: BASE, tree: TREE, changedCount: changed.length, folder }),
	}
}

describe(
	'the scoped tests step and the direct tests of a shared file',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('a file most tests reach through a helper, its own unit test importing it -> its unit test runs here, the far reach is left to CI', () => {
			const far = SHARED_FILE_FLOOR + 1
			const root = createVitestPackage({
				files: {
					...CORE_FILES,
					...testsOf({ prefix: 'far', count: far, from: './helper.ts', expected: 'core' }),
				},
			})
			const handed = handedFor(['src/core.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain('src/core.test.ts')
			expect(run.output).not.toContain('far-1.test.ts')
			expect(run.output).toMatch(/Tests\s+1 passed \(1\)/)
			expect(run.output).toContain(
				`${LEFT_TO_CI_LINE_START}src/core.ts (${far + 1} of ${far + 1} test files; the 1 importing it directly ran here)`,
			)
			const judged = judgeSelection({ path: handed.selection, scopeRun: handed.scopeRun })
			expect('selection' in judged && judged.selection.ids).toEqual(['related-tests'])
			const skipped = 'selection' in judged ? JSON.stringify(judged.selection.skipped) : ''
			expect(skipped).toContain('src/core.ts')
		})

		it('a file above the floor but under the share of a large package -> every test reaching it runs', () => {
			const far = SHARED_FILE_FLOOR + 1
			// enough other test files that the far reach stays at or under the share
			const others = Math.ceil((far + 1) / SHARED_FILE_SHARE) - (far + 1)
			const root = createVitestPackage({
				files: {
					...CORE_FILES,
					...testsOf({ prefix: 'far', count: far, from: './helper.ts', expected: 'core' }),
					'src/other.ts': "export const value = 'other'\n",
					...testsOf({ prefix: 'other', count: others, from: './other.ts', expected: 'other' }),
				},
			})
			const handed = handedFor(['src/core.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).not.toContain(LEFT_TO_CI_LINE_START)
			expect(run.output).toMatch(new RegExp(`Tests\\s+${far + 1} passed \\(${far + 1}\\)`))
		})

		it('a small package, a test reaching the changed file only through a helper -> that test runs', () => {
			const root = createVitestPackage({
				files: {
					'src/core.ts': "export const value = 'core'\n",
					'src/helper.ts': "export { value } from './core.ts'\n",
					'src/far.test.ts': testOf({ from: './helper.ts', expected: 'core', name: 'far' }),
				},
			})
			const handed = handedFor(['src/core.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain('src/far.test.ts')
			expect(run.output).toMatch(/Tests\s+1 passed \(1\)/)
		})
	},
)
