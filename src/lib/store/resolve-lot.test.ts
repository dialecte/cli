import { mkdirSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
	addWorktreeFolder,
	createWorkspaceWithLots,
	linkLot,
	writeStoreListFile,
} from '../../../test/lot-stores.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotOfWorktree, requireLot, resolveLot } from './resolve-lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotRequirement, LotResolution, ResolveMode } from './store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const SUBSCRIBE = '0171-repo-subscribe'
const SEVEN = '0007-repo-seven'
const SEVENTY = '0070-repo-seventy'
const DOTTED = '0180-scl-release-0.6'

/** What a table row compares: the lot or folder as is, a refusal as its exit code and the fragments its text lacks. */
function summarise(params: {
	resolved: LotResolution | LotRequirement
	mentions?: readonly string[]
}): unknown {
	const { resolved } = params
	if ('lot' in resolved) return { lot: resolved.lot }
	if ('folder' in resolved)
		return resolved.note === undefined
			? { folder: resolved.folder }
			: { folder: resolved.folder, note: resolved.note }
	return {
		exitCode: resolved.exitCode,
		missing: (params.mentions ?? []).filter((fragment) => !resolved.output.includes(fragment)),
	}
}

/** One workspace with four lots (and the lot's own worktree, linked), its store alone in the list. */
function singleStore() {
	const { workspace, folders } = createWorkspaceWithLots({
		names: [SUBSCRIBE, SEVEN, SEVENTY, DOTTED],
	})
	writeStoreListFile({ stores: [realpathSync(workspace.store)] })
	const worktree = addWorktreeFolder({ workspace, folderName: SUBSCRIBE })
	const link = linkLot({ worktree, lotFolder: folders[SUBSCRIBE] })
	return { workspace, folders, worktree, link, outside: realpathSync(temporaryFolder('outside-')) }
}

type Single = ReturnType<typeof singleStore>

type SingleRow = {
	name: string
	argument: (fixture: Single) => string
	cwd: (fixture: Single) => string
	setup?: (fixture: Single) => void
	expected: (fixture: Single) => unknown
}

function repositoryOf(fixture: Single): string {
	return fixture.workspace.repository
}

