/** The type-cost notes a change added to its changelog fragments and no-entry notes: none the base already holds. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { FRAGMENT_EXTENSION, FRAGMENTS_FOLDER } from '../changelog/changelog.constants.ts'
import { readFragments } from '../changelog/fragments.ts'
import { readFilesAtRevision, tryReadGit } from '../git.ts'
import { TYPE_COST_NOTE_PATTERN } from './type-cost-notes.constants.ts'

import type { TypeCostNote } from './type-cost-notes.types.ts'

/**
 * The lines matching `TYPE_COST_NOTE_PATTERN` in the files `readFragments` reads whose trimmed text no fragment or note
 * at `base` holds: the one rule of what the change added (a note the base holds, a renamed fragment's included,
 * explains nothing new; a reworded one does).
 */
export function readTypeCostNotes(params: { root: string; base: string }): TypeCostNote[] {
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
	return files.flatMap(function notesOf(file): TypeCostNote[] {
		return readFileSync(join(root, file), 'utf8')
			.split('\n')
			.flatMap(function noteOf(raw, index): TypeCostNote[] {
				const text = raw.trimEnd()
				if (!TYPE_COST_NOTE_PATTERN.test(text) || atBase.has(text.trim())) return []
				return [{ file, line: index + 1, text }]
			})
	})
}

/**
 * The trimmed lines of every fragment and note the base holds.
 */
function readTextsAtBase(params: { root: string; base: string }): Set<string> {
	const { root, base } = params
	const listed = tryReadGit({
		root,
		args: ['ls-tree', '-r', '--name-only', base, '--', `${FRAGMENTS_FOLDER}/`],
	})
	const files = (listed ?? '')
		.split('\n')
		.filter((file) => dirname(file) === FRAGMENTS_FOLDER && file.endsWith(FRAGMENT_EXTENSION))
	const texts = readFilesAtRevision({ root, revision: base, files })
	return new Set([...texts.values()].flatMap((text) => text.split('\n').map((line) => line.trim())))
}
