/**
 * A visible change brings its changelog fragment: in a package keeping `changes/`, a change that edits the README or
 * the command map adds `changes/<name>.md`, or a no-entry note `changes/<name>.none.md` saying why it has none.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { errorReasonOf } from '../error-reason.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { readGit } from '../git.ts'
import {
	CHANGELOG_FILE,
	FRAGMENT_ASKING_FILES,
	FRAGMENT_CHECK_LINES,
	FRAGMENT_EXTENSION,
	FRAGMENTS_FOLDER,
} from './changelog.constants.ts'
import { readFragments } from './fragments.ts'

import type { FragmentCheck } from './changelog.types.ts'

/**
 * The change of the package at `root` since `base` (its commits, the working files and the new ones, renames read
 * as a deletion and an addition): failed when it edits a file asking for a fragment (`FRAGMENT_ASKING_FILES`) and adds
 * or edits no readable `changes/*.md`, when such a file cannot be read, or when the change cannot be read; passed
 * otherwise, saying what answered. A release (CHANGELOG.md edited) is answered by its version section; a package
 * without `changes/` passes.
 *
 * @intent tell whether a change that users see brings its changelog fragment
 * @internal
 */
export function checkChangeFragment(params: { root: string; base: string }): FragmentCheck {
	const { root } = params
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
	const asking = changed.find((file) => FRAGMENT_ASKING_FILES.includes(file))
	if (asking === undefined) return { status: 'passed', note: FRAGMENT_CHECK_LINES.nothingAsked }
	if (changed.includes(CHANGELOG_FILE))
		return { status: 'passed', note: FRAGMENT_CHECK_LINES.release }
	const written = changed.filter(
		(file) =>
			file.startsWith(`${FRAGMENTS_FOLDER}/`) &&
			file.endsWith(FRAGMENT_EXTENSION) &&
			existsSync(join(root, file)),
	)
	if (written.length === 0)
		return { status: 'failed', reason: FRAGMENT_CHECK_LINES.missing.replace('{file}', asking) }
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
