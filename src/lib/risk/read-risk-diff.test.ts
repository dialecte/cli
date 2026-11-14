import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { readRiskDiff } from './read-risk-diff.ts'

import { describe, expect, it } from 'vitest'

describe('readRiskDiff', () => {
	it('files changed after the base (committed and not), untracked files sorted by path and a version-only package.json', () => {
		const root = initializeRepository({
			root: temporaryFolder('risk-diff-'),
			files: {
				'package.json': '{\n  "name": "x",\n  "version": "1.0.0"\n}\n',
				'src/a.ts': 'one\ntwo\n',
			},
		})
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({
			root,
			files: { 'src/a.ts': 'one\ntwo\nthree\n', 'src/committed.ts': 'gamma\n' },
		})
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: after the base'] })
		writeFiles({
			root,
			files: {
				'package.json': '{\n  "name": "x",\n  "version": "1.0.1"\n}\n',
				'src/a.ts': 'one\ntwo\nthree\nfour\n',
				'src/new.ts': 'alpha\nbeta\n',
				'a.ts': 'delta\n',
			},
		})

		expect(readRiskDiff({ root, base })).toStrictEqual([
			{ path: 'a.ts', added: [{ line: 1, text: 'delta' }], addedCount: 1, removedCount: 0 },
			{
				path: 'package.json',
				added: [{ line: 3, text: '  "version": "1.0.1"' }],
				addedCount: 1,
				removedCount: 1,
				versionOnly: true,
			},
			{
				path: 'src/a.ts',
				added: [
					{ line: 3, text: 'three' },
					{ line: 4, text: 'four' },
				],
				addedCount: 2,
				removedCount: 0,
			},
			{
				path: 'src/committed.ts',
				added: [{ line: 1, text: 'gamma' }],
				addedCount: 1,
				removedCount: 0,
			},
			{
				path: 'src/new.ts',
				added: [
					{ line: 1, text: 'alpha' },
					{ line: 2, text: 'beta' },
				],
				addedCount: 2,
				removedCount: 0,
			},
		])
	})
})
