/**
 * A rehearsal clone resolves the repository's relative `file:` and `link:` dependencies as the checkout
 * does: next to the clone, inside the rehearsal folder, a link per dependency whose path leaves the
 * repository, to the folder the same path reaches from the repository (`<rehearsal folder>/core ->
 * <workspace>/core` for `file:../core`). A path that leaves the rehearsal folder too is not linked. The
 * links are removed as links: what they reach is never touched.
 */
import { existsSync, mkdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { isPresent } from '../file-system.ts'
import { readPackageJson } from '../package-json.ts'
import { isInside } from '../worktree/sibling-links.ts'
import { DEPENDENCY_SECTIONS, LOCAL_DEPENDENCY_PATTERN } from '../worktree/worktree.constants.ts'

import type { RehearsalLinks } from './handover.types.ts'

export function linkRehearsalSiblings(params: {
	repository: string
	/** The rehearsal folder: the clone and the links inside. */
	folder: string
	clone: string
}): RehearsalLinks {
	const { repository, folder, clone } = params
	const packageJson = readPackageJson(repository)
	const links: string[] = []
	const lines: string[] = []
	const linked: string[] = []
	for (const section of DEPENDENCY_SECTIONS)
		for (const spec of Object.values(packageJson[section] ?? {})) {
			const path = LOCAL_DEPENDENCY_PATTERN.exec(spec)?.[1]
			if (path === undefined || isAbsolute(path)) continue
			const link = resolve(clone, path)
			if (link === clone || isInside({ path: link, folder: clone })) continue
			if (!isInside({ path: link, folder })) {
				lines.push(`  not linked: ${path} leaves the rehearsal folder`)
				continue
			}
			const target = resolve(repository, path)
			if (isPresent(link)) continue
			if (!existsSync(target)) {
				lines.push(`  not linked: ${path} (${target} missing)`)
				continue
			}
			mkdirSync(dirname(link), { recursive: true })
			symlinkSync(target, link)
			links.push(link)
			linked.push(path)
		}
	if (linked.length) lines.unshift(`  links beside the clone: ${linked.join(', ')}`)
	return { links, lines }
}

/** The rehearsal folder removed: its links unlinked first (their targets untouched), then the folder. */
export function removeRehearsalFolder(params: { folder: string; links: readonly string[] }): void {
	unlinkRehearsalLinks(params.links)
	rmSync(params.folder, { recursive: true, force: true })
}

/** The links beside the clone unlinked, their targets untouched: what goes before the folder leaves. */
export function unlinkRehearsalLinks(links: readonly string[]): void {
	for (const link of links) if (isPresent(link)) unlinkSync(link)
}
