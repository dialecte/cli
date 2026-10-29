/**
 * The git state agents must leave alone, checked after the fact whatever wrote it: the index stays empty
 * (nothing staged), no stash entry is pushed on this worktree's branch (one stash is shared by every
 * worktree and session: entries of other branches are only noted), and every new file is one the change
 * declares. A worktree made without `dialecte worktree add` has no baseline: the stash is then not compared.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitFolderOf, listStagedFiles, readGit } from '../git.ts'
import { lotPathCovers } from '../handover/read-lots-file.ts'
import { shellQuote } from '../shell-quote.ts'
import { HYGIENE_BASELINE_FILE, STASH_SUBJECT_PATTERN } from './worktree.constants.ts'

import type { HygieneBaseline, HygieneReport, StashEntry } from './worktree.types.ts'

export function writeHygieneBaseline(params: { root: string; now: Date }): HygieneBaseline {
	const { root } = params
	const baseline: HygieneBaseline = {
		stashCommits: readStashEntries(root).map((entry) => entry.commit),
		head: readGit({ root, args: ['rev-parse', 'HEAD'] }).trim(),
		writtenAt: params.now.toISOString(),
	}
	writeFileSync(hygieneBaselinePath(root), `${JSON.stringify(baseline, null, '\t')}\n`)
	return baseline
}

export function checkHygiene(params: {
	root: string
	/** Files, or folders ending with `/`, the change creates: new files outside them are warned about. */
	declared: readonly string[]
}): HygieneReport {
	const { root } = params
	const report: HygieneReport = { failures: [], look: [], warnings: [], notes: [] }
	const quotedRoot = shellQuote(root)

	const staged = listStagedFiles(root)
	if (staged.length) {
		report.failures.push(`${staged.length} file(s) staged: ${staged.join(', ')}`)
		report.look.push(`git -C ${quotedRoot} diff --cached --stat`)
	}

	const baseline = readBaseline(root)
	if (baseline === 'missing')
		report.notes.push(
			'no hygiene baseline (worktree not made by `dialecte worktree add`): the stash is not compared',
		)
	else if (baseline === 'unreadable')
		report.notes.push('the hygiene baseline cannot be read (not JSON): the stash is not compared')
	else {
		const branch = readGit({ root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
		const known = new Set(baseline.stashCommits ?? [])
		const pushed = readStashEntries(root).filter((entry) => !known.has(entry.commit))
		const mine = pushed.filter((entry) => entry.branch === branch)
		const theirs = pushed.filter((entry) => entry.branch !== branch)
		for (const entry of mine)
			report.failures.push(
				`a stash entry on this worktree's branch ${branch} since the worktree was made (${baseline.writtenAt}): ${entry.subject}`,
			)
		if (mine.length)
			report.look.push(
				`git -C ${quotedRoot} stash list`,
				...mine.map((entry) => `git -C ${quotedRoot} stash show --stat stash@{${entry.index}}`),
			)
		if (theirs.length)
			report.notes.push(
				`${theirs.length} stash ${theirs.length === 1 ? 'entry' : 'entries'} pushed since the worktree was made on another branch (not this worktree's): ${[...new Set(theirs.map((entry) => entry.branch ?? 'unknown'))].join(', ')}`,
			)
	}

	const untracked = readGit({ root, args: ['ls-files', '--others', '--exclude-standard'] })
		.split('\n')
		.filter(Boolean)
	const undeclared = untracked.filter(
		(file) => !params.declared.some((path) => lotPathCovers({ path, file })),
	)
	if (undeclared.length)
		report.warnings.push(
			`${undeclared.length} new file(s) the change did not declare (--declare <path>): ${undeclared.join(', ')}`,
		)
	return report
}

/** The stash, newest first: each entry's commit, subject and the branch it was pushed on. */
function readStashEntries(root: string): StashEntry[] {
	return readGit({ root, args: ['stash', 'list', '--format=%H%x09%gs'] })
		.split('\n')
		.filter(Boolean)
		.map(function parse(line, index) {
			const [commit, ...rest] = line.split('\t')
			const subject = rest.join('\t')
			const branch = STASH_SUBJECT_PATTERN.exec(subject)?.[1]
			return { index, commit, subject, ...(branch && { branch }) }
		})
}

function readBaseline(root: string): HygieneBaseline | 'missing' | 'unreadable' {
	const path = hygieneBaselinePath(root)
	if (!existsSync(path)) return 'missing'
	return readHygieneBaseline(root) ?? 'unreadable'
}

/** The baseline `worktree add` wrote, or undefined when there is none or it cannot be read. */
export function readHygieneBaseline(root: string): HygieneBaseline | undefined {
	const path = hygieneBaselinePath(root)
	if (!existsSync(path)) return undefined
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as HygieneBaseline
	} catch {
		return undefined
	}
}

function hygieneBaselinePath(root: string): string {
	return join(gitFolderOf(root), HYGIENE_BASELINE_FILE)
}
