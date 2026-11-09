/**
 * Texts and scratch packages of the moved-cases scenarios: a test file of describes (core test vocabulary: D,
 * DD_1, attribute a) split into several files, table suites split into legs, top-level cases around a hook.
 */
import { unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { HOOKED_IMPORT, HOOK_LINE, VITEST_IMPORT } from './moved-cases-fixture.constants.ts'
import { writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'

import type { SourceLocation } from '../src/lib/tdd/tdd.types.ts'

/** A describe holding one case whose body names the group: two groups never share a test call. */
function groupText(group: string): string {
	return [
		`\tdescribe('${group}', () => {`,
		`\t\tit('keeps attribute a', () => { expect('${group}').toBe('${group}') })`,
		'\t})',
	].join('\n')
}

/** A test file with `describe('D', ...)` around one describe per group; `edit` rewrites a group's text. */
export function suiteText(params: {
	groups: readonly string[]
	edit?: Record<string, (text: string) => string>
}): string {
	return [
		VITEST_IMPORT,
		"describe('D', () => {",
		...params.groups.map((group) => params.edit?.[group]?.(groupText(group)) ?? groupText(group)),
		'})',
		'',
	].join('\n')
}

/** The name of the case of `group` in a file of `suiteText`. */
export function suiteCaseName(group: string): string {
	return `D > ${group} > keeps attribute a`
}

/** A test file of top-level `it` calls around a hook: `hook` is the `beforeEach` line, `names` the cases. */
export function hookedText(params: { names: readonly string[]; hook?: string }): string {
	return [
		HOOKED_IMPORT,
		'let state = 0',
		params.hook ?? HOOK_LINE,
		...params.names.map((name) => `it('${name}', () => { expect(state).toBe(1) })`),
		'',
	].join('\n')
}

/** A leg file of the table: it registers the rows of `subset` through the shared helper. */
export function legText(params: {
	subset: readonly number[]
	rename?: Record<string, string>
}): string {
	return [
		"import { describe } from 'vitest'",
		"import { defineLeg } from '../test/define-leg.ts'",
		`describe('D', () => { defineLeg({ subset: [${params.subset.join(', ')}]${
			params.rename ? `, rename: ${JSON.stringify(params.rename)}` : ''
		} }) })`,
		'',
	].join('\n')
}

/** A runner file of the table: loops over the rows of one leg, registering each with a test call. */
export function runnerText(params: { leg: string }): string {
	return [
		VITEST_IMPORT,
		"import { ROWS } from '../test/rows.cases.ts'",
		"describe('D', () => {",
		`\tfor (const row of ROWS.filter((each) => each.leg === '${params.leg}'))`,
		'\t\tit(row.name, () => { expect(row.value).toBeGreaterThan(0) })',
		'})',
		'',
	].join('\n')
}

/** The loop-over-everything runner file the table base holds. */
export function baseRunnerText(): string {
	return [
		VITEST_IMPORT,
		"import { ROWS } from '../test/rows.cases.ts'",
		"describe('D', () => {",
		'\tfor (const row of ROWS)',
		'\t\tit(row.name, () => { expect(row.value).toBeGreaterThan(0) })',
		'})',
		'',
	].join('\n')
}

/**
 * A scratch vitest package whose base commit holds `base`, then the change: each file of `now` written, a
 * `null` one deleted. Nothing is committed after the base.
 */
export function splitPackage(params: {
	base: Record<string, string>
	now: Record<string, string | null>
	/** The package's `dialecte` key (a gate to run, for instance). */
	dialecte?: Record<string, unknown>
}): string {
	const root = createVitestPackage({ files: params.base, dialecte: params.dialecte })
	for (const [file, text] of Object.entries(params.now)) {
		if (text === null) unlinkSync(join(root, file))
		else writeFiles({ root, files: { [file]: text } })
	}
	return root
}

/** Where `needle` starts in `text`, 1-based as a run reports a test call. */
export function locationOf(params: { text: string; needle: string }): SourceLocation {
	const index = params.text.indexOf(params.needle)
	if (index < 0) throw new Error(`no ${params.needle} in the text`)
	const before = params.text.slice(0, index).split('\n')
	return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 }
}

/** A file whose one test call (the same text whatever the describe) sits under `describe('D')` and `describe(group)`. */
export function pathText(group: string): string {
	return [
		VITEST_IMPORT,
		"describe('D', () => {",
		`\tdescribe('${group}', () => {`,
		"\t\tit('keeps attribute a', () => { expect('same').toBe('same') })",
		'\t})',
		'})',
		'',
	].join('\n')
}

/** A runner file whose own `check` function holds the test call, looping over the rows of `leg` (every row without one). */
export function localRunnerText(params: { leg?: string }): string {
	return [
		VITEST_IMPORT,
		"import { ROWS } from '../test/rows.cases.ts'",
		'function check(row: (typeof ROWS)[number]): void {',
		'\tit(row.name, () => { expect(row.value).toBeGreaterThan(0) })',
		'}',
		params.leg === undefined
			? "describe('D', () => { for (const row of ROWS) check(row) })"
			: `describe('D', () => { for (const row of ROWS.filter((each) => each.leg === '${params.leg}')) check(row) })`,
		'',
	].join('\n')
}
