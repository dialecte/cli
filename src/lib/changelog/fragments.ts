/** The changelog fragments of a package: `changes/<name>.md`, one per lot, under the changelog's section headings. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	FRAGMENT_EXTENSION,
	FRAGMENT_PROBLEMS,
	FRAGMENTS_FOLDER,
	NO_ENTRY_EXTENSION,
} from './changelog.constants.ts'
import { readSections } from './sections.ts'

import type { Fragment, FragmentProblem, FragmentsRead, NoEntryNote } from './changelog.types.ts'

/**
 * Every `.md` file of `<root>/changes/` in file name order: its sections, or its problem (a heading that is no
 * section, loose text, an empty or repeated section, no section); a `.none.md` file is a no-entry note, its text the
 * reason (none: a problem). No folder: nothing.
 *
 * @intent read the changelog fragments the lots wrote, before a release folds them
 * @internal
 */
export function readFragments(params: { root: string }): FragmentsRead {
	const folder = join(params.root, FRAGMENTS_FOLDER)
	if (!existsSync(folder)) return { fragments: [], notes: [], problems: [] }
	const names = readdirSync(folder)
		.filter((name) => name.endsWith(FRAGMENT_EXTENSION))
		.sort()
	const fragments: Fragment[] = []
	const notes: NoEntryNote[] = []
	const problems: FragmentProblem[] = []
	for (const name of names) {
		const file = `${FRAGMENTS_FOLDER}/${name}`
		if (name.endsWith(NO_ENTRY_EXTENSION)) {
			const reason = readFileSync(join(folder, name), 'utf8').trim()
			if (reason === '') problems.push({ file, problem: FRAGMENT_PROBLEMS.emptyNote })
			else notes.push({ file, reason })
			continue
		}
		const text = readFileSync(join(folder, name), 'utf8').replace(/\r\n/g, '\n')
		const read = readSections({ text, mode: 'fragment' })
		if ('problem' in read) problems.push({ file, problem: read.problem })
		else if (read.sections.length === 0)
			problems.push({ file, problem: FRAGMENT_PROBLEMS.noSection })
		else fragments.push({ file, sections: read.sections })
	}
	return { fragments, notes, problems }
}
