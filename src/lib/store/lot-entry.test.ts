/**
 * The landed reading's pieces: the entry rule over registry entries (files only), the git probe over scratch
 * repositories, the line that says why.
 */
import { createEntryScene, entriesOf } from '../../../test/landed-store-lot-entries.ts'
import { createProbeScene, renameBranch } from '../../../test/landed-store-lot-probe.ts'
import { LANDED_LOT } from '../../../test/landed-store-lot-workspace.constants.ts'
import { entryOf } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { committedElsewhereEntry, createLandedProbe, landedLineOf } from './lot-entry.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EntrySpec } from '../../../test/landed-store-lot-entries.types.ts'
import type { ProbeScene, ProbeShape } from '../../../test/landed-store-lot-probe.types.ts'
import type { LandedProbe } from './lot-entry.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const EARLIER = '2026-11-01T09:00:00.000Z'
const LATER = '2026-11-05T09:00:00.000Z'

type EntryRow = { title: string; specs: EntrySpec[]; expected: string | undefined }

const ENTRY_ROWS: EntryRow[] = [
	{
		title:
			'no entry at the lot folder, one committed entry elsewhere for its worktree and branch → that entry',
		specs: [{ name: 'one', state: 'committed' }],
		expected: 'one',
	},
	{
		title: 'two committed entries elsewhere, the earlier listed first → the latest written',
		specs: [
			{ name: 'early', state: 'committed', written: EARLIER },
			{ name: 'late', state: 'committed', written: LATER },
		],
		expected: 'late',
	},
	{
		title: 'two committed entries elsewhere, the later listed first → the latest written',
		specs: [
			{ name: 'late', state: 'committed', written: LATER },
			{ name: 'early', state: 'committed', written: EARLIER },
		],
		expected: 'late',
	},
	{
		title: 'one committed and one pending entry elsewhere for it → none',
		specs: [
			{ name: 'done', state: 'committed' },
			{ name: 'open', state: 'pending' },
		],
		expected: undefined,
	},
	{
		title: 'one committed and one abandoned entry elsewhere for it → none',
		specs: [
			{ name: 'done', state: 'committed' },
			{ name: 'dropped', state: 'abandoned' },
		],
		expected: undefined,
	},
	{
		title: 'a committed entry at the lot folder beside a committed one elsewhere → none',
		specs: [
			{ name: 'own', state: 'committed', at: 'lot-folder' },
			{ name: 'elsewhere', state: 'committed' },
		],
		expected: undefined,
	},
	{
		title: 'a pending entry at the lot folder beside a committed one elsewhere → none',
		specs: [
			{ name: 'own', state: 'pending', at: 'lot-folder' },
			{ name: 'elsewhere', state: 'committed' },
		],
		expected: undefined,
	},
	{
		title: 'a committed entry for the same branch in another worktree → none',
		specs: [{ name: 'moved', state: 'committed', worktree: 'other' }],
		expected: undefined,
	},
	{
		title: 'a committed entry for its worktree on another branch → none',
		specs: [{ name: 'other-branch', state: 'committed', branch: 'other' }],
		expected: undefined,
	},
	{
		title: 'a committed entry naming its worktree through a symbolic link → that entry',
		specs: [{ name: 'linked', state: 'committed', worktree: 'link' }],
		expected: 'linked',
	},
	{
		title: 'a committed entry elsewhere beside a pending entry of another worktree → that entry',
		specs: [
			{ name: 'noise', state: 'pending', worktree: 'other' },
			{ name: 'one', state: 'committed' },
		],
		expected: 'one',
	},
	{
		title:
			'a committed entry elsewhere beside an abandoned entry of the same worktree on another branch → that entry',
		specs: [
			{ name: 'noise', state: 'abandoned', branch: 'other' },
			{ name: 'one', state: 'committed' },
		],
		expected: 'one',
	},
	{ title: 'no entry at all → none', specs: [], expected: undefined },
]

