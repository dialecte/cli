/**
 * CI first (33CI CI5): the machine runs only the tests the importable changes reach; a change no test imports (the
 * entry, the vitest config, a setup file, the manifest, a file a test reads, the root README and CHANGELOG) is left to
 * the full suite CI runs, said in one line and recorded as skipped. Run in a scratch vitest package, never over this
 * package.
 */
import { join } from 'node:path'

import { plainScopedRun } from '../../../test/plain-scoped-run.ts'
import { scopeRunOf } from '../../../test/scope-run.ts'
import {
	SCRATCH_EXTRA_FILES,
	SCRATCH_TEST_FILES,
	LEFT_TO_CI_CHANGES,
} from '../../../test/scoped-left-to-ci.constants.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import { BASE, TREE } from '../../../test/step4-cases.constants.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { LEFT_TO_CI_LINE_START } from './scoped-tests.constants.ts'
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
	const folder = temporaryFolder('dialecte-scoped-left-')
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
		for (const change of LEFT_TO_CI_CHANGES)
			it(`${change.title} changed -> no test runs here, one line leaves it to the full suite on CI, the selection names it`, () => {
				const root = scratchPackage()
				const handed = handedFor([change.path])

				const run = plainScopedRun({ root, environment: handed.environment })

				expect(run.exitCode).toBe(0)
				expect(run.output).toContain(`${LEFT_TO_CI_LINE_START}${change.path}`)
				for (const file of SCRATCH_TEST_FILES) expect(run.output).not.toContain(file)
				const judged = judgeSelection({ path: handed.selection, scopeRun: handed.scopeRun })
				expect(judged).toHaveProperty('selection')
				// nothing selected (the gate passes the step with its nothing-selected note), the path skipped for CI
				expect('selection' in judged && judged.selection.ids).toEqual([])
				const skipped = 'selection' in judged ? JSON.stringify(judged.selection.skipped) : ''
				expect(skipped).toContain(change.path)
			})

		it("the manifest and an importable source file changed -> the source file's related test runs, the manifest is left to CI", () => {
			const root = scratchPackage()
			const handed = handedFor(['package.json', 'src/a.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain(`${LEFT_TO_CI_LINE_START}package.json`)
			expect(run.output).toContain('src/a.test.ts')
			expect(run.output).not.toContain('src/b.test.ts')
		})

		it('only an importable source file changed -> only its related test runs', () => {
			const root = scratchPackage()
			const handed = handedFor(['src/a.ts'])

			const run = plainScopedRun({ root, environment: handed.environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain('src/a.test.ts')
			expect(run.output).not.toContain('src/b.test.ts')
			expect(run.output).toMatch(/Tests\s+1 passed \(1\)/)
		})
	},
)