const SINGLE_ROWS: SingleRow[] = [
	{
		name: 'index 0171 -> the lot',
		argument: () => '0171',
		cwd: repositoryOf,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'padded 171 -> the lot of 0171',
		argument: () => '171',
		cwd: repositoryOf,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'padded 7 -> 0007, not 0070',
		argument: () => '7',
		cwd: repositoryOf,
		expected: (fixture) => ({ lot: fixture.folders[SEVEN] }),
	},
	{
		name: 'full name -> the lot',
		argument: () => SUBSCRIBE,
		cwd: repositoryOf,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'dotted full name 0180-scl-release-0.6 (case 50) -> the lot, it is a word and no path',
		argument: () => DOTTED,
		cwd: repositoryOf,
		expected: (fixture) => ({ lot: fixture.folders[DOTTED] }),
	},
	{
		name: 'dotted full name, asked from outside every repository (a full name needs no store of its own) -> the lot',
		argument: () => DOTTED,
		cwd: (fixture) => fixture.outside,
		expected: (fixture) => ({ lot: fixture.folders[DOTTED] }),
	},
	{
		name: 'an index from the lot worktree (a linked worktree finds the store) -> the lot',
		argument: () => '0171',
		cwd: (fixture) => fixture.worktree,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'index from outside every repository, the list holding the store -> the lot',
		argument: () => '0171',
		cwd: (fixture) => fixture.outside,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'absolute path to the lot folder -> the lot',
		argument: (fixture) => fixture.folders[SUBSCRIBE],
		cwd: (fixture) => fixture.outside,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'relative path to the lot folder -> the lot',
		argument: (fixture) => relative(fixture.workspace.repository, fixture.folders[SUBSCRIBE]),
		cwd: repositoryOf,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: '. from inside the lot folder -> the lot',
		argument: () => '.',
		cwd: (fixture) => fixture.folders[SUBSCRIBE],
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: '.. from a folder inside the lot -> the lot',
		argument: () => '..',
		cwd: (fixture) => join(fixture.folders[SUBSCRIBE], 'transitions'),
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: '.dialecte/lot from the lot worktree -> the lot (its real path)',
		argument: () => '.dialecte/lot',
		cwd: (fixture) => fixture.worktree,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'the absolute path of the link -> the lot (its real path)',
		argument: (fixture) => fixture.link,
		cwd: (fixture) => fixture.outside,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'an id-shaped word with no lot (0999) -> the folder cwd/0999, not made',
		argument: () => '0999',
		cwd: repositoryOf,
		expected: (fixture) => ({ folder: join(fixture.workspace.repository, '0999') }),
	},
	{
		name: 'a word that is no id (handover-x) -> the folder cwd/handover-x',
		argument: () => 'handover-x',
		cwd: (fixture) => fixture.outside,
		expected: (fixture) => ({ folder: join(fixture.outside, 'handover-x') }),
	},
	{
		name: 'digits and a letter (0171x) -> a folder, not the lot of 0171',
		argument: () => '0171x',
		cwd: repositoryOf,
		expected: (fixture) => ({ folder: join(fixture.workspace.repository, '0171x') }),
	},
	{
		name: 'three digits and a dash (171-repo-subscribe) -> a folder: an id with a dash needs four digits',
		argument: () => '171-repo-subscribe',
		cwd: repositoryOf,
		expected: (fixture) => ({ folder: join(fixture.workspace.repository, '171-repo-subscribe') }),
	},
	{
		name: 'the store folder as a path -> that folder, no lot',
		argument: (fixture) => realpathSync(fixture.workspace.store),
		cwd: (fixture) => fixture.outside,
		expected: (fixture) => ({ folder: realpathSync(fixture.workspace.store) }),
	},
	{
		name: 'an existing folder named 0999, no lot of that index -> the folder, without a note',
		argument: () => '0999',
		cwd: (fixture) => fixture.outside,
		setup: (fixture) => mkdirSync(join(fixture.outside, '0999')),
		expected: (fixture) => ({ folder: join(fixture.outside, '0999') }),
	},
]

describe('resolveLot - one store', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const mode of ['read', 'write'] as const)
		for (const row of SINGLE_ROWS)
			it(`${mode}: ${row.name}`, () => {
				const fixture = singleStore()
				row.setup?.(fixture)

				expect(
					summarise({
						resolved: resolveLot({
							argument: row.argument(fixture),
							cwd: row.cwd(fixture),
							mode,
						}),
					}),
				).toEqual(row.expected(fixture))
			})

	for (const mode of ['read', 'write'] as const)
		it(`${mode}: a folder named 0171 in cwd, and a lot of index 0171 -> the folder wins, with the note naming both`, () => {
			const fixture = singleStore()
			mkdirSync(join(fixture.outside, '0171'))

			expect(resolveLot({ argument: '0171', cwd: fixture.outside, mode })).toEqual({
				folder: join(fixture.outside, '0171'),
				note: `0171 is the folder ./0171, not lot ${SUBSCRIBE}`,
			})
		})

	for (const mode of ['read', 'write'] as const)
		it(`${mode}: padded 171 and a folder 171 in cwd -> the folder wins, with the note`, () => {
			const fixture = singleStore()
			mkdirSync(join(fixture.outside, '171'))

			expect(resolveLot({ argument: '171', cwd: fixture.outside, mode })).toEqual({
				folder: join(fixture.outside, '171'),
				note: `171 is the folder ./171, not lot ${SUBSCRIBE}`,
			})
		})
})

/** Three workspaces: A (cwd of most rows), B and C; A and B both hold index 0005, A also two lots of 0009. */
function threeStores() {
	const first = createWorkspaceWithLots({
		names: ['0005-repo-a', '0006-repo-a', '0009-repo-x', '0009-repo-y', '0171-repo-a'],
	})
	const second = createWorkspaceWithLots({ names: ['0005-repo-b', '0171-repo-b-longer'] })
	const third = createWorkspaceWithLots({ names: ['0001-repo-c'] })
	writeStoreListFile({
		stores: [first, second, third].map((each) => realpathSync(each.workspace.store)),
	})
	return { first, second, third, outside: realpathSync(temporaryFolder('outside-')) }
}

