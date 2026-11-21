/**
 * The base-aware rules on a change, read from git: the changed paths from the presence map against the base (on a
 * commit, from one diff of the two), the tree's facts from the source index (on a commit, its texts read in one batch), the base side of the changed paths from one batch read, each side's imports
 * resolved over its own file set; then `duplicate-read`, `shared-export-changed` and, in a contributor library,
 * `docs-not-updated` against the public API entries the change touches.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import { diffApiIndexes, listFilesAtRevision, packageJsonOfText } from '../api/api-index-diff.ts'
import { ownIndexPathsIn, readOwnApiIndexes } from '../api/read-api-indexes.ts'
import { parseSourceFile } from '../api/source-file-functions.ts'
import { isSourceFilePath, listSourceFiles } from '../api/source-functions.ts'
import { indexSourceFiles } from '../api/source-index.ts'
import { listRepositoryFiles, readFilesAtRevision } from '../git.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { createDialecteChangeReader } from '../rules/dialecte-change.ts'
import { createImportReading, packagePathOf } from '../rules/import-reading.ts'
import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { createModuleResolver, fileSetHost } from '../tdd/module-resolver.ts'
import { changedTestCodeOf, readDiffChanges } from '../tdd/test-code-presence.ts'
import { functionSidesOf } from './change-sides.ts'
import { docsGateApplies, findDocsNotUpdated } from './docs-gate.ts'
import { findDuplicateReads } from './duplicate-reads.ts'
import {
	ALIAS_CONFIG_PATTERN,
	CONTRIBUTOR_PROFILE,
	DOC_PAGE_PATTERN,
	QUALITY_READ_FAILURES,
	WORKTREE,
} from './quality.constants.ts'
import { findSharedExportChanges } from './shared-exports.ts'

import ts from 'typescript'

import type { ApiJson } from '../api/api-json.types.ts'
import type { FileFacts, ParsedSourceFile } from '../api/source-functions.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { ImportReading } from '../rules/import-reading.types.ts'
import type { DiffChange } from '../tdd/tdd.types.ts'
import type {
	ChangeFacts,
	ChangedPath,
	DocPage,
	QualityBase,
	QualityResult,
	QualityTree,
	QualityTreeSide,
	ResolveSpecifier,
} from './quality.types.ts'

/**
 * The base-aware findings of the package at `root` against `base`, on `tree`: its worktree (the default), or a commit
 * (uncommitted work ignored).
 *
 * @intent compare a change with its lot base: duplicate reads, shared exports changed, docs left behind
 * @internal
 */
export function checkBaseAware(params: {
	root: string
	base: QualityBase
	tree?: QualityTree
	/** On a commit: its package.json when the caller read it already (else read with the commit's texts). */
	treePackageJson?: PackageJson
}): QualityResult {
	const judged = judgeBaseAware(params)
	if ('notJudged' in judged) throw new Error(judged.notJudged)
	return judged
}

/**
 * The base-aware findings of the package at `root` against `base` on the commit `revision`, or why they were not
 * judged: a read of the commit that failed (its diff from the base, its file list, a text it lists), never taken as
 * an empty change or text.
 *
 * @intent judge a commit's change against its base, or say why it could not be read
 * @internal
 */
export function checkBaseAwareAt(params: {
	root: string
	base: QualityBase
	revision: string
	/** The commit's package.json when the caller read it already (else read with the commit's texts). */
	treePackageJson?: PackageJson
}): QualityResult | { notJudged: string } {
	return judgeBaseAware({ ...params, tree: { kind: 'revision', revision: params.revision } })
}

