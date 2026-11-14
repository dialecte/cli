/**
 * The diff a risk derivation reads, from git: every file changed against a base (committed after it or not, and
 * untracked), with its added lines and their numbers, its line counts and, for a `package.json`, whether only its
 * `version` changed.
 */
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import { readGit, tryReadGit } from '../git.ts'
import { LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import {
	DIFF_NEW_PATH_PREFIX,
	DIFF_PATH_END_PATTERN,
	HUNK_HEADER_PATTERN,
	RISK_PACKAGE_FILE,
} from './risk.constants.ts'

import type { RiskAddedLine, RiskDiffFile } from './risk.types.ts'

/** The files changed against `base` (tracked and untracked) with their added lines and counts, sorted by path. */
export function readRiskDiff(params: { root: string; base: string }): RiskDiffFile[] {
	const counts = numstatOf(params)
	const addedLines = addedLinesOf(params)
	const tracked = [...counts.entries()].map(function trackedFile([path, count]): RiskDiffFile {
		return { path, added: addedLines.get(path) ?? [], ...count }
	})
	const untracked = untrackedPathsOf(params.root).map(function untrackedFile(path): RiskDiffFile {
		const added = linesOf(readFileSync(join(params.root, path), 'utf8')).map(
			function addedLine(text, index): RiskAddedLine {
				return { line: index + 1, text }
			},
		)
		return { path, added, addedCount: added.length, removedCount: 0 }
	})
	return [...tracked, ...untracked]
		.filter(function isNotLotFile(file) {
			return !LOT_FILE_PATTERN.test(file.path)
		})
		.sort(function byPath(left, right) {
			return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
		})
		.map(function withVersionOnly(file) {
			if (posix.basename(file.path) !== RISK_PACKAGE_FILE) return file
			return {
				...file,
				versionOnly: isVersionOnly({ root: params.root, base: params.base, path: file.path }),
			}
		})
}

/** Added and removed lines per tracked file against the base, deleted files included, binary files as 0. */
function numstatOf(params: {
	root: string
	base: string
}): Map<string, { addedCount: number; removedCount: number }> {
	const fields = readGit({
		root: params.root,
		args: ['diff', '--numstat', '-z', '--relative', '--no-renames', params.base],
	})
		.split('\0')
		.filter(Boolean)
	return new Map(
		fields.map(function countOf(field) {
			const [added, removed, path] = field.split('\t')
			return [path, { addedCount: Number(added) || 0, removedCount: Number(removed) || 0 }]
		}),
	)
}

/** The added lines of each tracked file against the base, with their numbers in the new file. */
function addedLinesOf(params: { root: string; base: string }): Map<string, RiskAddedLine[]> {
	const diff = readGit({
		root: params.root,
		args: ['diff', '-U0', '--relative', '--no-renames', '--no-color', params.base],
	})
	const addedLines = new Map<string, RiskAddedLine[]>()
	let path: string | undefined
	let nextLine = 0
	let remaining = 0
	for (const line of diff.split('\n')) {
		if (remaining > 0) {
			if (line.startsWith('+')) {
				addedLines.set(path ?? '', [
					...(addedLines.get(path ?? '') ?? []),
					{ line: nextLine, text: line.slice(1) },
				])
				nextLine += 1
				remaining -= 1
			}
			continue
		}
		// git ends the header of a path holding a space with a tab: the path stops before it
		if (line.startsWith(DIFF_NEW_PATH_PREFIX))
			path = line.slice(DIFF_NEW_PATH_PREFIX.length).replace(DIFF_PATH_END_PATTERN, '')
		const hunk = HUNK_HEADER_PATTERN.exec(line)
		if (hunk) {
			nextLine = Number(hunk[1])
			remaining = hunk[2] === undefined ? 1 : Number(hunk[2])
		}
	}
	return addedLines
}

function untrackedPathsOf(root: string): string[] {
	return readGit({ root, args: ['ls-files', '-z', '--others', '--exclude-standard'] })
		.split('\0')
		.filter(Boolean)
}

/** Lines as git counts them: a last line without its newline counts too. */
function linesOf(text: string): string[] {
	if (!text) return []
	const lines = text.split('\n')
	return text.endsWith('\n') ? lines.slice(0, -1) : lines
}

/** The base's and the worktree's `package.json` are the same once `version` is left out of both. */
function isVersionOnly(params: { root: string; base: string; path: string }): boolean {
	const baseText = tryReadGit({
		root: params.root,
		args: ['show', `${params.base}:./${params.path}`],
	})
	if (baseText === undefined) return false
	try {
		const worktreeText = readFileSync(join(params.root, params.path), 'utf8')
		return withoutVersion(baseText) === withoutVersion(worktreeText)
	} catch {
		return false
	}
}

/** The manifest as JSON text without its `version`. */
function withoutVersion(text: string): string {
	const manifest: Record<string, unknown> = JSON.parse(text)
	// a key set to undefined is left out of the text
	return JSON.stringify({ ...manifest, version: undefined })
}
