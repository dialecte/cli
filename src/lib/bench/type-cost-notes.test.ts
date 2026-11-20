import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readTypeCostNotes } from './type-cost-notes.ts'

import { describe, expect, it } from 'vitest'

import type { TypeCostNotesRead } from './type-cost-notes.types.ts'

const NOTE = '- Type cost: the element union grows with the new version'
const FRAGMENT = ['### Changed', '', '- The widget reads its children once', ''].join('\n')
const FRAGMENT_WITH_NOTE = [
	'### Changed',
	'',
	'- The widget reads its children once',
	NOTE,
	'',
].join('\n')

/** A package whose base commit holds `changes/` with `files`; the base commit. */
function packageAtBase(files: Record<string, string>): { root: string; base: string } {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: '@dialecte/demo' })}\n`,
		'changes/.gitkeep': '',
		...files,
	})
	return { root, base: git({ root, args: ['rev-parse', 'HEAD'] }).trim() }
}

/** The texts of the notes read; a refusal is no answer these cases expect, so it fails the case. */
function noteTextsOf(read: TypeCostNotesRead): string[] {
	if ('refusal' in read) throw new Error(`refused: ${read.refusal}`)
	return read.map((note) => note.text)
}

describe(
	'readTypeCostNotes: only the notes this change added',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('an added "- Type cost: x" bullet in a new fragment → one note', () => {
			const { root, base } = packageAtBase({})
			writeFiles({ root, files: { 'changes/widget.md': FRAGMENT_WITH_NOTE } })

			expect(noteTextsOf(readTypeCostNotes({ root, base }))).toEqual([NOTE])
		})

		it('the bullet already at the base, the change adds another line → no note', () => {
			const { root, base } = packageAtBase({ 'changes/widget.md': FRAGMENT_WITH_NOTE })
			writeFiles({
				root,
				files: { 'changes/widget.md': `${FRAGMENT_WITH_NOTE}- The widget reads its items once\n` },
			})

			expect(noteTextsOf(readTypeCostNotes({ root, base }))).toEqual([])
		})

		it('a fragment the change renames, whose note the base already held → no note', () => {
			const { root, base } = packageAtBase({ 'changes/widget.md': FRAGMENT_WITH_NOTE })
			git({ root, args: ['mv', 'changes/widget.md', 'changes/widget-children.md'] })
			commitFiles({
				root,
				files: { 'notes.md': 'renamed\n' },
				message: 'chore: rename the fragment',
			})

			expect(noteTextsOf(readTypeCostNotes({ root, base }))).toEqual([])
		})

		it('"Type cost:" with nothing after it → no note', () => {
			const { root, base } = packageAtBase({ 'changes/widget.md': FRAGMENT })
			writeFiles({ root, files: { 'changes/widget.md': `${FRAGMENT}- Type cost:\n` } })

			expect(noteTextsOf(readTypeCostNotes({ root, base }))).toEqual([])
		})

		it('a base whose fragments git cannot list → a refusal, never an empty set that lets every note count', () => {
			const { root } = packageAtBase({})
			writeFiles({ root, files: { 'changes/widget.md': FRAGMENT_WITH_NOTE } })

			expect(readTypeCostNotes({ root, base: 'a'.repeat(40) })).toEqual({
				refusal: expect.any(String),
			})
		})
	},
)