/** The findings on `tree`, or why a commit could not be read. */
function judgeBaseAware(params: {
	root: string
	base: QualityBase
	tree?: QualityTree
	treePackageJson?: PackageJson
}): QualityResult | { notJudged: string } {
	const { root, base } = params
	const tree = params.tree ?? WORKTREE
	const side =
		tree.kind === 'revision'
			? revisionSideOf({
					root,
					base: base.commit,
					revision: tree.revision,
					...(params.treePackageJson !== undefined && { packageJson: params.treePackageJson }),
				})
			: worktreeSideOf({ root, base: base.commit })
	if ('notJudged' in side) return side
	const allChanged = side.changed
	const sourceChanged = allChanged.filter(
		(path) =>
			isSourceFilePath(path.path) || (path.state === 'renamed' && isSourceFilePath(path.from)),
	)
	// in an app only the Dialecte changes count: any other file reads as untouched, so no rule reports it
	const changed = appChangesOf({ root, base: base.commit, changed: sourceChanged, side })
	const change: ChangeFacts = {
		changed,
		tree: side.facts,
		base: baseFactsOf({ root, base: base.commit, changed }),
	}
	const { reading } = side
	function resolveTree(request: { from: string; specifier: string }): string | undefined {
		return reading.localFileOf(request)
	}
	const resolveBase = revisionResolverOf({ root, revision: base.commit })
	const sides = functionSidesOf(change)
	const publicApi = diffApiIndexes({
		root,
		base: base.commit,
		tree,
		...(side.package !== undefined && { treePackage: side.package }),
	})
	const docsJudged =
		publicApi.kind === 'compared' &&
		docsGateApplies({
			profile: side.packageJson?.dialecte?.profile,
			tool: side.packageJson?.bin !== undefined,
		})
	return {
		base,
		examined: changed.filter((path) => path.state !== 'deleted').map((path) => path.path),
		duplicates: findDuplicateReads({ sides, indexes: side.ownIndexes(), resolve: resolveTree }),
		sharedExports: findSharedExportChanges({ change, resolveTree, resolveBase }),
		publicApi,
		docs:
			docsJudged && publicApi.kind === 'compared'
				? findDocsNotUpdated({ entries: publicApi.entries, pages: side.docPages() })
				: [],
		aliasesChanged: allChanged.some(
			(path) =>
				ALIAS_CONFIG_PATTERN.test(path.path) ||
				(path.state === 'renamed' && ALIAS_CONFIG_PATTERN.test(path.from)),
		),
	}
}

/**
 * The worktree as the tree side: the changed paths from the presence map (uncommitted and untracked ones included),
 * the facts of every implementation file on the disk through the source index, the run's import reading, the doc
 * pages and the package.json on the disk.
 */
function worktreeSideOf(params: { root: string; base: string }): QualityTreeSide {
	const { root } = params
	const presence = changedTestCodeOf(params)
	const changed = [...presence.paths].map(([file, path]) => changedPathOf({ file, path }))
	const files = listSourceFiles(root)
	return {
		changed,
		facts: factsOf({ files, parsed: indexSourceFiles({ root, files, parse: parseSourceFile }) }),
		reading: createImportReading({ root }),
		docPages: function worktreePages() {
			return docPagesOf({ root, touched: new Set(changed.map((path) => path.path)) })
		},
		packageJson: existsSync(join(root, PACKAGE_MANIFEST_FILE)) ? readPackageJson(root) : undefined,
		ownIndexes: function worktreeIndexes() {
			return ownIndexesOf({ root })
		},
	}
}

/**
 * A commit as the tree side: the changed paths from one diff of the base against it, its file set from one listing,
 * the texts of its implementation files, doc pages and package.json (unless given) from one batch read (the facts
 * through the source index, never written), an import reading over its file set and texts. Nothing is read from the
 * disk but the aliases and the installed packages.
 */
function revisionSideOf(params: {
	root: string
	base: string
	revision: string
	packageJson?: PackageJson
}): QualityTreeSide | { notJudged: string } {
	const { root, revision } = params
	const diff = readDiffChanges(params)
	if (diff === undefined)
		return { notJudged: QUALITY_READ_FAILURES.diff.replace('{base}', () => params.base) }
	const changed = diff.map(changedPathOf)
	const files = listFilesAtRevision({ root, revision, folder: '.' })
	if (files === undefined)
		return { notJudged: QUALITY_READ_FAILURES.list.replace('{revision}', () => revision) }
	const sources = files.filter((file) => isSourceFilePath(file)).sort(TEXT_COLLATOR.compare)
	const pages = files.filter((file) => DOC_PAGE_PATTERN.test(file))
	const indexPaths = ownIndexPathsIn(files)
	const manifest = params.packageJson === undefined ? [PACKAGE_MANIFEST_FILE] : []
	const texts = readFilesAtRevision({
		root,
		revision,
		files: [...sources, ...pages, ...indexPaths, ...manifest],
	})
	// a file the commit lists whose text the batch did not return is never read as empty or absent
	const unread = [...sources, ...pages, ...indexPaths].find((path) => !texts.has(path))
	if (unread !== undefined)
		return {
			notJudged: QUALITY_READ_FAILURES.text
				.replace('{path}', () => unread)
				.replace('{revision}', () => revision),
		}
	const manifestText = texts.get(PACKAGE_MANIFEST_FILE)
	const packageJson =
		params.packageJson ?? (manifestText === undefined ? undefined : packageJsonOfText(manifestText))
	const touched = new Set(changed.map((path) => path.path))
	return {
		changed,
		facts: factsOf({
			files: sources,
			parsed: indexSourceFiles({ root, files: sources, parse: parseSourceFile, texts }),
		}),
		reading: revisionReadingOf({ root, revision, files, texts }),
		docPages: function revisionPages() {
			return pages.flatMap((path) => {
				const text = texts.get(path)
				return text === undefined ? [] : [{ path, text, touched: touched.has(path) }]
			})
		},
		packageJson,
		package: { packageJson, files: new Set(files) },
		ownIndexes: function revisionIndexes() {
			return ownIndexesOf({ root, tree: { files: indexPaths, texts } })
		},
	}
}

