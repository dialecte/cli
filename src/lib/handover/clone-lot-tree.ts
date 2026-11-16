/**
 * The working tree of a rehearsal clone, lot by lot. The clone starts at the repository's HEAD with the whole
 * working tree on top; before it commits a lot, the files of every later lot go back to what its index holds (the
 * commit before: HEAD's content, absent when HEAD lacks the file, a later lot's deleted file present), so the commit
 * and its hook see HEAD plus the lots up to that one, and nothing more. Once the lot is committed those files come
 * back as the repository's working tree has them. Only the clone's files and index change, never the repository's.
 */
import { spawnSync } from 'node:child_process'
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readlinkSync,
	rmdirSync,
	rmSync,
	symlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { isPresent } from '../file-system.ts'
import { readGit } from '../git.ts'

import type { CloneLotTree } from './clone-lot-tree.types.ts'
import type { ResolvedLot } from './handover.types.ts'

/**
 * The callbacks `commitLots` runs around each lot it commits in the rehearsal `clone` of `repository`, and the one
 * the rehearsal runs once the commits stopped.
 */
export function cloneLotTree(params: {
	repository: string
	clone: string
	lots: readonly ResolvedLot[]
}): CloneLotTree {
	const { repository, clone, lots } = params
	return {
		prepareLot: function takeLaterLotsOut({ number }) {
			resetToIndex({ clone, paths: laterLotPaths({ lots, number }) })
		},
		afterLot: function bringLaterLotsBack({ number }) {
			copyRepositoryFiles({ repository, clone, files: laterLotPaths({ lots, number }) })
		},
		restoreLots: function bringEveryLotBack() {
			copyRepositoryFiles({ repository, clone, files: laterLotPaths({ lots, number: 0 }) })
		},
	}
}

/**
 * Each of `files` (relative to the root) in the clone as it is in the repository's working tree: copied, a link as
 * the link it is (relative, never followed, as git commits it), or removed with the folders it leaves empty.
 */
export function copyRepositoryFiles(params: {
	repository: string
	clone: string
	files: readonly string[]
}): void {
	const { repository, clone } = params
	for (const file of params.files) {
		const source = join(repository, file)
		const target = join(clone, file)
		if (!isPresent(source)) {
			rmSync(target, { force: true })
			removeEmptiedFolders({ clone, folder: dirname(target) })
		} else if (lstatSync(source).isSymbolicLink()) {
			mkdirSync(dirname(target), { recursive: true })
			rmSync(target, { force: true })
			symlinkSync(readlinkSync(source), target)
		} else {
			mkdirSync(dirname(target), { recursive: true })
			cpSync(source, target)
		}
	}
	refreshIndex(clone)
}

/** A deleted file's folder, and each parent up to the clone, removed while empty: as git leaves the tree. */
export function removeEmptiedFolders(params: { clone: string; folder: string }): void {
	for (
		let folder = params.folder;
		folder !== params.clone && folder.startsWith(params.clone) && existsSync(folder);
		folder = dirname(folder)
	) {
		if (readdirSync(folder).length) return
		rmdirSync(folder)
	}
}

/** The paths (changed and deleted) of the lots after lot `number`, numbered from 1. */
function laterLotPaths(params: { lots: readonly ResolvedLot[]; number: number }): string[] {
	return params.lots.slice(params.number).flatMap((lot) => [...lot.files, ...lot.deletedFiles])
}

/** Each of `paths` in the clone's working tree as its index holds it; a path the index lacks is removed. */
function resetToIndex(params: { clone: string; paths: readonly string[] }): void {
	const { clone, paths } = params
	if (paths.length === 0) return
	const indexed = new Set(
		readGit({ root: clone, args: ['--literal-pathspecs', 'ls-files', '-z', '--', ...paths] })
			.split('\0')
			.filter(Boolean),
	)
	if (indexed.size > 0)
		readGit({
			root: clone,
			args: ['checkout-index', '-f', '-z', '--stdin'],
			input: `${[...indexed].join('\0')}\0`,
		})
	for (const path of paths.filter((candidate) => !indexed.has(candidate))) {
		rmSync(join(clone, path), { force: true })
		removeEmptiedFolders({ clone, folder: dirname(join(clone, path)) })
	}
	refreshIndex(clone)
}

/** The index's stat data brought to the files just written: a hook's diff reads only real changes. */
function refreshIndex(clone: string): void {
	// `--refresh` exits non-zero while files differ from the index: that is expected, not a failure
	spawnSync('git', ['update-index', '-q', '--refresh'], { cwd: clone })
}
