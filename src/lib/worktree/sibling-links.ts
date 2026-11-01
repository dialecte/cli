/**
 * The links a new worktree needs to reach its sibling checkouts: a `file:` or `link:` dependency whose
 * relative path leaves the worktree into the workspace's `.worktrees/` gets a link there to the folder the
 * same path reaches from the main checkout (`.worktrees/core -> ../core`). Never replaces what is there.
 */
import { existsSync, lstatSync, readlinkSync, realpathSync, symlinkSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { isPresent } from '../file-system.ts'
import { readPackageJson } from '../package-json.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { DEPENDENCY_SECTIONS, LOCAL_DEPENDENCY_PATTERN } from './worktree.constants.ts'

import type { SiblingLink } from './worktree.types.ts'

export function linkSiblings(params: {
	/** The new worktree, under the workspace's `.worktrees/`. */
	worktree: string
	/** The repository's main checkout. */
	repository: string
	/** Called right before a link is made (the tests make one there, as another process would). */
	beforeLink?: (link: string) => void
}): SiblingLink[] {
	const { worktree, repository } = params
	const worktreesFolder = join(dirname(repository), WORKTREES_FOLDER)
	const packageJson = readPackageJson(worktree)
	const links: SiblingLink[] = []
	for (const section of DEPENDENCY_SECTIONS)
		for (const [dependency, spec] of Object.entries(packageJson[section] ?? {})) {
			const path = LOCAL_DEPENDENCY_PATTERN.exec(spec)?.[1]
			if (path === undefined || isAbsolute(path)) continue
			const link = resolve(worktree, path)
			const target = resolve(repository, path)
			if (link === worktree || isInside({ path: link, folder: worktree })) continue
			if (!isInside({ path: link, folder: worktreesFolder })) {
				links.push({ dependency, link, target, outcome: 'skipped: outside .worktrees/' })
				continue
			}
			links.push({
				dependency,
				link,
				target,
				outcome: linkOutcome({
					link,
					target,
					worktreesFolder,
					beforeLink: params.beforeLink,
				}),
			})
		}
	return links
}

/** Makes the link when nothing is there; else says what is there. */
function linkOutcome(params: {
	link: string
	target: string
	worktreesFolder: string
	beforeLink?: (link: string) => void
}): string {
	const { link, target } = params
	if (isPresent(link)) return describeExisting({ link, target })
	if (!existsSync(target)) return `skipped: ${target} missing`
	// a path into a sibling (`file:../core/sub/pkg`) needs the sibling's own link first: never made here
	const missingParent = topMissingFolder({ path: dirname(link), above: params.worktreesFolder })
	if (missingParent) return `skipped: ${missingParent} missing`
	params.beforeLink?.(link)
	try {
		symlinkSync(relative(dirname(link), target), link)
		return 'created'
	} catch (error) {
		// made by another process meanwhile: read it as it is now
		const code = (error as NodeJS.ErrnoException).code
		if (code === 'EEXIST') return describeExisting({ link, target })
		return `skipped: cannot make the link (${code ?? (error as Error).message})`
	}
}

/** The highest missing folder from `path` up to (not including) `above`; undefined when `path` exists. */
function topMissingFolder(params: { path: string; above: string }): string | undefined {
	let missing: string | undefined
	for (
		let folder = params.path;
		folder !== params.above && folder !== dirname(folder) && !isPresent(folder);
		folder = dirname(folder)
	)
		missing = folder
	return missing
}

/** `present` for a link reaching the target, else `kept: <why>`: what is there stays. */
function describeExisting(params: { link: string; target: string }): string {
	const { link, target } = params
	const status = lstatSync(link)
	if (!status.isSymbolicLink()) return `kept: a real ${status.isDirectory() ? 'folder' : 'file'}`
	if (existsSync(target) && existsSync(link) && realpathSync(link) === realpathSync(target))
		return 'present'
	return `kept: points to ${readlinkSync(link)}, not ${target}`
}

/** Strictly under the folder. */
export function isInside(params: { path: string; folder: string }): boolean {
	const fromFolder = relative(params.folder, params.path)
	return (
		fromFolder !== '' &&
		fromFolder !== '..' &&
		!fromFolder.startsWith(`..${sep}`) &&
		!isAbsolute(fromFolder)
	)
}
