/**
 * The fix diff a round-n reviewer reads: per file, what changed between the snapshot `round-<n-1>/` and
 * the lot's worktree now. The git form of each file's diff depends on where the file is - in the
 * snapshot, in its deletions, in the worktree, at HEAD - and git's own plain diff is taken whatever the
 * repository configured. `--worktree` adds a throwaway worktree holding round n-1, to run a new guard on
 * the old code.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { copyFileOrLink, isFileOrLink } from '../copy-file-or-link.ts'
import { tabsExpanded } from '../expand-tabs.ts'
import { mainCheckoutOf, readGit } from '../git.ts'
import { textOf } from '../print/print.ts'
import { shellQuote } from '../shell-quote.ts'
import { addWorktree, checkoutOf } from '../worktree/add-worktree.ts'
import { worktreeIndexOf } from '../worktree/worktree-index.ts'
import { LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import { verbPrefix } from './review-round-verbs.ts'
import { DELTA_FILE_MARK, NO_FILE, PLAIN_DIFF_OPTIONS } from './review-rounds.constants.ts'
import { roundNames } from './snapshot-round.ts'
import { listTreeFiles } from './worktree-state.ts'

import type { PrintedText } from '../print/print.types.ts'
import type { AddedWorktree } from '../worktree/worktree.types.ts'
import type {
	DeltaSides,
	ReviewDelta,
	ReviewDeltaFile,
	ReviewThrowaway,
	WorktreeState,
} from './review-rounds.types.ts'

/** Why the delta from round `previous` cannot be read: its snapshot is missing, or HEAD moved since. */
export function previousRoundRefusal(params: {
	root: string
	folder: string
	previous: number
}): string | undefined {
	const names = roundNames(params.previous)
	const snapshot = join(params.folder, names.folder)
	if (!existsSync(snapshot) || !statSync(snapshot).isDirectory())
		return `no snapshot ${snapshot}: lot snapshot --round ${params.previous} takes it`
	if (!existsSync(join(params.folder, names.deleted)))
		return `no ${join(params.folder, names.deleted)}: lot snapshot --round ${params.previous} writes it`
	const baseFile = join(params.folder, names.base)
	if (!existsSync(baseFile)) return undefined
	const base = readFileSync(baseFile, 'utf8').trim()
	const head = readGit({ root: params.root, args: ['rev-parse', 'HEAD'] }).trim()
	return base === head
		? undefined
		: `HEAD moved since round-${params.previous} (base ${base}, HEAD ${head})`
}

/** The paths a round `previous` snapshot deleted, read from its `.deleted` file. */
export function readDeletedPaths(params: { folder: string; previous: number }): string[] {
	return readFileSync(join(params.folder, roundNames(params.previous).deleted), 'utf8')
		.split('\0')
		.filter(Boolean)
}

/**
 * Each file changed since round `previous`, sorted by path, with its form and git's diff: the files of
 * the snapshot, of its deletions and of the worktree's status now, the lot declaration left out.
 */
export function computeDelta(params: {
	root: string
	folder: string
	previous: number
	state: WorktreeState
}): ReviewDeltaFile[] {
	const { root, previous } = params
	const snapshot = join(params.folder, roundNames(previous).folder)
	const inPrevious = new Set(listTreeFiles(snapshot))
	const inDeleted = new Set(readDeletedPaths(params))
	const atHead = params.state.head.files
	const paths = [...new Set([...inPrevious, ...inDeleted, ...params.state.status.paths])]
		.filter((path) => !LOT_FILE_PATTERN.test(path))
		.sort()
	const files: ReviewDeltaFile[] = []
	for (const path of paths) {
		const sides: DeltaSides = {
			inPrevious: inPrevious.has(path),
			inDeleted: inDeleted.has(path),
			inWorktree: isFileOrLink(join(root, path)),
			atBase: atHead.has(path),
		}
		const diff = diffOf({ root, snapshot, path, sides, previous })
		if (diff?.text) files.push({ path, form: diff.form, diff: diff.text })
	}
	return files
}

/** The form of a file's fix diff and git's output for it; undefined when no form applies. */
function diffOf(params: {
	root: string
	snapshot: string
	path: string
	sides: DeltaSides
	previous: number
}): { form: string; text: string } | undefined {
	const { sides } = params
	const current = join(params.root, params.path)
	const before = join(params.snapshot, params.path)
	if (sides.inPrevious)
		return sides.inWorktree
			? {
					form: `round-${params.previous} → worktree`,
					text: diffFiles({ cwd: params.snapshot, left: before, right: current }),
				}
			: {
					form: `round-${params.previous} → deleted`,
					text: diffFiles({ cwd: params.snapshot, left: before, right: NO_FILE }),
				}
	if (sides.inDeleted)
		return sides.inWorktree
			? {
					form: 'deleted → worktree',
					text: diffFiles({ cwd: params.snapshot, left: NO_FILE, right: current }),
				}
			: undefined
	if (sides.atBase)
		return {
			form: 'base → worktree',
			text: runDiff({
				cwd: params.root,
				args: [
					'--literal-pathspecs',
					'diff',
					...PLAIN_DIFF_OPTIONS,
					'--no-renames',
					'HEAD',
					'--',
					params.path,
				],
			}),
		}
	if (sides.inWorktree)
		return {
			form: 'new → worktree',
			text: diffFiles({ cwd: params.snapshot, left: NO_FILE, right: current }),
		}
	return undefined
}

