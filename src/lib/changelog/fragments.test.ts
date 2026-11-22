/** Changelog fragments: one `changes/<name>.md` per lot, its entries under the changelog's own section headings. */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { readFragments } from './fragments.ts'

import { describe, expect, it } from 'vitest'

describe('readFragments', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('two fragments → their sections, each entry text as written, the fragments in file name order', () => {
		const root = createScratchRepository({
			'changes/b-lot.md': '### Fixed\n\n- the gate reads the tree.\n',
			'changes/a-lot.md': '### Added\n\n- `changelog release`.\n\n### Fixed\n\n- a typo.\n',
		})

		expect(readFragments({ root })).toEqual({
			fragments: [
				{
					file: 'changes/a-lot.md',
					sections: [
						{ section: 'Added', text: '- `changelog release`.' },
						{ section: 'Fixed', text: '- a typo.' },
					],
				},
				{
					file: 'changes/b-lot.md',
					sections: [{ section: 'Fixed', text: '- the gate reads the tree.' }],
				},
			],
			notes: [],
			problems: [],
		})
	})

	it.each([
		{
			label: 'a heading that is no changelog section',
			text: '### Improved\n\n- faster.\n',
			problem:
				'heading "### Improved" is no section: Added, Changed, Deprecated, Removed, Fixed, Security',
		},
		{
			label: 'text before the first heading',
			text: 'a note\n\n### Added\n\n- x.\n',
			problem: 'text before the first section heading',
		},
		{
			label: 'a section with no text',
			text: '### Added\n\n### Fixed\n\n- x.\n',
			problem: 'section Added holds no text',
		},
		{ label: 'no section at all', text: '\n', problem: 'holds no section' },
		{
			label: 'an HTML comment that never closes',
			text: '### Changed\n\n- a.\n\n<!-- todo\n\n- **Breaking:** hidden?\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'the same section twice',
			text: '### Added\n\n- a.\n\n### Added\n\n- b.\n',
			problem: 'section Added appears twice',
		},
	])('$label → a problem naming the fragment', ({ text, problem }) => {
		const root = createScratchRepository({ 'changes/lot.md': text })

		expect(readFragments({ root }).problems).toEqual([{ file: 'changes/lot.md', problem }])
	})

	it('a CRLF fragment → read as LF, no carriage return in its text', () => {
		const root = createScratchRepository({ 'changes/lot.md': '### Added\r\n\r\n- x.\r\n- y.\r\n' })

		expect(readFragments({ root }).fragments).toEqual([
			{ file: 'changes/lot.md', sections: [{ section: 'Added', text: '- x.\n- y.' }] },
		])
	})

	it('no changes folder → no fragment, no problem', () => {
		expect(readFragments({ root: createScratchRepository() })).toEqual({
			fragments: [],
			notes: [],
			problems: [],
		})
	})

	it('a file of the folder that is no .md (a .gitkeep) → ignored', () => {
		const root = createScratchRepository({ 'changes/.gitkeep': '' })

		expect(readFragments({ root })).toEqual({ fragments: [], notes: [], problems: [] })
	})
})

describe('readFragments: a no-entry note', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('changes/<name>.none.md holding a reason → a note, no fragment, no problem', () => {
		const root = createScratchRepository({
			'changes/typo.none.md': 'a wording fix in the README\n',
		})

		expect(readFragments({ root })).toEqual({
			fragments: [],
			notes: [{ file: 'changes/typo.none.md', reason: 'a wording fix in the README' }],
			problems: [],
		})
	})

	it('changes/<name>.none.md with no text → a problem: it must say why no entry', () => {
		const root = createScratchRepository({ 'changes/typo.none.md': '\n' })

		expect(readFragments({ root }).problems).toEqual([
			{ file: 'changes/typo.none.md', problem: 'a no-entry note holds no reason' },
		])
	})
})
