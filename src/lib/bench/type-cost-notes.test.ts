import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readTypeCostNotes } from './type-cost-notes.ts'

import { describe, expect, it } from 'vitest'

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

describe(
	'readTypeCostNotes: only the notes this change added',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('an added "- Type cost: x" bullet in a new fragment → one note', () => {
			const { root, base } = packageAtBase({})
			writeFiles({ root, files: { 'changes/widget.md': FRAGMENT_WITH_NOTE } })

			expect(readTypeCostNotes({ root, base }).map((note) => note.text)).toEqual([NOTE])
		})

		it('the bullet already at the base, the change adds another line → no note', () => {
			const { root, base } = packageAtBase({ 'changes/widget.md': FRAGMENT_WITH_NOTE })
			writeFiles({
				root,
				files: { 'changes/widget.md': `${FRAGMENT_WITH_NOTE}- The widget reads its items once\n` },
			})

			expect(readTypeCostNotes({ root, base }).map((note) => note.text)).toEqual([])
		})

		it('a fragment the change renames, whose note the base already held → no note', () => {
			const { root, base } = packageAtBase({ 'changes/widget.md': FRAGMENT_WITH_NOTE })
			git({ root, args: ['mv', 'changes/widget.md', 'changes/widget-children.md'] })
			commitFiles({
				root,
				files: { 'notes.md': 'renamed\n' },
				message: 'chore: rename the fragment',
			})

			expect(readTypeCostNotes({ root, base }).map((note) => note.text)).toEqual([])
		})

		it('"Type cost:" with nothing after it → no note', () => {
			const { root, base } = packageAtBase({ 'changes/widget.md': FRAGMENT })
			writeFiles({ root, files: { 'changes/widget.md': `${FRAGMENT}- Type cost:\n` } })

			expect(readTypeCostNotes({ root, base }).map((note) => note.text)).toEqual([])
		})
	},
)
