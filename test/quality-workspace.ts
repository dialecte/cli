/** The base-aware rules' inputs built from whole source texts: both sides of a change, and a resolver over its files. */
import { rmSync } from 'node:fs'
import { join, posix } from 'node:path'

import { parseSourceFile } from '../src/lib/api/source-file-functions.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { addWorktreeFolder, linkLot } from './lot-stores.ts'
import { QUALITY_LOT_NAME, QUALITY_PACKAGE_JSON } from './quality-workspace.constants.ts'
import { git, writeFiles } from './scratch-repository.ts'

import type { FileFacts } from '../src/lib/api/source-functions.types.ts'
import type {
	ChangeFacts,
	ChangedPath,
	ResolveSpecifier,
} from '../src/lib/quality/quality.types.ts'

/** The facts of `text` parsed as `file`; a file that does not parse is a fixture mistake. */
function factsOf(params: { file: string; text: string }): FileFacts {
	const { facts } = parseSourceFile(params)
	if (facts === undefined) throw new Error(`fixture ${params.file} does not parse`)
	return facts
}

/**
 * The change from `base` to `tree` (path to text): added, modified and deleted paths by their texts, `renamed` (new
 * path to old) paired; the tree's facts of every file, the base's facts of every changed, renamed-from or deleted one.
 */
export function changeFactsOf(params: {
	base: Readonly<Record<string, string>>
	tree: Readonly<Record<string, string>>
	renamed?: Readonly<Record<string, string>>
}): ChangeFacts {
	const renamed = params.renamed ?? {}
	const renamedFrom = new Set(Object.values(renamed))
	const changed: ChangedPath[] = [
		...Object.keys(params.tree).flatMap(function changeOf(path): ChangedPath[] {
			const from = renamed[path]
			if (from !== undefined) return [{ path, state: 'renamed', from }]
			const before = params.base[path]
			if (before === undefined) return [{ path, state: 'added' }]
			return before === params.tree[path] ? [] : [{ path, state: 'modified' }]
		}),
		...Object.keys(params.base)
			.filter((path) => params.tree[path] === undefined && !renamedFrom.has(path))
			.map((path): ChangedPath => ({ path, state: 'deleted' })),
	]
	const baseSide = new Set(
		changed.flatMap((change) => (change.state === 'renamed' ? [change.from] : [change.path])),
	)
	return {
		changed,
		tree: new Map(
			Object.entries(params.tree).map(([file, text]) => [file, factsOf({ file, text })]),
		),
		base: new Map(
			Object.entries(params.base)
				.filter(([file]) => baseSide.has(file))
				.map(([file, text]) => [file, factsOf({ file, text })]),
		),
	}
}

/** A resolver over `files`: a relative specifier from a file, as written or with `.ts` or `/index.ts`. */
export function resolverOver(files: Iterable<string>): ResolveSpecifier {
	const known = new Set(files)
	return function resolve(request) {
		if (!request.specifier.startsWith('.')) return undefined
		const joined = posix.normalize(posix.join(posix.dirname(request.from), request.specifier))
		return [joined, `${joined}.ts`, `${joined}/index.ts`].find((candidate) => known.has(candidate))
	}
}

/**
 * A store lot of a package whose main holds `base`: the lot's worktree cut from it (its identity records that cut),
 * linked to its lot folder unless `link` is false (a clone outside any lot); each of `commits` committed in the
 * worktree in order; then `uncommitted` written, and `deleted` removed and left unstaged. `baseBranch: 'absent'`
 * renames main away (no base branch found).
 */
export function createQualityLot(params: {
	base: Readonly<Record<string, string>>
	commits?: readonly Readonly<Record<string, string>>[]
	/** Files removed in one more commit, after `commits`. */
	committedDeletions?: readonly string[]
	uncommitted?: Readonly<Record<string, string>>
	deleted?: readonly string[]
	link?: boolean
	baseBranch?: 'present' | 'absent'
}): { root: string; cut: string; shortCut: string } {
	const workspace = createBriefWorkspace()
	const { repository } = workspace
	writeFiles({ root: repository, files: { 'package.json': QUALITY_PACKAGE_JSON, ...params.base } })
	git({ root: repository, args: ['add', '-A'] })
	git({ root: repository, args: ['commit', '-q', '-m', 'chore: package'] })
	const cut = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
	const shortCut = git({ root: repository, args: ['rev-parse', '--short', 'HEAD'] }).trim()
	const root = addWorktreeFolder({ workspace, folderName: QUALITY_LOT_NAME })
	for (const [index, files] of (params.commits ?? []).entries()) {
		writeFiles({ root, files })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', `feat: change ${index + 1}`] })
	}
	if (params.committedDeletions?.length) {
		git({ root, args: ['rm', '-q', '--', ...params.committedDeletions] })
		git({ root, args: ['commit', '-q', '-m', 'chore: deletions'] })
	}
	writeFiles({ root, files: params.uncommitted ?? {} })
	for (const file of params.deleted ?? []) rmSync(join(root, file))
	if (params.link !== false) {
		const lotFolder = writeStoreLot({
			workspace,
			name: QUALITY_LOT_NAME,
			scope: ['src/'],
			worktree: root,
			repository,
			base: { ref: 'main', commit: cut },
		})
		linkLot({ worktree: root, lotFolder })
	}
	if (params.baseBranch === 'absent')
		git({ root: repository, args: ['branch', '-m', 'main', 'trunk'] })
	return { root, cut, shortCut }
}
