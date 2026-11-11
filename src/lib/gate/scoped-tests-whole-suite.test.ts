/**
 * R1-C1: the scoped tests step runs the whole suite, saying why, for a change no test imports (the entry, the
 * vitest config, a setup file, the manifest, a file a test reads); a change of only an importable source file still
 * runs its related tests. Run in a scratch vitest package, never over this package.
 */
import { join } from 'node:path'

import { scopeRunOf } from '../../../test/scope-run.ts'
import {
	SCRATCH_EXTRA_FILES,
	SCRATCH_TEST_FILES,
	WHOLE_SUITE_CHANGES,
} from '../../../test/scoped-whole-suite.constants.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import { BASE, TREE } from '../../../test/step4-cases.constants.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runScopedTests } from './scoped-tests.ts'
import { judgeSelection } from './selection.ts'

import { describe, expect, it } from 'vitest'

/** A test of `module`'s sibling file. */
function testOf(module: string): string {
	return `import { expect, it } from 'vitest'\nimport { value } from './${module}.ts'\n\nit('${module}', () => {\n\texpect(value).toBe('${module}')\n})\n`
}

/** A package with two modules, each with its own test, and the files whose change no test relates to. */
function scratchPackage(): string {
	return createVitestPackage({
		files: {
			'src/a.ts': "export const value = 'a'\n",
			'src/a.test.ts': testOf('a'),
			'src/b.ts': "export const value = 'b'\n",
			'src/b.test.ts': testOf('b'),
			...SCRATCH_EXTRA_FILES,
		},
	})
}

/** What the gate hands the step for `changed` paths. */
function handedFor(changed: readonly string[]) {
	const folder = temporaryFolder('dialecte-scoped-whole-')
	writeFiles({ root: folder, files: { changed: changed.map((path) => `${path}\0`).join('') } })
	const selection = join(folder, 'selection.json')
	return {
		environment: { base: BASE, tree: TREE, changed: join(folder, 'changed'), selection },
		selection,
		scopeRun: scopeRunOf({ base: BASE, tree: TREE, changedCount: changed.length, folder }),
	}
}

describe(
	'the scoped tests step and a change no test imports',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		for (const change of WHOLE_SUITE_CHANGES)
			it(`${change.title} changed -> every test file runs and the selection names the change as the reason`, () => {
				const root = scratchPackage()
				const handed = handedFor([change.path])

				const run = runScopedTests({ root, environment: handed.environment })

				expect(run.exitCode).toBe(0)
				for (const file of SCRATCH_TEST_FILES) expect(run.output).toContain(file)
				expect(run.output).toMatch(/Tests\s+2 passed \(2\)/)
				const judged = judgeSelection({ path: handed.selection, scopeRun: handed.scopeRun })
				expect(judged).toHaveProperty('selection')
				const reasons = 'selection' in judged ? JSON.stringify(judged.selection.reasons) : ''
				expect('selection' in judged && judged.selection.ids.length).toBeGreaterThan(0)
				expect(reasons).toContain(change.path)
			})

		it('only an importable source file changed -> only its related test runs', () => {
			const root = scratchPackage()
			const handed = handedFor(['src/a.ts'])

			const run = runScopedTests({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain('src/a.test.ts')
			expect(run.output).not.toContain('src/b.test.ts')
			expect(run.output).toMatch(/Tests\s+1 passed \(1\)/)
		})
	},
)