/** A change as the diff or the presence map reads it, as the base-aware rules take it: a rename naming its old path. */
function changedPathOf(change: DiffChange): ChangedPath {
	const { file, path } = change
	if (path.state === 'renamed') return { path: file, state: 'renamed', from: path.from }
	return { path: file, state: path.state }
}

/** The facts of each file of `files` its parse answers (a file that does not parse has none), by path. */
function factsOf(params: {
	files: readonly string[]
	parsed: readonly ParsedSourceFile[]
}): Map<string, FileFacts> {
	return new Map(
		params.files.flatMap((file, index) => {
			const facts = params.parsed[index]?.facts
			return facts === undefined ? [] : [[file, facts] as const]
		}),
	)
}

/**
 * An import reading over the commit `revision`: specifiers resolved over its file set, syntax trees of its texts (a
 * file `texts` lacks read at the commit when asked), never the disk.
 */
function revisionReadingOf(params: {
	root: string
	revision: string
	files: readonly string[]
	texts: ReadonlyMap<string, string>
}): ImportReading {
	const { root, revision } = params
	const resolveAtRevision = resolverOver({ root, files: params.files })
	const sources = new Map<string, ts.SourceFile | undefined>()
	function textOf(path: string): string | undefined {
		return (
			params.texts.get(path) ?? readFilesAtRevision({ root, revision, files: [path] }).get(path)
		)
	}
	return {
		localFileOf: resolveAtRevision,
		sourceOf(file) {
			const path = packagePathOf({ root, file })
			if (!sources.has(path)) {
				const text = textOf(path)
				sources.set(path, text === undefined ? undefined : syntaxTreeOf({ file: path, text }))
			}
			return sources.get(path)
		},
		sourceOfText({ file, text }) {
			return syntaxTreeOf({ file, text })
		},
	}
}

/** The syntax tree of a file's text, with parent nodes set. */
function syntaxTreeOf(params: { file: string; text: string }): ts.SourceFile {
	return ts.createSourceFile(params.file, params.text, ts.ScriptTarget.Latest, true)
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

/** A resolver over the file set the commit `revision` holds (`git ls-tree`), never the disk. */
function revisionResolverOf(params: { root: string; revision: string }): ResolveSpecifier {
	return resolverOver({
		root: params.root,
		files: listFilesAtRevision({ ...params, folder: '.' }) ?? [],
	})
}

/** The module resolver over `files` (relative to `root`), its local answers as package paths. */
function resolverOver(params: { root: string; files: readonly string[] }): ResolveSpecifier {
	const resolver = createModuleResolver({
		root: params.root,
		host: fileSetHost({ root: params.root, files: params.files }),
	})
	return function resolveOverFiles(request) {
		const resolution = resolver(request)
		return resolution.kind === 'local' ? resolution.file.split('\\').join(posix.sep) : undefined
	}
}

/**
 * The package's own api indexes, whatever its exports map: on the disk, or among a commit's files and texts; none when
 * one cannot be read (the public API diff says why).
 */
function ownIndexesOf(params: {
	root: string
	tree?: { files: readonly string[]; texts: ReadonlyMap<string, string> }
}): ApiJson[] {
	try {
		return readOwnApiIndexes({
			cwd: params.root,
			...(params.tree !== undefined && { tree: params.tree }),
		})
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
	/** The tree side: its package.json, its package as a commit holds it, its reading over its file set. */
	side: QualityTreeSide
}): ChangedPath[] {
	const { root, changed, side } = params
	if (side.packageJson === undefined) return [...changed]
	const reader = createDialecteChangeReader({
		root,
		reading: side.reading,
		...(side.package !== undefined && { tree: side.package }),
	})
	if (reader.kind !== 'app' || side.packageJson.dialecte?.profile === CONTRIBUTOR_PROFILE)
		return [...changed]
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
		const sourceFile = syntaxTreeOf({ file: basePath, text })
		return reader.verdictOf({ file: basePath, sourceFile }).dialecteChange
	})
}

/** Where a changed path was at the base: its old path when renamed, else its own. */
function basePathOf(path: ChangedPath): string {
	return path.state === 'renamed' ? path.from : path.path
}
