/**
 * `lotOfStep` (33L0 section 4 "Which lot", case 12's naming half): the lot a step's folder belongs to, checked
 * against the lot's identity: its own worktree, its throwaway, a plain checkout, a copied link, a moved worktree.
 */
import { existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { addWorktreeFolder, createWorkspaceWithLots, linkLot } from '../../../test/lot-stores.ts'
import { git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotOfStep } from './lot-of-step.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const SUBSCRIBE = '0171-repo-subscribe'
const OTHER = '0172-repo-other'

/** A lot whose own name ends the way a review throwaway's does. */
const ROUNDED = '0173-repo-feature-round-2'

/** A store holding three lots; each lot's identity names `<workspace>/.worktrees/<lot name>` as its worktree. */
function fixture() {
	const lots = createWorkspaceWithLots({ names: [SUBSCRIBE, OTHER, ROUNDED] })
	return { ...lots, workspace: lots.workspace }
}

type Fixture = ReturnType<typeof fixture>

type Row = {
	name: string
	/** Makes the folder the step runs in; the real path of the worktree holding it, when there is one. */
	cwd: (fixture: Fixture) => { cwd: string; worktree?: string }
	expected: (
		worktree: string | undefined,
	) =>
		| { lot: string; worktree: string; throwaway: boolean }
		| { foreign: string; worktree: string }
		| undefined
}

const ROWS: Row[] = [
	{
		name: "the lot's own worktree, no link → the lot, not a throwaway",
		cwd(fixture) {
			const worktree = addWorktreeFolder({ workspace: fixture.workspace, folderName: SUBSCRIBE })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: SUBSCRIBE, worktree: worktree!, throwaway: false }),
	},
	{
		name: "the lot's own worktree with its .dialecte/lot link → the lot, not a throwaway",
		cwd(fixture) {
			const worktree = addWorktreeFolder({ workspace: fixture.workspace, folderName: SUBSCRIBE })
			linkLot({ worktree, lotFolder: fixture.folders[SUBSCRIBE] })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: SUBSCRIBE, worktree: worktree!, throwaway: false }),
	},
	{
		name: "a sub-folder of the lot's worktree → the lot, the worktree root as worktree",
		cwd(fixture) {
			const worktree = addWorktreeFolder({ workspace: fixture.workspace, folderName: SUBSCRIBE })
			const deep = join(worktree, 'packages', 'deep')
			mkdirSync(deep, { recursive: true })
			return { cwd: deep, worktree }
		},
		expected: (worktree) => ({ lot: SUBSCRIBE, worktree: worktree!, throwaway: false }),
	},
	{
		name: "the lot's worktree reached through a symbolic link → the lot, the real path as worktree",
		cwd(fixture) {
			const worktree = addWorktreeFolder({ workspace: fixture.workspace, folderName: SUBSCRIBE })
			const through = join(realpathSync(temporaryFolder('through-')), 'via')
			symlinkSync(worktree, through)
			return { cwd: through, worktree }
		},
		expected: (worktree) => ({ lot: SUBSCRIBE, worktree: worktree!, throwaway: false }),
	},
	{
		name: "the lot's review throwaway <lot name>-round-<n> → the lot, a throwaway",
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: `${SUBSCRIBE}-round-1`,
			})
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: SUBSCRIBE, worktree: worktree!, throwaway: true }),
	},
	{
		name: 'a throwaway of the other lot → that lot, a throwaway',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: `${OTHER}-round-3`,
			})
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: OTHER, worktree: worktree!, throwaway: true }),
	},
	{
		name: 'a throwaway of the same index but not of the lot name (0171-repo-unrelated-round-1) → undefined',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: '0171-repo-unrelated-round-1',
			})
			return { cwd: worktree, worktree }
		},
		expected: () => undefined,
	},
	{
		name: 'a worktree named x-<lot name>-round-1 (the lot name is not its start) → undefined',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: `x-${SUBSCRIBE}-round-1`,
			})
			return { cwd: worktree, worktree }
		},
		expected: () => undefined,
	},
	{
		name: 'a worktree named <lot name>-round- (no digits) → undefined',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: `${SUBSCRIBE}-round-`,
			})
			return { cwd: worktree, worktree }
		},
		expected: () => undefined,
	},
	{
		name: "a throwaway holding its own lot's link → that lot, a throwaway",
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: `${SUBSCRIBE}-round-2`,
			})
			linkLot({ worktree, lotFolder: fixture.folders[SUBSCRIBE] })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: SUBSCRIBE, worktree: worktree!, throwaway: true }),
	},
	{
		name: "a throwaway holding another lot's link → foreign, naming the linked lot",
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: `${SUBSCRIBE}-round-2`,
			})
			linkLot({ worktree, lotFolder: fixture.folders[OTHER] })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ foreign: OTHER, worktree: worktree! }),
	},
	{
		name: 'a lot whose own name ends -round-2, its own worktree holding its link → the lot, not a throwaway',
		cwd(fixture) {
			const worktree = addWorktreeFolder({ workspace: fixture.workspace, folderName: ROUNDED })
			linkLot({ worktree, lotFolder: fixture.folders[ROUNDED] })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: ROUNDED, worktree: worktree!, throwaway: false }),
	},
	{
		name: 'a lot whose own name ends -round-2, its own worktree with no link → the lot, not a throwaway',
		cwd(fixture) {
			const worktree = addWorktreeFolder({ workspace: fixture.workspace, folderName: ROUNDED })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: ROUNDED, worktree: worktree!, throwaway: false }),
	},
	{
		name: 'the throwaway of a lot whose own name ends -round-2 (<that name>-round-1) → that lot, a throwaway',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: `${ROUNDED}-round-1`,
			})
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ lot: ROUNDED, worktree: worktree!, throwaway: true }),
	},
	{
		name: 'a worktree moved with git worktree move, no link → undefined',
		cwd(fixture) {
			const old = addWorktreeFolder({ workspace: fixture.workspace, folderName: SUBSCRIBE })
			const moved = join(fixture.workspace.workspace, '.worktrees', 'moved-bare')
			git({ root: fixture.workspace.repository, args: ['worktree', 'move', old, moved] })
			return { cwd: realpathSync(moved) }
		},
		expected: () => undefined,
	},
	{
		name: 'the main checkout of the repository → undefined',
		cwd: (fixture) => ({ cwd: fixture.workspace.repository }),
		expected: () => undefined,
	},
	{
		name: 'a worktree of no lot → undefined',
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: 'scratch-checkout',
			})
			return { cwd: worktree, worktree }
		},
		expected: () => undefined,
	},
	{
		name: 'a folder outside every repository → undefined',
		cwd: () => ({ cwd: realpathSync(temporaryFolder('outside-')) }),
		expected: () => undefined,
	},
	{
		name: "a worktree whose .dialecte/lot was copied from another lot's → foreign, naming that lot",
		cwd(fixture) {
			const worktree = addWorktreeFolder({
				workspace: fixture.workspace,
				folderName: 'copied-checkout',
			})
			linkLot({ worktree, lotFolder: fixture.folders[SUBSCRIBE] })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ foreign: SUBSCRIBE, worktree: worktree! }),
	},
	{
		name: "a worktree that holds the other lot's link while named for this lot → foreign, naming the linked lot",
		cwd(fixture) {
			const worktree = addWorktreeFolder({ workspace: fixture.workspace, folderName: SUBSCRIBE })
			linkLot({ worktree, lotFolder: fixture.folders[OTHER] })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ foreign: OTHER, worktree: worktree! }),
	},
	{
		name: "the lot's worktree moved with git worktree move (identity names the old path) → foreign",
		cwd(fixture) {
			const old = addWorktreeFolder({ workspace: fixture.workspace, folderName: SUBSCRIBE })
			const moved = join(fixture.workspace.workspace, '.worktrees', 'moved-checkout')
			git({ root: fixture.workspace.repository, args: ['worktree', 'move', old, moved] })
			const worktree = realpathSync(moved)
			linkLot({ worktree, lotFolder: fixture.folders[SUBSCRIBE] })
			return { cwd: worktree, worktree }
		},
		expected: (worktree) => ({ foreign: SUBSCRIBE, worktree: worktree! }),
	},
]

