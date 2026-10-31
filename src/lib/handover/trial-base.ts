/**
 * The tree each merge lot of a hand-over is trial-merged on: HEAD's, then what each earlier lot leaves on
 * top - a plain lot's files as they are in the working tree (deletions removed), a merge lot's trial tree
 * with its resolutions. Each step is a commit object built in an index of its own (in a temporary folder,
 * removed after): the repository's index, working tree and refs are never touched. A step after a merge
 * has the merged tip as its second parent, so the next trial merge finds the merge base the run will.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	TRIAL_BASE_IDENTITY,
	TRIAL_BASE_MESSAGE,
	TRIAL_INDEX_FOLDER_PREFIX,
} from './handover.constants.ts'

import type { MergeResolution, TrialBase } from './handover.types.ts'

/** HEAD as the first trial base: its commit and its tree. */
export function readHeadBase(root: string): TrialBase {
	const [commit, tree] = runGit({ root, args: ['rev-parse', 'HEAD', 'HEAD^{tree}'] })
		.trim()
		.split('\n')
	return { commit, tree }
}

/** `base` with each file as it is in the working tree on top, a missing one removed: as `git add` stages it. */
export function addWorkingFiles(params: {
	root: string
	base: TrialBase
	/** Relative to `root`; existing or deleted. */
	files: readonly string[]
}): TrialBase {
	const { root, base, files } = params
	const tree = addWorkingFilesToTree({ root, tree: base.tree, files })
	return { commit: commitTree({ root, tree, parents: [base.commit] }), tree }
}

/**
 * The tree `tree` with each file as it is in the working tree on top, a missing one removed: the tree only,
 * no commit object made.
 */
export function addWorkingFilesToTree(params: {
	root: string
	tree: string
	/** Relative to `root`; existing or deleted. */
	files: readonly string[]
}): string {
	return buildTree({
		root: params.root,
		tree: params.tree,
		args: ['update-index', '--add', '--remove', '-z', '--stdin'],
		input: params.files.map((file) => `${file}\0`).join(''),
	})
}

/** What a merge lot leaves: its trial tree with each resolution's file (or its removal), the tip a parent. */
export function addMerge(params: {
	root: string
	base: TrialBase
	/** The tip merged. */
	tip: string
	/** The trial merge's tree, conflicts written with their markers. */
	tree: string
	resolutions: readonly MergeResolution[]
}): TrialBase {
	const { root, base, tip, resolutions } = params
	const entries = resolutions.map(function indexEntryOf(resolution): string {
		if ('removed' in resolution) return `0 ${'0'.repeat(40)}\t${resolution.path}\0`
		// hashed as git add would for that path (its attributes' filters)
		const blob = runGit({
			root,
			args: ['hash-object', '-w', '--path', resolution.path, '--', resolution.file],
		}).trim()
		return `${modeOf({ root, tree: params.tree, path: resolution.path })} ${blob}\t${resolution.path}\0`
	})
	const tree = buildTree({
		root,
		tree: params.tree,
		args: ['update-index', '-z', '--index-info'],
		input: entries.join(''),
	})
	return { commit: commitTree({ root, tree, parents: [base.commit, tip] }), tree }
}

/** The tree of `tree` changed by one `git update-index` call, in an index of its own. */
function buildTree(params: { root: string; tree: string; args: string[]; input: string }): string {
	const { root } = params
	const folder = mkdtempSync(join(tmpdir(), TRIAL_INDEX_FOLDER_PREFIX))
	try {
		const indexFile = join(folder, 'index')
		runGit({ root, indexFile, args: ['read-tree', params.tree] })
		if (params.input) runGit({ root, indexFile, args: params.args, input: params.input })
		return runGit({ root, indexFile, args: ['write-tree'] }).trim()
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** A commit object of `tree` on `parents`, no ref moved. */
function commitTree(params: { root: string; tree: string; parents: readonly string[] }): string {
	return runGit({
		root: params.root,
		args: [
			'commit-tree',
			params.tree,
			...params.parents.flatMap((parent) => ['-p', parent]),
			'-m',
			TRIAL_BASE_MESSAGE,
		],
	}).trim()
}

/** The mode a resolution keeps: the trial tree's when it is an executable file, else a plain file's. */
function modeOf(params: { root: string; tree: string; path: string }): string {
	const entry = runGit({
		root: params.root,
		args: ['ls-tree', '-z', params.tree, '--', params.path],
	})
	return entry.startsWith('100755 ') ? '100755' : '100644'
}

/** Runs git in `root`, with an index of its own when given; its standard output, or throws with git's message. */
function runGit(params: {
	root: string
	args: string[]
	indexFile?: string
	input?: string
}): string {
	const { name, email } = TRIAL_BASE_IDENTITY
	const result = spawnSync('git', params.args, {
		cwd: params.root,
		encoding: 'utf8',
		maxBuffer: 1e8,
		...(params.input !== undefined && { input: params.input }),
		env: {
			...process.env,
			GIT_AUTHOR_NAME: name,
			GIT_AUTHOR_EMAIL: email,
			GIT_COMMITTER_NAME: name,
			GIT_COMMITTER_EMAIL: email,
			...(params.indexFile && { GIT_INDEX_FILE: params.indexFile }),
		},
	})
	if (result.status !== 0)
		throw new Error(`git ${params.args.join(' ')}: ${(result.stderr || result.stdout).trim()}`)
	return result.stdout
}
