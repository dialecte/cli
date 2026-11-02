import { existsSync } from 'node:fs'

import { readInstalledKey } from '../gate-records/check-key.ts'
import { readGit } from '../git.ts'
import { hashFile, hashText } from '../tdd/tdd-files.ts'
import {
	KEY_EXCLUDED_OPTION_FIELDS,
	MISSING_KEY_INPUT,
	PACKAGE_HASH_LENGTH,
} from './incremental-cache.constants.ts'

import type { StrykerOptions } from './mutation.types.ts'

/**
 * The key of the fast tier's incremental file: sha256 (hex) of the whole tree the run reads (`tree`, as
 * `computeStateTree` gives it), the package's path in the repository, the installed lock, the linked `file:`
 * dependencies, the fast tier's options (minus the per-run fields), the cli version and the ignorer plugin's
 * bytes. Stryker's incremental mode reuses a verdict whenever the killing test's name and file are unchanged and
 * never reads helpers or fixtures, so a cached file is only sound on an identical tree: reruns, other targets,
 * another worktree at the same tree, never across edits. Object keys are hashed in a stable order.
 *
 * @intent compute the cache key of a mutation run, tell whether a cached incremental file applies to this tree
 * @internal
 */
export function computeIncrementalKey(params: {
	root: string
	tree: string
	options: StrykerOptions
	cliVersion: string
	ignorerPlugin: string
}): string {
	const { root, tree, options, cliVersion, ignorerPlugin } = params
	const keyed = {
		tree,
		packagePath: packagePathOf(root),
		...readInstalledKey(root),
		options: withoutPerRunFields(options),
		cliVersion,
		ignorer: existsSync(ignorerPlugin) ? hashFile(ignorerPlugin) : MISSING_KEY_INPUT,
	}
	return hashText(JSON.stringify(withSortedKeys(keyed)))
}

/**
 * The prefix of the store's file names for the package at `root`: the first 16 hex characters of sha256 of its
 * path in the repository, the same from every worktree.
 *
 * @intent group the cached incremental files of one package
 * @internal
 */
export function packageHashOf(params: { root: string }): string {
	return hashText(packagePathOf(params.root)).slice(0, PACKAGE_HASH_LENGTH)
}

/** The package root relative to the repository top (`/` separators, no trailing slash; `''` at the top). */
function packagePathOf(root: string): string {
	return readGit({ root, args: ['rev-parse', '--show-prefix'] })
		.trim()
		.replace(/\/$/, '')
}

function withoutPerRunFields(options: StrykerOptions): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(options).filter(
			([name]) => !(KEY_EXCLUDED_OPTION_FIELDS as readonly string[]).includes(name),
		),
	)
}

/** The same value with the keys of every object in sorted order, so equal values serialise alike. */
function withSortedKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withSortedKeys)
	if (typeof value !== 'object' || value === null) return value
	return Object.fromEntries(
		Object.entries(value)
			.sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
			.map(([name, each]) => [name, withSortedKeys(each)]),
	)
}
