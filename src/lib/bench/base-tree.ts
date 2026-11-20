/**
 * The base tree of the type bench: the package exported at a commit into a scratch folder (no worktree registered),
 * its `file:` siblings linked, its `node_modules` the head's when they install its lock, else installed.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { linkRehearsalSiblings, removeRehearsalFolder } from '../handover/rehearsal-links.ts'
import { tailOf } from '../progress/tail-of.ts'
import { makeScratchFolder } from '../scratch/make-scratch-folder.ts'
import { runNpm } from '../worktree/npm-runner.ts'
import { checkInstallMatchesTree } from '../worktree/tree-install.ts'
import {
	BASE_TREE_INSTALL_ARGS,
	BASE_TREE_PURPOSE,
	BASE_TREE_REFUSALS,
	SILENT_FAILURE,
} from './base-tree.constants.ts'

import type { NpmRunner } from '../worktree/worktree.types.ts'
import type { BaseTree } from './base-tree.types.ts'

/**
 * The package at `root` as `commit` holds it, exported beside its siblings' links into a new scratch folder: the links
 * made before any install, `node_modules` a link to the head's when they install the commit's lock, else `install`ed.
 * A step that fails removes what was made and is refused, named.
 */
// dialecte-allow duplicate-read: tdd's copyBaseTree links every head node_modules entry; the bench links or installs by the base's lock
export function materializeBaseTree(params: {
	root: string
	commit: string
	/** Installs the base's lock when the head's `node_modules` does not; default: `npm ci` in the base tree. */
	install?: NpmRunner
}): BaseTree | { refusal: string } {
	const { root, commit } = params
	const scratch = makeScratchFolder({ purpose: BASE_TREE_PURPOSE })
	const folder = join(scratch, basename(root))
	const exported = exportPackage({ root, commit, folder })
	if (exported !== undefined) return refused({ tree: { folder, links: [] }, refusal: exported })
	const siblings = linkRehearsalSiblings({
		repository: root,
		packageFolder: folder,
		folder: scratch,
		clone: folder,
	})
	const tree: BaseTree = { folder, links: siblings.links }
	if (siblings.missing.length)
		return refused({
			tree,
			refusal: BASE_TREE_REFUSALS.missing.replace('{paths}', () => siblings.missing.join(', ')),
		})
	if (siblings.leaving.length)
		return refused({
			tree,
			refusal: BASE_TREE_REFUSALS.leaving.replace('{paths}', () => siblings.leaving.join(', ')),
		})
	const headModules = join(root, 'node_modules')
	if (checkInstallMatchesTree({ root, tree: commit }) === undefined) {
		if (!existsSync(headModules)) return tree
		const link = join(folder, 'node_modules')
		symlinkSync(headModules, link)
		return { folder, links: [...tree.links, link] }
	}
	const install = params.install ?? runNpm
	const ran = install({ checkout: folder, args: [...BASE_TREE_INSTALL_ARGS] })
	if (ran.status === 0) return tree
	return refused({
		tree,
		refusal: BASE_TREE_REFUSALS.install.replace('{reason}', () => lastLineOf(ran)),
	})
}

/** The base tree removed: its links unlinked first (their targets untouched), then its scratch folder. */
// dialecte-allow duplicate-read: the removal of the bench's own tree, through removeRehearsalFolder
export function removeBaseTree(tree: BaseTree): void {
	removeRehearsalFolder({ folder: dirname(tree.folder), links: tree.links })
}

/**
 * `git archive` of the package's folder at `commit` unpacked into `folder`; undefined when done, else why not. Not
 * `copyBaseTree` (tdd): that one links every entry of the head's `node_modules`, where the bench links or installs
 * by the base's lock.
 */
function exportPackage(params: {
	root: string
	commit: string
	folder: string
}): string | undefined {
	const { root, commit, folder } = params
	const refusal = BASE_TREE_REFUSALS.export.replace('{commit}', () => commit)
	// `<commit>:./` read from the package's folder: the package alone, wherever it sits in its repository
	const archive = spawnSync('git', ['archive', '--format=tar', `${commit}:./`], {
		cwd: root,
		maxBuffer: 1e10,
	})
	if (archive.status !== 0)
		return refusal.replace('{reason}', () =>
			lastLineOf({ status: archive.status ?? 1, output: String(archive.stderr) }),
		)
	mkdirSync(folder, { recursive: true })
	const unpacked = spawnSync('tar', ['-x', '-C', folder], { input: archive.stdout, maxBuffer: 1e8 })
	if (unpacked.status !== 0)
		return refusal.replace('{reason}', () =>
			lastLineOf({ status: unpacked.status ?? 1, output: String(unpacked.stderr) }),
		)
	return undefined
}

/** The tree's scratch folder removed, and the refusal. */
function refused(params: { tree: BaseTree; refusal: string }): { refusal: string } {
	removeBaseTree(params.tree)
	return { refusal: params.refusal }
}

/** The last line a command printed (`tailOf`), or its exit status when it printed nothing. */
function lastLineOf(ran: { status: number; output: string }): string {
	return (
		tailOf({ output: ran.output, lines: 1 }).trim() ||
		SILENT_FAILURE.replace('{status}', () => String(ran.status))
	)
}
