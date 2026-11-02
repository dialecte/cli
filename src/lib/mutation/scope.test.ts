import { changedRanges, isMutable } from './scope.ts'

import { describe, expect, it } from 'vitest'

import type { MutationDeclaration } from './mutation.types.ts'

const DECLARATION: MutationDeclaration = {
	scope: ['src/v2019C1/extensions/lifecycle/**', 'src/engine/*.ts'],
	exclude: ['**/errors/**', '**/*.constants.ts'],
	errorFactories: [],
	fast: { vitestConfig: 'v.config.ts' },
}

describe('isMutable', () => {
	it.each([
		['a file under a scope glob', 'src/v2019C1/extensions/lifecycle/fork/fork.ts', true],
		['a file matching the second scope glob', 'src/engine/run.ts', true],
		['a file outside every scope glob', 'src/v2019C1/extensions/identity/a.ts', false],
		['a nested file the single-star glob does not reach', 'src/engine/deep/run.ts', false],
		['an excluded folder', 'src/v2019C1/extensions/lifecycle/errors/fork.ts', false],
		['an excluded suffix', 'src/v2019C1/extensions/lifecycle/fork.constants.ts', false],
		[
			'a non-source file under a scope glob (json)',
			'src/v2019C1/extensions/lifecycle/data.json',
			false,
		],
		[
			'a non-source file under a scope glob (md)',
			'src/v2019C1/extensions/lifecycle/notes.md',
			false,
		],
		['a javascript file under a scope glob', 'src/v2019C1/extensions/lifecycle/a.js', false],
		['a test file', 'src/v2019C1/extensions/lifecycle/fork.test.ts', false],
		['a types file', 'src/v2019C1/extensions/lifecycle/fork.types.ts', false],
		['a declaration file', 'src/v2019C1/extensions/lifecycle/fork.d.ts', false],
		['a generated file', 'src/v2019C1/extensions/lifecycle/fork.generated.ts', false],
		['a setup file', 'src/v2019C1/extensions/lifecycle/fork.setup.ts', false],
		['a fixtures folder', 'src/v2019C1/extensions/lifecycle/fixtures/a/b.ts', false],
		['a __tests__ folder', 'src/v2019C1/extensions/lifecycle/__tests__/b.ts', false],
	])('%s → %s', (_label, file, expected) => {
		expect(isMutable({ declaration: DECLARATION, file })).toBe(expected)
	})
})

describe('changedRanges', () => {
	const IN = 'src/v2019C1/extensions/lifecycle/a.ts'
	const SPACED = 'src/v2019C1/extensions/lifecycle/a b.ts'
	const OUT = 'src/v2019C1/extensions/identity/b.ts'
	const EXCLUDED = 'src/v2019C1/extensions/lifecycle/errors/e.ts'
	const NEVER = [
		'src/v2019C1/extensions/lifecycle/a.test.ts',
		'src/v2019C1/extensions/lifecycle/b.types.ts',
		'src/v2019C1/extensions/lifecycle/d.generated.ts',
		'src/v2019C1/extensions/lifecycle/fixtures/x/y.ts',
		'src/v2019C1/extensions/lifecycle/s.setup.ts',
	]

	function header(params: { path: string; hunk: string[] }): string[] {
		const { path, hunk } = params
		return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...hunk]
	}

	const DIFF = [
		...header({ path: IN, hunk: ['@@ -10,0 +11,3 @@ function a() {', '+one'] }),
		'+++ b/src/v2019C1/extensions/lifecycle/content.ts',
		'@@ -20 +23 @@',
		'+two',
		'@@ -30,2 +33,0 @@',
		'-gone',
		'diff --git a/x b/x',
		`--- a/${SPACED}\t`,
		`+++ b/${SPACED}\t`,
		'@@ -1,0 +2,1 @@',
		'+spaced',
		...[OUT, EXCLUDED, ...NEVER].flatMap((path) => header({ path, hunk: ['@@ -1,0 +2,1 @@'] })),
		'diff --git a/src/gone.ts b/src/gone.ts',
		'--- a/src/gone.ts',
		'+++ /dev/null',
		'@@ -1,3 +0,0 @@',
	].join('\n')

	it('the added and changed lines of the mutable files, the untracked mutable files whole; nothing for the others', () => {
		expect(
			changedRanges({
				declaration: DECLARATION,
				diff: DIFF,
				untracked: [
					'src/v2019C1/extensions/lifecycle/new.ts',
					'src/v2019C1/extensions/lifecycle/new.test.ts',
					OUT,
					EXCLUDED,
					'src/v2019C1/extensions/lifecycle/new.types.ts',
					'src/v2019C1/extensions/lifecycle/fixtures/n.ts',
					'README.md',
				],
			}),
		).toEqual([
			`${IN}:11-13`,
			`${IN}:23-23`,
			`${SPACED}:2-2`,
			'src/v2019C1/extensions/lifecycle/new.ts',
		])
	})

	it('a changed file that is also untracked → its ranges, then the file whole', () => {
		const diff = [...header({ path: IN, hunk: ['@@ -1 +1 @@'] })].join('\n')
		expect(changedRanges({ declaration: DECLARATION, diff, untracked: [IN] })).toEqual([
			`${IN}:1-1`,
			IN,
		])
	})
})