type Three = ReturnType<typeof threeStores>

type CrossRow = {
	name: string
	mode: ResolveMode
	cwd: (fixture: Three) => string
	argument: string
	expected: (fixture: Three) => unknown
	mentions?: (fixture: Three) => string[]
}

function bothFivesOf(fixture: Three): string[] {
	return [
		'0005-repo-a',
		'0005-repo-b',
		fixture.first.folders['0005-repo-a'],
		fixture.second.folders['0005-repo-b'],
	]
}

const CROSS_ROWS: CrossRow[] = [
	{
		name: 'read, an index held by two stores, asked from inside A (case 16) -> A is the cwd store, it decides',
		mode: 'read',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0005',
		expected: (fixture) => ({ lot: fixture.first.folders['0005-repo-a'] }),
	},
	{
		name: 'read, the same index asked from inside B -> B decides',
		mode: 'read',
		cwd: (fixture) => fixture.second.workspace.repository,
		argument: '0005',
		expected: (fixture) => ({ lot: fixture.second.folders['0005-repo-b'] }),
	},
	{
		name: 'read, the same index from a lot worktree of A -> A decides',
		mode: 'read',
		cwd: (fixture) => addWorktreeFolder({ workspace: fixture.first.workspace, folderName: 'x-wt' }),
		argument: '5',
		expected: (fixture) => ({ lot: fixture.first.folders['0005-repo-a'] }),
	},
	{
		name: 'read, the same index from outside every repository (case 16) -> exit 2 listing both full names and folders',
		mode: 'read',
		cwd: (fixture) => fixture.outside,
		argument: '0005',
		expected: () => ({ exitCode: 2, missing: [] }),
		mentions: bothFivesOf,
	},
	{
		name: 'read, the same index from C, whose store has none -> exit 2 listing both',
		mode: 'read',
		cwd: (fixture) => fixture.third.workspace.repository,
		argument: '0005',
		expected: () => ({ exitCode: 2, missing: [] }),
		mentions: bothFivesOf,
	},
	{
		name: 'read, an index held by the list stores only once, asked from outside -> that lot',
		mode: 'read',
		cwd: (fixture) => fixture.outside,
		argument: '0006',
		expected: (fixture) => ({ lot: fixture.first.folders['0006-repo-a'] }),
	},
	{
		name: 'read, an index held by another store only, asked from inside A -> that lot',
		mode: 'read',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0001',
		expected: (fixture) => ({ lot: fixture.third.folders['0001-repo-c'] }),
	},
	{
		name: 'read, two lots of one index in the cwd store -> exit 2 listing both',
		mode: 'read',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0009',
		expected: () => ({ exitCode: 2, missing: [] }),
		mentions: (fixture) => [
			'0009-repo-x',
			'0009-repo-y',
			fixture.first.folders['0009-repo-x'],
			fixture.first.folders['0009-repo-y'],
		],
	},
	{
		name: 'read, a full name held by another store, asked from inside A -> that lot',
		mode: 'read',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0005-repo-b',
		expected: (fixture) => ({ lot: fixture.second.folders['0005-repo-b'] }),
	},
	{
		name: 'write, an index held by two stores, asked from inside A (case 51) -> exit 2 listing both full names and folders',
		mode: 'write',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0005',
		expected: () => ({ exitCode: 2, missing: [] }),
		mentions: bothFivesOf,
	},
	{
		name: 'write, the same index asked from C, whose store has none (case 60) -> exit 2 listing both',
		mode: 'write',
		cwd: (fixture) => fixture.third.workspace.repository,
		argument: '5',
		expected: () => ({ exitCode: 2, missing: [] }),
		mentions: bothFivesOf,
	},
	{
		name: 'write, the same index asked from outside every repository -> exit 2 listing both',
		mode: 'write',
		cwd: (fixture) => fixture.outside,
		argument: '0005',
		expected: () => ({ exitCode: 2, missing: [] }),
		mentions: bothFivesOf,
	},
	{
		name: 'write, an index held by the cwd store only (its store is in the list too: counted once) -> the lot',
		mode: 'write',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0006',
		expected: (fixture) => ({ lot: fixture.first.folders['0006-repo-a'] }),
	},
	{
		name: 'write, an index held by another store only -> the lot',
		mode: 'write',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0001',
		expected: (fixture) => ({ lot: fixture.third.folders['0001-repo-c'] }),
	},
	{
		name: 'write, two lots of one index in the cwd store -> exit 2 listing both',
		mode: 'write',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0009',
		expected: () => ({ exitCode: 2, missing: [] }),
		mentions: (fixture) => [
			'0009-repo-x',
			'0009-repo-y',
			fixture.first.folders['0009-repo-x'],
			fixture.first.folders['0009-repo-y'],
		],
	},
	{
		name: 'write, a full name is never ambiguous, even with the index held by two stores -> the lot',
		mode: 'write',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0005-repo-b',
		expected: (fixture) => ({ lot: fixture.second.folders['0005-repo-b'] }),
	},
	{
		name: 'write, an unknown index -> a folder, as today',
		mode: 'write',
		cwd: (fixture) => fixture.first.workspace.repository,
		argument: '0999',
		expected: (fixture) => ({ folder: join(fixture.first.workspace.repository, '0999') }),
	},
]

