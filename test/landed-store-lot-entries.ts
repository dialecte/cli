/** Registry entries for the entry rule of a landed lot: plain records, real folders so a path has a real path. */
import { mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import {
	EARLY_WRITTEN,
	LANDED_BRANCH,
	LANDED_LOT,
	OTHER_BRANCH,
} from './landed-store-lot-workspace.constants.ts'
import { linkFolder } from './plan-facts.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { identityOf } from './store-records.ts'

import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { EntryScene, EntrySpec } from './landed-store-lot-entries.types.ts'

/** The lot's worktree and folder (real folders of the test), a symbolic link to the worktree, and its identity. */
export function createEntryScene(): EntryScene {
	const root = realpathSync(temporaryFolder('dialecte-landed-entries-'))
	const worktree = join(root, 'lot-worktree')
	const otherWorktree = join(root, 'other-worktree')
	const lotFolder = join(root, 'store', LANDED_LOT)
	for (const folder of [worktree, otherWorktree, lotFolder]) mkdirSync(folder, { recursive: true })
	return {
		identity: { ...identityOf({ name: LANDED_LOT }), worktree, branch: LANDED_BRANCH },
		lotFolder,
		worktree,
		link: linkFolder({ target: worktree, link: join(root, 'lot-worktree-link') }),
		otherWorktree,
	}
}

/** The entries of a row, in the order given. */
export function entriesOf(params: { scene: EntryScene; specs: EntrySpec[] }): StoreEntry[] {
	return params.specs.map((spec) => entryFor({ scene: params.scene, spec }))
}

/** The registry entry a spec describes, its worktree, branch and folder resolved against the scene. */
function entryFor(params: { scene: EntryScene; spec: EntrySpec }): StoreEntry {
	const { scene, spec } = params
	const worktree = { lot: scene.worktree, link: scene.link, other: scene.otherWorktree }[
		spec.worktree ?? 'lot'
	]
	return {
		name: spec.name,
		folder:
			spec.at === 'lot-folder'
				? scene.lotFolder
				: join(scene.lotFolder, '..', `${spec.name}-handover`),
		branch: spec.branch === 'other' ? OTHER_BRANCH : LANDED_BRANCH,
		worktree,
		written: spec.written ?? EARLY_WRITTEN,
		state: spec.state,
	}
}
