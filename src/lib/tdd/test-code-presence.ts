/**
 * The presence map of test code (FIX-ci-loop design, section 4): a path's presence is decided once, from one git read
 * (`git status --porcelain=v2` and `git diff --name-status` against the base, rename pairs included), never by opening
 * a path that may be gone. Every tdd reader takes texts from it (`presentTextOf`), and the lot's `gone` and `moved`
 * entries are checked against it (`declaredPathRefusalOf`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { shellWord } from '../shell-quote.ts'
import {
	CASE_ARGUMENT_SEPARATOR,
	DECLARED_PATH_REFUSALS,
	GLOB_MAGIC_PATTERN,
	TEST_CODE_PATH_PATTERNS,
	UNUSED_ENTRY_REMOVE,
} from './tdd.constants.ts'

import type { DiffChange, LotGoneEntry, LotMovedEntry, TddLedger } from './tdd.types.ts'
import type { TestCodePath, TestCodePresence } from './test-code-presence.types.ts'

/**
 * The paths of the package at `root` changed since `base`, each with its state and its text when present.
 *
 * @intent decide once which test code is present, changed or deleted, and read the present texts
 * @internal
 */
export function changedTestCodeOf(params: { root: string; base: string }): TestCodePresence {
	const { root, base } = params
	const paths = new Map<string, TestCodePath>()
	// a diff git cannot read changes nothing here, as before: the base is the caller's to have checked
	for (const change of readDiffChanges({ root, base }) ?? []) paths.set(change.file, change.path)
	const prefix = tryReadGit({ root, args: ['rev-parse', '--show-prefix'] })?.trim() ?? ''
	for (const entry of readStatusEntries({ root, prefix })) {
		const known = paths.get(entry.file)
		if (entry.kind === 'untracked' && known === undefined) paths.set(entry.file, { state: 'added' })
		if (entry.kind === 'missing' && known?.state !== 'deleted')
			paths.set(entry.file, { state: 'deleted', atBase: known?.state === 'modified' })
	}
	return { base, paths: new Map([...paths].sort(byPath).map(withText(root))) }
}

/**
 * The text of `file` (relative to the package root) as the presence map knows it: a changed file's text, nothing for a
 * deleted one, an unchanged file's text from disk (nothing when it cannot be read).
 *
 * @intent read test code through the presence map, never a path that is gone
 * @internal
 */
export function presentTextOf(params: {
	root: string
	presence: TestCodePresence
	file: string
}): string | undefined {
	const known = params.presence.paths.get(params.file)
	if (known?.state === 'deleted') return undefined
	// a changed path read when the map was made, else present (unchanged, or changed but no test code by its path)
	return known?.text ?? readTextOrNone(join(params.root, params.file))
}

/**
 * True when the presence map holds `file` as deleted: an unchanged path is present.
 *
 * @intent leave a file deleted on disk out of what tdd reads
 * @internal
 */
export function isDeletedIn(params: { presence: TestCodePresence; file: string }): boolean {
	return params.presence.paths.get(params.file)?.state === 'deleted'
}

/**
 * The refusal of the first `gone` or `moved` entry naming a path the change leaves unchanged and present, or one known
 * nowhere (not at the base, not now, not in the receipts), or of a `gone` entry naming the old path of a rename git
 * pairs (the case removed in the rename is gone at the new path); undefined when every entry names a path the change
 * touches, the old path of such a rename (a `moved` entry), one with receipts, or a glob. One line, naming the verb that
 * removes the entry.
 *
 * @intent refuse a stale lot declaration before tdd reads the path it names
 * @internal
 */
export function declaredPathRefusalOf(params: {
	root: string
	presence: TestCodePresence
	ledger: TddLedger
	gone: readonly LotGoneEntry[]
	moved: readonly LotMovedEntry[]
}): string | undefined {
	const receipts = new Set(
		params.ledger.entries.flatMap((entry) =>
			entry.kind === 'freeze' ? Object.keys(entry.files) : [entry.file],
		),
	)
	const declared = [
		...params.gone.map((entry) => ({
			list: 'gone',
			paths: [entry.file],
			removeWords: [entry.file],
		})),
		...params.moved.map((entry) => ({
			list: 'moved',
			paths: [entry.from, entry.to].map((side) => side.split(CASE_ARGUMENT_SEPARATOR)[0]),
			removeWords: [entry.from, entry.to],
		})),
	]
	// the old path of each rename git pairs, to its new path
	const renamedTo = new Map(
		[...listRenames(params.presence)].map(([file, from]) => [from, file] as const),
	)
	for (const { list, paths, removeWords } of declared)
		for (const path of paths) {
			const remove = fillMessage({
				template: UNUSED_ENTRY_REMOVE,
				values: { list, entry: removeWords.map((word) => shellWord(word)).join(' ') },
			})
			const to = renamedTo.get(path)
			if (to !== undefined && list === 'gone')
				return fillMessage({
					template: DECLARED_PATH_REFUSALS.renamed,
					values: { list, path, to, remove },
				})
			if (to !== undefined) continue
			if (GLOB_MAGIC_PATTERN.test(path) || params.presence.paths.has(path)) continue
			const present = existsSync(join(params.root, path))
			if (!present && receipts.has(path)) continue
			return fillMessage({
				template: present ? DECLARED_PATH_REFUSALS.present : DECLARED_PATH_REFUSALS.unknown,
				values: { list, path, remove },
			})
		}
	return undefined
}