describe('resolveLot - the cwd store is not in the list', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const mode of ['read', 'write'] as const)
		for (const listed of ['no list file', 'a list naming only another store'] as const)
			for (const argument of ['171', SUBSCRIBE])
				it(`${mode}: ${listed}, ${argument} asked from inside the repository -> the lot (the cwd store is searched first)`, () => {
					const { workspace, folders } = createWorkspaceWithLots({ names: [SUBSCRIBE] })
					const other = createWorkspaceWithLots({ names: ['0001-repo-other'] })
					if (listed !== 'no list file')
						writeStoreListFile({ stores: [realpathSync(other.workspace.store)] })

					expect(resolveLot({ argument, cwd: workspace.repository, mode })).toEqual({
						lot: folders[SUBSCRIBE],
					})
				})
})

describe('resolveLot - several stores', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of CROSS_ROWS)
		it(row.name, () => {
			const fixture = threeStores()

			expect(
				summarise({
					resolved: resolveLot({ argument: row.argument, cwd: row.cwd(fixture), mode: row.mode }),
					mentions: row.mentions?.(fixture),
				}),
			).toEqual(row.expected(fixture))
		})

	it('write, a path to the lot of a store whose index another store holds too -> the lot, a path is never ambiguous', () => {
		const fixture = threeStores()

		expect(
			resolveLot({
				argument: fixture.second.folders['0005-repo-b'],
				cwd: fixture.outside,
				mode: 'write',
			}),
		).toEqual({ lot: fixture.second.folders['0005-repo-b'] })
	})
})

type RequireRow = {
	name: string
	argument: (fixture: Single) => string
	cwd: (fixture: Single) => string
	setup?: (fixture: Single) => void
	expected: (fixture: Single) => unknown
}

const REFUSED_NAMING = { exitCode: 2, missing: [] }

