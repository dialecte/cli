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
import { ownIndexPathsIn, parseApiJsonText } from './read-api-indexes.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { QualityTree } from '../quality/quality.types.ts'
import type {
	ApiChange,
	ApiEntryChange,
	ApiIndexDiff,
	ApiSides,
	IndexSides,
} from '../risk/risk.types.ts'
import type { PackageTree } from '../rules/dialecte-change.types.ts'
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
export function diffApiIndexes(params: {
	root: string
	base: string
	/** The tree side: the worktree (the default), or a commit, every index and export source read at it. */
	tree?: QualityTree
	/** A commit's package.json and file set, read by the caller: the tree side at `tree`'s revision. */
	treePackage?: PackageTree
}): ApiIndexDiff {
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

/**
 * The files the commit `revision` holds under `folder`, relative to `root`.
 *
 * @intent list what a commit holds without checking it out
 * @internal
 */
export function listFilesAtRevision(params: {
	root: string
	revision: string
	folder: string
}): string[] {
	const listing =
		tryReadGit({
			root: params.root,
			args: ['ls-tree', '-r', '-z', '--name-only', params.revision, '--', params.folder],
		}) ?? ''
	return listing.split('\0').filter((file) => file !== '')
}

/**
 * The index files and export sources of both sides, read once: the tree side from the worktree, or from a commit
 * (its package.json and file set from `treePackage`, else read here).
 */
function readApiSides(params: {
	root: string
	base: string
	tree?: QualityTree
	treePackage?: PackageTree
}): ApiSides {
	const { root, base } = params
	const revision = params.tree?.kind === 'revision' ? params.tree.revision : undefined
	const treePackage =
		revision === undefined ? undefined : (params.treePackage ?? readPackageTree({ root, revision }))
	const packageJson =
		treePackage === undefined
			? existsSync(join(root, RISK_PACKAGE_FILE))
				? readPackageJson(root)
				: undefined
			: treePackage.packageJson
	// a root with no package.json is not a package, and a package with a bin is a tool: no runtime api either way (D26)
	if (packageJson === undefined) return { kind: 'none' }
	// a package with no exports map ships no entry point: no runtime api to change
	if (packageJson.bin !== undefined || packageJson.exports === undefined) return { kind: 'none' }
	const baseCommit = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${base}^{commit}`],
	})
	if (baseCommit === undefined) return { kind: 'unknown', why: API_DIFF_UNKNOWN.noBase }
	const treePaths =
		treePackage === undefined ? worktreeIndexPathsOf(root) : ownIndexPathsIn(treePackage.files)
	const basePaths = ownIndexPathsIn(
		listFilesAtRevision({ root, revision: base, folder: SKILLS_FOLDER }),
	)
	const paths = [...new Set([...treePaths, ...basePaths])]
	const sources = exportSourcesOf({ root, treePackage })
	const files = [...paths, ...(sources ?? [])]
	const atBase = readFilesAtRevision({ root, revision: base, files })
	const atRevision =
		revision === undefined ? undefined : readFilesAtRevision({ root, revision, files })
	function treeTextOf(path: string): string | undefined {
		return atRevision === undefined ? worktreeTextOf({ root, path }) : atRevision.get(path)
	}
	const indexes = paths.map(function sidesOf(path): IndexSides {
		const baseText = atBase.get(path)
		const treeText = treeTextOf(path)
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
			sources === undefined || sources.some((source) => atBase.get(source) !== treeTextOf(source)),
	}
}

/** A commit's package.json (undefined when it holds none, or one that does not parse) and its file set. */
function readPackageTree(params: { root: string; revision: string }): PackageTree {
	const files = listFilesAtRevision({ ...params, folder: '.' })
	const text = readFilesAtRevision({ ...params, files: [RISK_PACKAGE_FILE] }).get(RISK_PACKAGE_FILE)
	return {
		packageJson: text === undefined ? undefined : packageJsonOfText(text),
		files: new Set(files),
	}
}

/**
 * The package.json a text holds; undefined when it does not parse (never guessed empty).
 *
 * @intent read a package.json another commit holds
 * @internal
 */
export function packageJsonOfText(text: string): PackageJson | undefined {
	try {
		return JSON.parse(text) as PackageJson
	} catch {
		return undefined
	}
}

/**
 * The source files the package's `exports` map points at, on the disk or in a commit's package; undefined when the
 * map cannot be read.
 */
function exportSourcesOf(params: {
	root: string
	treePackage: PackageTree | undefined
}): string[] | undefined {
	const { root, treePackage } = params
	try {
		const entries =
			treePackage === undefined
				? readExportEntries({ root })
				: readExportEntries({
						root,
						manifest: treePackage.packageJson ?? {},
						isFile: (path) => treePackage.files.has(path),
					})
		return entries.map((entry) => entry.source)
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
