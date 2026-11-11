/**
 * R4-2: the scoped tests step runs the whole suite for a root README or CHANGELOG change (tests read them); a change of
 * a production file under src/ also runs the test files that spawn the cli entry though they import nothing of src.
 * Run in a scratch vitest package, never over this package.
 */
import { join } from 'node:path'

import { scopeRunOf } from '../../../test/scope-run.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import { BASE, TREE } from '../../../test/step4-cases.constants.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { SPAWNING_TEST, WHOLE_SUITE_NOTES } from './scoped-tests-readme-spawn.constants.ts'
import { runScopedTests } from './scoped-tests.ts'

import { describe, expect, it } from 'vitest'

/** A test of `module`'s sibling file. */
function testOf(module: string): string {
	return `import { expect, it } from 'vitest'\nimport { value } from './${module}.ts'\n\nit('${module}', () => {\n\texpect(value).toBe('${module}')\n})\n`
}

/** A package with two modules and their tests, a cli entry, the root notes, and a spawning test when asked. */
function scratchPackage(params: { spawning: boolean }): string {
	return createVitestPackage({
		files: {
			'src/a.ts': "export const value = 'a'\n",
			'src/a.test.ts': testOf('a'),
			'src/b.ts': "export const value = 'b'\n",
			'src/b.test.ts': testOf('b'),
			'src/cli.ts': "console.log('entry')\n",
			'README.md': 'readme\n',
			'CHANGELOG.md': 'changelog\n',
			...(params.spawning && { 'src/spawn.test.ts': SPAWNING_TEST }),
		},
	})
}

/** What the gate hands the step for `changed` paths. */
function handedFor(changed: readonly string[]) {
	const folder = temporaryFolder('dialecte-scoped-notes-')
	writeFiles({ root: folder, files: { changed: changed.map((path) => `${path}\0`).join('') } })
	const selection = join(folder, 'selection.json')
	return {
		environment: { base: BASE, tree: TREE, changed: join(folder, 'changed'), selection },
		scopeRun: scopeRunOf({ base: BASE, tree: TREE, changedCount: changed.length, folder }),
	}
}

describe(
	'the scoped tests step, root notes and spawning tests',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		for (const note of WHOLE_SUITE_NOTES)
			it(`the root ${note} changed -> every test file runs`, () => {
				const root = scratchPackage({ spawning: false })

				const run = runScopedTests({ root, environment: handedFor([note]).environment })

				expect(run.exitCode).toBe(0)
				expect(run.output).toContain('src/a.test.ts')
				expect(run.output).toContain('src/b.test.ts')
				expect(run.output).toMatch(/Tests\s+2 passed \(2\)/)
			})

		it('a production file under src changed, a test file spawns the cli entry and imports nothing of src -> it runs with the related test, the unrelated one does not', () => {
			const root = scratchPackage({ spawning: true })

			const run = runScopedTests({ root, environment: handedFor(['src/a.ts']).environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain('src/a.test.ts')
			expect(run.output).toContain('src/spawn.test.ts')
			expect(run.output).not.toContain('src/b.test.ts')
			expect(run.output).toMatch(/Tests\s+2 passed \(2\)/)
		})

		it('an importable file changed, no test spawns the cli entry -> only its related test runs', () => {
			const root = scratchPackage({ spawning: false })

			const run = runScopedTests({ root, environment: handedFor(['src/a.ts']).environment })

			expect(run.exitCode).toBe(0)
			expect(run.output).toContain('src/a.test.ts')
			expect(run.output).not.toContain('src/b.test.ts')
			expect(run.output).toMatch(/Tests\s+1 passed \(1\)/)
		})
	},
)