const REQUIRE_ROWS: RequireRow[] = [
	{
		name: 'a known index -> the lot',
		argument: () => '171',
		cwd: repositoryOf,
		expected: (fixture) => ({ lot: fixture.folders[SUBSCRIBE] }),
	},
	{
		name: 'an unknown index -> exit 2, no lot of that index',
		argument: () => '0999',
		cwd: repositoryOf,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'an unknown full name -> exit 2, no lot',
		argument: () => '0999-repo-nothing',
		cwd: repositoryOf,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'a word that is no id -> exit 2',
		argument: () => 'handover-x',
		cwd: repositoryOf,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'the store root as a path (case 17) -> exit 2',
		argument: (fixture) => realpathSync(fixture.workspace.store),
		cwd: (fixture) => fixture.outside,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'round-1/ inside a lot (case 17) -> exit 2',
		argument: (fixture) => join(fixture.folders[SUBSCRIBE], 'round-1'),
		cwd: (fixture) => fixture.outside,
		setup: (fixture) => mkdirSync(join(fixture.folders[SUBSCRIBE], 'round-1')),
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'the transitions folder of a lot -> exit 2',
		argument: (fixture) => join(fixture.folders[SUBSCRIBE], 'transitions'),
		cwd: (fixture) => fixture.outside,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'the .git folder (case 17) -> exit 2',
		argument: (fixture) => join(fixture.workspace.repository, '.git'),
		cwd: (fixture) => fixture.outside,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'a folder inside .git (case 17) -> exit 2',
		argument: (fixture) => join(fixture.workspace.repository, '.git', 'objects'),
		cwd: (fixture) => fixture.outside,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'a plain folder -> exit 2',
		argument: (fixture) => fixture.outside,
		cwd: (fixture) => fixture.outside,
		expected: () => REFUSED_NAMING,
	},
	{
		name: 'a word naming a folder of cwd that looks like a lot id -> the folder wins, so exit 2',
		argument: () => '0171',
		cwd: (fixture) => fixture.outside,
		setup: (fixture) => mkdirSync(join(fixture.outside, '0171')),
		expected: () => REFUSED_NAMING,
	},
]

describe('requireLot - a verb that needs a lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REQUIRE_ROWS)
		it(row.name, () => {
			const fixture = singleStore()
			row.setup?.(fixture)
			const argument = row.argument(fixture)

			expect(
				summarise({
					resolved: requireLot({ argument, cwd: row.cwd(fixture), mode: 'read' }),
					// the refusal names the argument as given (`no lot <argument>`, the path of a folder that is no lot)
					mentions: [argument],
				}),
			).toEqual(row.expected(fixture))
		})

	it('an unknown index -> the text says `no lot <argument>`', () => {
		const fixture = singleStore()

		expect(requireLot({ argument: '0999', cwd: fixture.outside, mode: 'read' })).toEqual({
			exitCode: 2,
			output: expect.stringContaining(`no lot ${'0999'}`),
		})
	})

	it('an index held by two stores, asked from outside -> exit 2 listing both, as resolveLot does', () => {
		const fixture = threeStores()

		expect(
			summarise({
				resolved: requireLot({ argument: '5', cwd: fixture.outside, mode: 'read' }),
				mentions: bothFivesOf(fixture),
			}),
		).toEqual({ exitCode: 2, missing: [] })
	})
})

/** Lot A's lots and worktrees: the lot's own worktree (linked or not) and review throwaways. */
function worktreeFixture() {
	const first = createWorkspaceWithLots({ names: [SUBSCRIBE, '0172-repo-other'] })
	const second = createWorkspaceWithLots({ names: ['0001-repo-b'] })
	writeStoreListFile({
		stores: [first, second].map((each) => realpathSync(each.workspace.store)),
	})
	return { first, second, outside: realpathSync(temporaryFolder('outside-')) }
}

type WorktreeFixture = ReturnType<typeof worktreeFixture>

type WorktreeRow = {
	name: string
	cwd: (fixture: WorktreeFixture) => string
	expected: (fixture: WorktreeFixture) => string | undefined
}

function ownWorktreeOf(fixture: WorktreeFixture): string {
	return addWorktreeFolder({ workspace: fixture.first.workspace, folderName: SUBSCRIBE })
}

