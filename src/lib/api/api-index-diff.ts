/**
 * Whether the public API of a package changed against a base, and which entries: its api indexes
 * (`skills/<skill>/references/api.json`) and export sources read from the base by git in one batch and from the
 * worktree. `none` for a root with no `package.json`, for a tool (a package with a `bin`) and for a package with no
 * `exports` map; `unknown` when the base cannot be read, or an export source changed while every index did not (no
 * index on either side included): a diff that touches no export source cannot stale an index.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { readFilesAtRevision, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { RISK_PACKAGE_FILE } from '../risk/risk.constants.ts'
import { readExportEntries } from '../skills/export-entries.ts'
import { SKILLS_FOLDER } from '../skills/skill-file.constants.ts'
import { API_DIFF_UNKNOWN, API_JSON_FILE, API_JSON_FOLDER } from './api-json.constants.ts'
import { parseApiJsonText } from './read-api-indexes.ts'

import type {
	ApiChange,
	ApiEntryChange,
	ApiIndexDiff,
	ApiSides,
	IndexSides,
} from '../risk/risk.types.ts'
import type { ApiJson, ApiMethod } from './api-json.types.ts'

/** Whether the api indexes of the package at `root` changed against `base`. */
export function compareApiIndexes(params: { root: string; base: string }): ApiChange {
	const sides = readApiSides(params)
	if (sides.kind !== 'read') return sides.kind
	if (sides.indexChanged) return 'changed'
	return sides.exportSourceChanged ? 'unknown' : 'unchanged'
}

/**
 * The public API entries the package at `root` adds, removes or re-signs against `base`, by route, sorted; a summary
 * or an example edit is no entry. Unknown also when an index of either side does not parse.
 *
 * @intent list the public exports a change touches, for its docs and its review
 * @internal
 */
export function diffApiIndexes(params: { root: string; base: string }): ApiIndexDiff {
	const sides = readApiSides(params)
	if (sides.kind !== 'read') return sides
	if (!sides.indexChanged && sides.exportSourceChanged)
		return { kind: 'unknown', why: API_DIFF_UNKNOWN.notRegenerated }
	const base = methodsOf(sides.indexes.map((index) => index.base))
	const tree = methodsOf(sides.indexes.map((index) => index.tree))
	if (base === undefined || tree === undefined)
		return { kind: 'unknown', why: API_DIFF_UNKNOWN.unreadable }
	return { kind: 'compared', indexChanged: sides.indexChanged, entries: entriesOf({ base, tree }) }
}

/** The index files and export sources of both sides, read once. */
function readApiSides(params: { root: string; base: string }): ApiSides {
	const { root, base } = params
	// a root with no package.json is not a package, and a package with a bin is a tool: no runtime api either way (D26)
	if (!existsSync(join(root, RISK_PACKAGE_FILE))) return { kind: 'none' }
	// a package with no exports map ships no entry point: no runtime api to change
	const packageJson = readPackageJson(root)
	if (packageJson.bin !== undefined || packageJson.exports === undefined) return { kind: 'none' }
	const baseCommit = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${base}^{commit}`],
	})
	if (baseCommit === undefined) return { kind: 'unknown', why: API_DIFF_UNKNOWN.noBase }
	const paths = [...new Set([...worktreeIndexPathsOf(root), ...baseIndexPathsOf({ root, base })])]
	const sources = exportSourcesOf(root)
	const atBase = readFilesAtRevision({
		root,
		revision: base,
		files: [...paths, ...(sources ?? [])],
	})
	const indexes = paths.map(function sidesOf(path): IndexSides {
		const baseText = atBase.get(path)
		const treeText = worktreeTextOf({ root, path })
		return {
			path,
			...(baseText !== undefined && { base: baseText }),
			...(treeText !== undefined && { tree: treeText }),
		}
	})
	return {
		kind: 'read',
		indexes,
		indexChanged: indexes.some((index) => index.base !== index.tree),
		// an exports map that cannot be read counts as changed
		exportSourceChanged:
			sources === undefined ||
			sources.some((source) => atBase.get(source) !== worktreeTextOf({ root, path: source })),
	}
}

/** The source files the package's `exports` map points at; undefined when the map cannot be read. */
function exportSourcesOf(root: string): string[] | undefined {
	try {
		return readExportEntries({ root }).map((entry) => entry.source)
	} catch {
		return undefined
	}
}

/** The text of `path` (relative to `root`) in the worktree; undefined when it is not there. */
function worktreeTextOf(params: { root: string; path: string }): string | undefined {
	const full = join(params.root, params.path)
	return existsSync(full) ? readFileSync(full, 'utf8') : undefined
}

/** The methods of every index text given (an absent side holds none), by route; undefined when one does not parse. */
function methodsOf(texts: readonly (string | undefined)[]): Map<string, ApiMethod> | undefined {
	const methods = new Map<string, ApiMethod>()
	for (const text of texts) {
		if (text === undefined) continue
		const read = parseApiJsonText(text)
		if (!('index' in read)) return undefined
		for (const method of (read.index as ApiJson).methods) methods.set(method.path, method)
	}
	return methods
}

/** The entries added, removed or re-signed from `base` to `tree`, sorted by route. */
function entriesOf(params: {
	base: ReadonlyMap<string, ApiMethod>
	tree: ReadonlyMap<string, ApiMethod>
}): ApiEntryChange[] {
	const { base, tree } = params
	const routes = [...new Set([...base.keys(), ...tree.keys()])].sort()
	return routes.flatMap(function changeOf(path): ApiEntryChange[] {
		const before = base.get(path)
		const after = tree.get(path)
		const change =
			before === undefined
				? 'added'
				: after === undefined
					? 'removed'
					: before.signature === after.signature
						? undefined
						: 'signature'
		if (change === undefined) return []
		const declaredAt = (after ?? before)?.declaredAt
		return [{ path, change, ...(declaredAt !== undefined && { declaredAt }) }]
	})
}

/** The api indexes of the worktree, relative to `root`. */
function worktreeIndexPathsOf(root: string): string[] {
	const skillsFolder = join(root, SKILLS_FOLDER)
	if (!existsSync(skillsFolder)) return []
	return readdirSync(skillsFolder)
		.map(function indexPathOf(skill) {
			return [SKILLS_FOLDER, skill, API_JSON_FOLDER, API_JSON_FILE].join('/')
		})
		.filter(function exists(path) {
			return existsSync(join(root, path))
		})
}

/** The api indexes the base holds, relative to `root`. */
function baseIndexPathsOf(params: { root: string; base: string }): string[] {
	const listing =
		tryReadGit({
			root: params.root,
			args: ['ls-tree', '-r', '-z', '--name-only', params.base, '--', SKILLS_FOLDER],
		}) ?? ''
	return listing.split('\0').filter(function isIndex(path) {
		const segments = path.split('/')
		return (
			segments.length === 4 &&
			segments[0] === SKILLS_FOLDER &&
			segments[2] === API_JSON_FOLDER &&
			segments[3] === API_JSON_FILE
		)
	})
}
