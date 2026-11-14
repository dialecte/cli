import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { compareApiIndexes } from './api-index-diff.ts'

import { describe, expect, it } from 'vitest'

import type { ApiChange } from '../risk/risk.types.ts'

const RUNTIME_PACKAGE =
	'{\n  "name": "@x/runtime",\n  "version": "1.0.0",\n  "exports": {\n    ".": {\n      "types": "./dist/index.d.ts",\n      "default": "./dist/index.js"\n    }\n  }\n}\n'
const CLI_PACKAGE =
	'{\n  "name": "@x/tool",\n  "version": "1.0.0",\n  "bin": {\n    "tool": "./dist/cli.js"\n  }\n}\n'
const INDEX_PATH = 'skills/runtime/references/api.json'
const INDEX_ONE = '{\n  "package": "@x/runtime",\n  "members": []\n}\n'
const INDEX_TWO = '{\n  "package": "@x/runtime",\n  "members": ["run"]\n}\n'
const MISSING_BASE = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

type ApiCase = {
	name: string
	committed: Record<string, string>
	worktree: Record<string, string>
	expected: ApiChange
}

const apiCases: ApiCase[] = [
	{
		name: 'a root with no package.json is not a package → none',
		committed: { 'src/a.ts': 'one\n' },
		worktree: { 'src/a.ts': 'one\ntwo\n' },
		expected: 'none',
	},
	{
		name: 'a package with a bin is not a runtime package → none',
		committed: { 'package.json': CLI_PACKAGE, 'src/cli.ts': 'one\n' },
		worktree: { 'src/cli.ts': 'one\ntwo\n' },
		expected: 'none',
	},
	{
		name: 'an index identical to the base, the export source untouched → unchanged',
		committed: {
			'package.json': RUNTIME_PACKAGE,
			'src/index.ts': 'export const a = 1\n',
			'src/other.ts': 'one\n',
			[INDEX_PATH]: INDEX_ONE,
		},
		worktree: { 'src/other.ts': 'one\ntwo\n' },
		expected: 'unchanged',
	},
	{
		name: 'case 33: an export source changed while the index did not → unknown',
		committed: {
			'package.json': RUNTIME_PACKAGE,
			'src/index.ts': 'export const a = 1\n',
			[INDEX_PATH]: INDEX_ONE,
		},
		worktree: { 'src/index.ts': 'export const a = 2\n' },
		expected: 'unknown',
	},
	{
		name: 'an export source and the index both changed → changed',
		committed: {
			'package.json': RUNTIME_PACKAGE,
			'src/index.ts': 'export const a = 1\n',
			[INDEX_PATH]: INDEX_ONE,
		},
		worktree: { 'src/index.ts': 'export const a = 2\n', [INDEX_PATH]: INDEX_TWO },
		expected: 'changed',
	},
	{
		name: 'exports, no index on either side, an export source changed → unknown',
		committed: { 'package.json': RUNTIME_PACKAGE, 'src/index.ts': 'export const a = 1\n' },
		worktree: { 'src/index.ts': 'export const a = 1\n// x\n' },
		expected: 'unknown',
	},
	{
		name: 'exports, no index on either side, a docs-only change → unchanged',
		committed: { 'package.json': RUNTIME_PACKAGE, 'src/index.ts': 'export const a = 1\n' },
		worktree: { 'README.md': 'a note\n' },
		expected: 'unchanged',
	},
	{
		name: 'no exports map and no index, a source changed → none',
		committed: {
			'package.json': '{\n  "name": "@x/plain",\n  "version": "1.0.0"\n}\n',
			'src/a.ts': 'one\n',
		},
		worktree: { 'src/a.ts': 'one\ntwo\n' },
		expected: 'none',
	},
]

describe('compareApiIndexes', () => {
	it.each(apiCases)('$name', (apiCase) => {
		const root = initializeRepository({
			root: temporaryFolder('api-index-diff-'),
			files: apiCase.committed,
		})
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({ root, files: apiCase.worktree })

		expect(compareApiIndexes({ root, base })).toBe(apiCase.expected)
	})

	it('an index committed after the base → changed', () => {
		const root = initializeRepository({
			root: temporaryFolder('api-index-diff-'),
			files: {
				'package.json': RUNTIME_PACKAGE,
				'src/index.ts': 'export const a = 1\n',
				[INDEX_PATH]: INDEX_ONE,
			},
		})
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({ root, files: { [INDEX_PATH]: INDEX_TWO } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: after the base'] })

		expect(compareApiIndexes({ root, base })).toBe('changed')
	})

	it('case 34: a base that cannot be read → unknown, never unchanged', () => {
		const root = initializeRepository({
			root: temporaryFolder('api-index-diff-'),
			files: {
				'package.json': RUNTIME_PACKAGE,
				'src/index.ts': 'export const a = 1\n',
				[INDEX_PATH]: INDEX_ONE,
			},
		})

		expect(compareApiIndexes({ root, base: MISSING_BASE })).toBe('unknown')
	})
})
