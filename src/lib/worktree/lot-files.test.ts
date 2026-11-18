/** The lot files of a worktree (CK-cli design 3.2.1): the root's and each tracked package's, found by git's index. */
import { join } from 'node:path'

import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { lotFilesOf } from './lot-files.ts'

import { describe, expect, it } from 'vitest'

const DECLARATION = '{}\n'

describe('lotFilesOf', () => {
	it('the root and two tracked packages holding lot files -> each, the root first, then by path', () => {
		const root = createScratchRepository({
			'package.json': '{}\n',
			'packages/ui/package.json': '{}\n',
			'packages/core/package.json': '{}\n',
		})
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': DECLARATION,
				'packages/ui/.dialecte/lot.json': DECLARATION,
				'packages/core/.dialecte/lot.json': DECLARATION,
			},
		})

		expect(lotFilesOf({ root })).toEqual([
			{ packagePath: '', file: join(root, '.dialecte/lot.json') },
			{ packagePath: 'packages/core', file: join(root, 'packages/core/.dialecte/lot.json') },
			{ packagePath: 'packages/ui', file: join(root, 'packages/ui/.dialecte/lot.json') },
		])
	})

	it('an untracked package.json folder holding a lot file -> not found', () => {
		const root = createScratchRepository({ 'package.json': '{}\n' })
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': DECLARATION,
				'scratch/package.json': '{}\n',
				'scratch/.dialecte/lot.json': DECLARATION,
			},
		})

		expect(lotFilesOf({ root })).toEqual([
			{ packagePath: '', file: join(root, '.dialecte/lot.json') },
		])
	})

	it('a tracked package without a lot file -> not listed', () => {
		const root = createScratchRepository({ 'packages/ui/package.json': '{}\n' })
		writeFiles({ root, files: { '.dialecte/lot.json': DECLARATION } })

		expect(lotFilesOf({ root })).toEqual([
			{ packagePath: '', file: join(root, '.dialecte/lot.json') },
		])
	})

	it('a folder outside git -> the root lot file only', () => {
		const root = temporaryFolder('dialecte-no-git-')
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': DECLARATION,
				'packages/ui/package.json': '{}\n',
				'packages/ui/.dialecte/lot.json': DECLARATION,
			},
		})

		expect(lotFilesOf({ root })).toEqual([
			{ packagePath: '', file: join(root, '.dialecte/lot.json') },
		])
	})
})