describe('lotOfStep', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of ROWS)
		it(row.name, () => {
			const made = fixture()
			const { cwd, worktree } = row.cwd(made)

			expect(lotOfStep({ cwd })).toEqual(row.expected(worktree))
		})
})

/** Whether this volume treats paths that differ in case as the same (found through this folder's own path). */
const CASE_INSENSITIVE_VOLUME = existsSync(process.cwd().toUpperCase())

/**
 * A lot whose identity names its worktree by another spelling of the path of the real worktree
 * `<workspace>/.worktrees/<lot name>` (the folder name starts with the lot's index, as `worktree add` makes it).
 */
function spelledLot(params: { spell: (realWorktree: string) => string }) {
	const workspace = createBriefWorkspace()
	const worktree = addWorktreeFolder({ workspace, folderName: SUBSCRIBE })
	writeStoreLot({
		workspace,
		name: SUBSCRIBE,
		scope: ['src/'],
		branch: 'feat/subscribe',
		repository: workspace.repository,
		worktree: params.spell(worktree),
	})
	return worktree
}

describe(
	'lotOfStep: the spelling of the worktree in the identity',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the identity names the worktree through a symbolic link → matched, the real path as worktree', () => {
			const worktree = spelledLot({
				spell(real) {
					const through = join(realpathSync(temporaryFolder('through-')), 'via')
					symlinkSync(real, through)
					return through
				},
			})

			expect(lotOfStep({ cwd: worktree })).toEqual({
				lot: SUBSCRIBE,
				worktree,
				throwaway: false,
			})
		})

		it.skipIf(!CASE_INSENSITIVE_VOLUME)(
			'the identity names the worktree with the case of its last segment changed → matched on a case-insensitive volume',
			() => {
				const worktree = spelledLot({
					spell: (real) => join(dirname(real), basename(real).toUpperCase()),
				})

				expect(lotOfStep({ cwd: worktree })).toEqual({
					lot: SUBSCRIBE,
					worktree,
					throwaway: false,
				})
			},
		)
	},
)
