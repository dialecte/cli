/** `lot status`: the worktree and link checks, the notes, the exit codes, and that it only reads. */
import { lstatSync, mkdirSync, readlinkSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { reachFrom } from '../../test/import-reach.ts'
import { snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { STATUS_USAGE } from '../../test/lot-start.constants.ts'
import { createWorkspaceWithLots, linkLot, writeStoreListFile } from '../../test/lot-stores.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { entryOf, questionTransitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LOT = '0007-repo-feature'
const UNKNOWN_ID = '9999'
const STATUS_MODULE = join(import.meta.dirname, 'lot-status.ts')
const LOT_STATE_MODULE = join(import.meta.dirname, '..', 'lib', 'store', 'lot-state.ts')
const RESOLVE_LOT_MODULE = join(import.meta.dirname, '..', 'lib', 'store', 'resolve-lot.ts')

/** A workspace holding the real lot `LOT` (its recorded worktree not made); the lot folder is the real path. */
function workspaceWithLot(): { workspace: BriefWorkspace; lotFolder: string; worktree: string } {
	const workspace = createBriefWorkspace()
	const lotFolder = realpathSync(writeStoreLot({ workspace, name: LOT, scope: ['src/'] }))
	return { workspace, lotFolder, worktree: join(workspace.workspace, '.worktrees', LOT) }
}

type ChecksRow = {
	title: string
	/** Makes the worktree and its link as the row needs them. */
	prepare: (made: { lotFolder: string; worktree: string }) => void
	expected: { worktree: string; link?: string }
}

const CHECKS_ROWS: ChecksRow[] = [
	{
		title: 'case 28: the worktree of the identity does not exist',
		prepare: function none() {},
		expected: { worktree: 'missing' },
	},
	{
		title: 'the worktree exists and holds no link',
		prepare: function worktreeOnly(made) {
			mkdirSync(made.worktree, { recursive: true })
		},
		expected: { worktree: 'present', link: 'missing' },
	},
	{
		title: 'the worktree holds the link to the lot folder',
		prepare: function linked(made) {
			mkdirSync(made.worktree, { recursive: true })
			linkLot({ worktree: made.worktree, lotFolder: made.lotFolder })
		},
		expected: { worktree: 'present', link: 'present' },
	},
	{
		title: 'case 25: the link target is gone',
		prepare: function dangling(made) {
			mkdirSync(made.worktree, { recursive: true })
			linkLot({
				worktree: made.worktree,
				lotFolder: join(temporaryFolder('dialecte-gone-'), 'lot'),
			})
		},
		expected: { worktree: 'present', link: 'dangling' },
	},
	{
		title: 'the link points to another folder',
		prepare: function wrong(made) {
			mkdirSync(made.worktree, { recursive: true })
			linkLot({ worktree: made.worktree, lotFolder: temporaryFolder('dialecte-elsewhere-') })
		},
		expected: { worktree: 'present', link: 'wrong' },
	},
]

describe('lot status, the checks', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of CHECKS_ROWS)
		it(`${row.title} -> checks ${JSON.stringify(row.expected)}, the lot still working`, () => {
			const { workspace, lotFolder, worktree } = workspaceWithLot()
			row.prepare({ lotFolder, worktree })

			expect(
				withJson(runLot({ cwd: workspace.repository, argv: ['status', LOT, '--json'] })),
			).toMatchObject({ exitCode: 0, json: { state: 'working', checks: row.expected } })
		})

	it('case 25: a dangling link is left as it is', () => {
		const { workspace, worktree } = workspaceWithLot()
		const gone = join(temporaryFolder('dialecte-gone-'), 'lot')
		mkdirSync(worktree, { recursive: true })
		const link = linkLot({ worktree, lotFolder: gone })

		expect(
			withJson(runLot({ cwd: workspace.repository, argv: ['status', LOT, '--json'] })),
		).toMatchObject({ exitCode: 0 })
		expect({ isLink: lstatSync(link).isSymbolicLink(), target: readlinkSync(link) }).toEqual({
			isLink: true,
			target: gone,
		})
	})

	it('a registry entry holding the lot’s worktree and branch but another folder -> a note naming --out <full name>, the lot stays working', () => {
		const { workspace, worktree } = workspaceWithLot()
		writeRecordFile({
			folder: workspace.registry,
			name: '2026-11-08-feat-other.json',
			text: JSON.stringify({
				...entryOf({
					state: 'pending',
					folder: join(temporaryFolder('dialecte-other-'), 'folder'),
				}),
				worktree,
				branch: `feat/${LOT}`,
			}),
		})

		expect(
			withJson(runLot({ cwd: workspace.repository, argv: ['status', LOT, '--json'] })),
		).toMatchObject({
			exitCode: 0,
			json: { state: 'working', handover: null, notes: [expect.stringContaining(`--out ${LOT}`)] },
		})
	})
})