/**
 * Every rename git pairs in the presence map, new path → old path.
 *
 * @intent read the renames of a change once, from its presence map
 * @internal
 */
export function listRenames(presence: TestCodePresence): Map<string, string> {
	return new Map(
		[...presence.paths].flatMap(([file, path]) =>
			path.state === 'renamed' ? [[file, path.from] as const] : [],
		),
	)
}

/**
 * The tracked changes against the base, relative to the package (other packages' paths left out): a rename's new
 * path names its old one. Against the worktree, or against the commit `revision` when given (uncommitted work ignored).
 * Undefined when git cannot read the diff (a base whose tree is gone), never an empty change.
 *
 * @intent read once which paths a change touches since its base, renames paired
 * @internal
 */
export function readDiffChanges(params: {
	root: string
	base: string
	revision?: string
}): DiffChange[] | undefined {
	const sides = params.revision === undefined ? [params.base] : [params.base, params.revision]
	const output = tryReadGit({
		root: params.root,
		args: ['diff', '--name-status', '-z', '-M', '--relative', ...sides, '--', '.'],
	})
	if (output === undefined) return undefined
	const words = output.split('\0')
	const changes: DiffChange[] = []
	for (let index = 0; index < words.length - 1;) {
		const letter = words[index].charAt(0)
		if (letter === 'R') {
			changes.push({
				file: words[index + 2],
				path: { state: 'renamed', from: words[index + 1] },
			})
			index += 3
			continue
		}
		const file = letter === 'C' ? words[index + 2] : words[index + 1]
		changes.push({ file, path: diffPathOf(letter) })
		index += letter === 'C' ? 3 : 2
	}
	return changes
}

/** The state a diff letter gives a path (its text read after). */
function diffPathOf(letter: string): TestCodePath {
	if (letter === 'D') return { state: 'deleted', atBase: true }
	if (letter === 'A' || letter === 'C') return { state: 'added' }
	return { state: 'modified' }
}

/**
 * The untracked files and the files the index holds but the disk lacks, from `git status --porcelain=v2 -z`, their
 * paths (relative to the repository there) made relative to the package.
 */
function readStatusEntries(params: {
	root: string
	prefix: string
}): Array<{ file: string; kind: 'untracked' | 'missing' }> {
	// outside a repository (the copy of the base a base run makes) nothing is changed: every file is present
	const records = (
		tryReadGit({
			root: params.root,
			args: ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--', '.'],
		}) ?? ''
	).split('\0')
	const entries: Array<{ file: string; kind: 'untracked' | 'missing' }> = []
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index]
		const kind = record.charAt(0)
		if (kind === '?') entries.push({ file: record.slice(2), kind: 'untracked' })
		if ((kind === '1' || kind === '2') && record.charAt(3) === 'D')
			entries.push({ file: pathOfRecord({ record, kind }), kind: 'missing' })
		// a rename record is followed by its original path
		if (kind === '2') index += 1
	}
	return entries
		.filter(({ file }) => file.startsWith(params.prefix))
		.map(({ file, kind }) => ({ file: file.slice(params.prefix.length), kind }))
}

/** The path of an ordinary (`1`, 8 fields before it) or rename (`2`, 9 fields) status record. */
function pathOfRecord(params: { record: string; kind: string }): string {
	const fields = params.kind === '1' ? 8 : 9
	return params.record.split(' ').slice(fields).join(' ')
}

/**
 * Each present path that may hold test code with its text read (one that cannot be read is deleted); a production
 * path keeps its presence alone.
 */
function withText(root: string): (entry: [string, TestCodePath]) => [string, TestCodePath] {
	return function readEntry([file, path]) {
		if (path.state === 'deleted' || !TEST_CODE_PATH_PATTERNS.some((pattern) => pattern.test(file)))
			return [file, path]
		const text = readTextOrNone(join(root, file))
		return [file, text === undefined ? { state: 'deleted', atBase: false } : { ...path, text }]
	}
}

function byPath(one: [string, TestCodePath], other: [string, TestCodePath]): number {
	return one[0] < other[0] ? -1 : one[0] > other[0] ? 1 : 0
}

/** The text of the file at `path`; undefined when it cannot be read (gone, a folder). */
function readTextOrNone(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}
