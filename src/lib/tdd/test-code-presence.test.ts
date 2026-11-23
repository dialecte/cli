/**
 * The presence map of test code: one git read gives each changed path of the package its state since the base, and its
 * text when present; a path deleted from disk, staged or not, is a state, never a read.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { LEDGER_VERSION } from './tdd.constants.ts'
import { changedTestCodeOf, declaredPathRefusalOf } from './test-code-presence.ts'

import { describe, expect, it } from 'vitest'

import type { LotGoneEntry, LotMovedEntry, TddLedger } from './tdd.types.ts'
import type { TestCodePath } from './test-code-presence.types.ts'

const KEPT = "it('kept', () => {})\n"
const EDITED = "it('edited', () => {})\n"
const MOVED = "it('moved', () => { expect(1).toBe(1) })\n"

/** A repository whose base commit holds `src/kept.test.ts` and `src/moved.test.ts`. */
function baseRepository(): string {
	return createScratchRepository({
		'src/add.ts': KEPT,
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
		name: 'a production file edited → modified, its text left unread',
		change: (root) => writeFiles({ root, files: { 'src/add.ts': EDITED } }),
		expected: { 'src/add.ts': { state: 'modified' } },
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

describe('declaredPathRefusalOf: a rename git pairs', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	/** A ledger holding one receipt of a case of `file`. */
	function ledgerWithReceiptOf(file: string): TddLedger {
		return {
			version: LEDGER_VERSION,
			entries: [
				{
					kind: 'unchanged',
					file,
					name: 'moved',
					project: '',
					testFileHash: 'hash',
					caseHash: 'hash',
					productionHash: 'hash',
					at: '2026-11-23T12:00:00.000Z',
				},
			],
		}
	}
	const EMPTY_LEDGER: TddLedger = { version: LEDGER_VERSION, entries: [] }

	const ROWS: Array<{
		name: string
		ledger: TddLedger
		gone: LotGoneEntry[]
		moved: LotMovedEntry[]
		expected: string | undefined
	}> = [
		{
			name: 'a moved entry naming the old and the new path of a rename → no refusal',
			ledger: EMPTY_LEDGER,
			gone: [],
			moved: [{ from: 'src/moved.test.ts', to: 'src/other.test.ts', reason: 'a rename' }],
			expected: undefined,
		},
		{
			name: 'a moved entry naming an old path no rename pairs, gone, without receipts → still refused as unknown',
			ledger: EMPTY_LEDGER,
			gone: [],
			moved: [{ from: 'src/never.test.ts', to: 'src/other.test.ts', reason: 'a rename' }],
			expected:
				'moved entry src/never.test.ts: no such test file at the base, in the change or in the receipts; drop it: dialecte lot moved --remove src/never.test.ts src/other.test.ts',
		},
		...[
			{ receipts: 'without receipts', ledger: EMPTY_LEDGER },
			{ receipts: 'with receipts', ledger: ledgerWithReceiptOf('src/moved.test.ts') },
		].map(({ receipts, ledger }) => ({
			name: `a gone entry naming the old path of a rename, ${receipts} → refused, naming the new path`,
			ledger,
			gone: [{ file: 'src/moved.test.ts', reason: 'a case removed' }],
			moved: [],
			expected:
				'gone entry src/moved.test.ts: git reports it renamed to src/other.test.ts; declare a case removed in the rename as gone src/other.test.ts; drop it: dialecte lot gone --remove src/moved.test.ts',
		})),
	]

	for (const { name, ledger, gone, moved, expected } of ROWS)
		it(name, () => {
			const root = baseRepository()
			git({ root, args: ['mv', 'src/moved.test.ts', 'src/other.test.ts'] })

			expect(
				declaredPathRefusalOf({
					root,
					presence: changedTestCodeOf({ root, base: 'HEAD' }),
					ledger,
					gone,
					moved,
				}),
			).toBe(expected)
		})
})
