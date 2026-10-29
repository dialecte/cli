import { isTestCode } from './tdd-files.ts'

import { describe, expect, it } from 'vitest'

describe('isTestCode', () => {
	it.each([
		['src/add.test.ts', true],
		['src/add.spec.mts', true],
		['test/expected.ts', true],
		['src/test/run-test-cases.ts', true],
		['src/__snapshots__/add.test.ts.snap', true],
		['src/view.snap', true],
		['src/fixtures/small.xml', true],
		['test/fixtures/small.xml', true],
		['src/__fixtures__/a.json', true],
		['src/add.ts', false],
		['src/testing-library.ts', false],
		['README.md', false],
	])('%s → %s', (file, expected) => {
		expect(isTestCode(file)).toBe(expected)
	})
})