/** `git diff --no-index` of two files (or a file and the missing side). */
function diffFiles(params: { cwd: string; left: string; right: string }): string {
	return runDiff({
		cwd: params.cwd,
		args: ['diff', '--no-index', ...PLAIN_DIFF_OPTIONS, params.left, params.right],
	})
}

/** Runs a git diff and answers its output: exit 0 (same) and 1 (differences) are answers, any other exit throws. */
function runDiff(params: { cwd: string; args: string[] }): string {
	const result = spawnSync('git', ['-c', 'core.quotePath=false', ...params.args], {
		cwd: params.cwd,
		encoding: 'utf8',
		maxBuffer: 1e9,
	})
	if (result.status !== 0 && result.status !== 1)
		throw new Error(
			`git ${params.args.join(' ')}: ${(result.stderr || result.error?.message || '').trim()}`,
		)
	return result.stdout
}

/** The branch checked out in `root`; undefined on a detached HEAD. */
export function currentBranchOf(root: string): string | undefined {
	const result = spawnSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], {
		cwd: root,
		encoding: 'utf8',
	})
	return result.status === 0 ? result.stdout.trim() || undefined : undefined
}

/**
 * A throwaway worktree on branch `<branch>-round-<previous>` from the lot's branch (its tip is the base), in
 * `.worktrees/<index>-<repository>-<branch tail>-round-<previous>` (the lot's index when its worktree has one),
 * the snapshot's deletions removed with `git rm`, then the snapshot copied over it. Answers why not when
 * it cannot be made; the lot's own worktree is never written.
 */
export function addThrowaway(params: {
	root: string
	folder: string
	previous: number
	branch: string
	now: Date
	/** Told the throwaway's path once it is decided, before anything is made. */
	onPlanned?: (worktree: string) => void
}): ReviewThrowaway | string {
	const branch = `${params.branch}-round-${params.previous}`
	let added: AddedWorktree | string
	try {
		added = addWorktree({
			repository: params.root,
			branch,
			from: params.branch,
			// the lot's own index when its worktree is numbered, else the workspace's next
			index: worktreeIndexOf(params.root),
			now: params.now,
			onPlanned: params.onPlanned,
		})
	} catch (error) {
		// git worktree add may have made it before a later step failed (the node_modules copy, the baseline)
		const made = checkoutOf({ repository: params.root, branch })
		const message = (error as Error).message
		return made
			? `${message}; the throwaway worktree is half made, remove it: ${removalCommand({ main: mainCheckoutOf(params.root), path: made, branch })}`
			: message
	}
	if (typeof added === 'string') return added
	const throwaway: ReviewThrowaway = {
		path: added.worktree,
		branch,
		removal: removalCommand({ main: added.repository, path: added.worktree, branch }),
	}
	const names = roundNames(params.previous)
	const deletedFile = join(params.folder, names.deleted)
	const snapshot = join(params.folder, names.folder)
	try {
		// deletions first: a path the snapshot turned from a file into a folder then copies
		if (statSync(deletedFile).size > 0)
			readGit({
				root: added.worktree,
				args: [
					'--literal-pathspecs',
					'rm',
					'-q',
					`--pathspec-from-file=${deletedFile}`,
					'--pathspec-file-nul',
				],
			})
		for (const path of listTreeFiles(snapshot))
			if (!LOT_FILE_PATTERN.test(path))
				copyFileOrLink({ from: join(snapshot, path), to: join(added.worktree, path) })
	} catch (error) {
		return `${(error as Error).message}; the throwaway worktree is half made, remove it: ${throwaway.removal}`
	}
	return throwaway
}

/** The command removing a throwaway worktree and its branch, with its absolute `cd` into the main checkout. */
function removalCommand(params: { main: string; path: string; branch: string }): string {
	return `cd ${shellQuote(params.main)} && git worktree remove --force ${shellQuote(params.path)} && git branch -D ${shellQuote(params.branch)}`
}

/** The text `lot delta` prints. */
export function renderDelta(delta: ReviewDelta): PrintedText {
	const previous = `round-${delta.round - 1}`
	const lines = delta.files.length
		? [
				`${verbPrefix('delta')}: ${previous} → worktree ${delta.root} - ${delta.files.length} file(s) changed`,
				// the diff is git's output, split into its lines here: tabs as four spaces, each line escaped
				...delta.files.flatMap((file) => [
					`${DELTA_FILE_MARK} ${file.path} (${file.form})`,
					...file.diff.replace(/\n$/, '').split('\n').map(tabsExpanded),
				]),
			]
		: [`${verbPrefix('delta')}: nothing changed since ${previous}`]
	if (delta.throwaway)
		lines.push(
			`throwaway worktree: ${delta.throwaway.path} (branch ${delta.throwaway.branch}, ${previous} applied)`,
			`remove it: ${delta.throwaway.removal}`,
		)
	return textOf(lines)
}
