/**
 * Scratch packages for the tests of a run that reports no case: a vitest package committing its configs, then the
 * new test files written in the working tree (the change a `tdd red` or `tdd green` reads).
 */
import { writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'
import { RED_TITLE, SUITE } from './tdd-bugs-zero-cases.constants.ts'

import type { ZeroCaseTestParts } from './tdd-bugs-zero-cases.types.ts'

/** The test call of the one real case of the scenarios: it fails on an assertion, so a red run counts it red. */
export function redCaseCall(): string {
	return `it('${RED_TITLE}', () => { expect(1).toBe(2) })`
}

/** The text of a test file with one suite holding `parts.body`. */
export function zeroCaseTestText(parts: ZeroCaseTestParts): string {
	return [
		"import { describe, expect, it } from 'vitest'",
		`describe('${parts.suite ?? SUITE}', () => {`,
		...parts.body.map((line) => `\t${line}`),
		'})',
		'',
	].join('\n')
}

/** A vitest package committing `configs`, then `written` in the working tree (the new test files). */
export function createZeroCasePackage(params: {
	configs: Record<string, string>
	written: Record<string, string>
}): string {
	const root = createVitestPackage({ files: params.configs })
	writeFiles({ root, files: params.written })
	return root
}
