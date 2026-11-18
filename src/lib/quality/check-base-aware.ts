/**
 * The base-aware rules on a change, read from git: the changed paths from the presence map against the base, the
 * tree's facts from the source index, the base side of the changed paths from one batch read, each side's imports
 * resolved over its own file set; then `duplicate-read`, `shared-export-changed` and, in a contributor library,
 * `docs-not-updated` against the public API entries the change touches.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import { diffApiIndexes } from '../api/api-index-diff.ts'
import { readOwnApiIndexes } from '../api/read-api-indexes.ts'
import { parseSourceFile } from '../api/source-file-functions.ts'
import { isSourceFilePath, listSourceFiles } from '../api/source-functions.ts'
import { indexSourceFiles } from '../api/source-index.ts'
import { listRepositoryFiles, readFilesAtRevision, tryReadGit } from '../git.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { readProfile } from '../profile/profile.ts'
import { createDialecteChangeReader } from '../rules/dialecte-change.ts'
import { createImportReading } from '../rules/import-reading.ts'
import { createModuleResolver, fileSetHost } from '../tdd/module-resolver.ts'
import { changedTestCodeOf } from '../tdd/test-code-presence.ts'
import { functionSidesOf } from './change-sides.ts'
import { docsGateApplies, findDocsNotUpdated } from './docs-gate.ts'
import { findDuplicateReads } from './duplicate-reads.ts'
import { ALIAS_CONFIG_PATTERN, CONTRIBUTOR_PROFILE, DOC_PAGE_PATTERN } from './quality.constants.ts'
import { findSharedExportChanges } from './shared-exports.ts'

import ts from 'typescript'

import type { ApiJson } from '../api/api-json.types.ts'
import type { FileFacts } from '../api/source-functions.types.ts'
import type {
	ChangeFacts,
	ChangedPath,
	DocPage,
	QualityBase,
	QualityResult,
	ResolveSpecifier,
} from './quality.types.ts'

/**
 * The base-aware findings of the package at `root` against `base`, on its worktree.
 *
 * @intent compare a change with its lot base: duplicate reads, shared exports changed, docs left behind
 * @internal
 */
export function checkBaseAware(params: { root: string; base: QualityBase }): QualityResult {
	const { root, base } = params
	const presence = changedTestCodeOf({ root, base: base.commit })
	const allChanged = [...presence.paths].map(([path, state]): ChangedPath => {
		if (state.state === 'renamed') return { path, state: 'renamed', from: state.from }
		return { path, state: state.state }
	})
	const sourceChanged = allChanged.filter(
		(path) =>
			isSourceFilePath(path.path) || (path.state === 'renamed' && isSourceFilePath(path.from)),
	)
	// in an app only the Dialecte changes count: any other file reads as untouched, so no rule reports it
	const changed = appChangesOf({ root, base: base.commit, changed: sourceChanged })
	const change: ChangeFacts = {
		changed,
		tree: treeFactsOf(root),
		base: baseFactsOf({ root, base: base.commit, changed }),
	}
	const resolveTree = treeResolverOf(root)
	const resolveBase = baseResolverOf({ root, base: base.commit })
	const sides = functionSidesOf(change)
	const publicApi = diffApiIndexes({ root, base: base.commit })
	const packageJson = readPackageJson(root)
	const docsJudged =
		publicApi.kind === 'compared' &&
		docsGateApplies({ profile: readProfile(root), tool: packageJson.bin !== undefined })
	return {
		base,
		examined: changed.filter((path) => path.state !== 'deleted').map((path) => path.path),
		duplicates: findDuplicateReads({ sides, indexes: ownIndexesOf(root), resolve: resolveTree }),
		sharedExports: findSharedExportChanges({ change, resolveTree, resolveBase }),
		publicApi,
		docs:
			docsJudged && publicApi.kind === 'compared'
				? findDocsNotUpdated({
						entries: publicApi.entries,
						pages: docPagesOf({ root, touched: new Set(allChanged.map((path) => path.path)) }),
					})
				: [],
		aliasesChanged: allChanged.some(
			(path) =>
				ALIAS_CONFIG_PATTERN.test(path.path) ||
				(path.state === 'renamed' && ALIAS_CONFIG_PATTERN.test(path.from)),
		),
	}
}