/** The lot of the id forms: the same lot whichever way it is named. */
const ID_FORMS: Array<{ title: string; word: (lotFolder: string) => string }> = [
	{ title: 'the padded index', word: () => '0007' },
	{ title: 'the index without its padding', word: () => '7' },
	{ title: 'the full name', word: () => LOT },
	{ title: 'the lot folder', word: (lotFolder) => lotFolder },
]

describe('lot status, the exit codes', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const form of ID_FORMS)
		it(`${form.title} -> the lot, exit 0`, () => {
			const { workspace, lotFolder } = workspaceWithLot()

			expect(
				withJson(
					runLot({ cwd: workspace.repository, argv: ['status', form.word(lotFolder), '--json'] }),
				),
			).toMatchObject({ exitCode: 0, json: { lot: LOT } })
		})

	it('an unknown id -> exit 2, no lot <id>', () => {
		const { workspace } = workspaceWithLot()

		expect(runLot({ cwd: workspace.repository, argv: ['status', UNKNOWN_ID] })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(`no lot ${UNKNOWN_ID}`),
		})
	})

	it('an index two stores of the list hold, asked from outside both -> exit 2 naming both lots', () => {
		const first = createWorkspaceWithLots({ names: ['0005-repo-b'] })
		const second = createWorkspaceWithLots({ names: ['0005-repo-c'] })
		writeStoreListFile({
			stores: [first, second].map((each) => realpathSync(each.workspace.store)),
		})

		expect(
			runLot({ cwd: realpathSync(temporaryFolder('dialecte-outside-')), argv: ['status', '0005'] }),
		).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/0005-repo-b[\s\S]*0005-repo-c/),
		})
	})

	it('a folder that is no lot (the store root) -> exit 2 saying it is no lot folder', () => {
		const { workspace } = workspaceWithLot()

		expect(
			runLot({ cwd: workspace.repository, argv: ['status', realpathSync(workspace.store)] }),
		).toMatchObject({ exitCode: 2, output: expect.stringContaining('is no lot folder') })
	})

	const usageRows: Record<string, string[]> = {
		'no id': ['status'],
		'two ids': ['status', LOT, '0008'],
		'only --json': ['status', '--json'],
		'an unknown option': ['status', LOT, '--bogus'],
	}
	for (const [title, argv] of Object.entries(usageRows))
		it(`${title} -> exit 2 with the lot usage listing status <id> [--json]`, () => {
			const { workspace } = workspaceWithLot()

			expect(runLot({ cwd: workspace.repository, argv })).toMatchObject({
				exitCode: 2,
				output: expect.stringContaining(STATUS_USAGE),
			})
		})
})

describe('lot status only reads', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('case 14: lots in three states, each read as JSON and as text -> every byte of the store and of the registry is as before', () => {
		const { workspace } = workspaceWithLot()
		writeStoreLot({
			workspace,
			name: '0008-repo-asking',
			scope: ['docs/'],
			later: [questionTransitionOf({ seq: 2, number: 1 })],
		})
		writeStoreLot({ workspace, name: '0009-repo-done', scope: ['lib/'], registry: 'committed' })
		writeStoreListFile({ stores: [realpathSync(workspace.store)] })
		const stateFolder = join(workspace.storeList, '..', '..')
		function watched() {
			return {
				store: snapshotOf(workspace.store),
				registry: snapshotOf(workspace.registry),
				state: snapshotOf(stateFolder),
			}
		}
		const before = watched()

		for (const name of [LOT, '0008-repo-asking', '0009-repo-done']) {
			expect(
				withJson(runLot({ cwd: workspace.repository, argv: ['status', name, '--json'] })),
			).toMatchObject({ exitCode: 0, json: { lot: name } })
			expect(runLot({ cwd: workspace.repository, argv: ['status', name] })).toMatchObject({
				exitCode: 0,
			})
		}
		expect(watched()).toEqual(before)
	})

	it('the import graph from lot-status.ts reaches no node:child_process, and reads through the state and the resolver', () => {
		expect(reachFrom(STATUS_MODULE)).toMatchObject({
			childProcessImporters: [],
			files: expect.arrayContaining([LOT_STATE_MODULE, RESOLVE_LOT_MODULE]),
		})
	})
})