const WORKTREE_ROWS: WorktreeRow[] = [
	{
		name: 'the lot worktree, .dialecte/lot present -> the lot folder',
		cwd(fixture) {
			const worktree = ownWorktreeOf(fixture)
			linkLot({ worktree, lotFolder: fixture.first.folders[SUBSCRIBE] })
			return worktree
		},
		expected: (fixture) => fixture.first.folders[SUBSCRIBE],
	},
	{
		name: 'a subfolder of the lot worktree, link present -> the lot folder',
		cwd(fixture) {
			const worktree = ownWorktreeOf(fixture)
			linkLot({ worktree, lotFolder: fixture.first.folders[SUBSCRIBE] })
			const folder = join(worktree, 'src', 'deep')
			mkdirSync(folder, { recursive: true })
			return folder
		},
		expected: (fixture) => fixture.first.folders[SUBSCRIBE],
	},
	{
		name: 'the lot worktree, the link removed -> the lot folder, through the identities of the store',
		cwd: ownWorktreeOf,
		expected: (fixture) => fixture.first.folders[SUBSCRIBE],
	},
	{
		name: 'a subfolder of the lot worktree, no link -> the lot folder',
		cwd(fixture) {
			const folder = join(ownWorktreeOf(fixture), 'src', 'deep')
			mkdirSync(folder, { recursive: true })
			return folder
		},
		expected: (fixture) => fixture.first.folders[SUBSCRIBE],
	},
	{
		name: 'a review throwaway of the same index in the same store -> the lot folder',
		cwd: (fixture) =>
			addWorktreeFolder({ workspace: fixture.first.workspace, folderName: `${SUBSCRIBE}-round-1` }),
		expected: (fixture) => fixture.first.folders[SUBSCRIBE],
	},
	{
		name: 'a subfolder of a review throwaway -> the lot folder',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.first.workspace,
				folderName: `${SUBSCRIBE}-round-2`,
			})
			const folder = join(worktree, 'src')
			mkdirSync(folder, { recursive: true })
			return folder
		},
		expected: (fixture) => fixture.first.folders[SUBSCRIBE],
	},
	{
		name: 'a review throwaway of an index no lot of the store holds -> undefined',
		cwd: (fixture) =>
			addWorktreeFolder({
				workspace: fixture.first.workspace,
				folderName: '0555-repo-gone-round-1',
			}),
		expected: () => undefined,
	},
	{
		name: 'a review throwaway of an index held by another store only -> undefined',
		cwd: (fixture) =>
			addWorktreeFolder({
				workspace: fixture.second.workspace,
				folderName: `${SUBSCRIBE}-round-1`,
			}),
		expected: () => undefined,
	},
	{
		name: 'a worktree folder without any index whose .dialecte/lot points to the lot of index 0172 -> that lot',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.first.workspace,
				folderName: 'scratch-checkout',
			})
			linkLot({ worktree, lotFolder: fixture.first.folders['0172-repo-other'] })
			return worktree
		},
		expected: (fixture) => fixture.first.folders['0172-repo-other'],
	},
	{
		name: 'the worktree identity.worktree names for the lot of index 0172, no link -> that lot, not the first lot of the store',
		cwd: (fixture) =>
			addWorktreeFolder({ workspace: fixture.first.workspace, folderName: '0172-repo-other' }),
		expected: (fixture) => fixture.first.folders['0172-repo-other'],
	},
	{
		name: 'a throwaway named as `lot delta --worktree` names it, <index>-<repository>-<branch tail>-round-<n> (round 3 of the lot of index 0172) -> that lot',
		cwd: (fixture) =>
			addWorktreeFolder({
				workspace: fixture.first.workspace,
				folderName: '0172-repo-other-round-3',
			}),
		expected: (fixture) => fixture.first.folders['0172-repo-other'],
	},
	{
		name: 'the main checkout of the repository -> undefined',
		cwd: (fixture) => fixture.first.workspace.repository,
		expected: () => undefined,
	},
	{
		name: 'a linked worktree of no lot and no throwaway name -> undefined',
		cwd: (fixture) =>
			addWorktreeFolder({ workspace: fixture.first.workspace, folderName: 'scratch-checkout' }),
		expected: () => undefined,
	},
	{
		name: 'a folder outside every repository -> undefined',
		cwd: (fixture) => fixture.outside,
		expected: () => undefined,
	},
]

describe('lotOfWorktree', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of WORKTREE_ROWS)
		it(row.name, () => {
			const fixture = worktreeFixture()
			const cwd = row.cwd(fixture)

			expect(lotOfWorktree({ cwd })).toBe(row.expected(fixture))
		})
})
