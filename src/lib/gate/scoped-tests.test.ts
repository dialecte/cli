/**
 * The scoped tests step of this package's fast gate, in a scratch vitest package: only the tests related to the
 * changed paths run; an empty selection exits 0 without starting vitest; the selection file is the gate's.
 */
import { join } from 'node:path'

import { scopeRunOf } from '../../../test/scope-run.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import { BASE, TREE } from '../../../test/step4-cases.constants.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runScopedTests } from './scoped-tests.ts'
import { judgeSelection, nothingSelectedNote } from './selection.ts'

import { describe, expect, it } from 'vitest'

import type { ScopeRun } from './gate.types.ts'
import type { ScopedTestsEnvironment } from './scoped-tests.types.ts'

/** A test of `module`'s sibling file, expecting the module's value (`expected` when it is to fail). */
function testOf(params: { module: string; expected?: string }): string {
	return `import { expect, it } from 'vitest'\nimport { value } from './${params.module}.ts'\n\nit('${params.module}', () => {\n\texpect(value).toBe('${params.expected ?? params.module}')\n})\n`
}

function moduleOf(name: string): string {
	return `export const value = '${name}'\n`
}

/** A package with two modules, each with its own test, and a note no test is related to. */
function scratchPackage(params: { failing?: 'a' } = {}): string {
	return createVitestPackage({
		files: {
			'src/a.ts': moduleOf('a'),
			'src/a.test.ts': testOf({ module: 'a', expected: params.failing && 'other' }),
			'src/b.ts': moduleOf('b'),
			'src/b.test.ts': testOf({ module: 'b' }),
			'docs/notes.md': 'notes\n',
		},
	})
}

/** What the gate hands the step for `changed` paths: the environment and where the selection is written. */
function handedFor(changed: readonly string[]): {
	environment: ScopedTestsEnvironment
	selection: string
	scopeRun: ScopeRun
} {
	const folder = temporaryFolder('dialecte-scoped-tests-')
	writeFiles({ root: folder, files: { changed: changed.map((path) => `${path}\0`).join('') } })
	const selection = join(folder, 'selection.json')
	return {
		environment: { base: BASE, tree: TREE, changed: join(folder, 'changed'), selection },
		selection,
		scopeRun: scopeRunOf({ base: BASE, tree: TREE, changedCount: changed.length, folder }),
	}
}

/** The selection the step wrote, as the gate's own reader judges it against the run it was handed. */
function judgedBy(handed: { selection: string; scopeRun: ScopeRun }) {
	return judgeSelection({ path: handed.selection, scopeRun: handed.scopeRun })
}

describe('the scoped tests step', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('one changed source file → only its related test runs, the selection names it', () => {
		const root = scratchPackage()
		const handed = handedFor(['src/a.ts'])

		expect(runScopedTests({ root, environment: handed.environment })).toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/a\.test\.ts[\s\S]*Tests\s+1 passed \(1\)/),
		})
		const judged = judgedBy(handed)
		expect(judged).toHaveProperty('selection')
		expect('selection' in judged && judged.selection.ids.length > 0).toBe(true)
		expect(judged).toMatchObject({ selection: { base: BASE, tree: TREE, changed: 1 } })
	})

	it('one changed source file → the test of the other module does not run', () => {
		const root = scratchPackage()
		const handed = handedFor(['src/a.ts'])

		expect(runScopedTests({ root, environment: handed.environment })).toMatchObject({
			output: expect.not.stringContaining('b.test.ts'),
		})
	})

	it('two changed source files → both related tests run', () => {
		const root = scratchPackage()
		const handed = handedFor(['src/a.ts', 'src/b.ts'])

		expect(runScopedTests({ root, environment: handed.environment })).toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/Tests\s+2 passed \(2\)/),
		})
	})

	it('a changed test file → that test runs alone', () => {
		const root = scratchPackage()
		const handed = handedFor(['src/b.test.ts'])

		expect(runScopedTests({ root, environment: handed.environment })).toMatchObject({
			output: expect.stringMatching(/b\.test\.ts[\s\S]*Tests\s+1 passed \(1\)/),
		})
	})

	it('a changed note no test is related to → exit 0, no test run, nothing selected, the change counted', () => {
		const root = scratchPackage()
		const handed = handedFor(['docs/notes.md'])

		expect(runScopedTests({ root, environment: handed.environment })).toMatchObject({
			exitCode: 0,
			output: expect.not.stringMatching(/Tests\s/),
		})
		const judged = judgedBy(handed)
		expect(judged).toMatchObject({ selection: { base: BASE, tree: TREE, changed: 1, ids: [] } })
		expect('selection' in judged ? nothingSelectedNote(judged.selection) : '').toBe(
			`nothing selected since ${BASE.slice(0, 12)} (1 path changed)`,
		)
	})

	it('no changed path at all → exit 0, nothing selected, zero paths judged', () => {
		const root = scratchPackage()
		const handed = handedFor([])

		expect(runScopedTests({ root, environment: handed.environment }).exitCode).toBe(0)
		expect(judgedBy(handed)).toMatchObject({ selection: { changed: 0, ids: [] } })
	})

	it('a related test that fails → exit 1, vitest’s failure in the output', () => {
		const root = scratchPackage({ failing: 'a' })
		const handed = handedFor(['src/a.ts'])

		expect(runScopedTests({ root, environment: handed.environment })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/FAIL\s/),
		})
	})
})
