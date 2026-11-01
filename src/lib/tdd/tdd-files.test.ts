import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { appendEntries, isTestCode, readLedger } from './tdd-files.ts'

import { describe, expect, it } from 'vitest'

import type { TddReceipt } from './tdd.types.ts'

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

describe('appendEntries', () => {
	it('the same production tree recorded at two bases (a default run, then a --base run) → each state kept under its own base', () => {
		const root = createScratchRepository()
		const receipt: TddReceipt = {
			kind: 'red',
			file: 'src/add.test.ts',
			name: 'add > one plus two',
			project: '',
			testFileHash: 'test',
			caseHash: 'case',
			productionHash: 'tree',
			at: '2026-11-01T12:00:00.000Z',
		}

		appendEntries({
			root,
			entries: [receipt],
			production: { hash: 'tree', base: 'head', files: {} },
		})
		appendEntries({
			root,
			entries: [receipt],
			production: { hash: 'tree', base: 'branch-start', files: { 'src/add.ts': 'add-1' } },
		})

		const ledger = readLedger(root)
		expect('failure' in ledger ? ledger : ledger.production).toEqual({
			head: { tree: {} },
			'branch-start': { tree: { 'src/add.ts': 'add-1' } },
		})
	})
})
