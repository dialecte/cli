/**
 * The presence map of test code: one git read gives each changed path of the package its state since the base, and its
 * text when present; a path deleted from disk, staged or not, is a state, never a read.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { changedTestCodeOf } from './test-code-presence.ts'

import { describe, expect, it } from 'vitest'

import type { TestCodePath } from './test-code-presence.types.ts'

const KEPT = "it('kept', () => {})\n"
const EDITED = "it('edited', () => {})\n"
const MOVED = "it('moved', () => { expect(1).toBe(1) })\n"

/** A repository whose base commit holds `src/kept.test.ts` and `src/moved.test.ts`. */
function baseRepository(): string {
	return createScratchRepository({
		'src/kept.test.ts': KEPT,
		'src/moved.test.ts': MOVED,
	})
}

type Row = {
	name: string
	change: (root: string) => void
	expected: Record<string, TestCodePath>
}

const ROWS: Row[] = [
	{
		name: 'nothing changed → an empty map',
		change: () => undefined,
		expected: {},
	},
	{
		name: 'a file edited, unstaged → modified, with its text now',
		change: (root) => writeFiles({ root, files: { 'src/kept.test.ts': EDITED } }),
		expected: { 'src/kept.test.ts': { state: 'modified', text: EDITED } },
	},
	{
		name: 'a new file, untracked → added, with its text',
		change: (root) => writeFiles({ root, files: { 'src/new.test.ts': EDITED } }),
		expected: { 'src/new.test.ts': { state: 'added', text: EDITED } },
	},
	{
		name: 'a committed file deleted with rm, not staged → deleted, held by the base',
		change: (root) => rmSync(join(root, 'src/kept.test.ts')),
		expected: { 'src/kept.test.ts': { state: 'deleted', atBase: true } },
	},
	{
		name: 'a file moved with git mv → renamed from its old path, with its text',
		change: (root) => git({ root, args: ['mv', 'src/moved.test.ts', 'src/other.test.ts'] }),
		expected: {
			'src/other.test.ts': {
				state: 'renamed',
				from: 'src/moved.test.ts',
				text: MOVED,
			},
		},
	},
	{
		name: 'a file moved with plain mv, not staged → the old path deleted, the new one added',
		change: (root) => {
			writeFiles({ root, files: { 'src/other.test.ts': MOVED } })
			rmSync(join(root, 'src/moved.test.ts'))
		},
		expected: {
			'src/moved.test.ts': { state: 'deleted', atBase: true },
			'src/other.test.ts': { state: 'added', text: MOVED },
		},
	},
	{
		name: 'a new file staged then deleted from disk → deleted, not held by the base',
		change: (root) => {
			writeFiles({ root, files: { 'src/staged.test.ts': EDITED } })
			git({ root, args: ['add', 'src/staged.test.ts'] })
			rmSync(join(root, 'src/staged.test.ts'))
		},
		expected: { 'src/staged.test.ts': { state: 'deleted', atBase: false } },
	},
]

describe('changedTestCodeOf', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const { name, change, expected } of ROWS)
		it(name, () => {
			const root = baseRepository()
			change(root)

			expect(Object.fromEntries(changedTestCodeOf({ root, base: 'HEAD' }).paths)).toEqual(expected)
		})

	it('a package in a sub-folder → its paths relative to the package, the rest of the repository left out', () => {
		const root = createScratchRepository({
			'pkg/src/a.test.ts': KEPT,
			'other/b.test.ts': KEPT,
		})
		writeFiles({
			root,
			files: { 'pkg/src/a.test.ts': EDITED, 'other/b.test.ts': EDITED },
		})

		expect(
			Object.fromEntries(changedTestCodeOf({ root: join(root, 'pkg'), base: 'HEAD' }).paths),
		).toEqual({ 'src/a.test.ts': { state: 'modified', text: EDITED } })
	})
})
