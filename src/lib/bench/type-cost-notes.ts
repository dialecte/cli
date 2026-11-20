/** The type-cost notes a change added to its changelog fragments and no-entry notes: none the base already holds. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { FRAGMENT_EXTENSION, FRAGMENTS_FOLDER } from '../changelog/changelog.constants.ts'
import { readFragments } from '../changelog/fragments.ts'
import { readFilesAtRevision, tryReadGit } from '../git.ts'
import { TYPE_COST_NOTE_PATTERN, TYPE_COST_NOTES_REFUSALS } from './type-cost-notes.constants.ts'

import type { TypeCostNote, TypeCostNotesRead } from './type-cost-notes.types.ts'

/**
 * The lines matching `TYPE_COST_NOTE_PATTERN` in the files `readFragments` reads whose trimmed text no fragment or note
 * at `base` holds: the one rule of what the change added (a note the base holds, a renamed fragment's included,
 * explains nothing new; a reworded one does). A refusal when the base's fragments cannot be read: never an empty base
 * that lets every note count.
 */
export function readTypeCostNotes(params: { root: string; base: string }): TypeCostNotesRead {
	const { root, base } = params
	const read = readFragments({ root })
	const files = [
		...new Set([
			...read.fragments.map((fragment) => fragment.file),
			...read.notes.map((note) => note.file),
			...read.problems.map((problem) => problem.file),
		]),
	]
	if (files.length === 0) return []
	const atBase = readTextsAtBase({ root, base })
	if ('refusal' in atBase) return atBase
	return files.flatMap(function notesOf(file): TypeCostNote[] {
		return readFileSync(join(root, file), 'utf8')
			.split('\n')
			.flatMap(function noteOf(raw, index): TypeCostNote[] {
				const text = raw.trimEnd()
				if (!TYPE_COST_NOTE_PATTERN.test(text) || atBase.texts.has(text.trim())) return []
				return [{ file, line: index + 1, text }]
			})
	})
}

/**
 * The trimmed lines of every fragment and note the base holds; a refusal when the base's fragments cannot be listed or
 * one of them read: an empty set there would let every note count.
 */
function readTextsAtBase(params: {
	root: string
	base: string
}): { texts: Set<string> } | { refusal: string } {
	const { root, base } = params
	const listed = tryReadGit({
		root,
		args: ['ls-tree', '-r', '--name-only', base, '--', `${FRAGMENTS_FOLDER}/`],
	})
	if (listed === undefined)
		return { refusal: TYPE_COST_NOTES_REFUSALS.unlisted.replace('{base}', () => base) }
	const files = listed
		.split('\n')
		.filter((file) => dirname(file) === FRAGMENTS_FOLDER && file.endsWith(FRAGMENT_EXTENSION))
	const texts = readFilesAtRevision({ root, revision: base, files })
	const unread = files.filter((file) => !texts.has(file))
	if (unread.length)
		return {
			refusal: TYPE_COST_NOTES_REFUSALS.unread
				.replace('{base}', () => base)
				.replace('{files}', () => unread.join(', ')),
		}
	return {
		texts: new Set(
			[...texts.values()].flatMap((text) => text.split('\n').map((line) => line.trim())),
		),
	}
}