/** The facts of every implementation file of the tree, through the source index (a file that does not parse has none). */
function treeFactsOf(root: string): Map<string, FileFacts> {
	const files = listSourceFiles(root)
	const parsed = indexSourceFiles({ root, files, parse: parseSourceFile })
	return new Map(
		files.flatMap((file, index) => {
			const facts = parsed[index]?.facts
			return facts === undefined ? [] : [[file, facts] as const]
		}),
	)
}

/** The facts of the base side of each changed, renamed-from or deleted source path the base holds, read in one batch. */
function baseFactsOf(params: {
	root: string
	base: string
	changed: readonly ChangedPath[]
}): Map<string, FileFacts> {
	const paths = params.changed.map(basePathOf).filter((path) => isSourceFilePath(path))
	const texts = readFilesAtRevision({ root: params.root, revision: params.base, files: paths })
	return new Map(
		[...texts].flatMap(([file, text]) => {
			const facts = parseSourceFile({ file, text }).facts
			return facts === undefined ? [] : [[file, facts] as const]
		}),
	)
}

/** The tree's resolver: the run's import reading over the disk. */
function treeResolverOf(root: string): ResolveSpecifier {
	const reading = createImportReading({ root })
	return function resolveInTree(request) {
		return reading.localFileOf(request)
	}
}

/** The base's resolver: the module resolver over the base's file set (`git ls-tree`), never the disk. */
function baseResolverOf(params: { root: string; base: string }): ResolveSpecifier {
	const listing =
		tryReadGit({
			root: params.root,
			args: ['ls-tree', '-r', '--name-only', params.base, '--', '.'],
		}) ?? ''
	const files = listing.split('\n').filter((file) => file !== '')
	const resolver = createModuleResolver({
		root: params.root,
		host: fileSetHost({ root: params.root, files }),
	})
	return function resolveAtBase(request) {
		const resolution = resolver(request)
		return resolution.kind === 'local' ? resolution.file.split('\\').join(posix.sep) : undefined
	}
}

/** The package's own api indexes; none when one cannot be read (the public API diff says why). */
function ownIndexesOf(root: string): ApiJson[] {
	try {
		return readOwnApiIndexes({ cwd: root })
	} catch {
		return []
	}
}

/** The doc pages of the tree (Markdown under `doc/`, and `README.md`), each with whether the change touched it. */
function docPagesOf(params: { root: string; touched: ReadonlySet<string> }): DocPage[] {
	// a new page git does not hold yet counts too: the change wrote it
	const pages = listRepositoryFiles({ root: params.root, folder: '.' }).filter((file) =>
		DOC_PAGE_PATTERN.test(file),
	)
	return pages.flatMap((path) => {
		const full = join(params.root, path)
		if (!existsSync(full)) return []
		return [{ path, text: readFileSync(full, 'utf8'), touched: params.touched.has(path) }]
	})
}

/**
 * The changed paths an app judges: a path whose tree text or base text (a deleted or renamed-from one) is a Dialecte
 * change, the base texts read in one batch; every path for any other package (a dialecte package, core, the cli, a
 * contributor's).
 */
function appChangesOf(params: {
	root: string
	base: string
	changed: readonly ChangedPath[]
}): ChangedPath[] {
	const { root, changed } = params
	if (!existsSync(join(root, PACKAGE_MANIFEST_FILE))) return [...changed]
	const reader = createDialecteChangeReader({ root, reading: createImportReading({ root }) })
	if (reader.kind !== 'app' || readProfile(root) === CONTRIBUTOR_PROFILE) return [...changed]
	const fromTree = new Set(
		changed
			.filter(
				(path) => path.state !== 'deleted' && reader.verdictOf({ file: path.path }).dialecteChange,
			)
			.map((path) => path.path),
	)
	const rest = changed.filter((path) => !fromTree.has(path.path))
	const baseTexts = readFilesAtRevision({
		root,
		revision: params.base,
		files: rest.map(basePathOf),
	})
	return changed.filter(function isDialecteChange(path) {
		if (fromTree.has(path.path)) return true
		const basePath = basePathOf(path)
		const text = baseTexts.get(basePath)
		if (text === undefined) return false
		const sourceFile = ts.createSourceFile(basePath, text, ts.ScriptTarget.Latest, true)
		return reader.verdictOf({ file: basePath, sourceFile }).dialecteChange
	})
}

/** Where a changed path was at the base: its old path when renamed, else its own. */
function basePathOf(path: ChangedPath): string {
	return path.state === 'renamed' ? path.from : path.path
}
