/**
 * Scratch packages for the tests of a red run freezing the data fixtures of accepted cases: a vitest package whose
 * committed state is `committed`, then test files and fixtures written in the working tree and the lot file naming
 * the accepted cases.
 */
import { writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'
import { ACCEPT_REASON, READER_SUITE, READER_TITLE } from './tdd-bugs-data-fixtures.constants.ts'

import type { ReaderTestParts } from './tdd-bugs-data-fixtures.types.ts'

/** The text of a test file with one case reading what `parts` import and asserting `parts.assertions`. */
export function readerTestText(parts: ReaderTestParts): string {
	return [
		...parts.imports,
		"import { describe, expect, it } from 'vitest'",
		`describe('${READER_SUITE}', () => {`,
		`\tit('${READER_TITLE}', () => {`,
		...(parts.setup ?? []).map((line) => `\t\t${line}`),
		...parts.assertions.map((line) => `\t\t${line}`),
		'\t})',
		'})',
		'',
	].join('\n')
}

/**
 * A vitest package committing `committed`, then `written` in the working tree (new or changed files) and, when
 * `accepted` is given, the lot file accepting those cases.
 */
export function createDataFixturePackage(params: {
	committed?: Record<string, string>
	written: Record<string, string>
	accepted?: string[]
}): string {
	const root = createVitestPackage({ files: params.committed ?? {} })
	writeFiles({ root, files: params.written })
	if (params.accepted)
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					accept: params.accepted.map((testCase) => ({ case: testCase, reason: ACCEPT_REASON })),
				}),
			},
		})
	return root
}
