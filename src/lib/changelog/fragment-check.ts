/**
 * A visible change brings its changelog fragment: in a package keeping `changes/`, a change that edits the README, a
 * page under `doc/` or a file the package lists in `dialecte.changelog.asking` adds `changes/<name>.md`, or a no-entry
 * note `changes/<name>.none.md` saying why it has none.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { errorReasonOf } from '../error-reason.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import {
	CHANGELOG_FILE,
	FRAGMENT_ASKING_FIELD,
	FRAGMENT_CHANGELOG_FIELD,
	FRAGMENT_ASKING_FILES,
	FRAGMENT_CHECK_LINES,
	FRAGMENT_EXTENSION,
	FRAGMENTS_FOLDER,
	NOT_A_GIT_PATH_PATTERN,
} from './changelog.constants.ts'
import { readFragments } from './fragments.ts'

import type { FragmentCheck } from './changelog.types.ts'

/**
 * The change of the package at `root` since `base` (its commits, the working files and the new ones, renames read
 * as a deletion and an addition): failed when the package's `dialecte.changelog` cannot be read as a list of paths
 * (in any package), or when it edits a file asking for a fragment (`askingEntriesOf`) and adds
 * or edits no readable `changes/*.md`, when such a file cannot be read, or when the change cannot be read; passed
 * otherwise, saying what answered. A release (CHANGELOG.md edited) is answered by its version section; a package
 * without `changes/` passes.
 *
 * @intent tell whether a change that users see brings its changelog fragment
 * @internal
 */
export function checkChangeFragment(params: { root: string; base: string }): FragmentCheck {
	const { root } = params
	// a list no change can match is a fault of the package, kept fragments or not
	const asking = askingEntriesOf({ root })
	if ('problem' in asking) return { status: 'failed', reason: asking.problem }
	if (!existsSync(join(root, FRAGMENTS_FOLDER)))
		return { status: 'passed', note: FRAGMENT_CHECK_LINES.noFolder }
	let changed: string[]
	try {
		changed = listChangeOf({ root, base: params.base })
	} catch (error) {
		return {
			status: 'failed',
			reason: FRAGMENT_CHECK_LINES.unreadable
				.replace('{base}', params.base.slice(0, SHORT_SHA_LENGTH))
				.replace('{reason}', () => errorReasonOf(error).split('\n')[0]),
		}
	}
	const askingFile = changed.find((file) => asksForFragment({ file, entries: asking.entries }))
	if (askingFile === undefined) return { status: 'passed', note: FRAGMENT_CHECK_LINES.nothingAsked }
	if (changed.includes(CHANGELOG_FILE))
		return { status: 'passed', note: FRAGMENT_CHECK_LINES.release }
	const written = changed.filter(
		(file) =>
			file.startsWith(`${FRAGMENTS_FOLDER}/`) &&
			file.endsWith(FRAGMENT_EXTENSION) &&
			existsSync(join(root, file)),
	)
	if (written.length === 0)
		return { status: 'failed', reason: FRAGMENT_CHECK_LINES.missing.replace('{file}', askingFile) }
	const { notes, problems } = readFragments({ root })
	const broken = problems.find((entry) => written.includes(entry.file))
	if (broken)
		return {
			status: 'failed',
			reason: FRAGMENT_CHECK_LINES.problem
				.replace('{file}', broken.file)
				.replace('{problem}', broken.problem),
		}
	const note = notes.find((entry) => written.includes(entry.file))
	return note && written.every((file) => notes.some((entry) => entry.file === file))
		? { status: 'passed', note: FRAGMENT_CHECK_LINES.note.replace('{reason}', () => note.reason) }
		: {
				status: 'passed',
				note: FRAGMENT_CHECK_LINES.fragment.replace('{files}', written.join(', ')),
			}
}

/** The files the change touches since `base`, relative to `root`: changed or deleted ones, and the new untracked ones. */
function listChangeOf(params: { root: string; base: string }): string[] {
	const { root } = params
	const tracked = readGit({
		root,
		args: ['diff', '--name-only', '--no-renames', '--relative', params.base],
	})
	const untracked = readGit({ root, args: ['ls-files', '--others', '--exclude-standard'] })
	return [...new Set(`${tracked}\n${untracked}`.split('\n').filter(Boolean))]
}

/**
 * The fragment-asking entries of the package at `root`: `FRAGMENT_ASKING_FILES` and its package.json's
 * `dialecte.changelog.asking`; the problem, naming the field, when `dialecte.changelog` is there and is no object, its
 * `asking` no list, or the list holds entries that are no path as git names a changed file (`isGitPath`, each named).
 */
function askingEntriesOf(params: { root: string }): { entries: string[] } | { problem: string } {
	const changelog: unknown = readPackageJson(params.root).dialecte?.changelog
	if (changelog === undefined) return { entries: [...FRAGMENT_ASKING_FILES] }
	if (changelog === null || typeof changelog !== 'object' || Array.isArray(changelog))
		return {
			problem: FRAGMENT_CHECK_LINES.badChangelog.replace('{field}', FRAGMENT_CHANGELOG_FIELD),
		}
	const listed = (changelog as { asking?: unknown }).asking
	if (listed === undefined) return { entries: [...FRAGMENT_ASKING_FILES] }
	if (!Array.isArray(listed))
		return { problem: FRAGMENT_CHECK_LINES.badAskingList.replace('{field}', FRAGMENT_ASKING_FIELD) }
	const bad = listed.filter((entry) => !isGitPath(entry))
	if (bad.length > 0)
		return {
			problem: FRAGMENT_CHECK_LINES.badAskingEntries
				.replace('{field}', FRAGMENT_ASKING_FIELD)
				.replace('{entries}', () => bad.map((entry) => JSON.stringify(entry)).join(', ')),
		}
	return { entries: [...FRAGMENT_ASKING_FILES, ...(listed as string[])] }
}

/**
 * A path as git names a changed file: a non-empty string, relative to the package (no leading `/`), with `/`
 * separators, no `.` or `..` segment, no `//`, no backslash, no glob, no white space around it; anything else would
 * never match a change.
 */
function isGitPath(entry: unknown): entry is string {
	return (
		typeof entry === 'string' &&
		entry !== '' &&
		entry === entry.trim() &&
		!entry.startsWith('/') &&
		!NOT_A_GIT_PATH_PATTERN.test(entry)
	)
}

/** Whether a changed file asks for a fragment: one of `entries`, or under one of its folders (an entry ending in `/`). */
function asksForFragment(params: { file: string; entries: readonly string[] }): boolean {
	return params.entries.some((entry) =>
		entry.endsWith('/') ? params.file.startsWith(entry) : params.file === entry,
	)
}