describe('committedElsewhereEntry: the entry a lot reads committed from', () => {
	for (const row of ENTRY_ROWS)
		it(row.title, () => {
			const scene = createEntryScene()

			expect(
				committedElsewhereEntry({
					entries: entriesOf({ scene, specs: row.specs }),
					identity: scene.identity,
					lotFolder: scene.lotFolder,
				})?.name,
			).toBe(row.expected)
		})
})

type ProbeRow = { title: string; shape: ProbeShape; target: string | undefined }

const PROBE_ROWS: ProbeRow[] = [
	{
		title: 'a branch with a commit, fast-forwarded into main → landed on main',
		shape: 'fast-forward',
		target: 'main',
	},
	{
		title: 'a branch with a commit, merged into main by a merge commit → landed on main',
		shape: 'merge-commit',
		target: 'main',
	},
	{ title: 'a branch tip equal to the base commit → none', shape: 'no-commit', target: undefined },
	{
		title: 'a branch with a commit not on main → none',
		shape: 'unmerged',
		target: undefined,
	},
	{
		title: 'a branch reset to a commit behind its base, which is on main → none',
		shape: 'behind-base',
		target: undefined,
	},
	{ title: 'a branch that is gone → none', shape: 'branch-gone', target: undefined },
	{
		title: 'a repository with only trunk and no configured base branch → none',
		shape: 'only-trunk',
		target: undefined,
	},
	{
		title: 'a configured base branch release, the branch on release only → landed on release',
		shape: 'release-only',
		target: 'release',
	},
]

/** What the probe gives for a scene whose target is `target`: the reading, or none. */
function readingOf(params: { scene: ProbeScene; target: string | undefined }) {
	const { entry } = params.scene
	return params.target === undefined
		? undefined
		: { entry, folder: entry.folder, target: params.target }
}

/** Renames a branch of the scene's repository, then asks the probe: its first call comes after the rename. */
function callAfterRename(params: {
	scene: ProbeScene
	probe: LandedProbe
	rename: { from: string; to: string }
}) {
	renameBranch({ root: params.scene.root, ...params.rename })
	return params.probe({ identity: params.scene.identity, entry: params.scene.entry })
}

/** Asks the probe, renames a branch of the scene's repository, asks it again: both answers. */
function callAroundRename(params: {
	scene: ProbeScene
	probe: LandedProbe
	rename: { from: string; to: string }
}) {
	const first = params.probe({ identity: params.scene.identity, entry: params.scene.entry })
	return [first, callAfterRename(params)]
}

describe('createLandedProbe: the lot branch is past its base and on the target branch', () => {
	for (const row of PROBE_ROWS)
		it(
			row.title,
			() => {
				const scene = createProbeScene(row.shape)

				expect(
					createLandedProbe({ root: scene.root, packageJson: scene.packageJson })({
						identity: scene.identity,
						entry: scene.entry,
					}),
				).toEqual(readingOf({ scene, target: row.target }))
			},
			STORE_CASE_TIMEOUT,
		)

	it(
		'the target branch appears after the probe was made, before its first call → landed on it (resolved at the first call)',
		() => {
			const scene = createProbeScene('only-trunk')

			expect(
				callAfterRename({
					scene,
					probe: createLandedProbe({ root: scene.root, packageJson: scene.packageJson }),
					rename: { from: 'trunk', to: 'main' },
				}),
			).toEqual(readingOf({ scene, target: 'main' }))
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'only trunk at the first call, then trunk renamed main → the second call still answers none (resolved once)',
		() => {
			const scene = createProbeScene('only-trunk')

			expect(
				callAroundRename({
					scene,
					probe: createLandedProbe({ root: scene.root, packageJson: scene.packageJson }),
					rename: { from: 'trunk', to: 'main' },
				}),
			).toEqual([undefined, undefined])
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('landedLineOf: why the lot reads committed', () => {
	it('a lot, the folder of its hand-over and the target branch → the line naming all three', () => {
		const entry = { ...entryOf({ state: 'committed', folder: '/handovers/one' }), name: 'one' }

		expect(
			landedLineOf({
				name: LANDED_LOT,
				reading: { entry, folder: '/handovers/one', target: 'main' },
			}),
		).toBe(`lot ${LANDED_LOT} committed: hand-over committed in /handovers/one, branch on main`)
	})
})
