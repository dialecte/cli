/**
 * CI first (33CI section 12): a changed file that most of the package's tests import (a shared helper, the command
 * map) is left to the full suite on CI as the manifest is: vitest's own import graph says how many test files reach
 * it, and one reached by more than a quarter of them and more than the floor runs nothing on the machine. The other
 * changed files of the same commit still run their related tests. Run in a scratch vitest package.
 */
import { join } from 'node:path'

import { plainScopedRun } from '../../../test/plain-scoped-run.ts'
import { scopeRunOf } from '../../../test/scope-run.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import { BASE, TREE } from '../../../test/step4-cases.constants.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../../test/test-timing.constants.ts'
import {
	GRAPH_FAILED_LINE,
	LEFT_TO_CI_LINE_START,
	SHARED_FILE_FLOOR,
} from './scoped-tests.constants.ts'
import { judgeSelection } from './selection.ts'

import { describe, expect, it } from 'vitest'

/** A test of `module` (a sibling file), named `name`. */
function testOf(params: { module: string; name: string }): string {
	return `import { expect, it } from 'vitest'\nimport { value } from './${params.module}.ts'\n\nit('${params.name}', () => {\n\texpect(value).toBe('${params.module}')\n})\n`
}

/** `count` test files `src/shared-<n>.test.ts`, each importing `src/shared.ts`. */
function sharedTests(count: number): Record<string, string> {
	return Object.fromEntries(
		Array.from({ length: count }, (_unused, index) => [
			`src/shared-${index + 1}.test.ts`,
			testOf({ module: 'shared', name: `shared ${index + 1}` }),
		]),
	)
}

/**
 * A package whose `src/shared.ts` one test file more than the floor imports, and `src/own.ts` one test imports:
 * `floor + 2` test files, the shared file reached by all but one.
 */
function sharedPackage(): string {
	return createVitestPackage({
		files: {
			'src/shared.ts': "export const value = 'shared'\n",
			'src/own.ts': "export const value = 'own'\n",
			'src/own.test.ts': testOf({ module: 'own', name: 'own' }),
			...sharedTests(SHARED_FILE_FLOOR + 1),
		},
	})
}

/** What the gate hands the step for `changed` paths. */
function handedFor(changed: readonly string[]) {
	const folder = temporaryFolder('dialecte-scoped-shared-')
	writeFiles({ root: folder, files: { changed: changed.map((path) => `${path}\0`).join('') } })
	const selection = join(folder, 'selection.json')
	return {
		environment: { base: BASE, tree: TREE, changed: join(folder, 'changed'), selection },
		selection,
		scopeRun: scopeRunOf({ base: BASE, tree: TREE, changedCount: changed.length, folder }),
	}
}

describe(
	'the scoped tests step and a file most tests import',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('the shared file changed -> no test runs here, the left-to-CI line names it with how many test files reach it, the selection skips it', () => {
			const root = sharedPackage()
			const handed = handedFor(['src/shared.ts'])
			const total = SHARED_FILE_FLOOR + 2

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain(
				`${LEFT_TO_CI_LINE_START}src/shared.ts (${total - 1} of ${total} test files)`,
			)
			expect(run.output).not.toContain('shared-1.test.ts')
			const judged = judgeSelection({ path: handed.selection, scopeRun: handed.scopeRun })
			expect('selection' in judged && judged.selection.ids).toEqual([])
			const skipped = 'selection' in judged ? JSON.stringify(judged.selection.skipped) : ''
			expect(skipped).toContain('left-to-ci')
			expect(skipped).toContain('src/shared.ts')
		})

		it('the shared file and a file one test imports changed together -> that one test runs, the shared file is left to CI', () => {
			const root = sharedPackage()
			const handed = handedFor(['src/shared.ts', 'src/own.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain(`${LEFT_TO_CI_LINE_START}src/shared.ts`)
			expect(run.output).toContain('src/own.test.ts')
			expect(run.output).not.toContain('shared-1.test.ts')
			expect(run.output).toMatch(/Tests\s+1 passed \(1\)/)
			const judged = judgeSelection({ path: handed.selection, scopeRun: handed.scopeRun })
			expect('selection' in judged && judged.selection.ids).toEqual(['related-tests'])
		})

		it('a small package, every test importing the changed file -> below the floor: its related tests run', () => {
			const root = createVitestPackage({
				files: {
					'src/shared.ts': "export const value = 'shared'\n",
					...sharedTests(3),
				},
			})
			const handed = handedFor(['src/shared.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).not.toContain(LEFT_TO_CI_LINE_START)
			expect(run.output).toMatch(/Tests\s+3 passed \(3\)/)
		})

		it('a test file vite cannot transform → the step fails naming the graph, the selection still written with what CI checks', () => {
			const root = createVitestPackage({
				files: {
					'src/a.ts': "export const value = 'a'\n",
					'src/a.test.ts': testOf({ module: 'a', name: 'a' }),
					'src/broken.test.ts': 'import { it } from "vitest"\nit("broken", () => {\n',
				},
			})
			const handed = handedFor(['src/a.ts', 'package.json'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(1)
			expect(run.output).toContain(GRAPH_FAILED_LINE)
			expect(run.output).toContain(`${LEFT_TO_CI_LINE_START}package.json`)
			const judged = judgeSelection({ path: handed.selection, scopeRun: handed.scopeRun })
			const skipped = 'selection' in judged ? JSON.stringify(judged.selection.skipped) : ''
			expect(skipped).toContain('package.json')
		})

		it('a test importing the changed file with a query (?raw) -> that test runs', () => {
			const root = createVitestPackage({
				files: {
					'src/data.ts': "export const value = 'data'\n",
					'src/data.test.ts':
						"import { expect, it } from 'vitest'\nimport text from './data.ts?raw'\n\nit('data', () => {\n\texpect(text).toContain('data')\n})\n",
				},
			})
			const handed = handedFor(['src/data.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toMatch(/Tests\s+1 passed \(1\)/)
		})
	},
)
