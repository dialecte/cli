/** The released-section verdict, three-way: the checked text, the base branch's tip and their merge-base. */
import { releasedSectionChanges } from './released-sections.ts'

import { describe, expect, it } from 'vitest'

const ONE_RELEASE = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- one.
- two.
`

const TWO_RELEASES = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-02-01

- three.

## [1.0.0] - 2026-01-01

- one.
`

const BEFORE_THE_RELEASE = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

- one.
`

const DUPLICATED_RELEASE = `# Changelog

## [0.0.44]

- a.

## [0.0.44]

- b.
`

describe('releasedSectionChanges: changes in a released section', () => {
	it.each([
		{
			label:
				'a released section with one line added and no merge-base → one change, one line added, at that line',
			checked: `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- one.
- two.
- three.
`,
			changes: [
				{ kind: 'changed', version: '1.0.0', line: 11, added: 1, removed: 0, reordered: false },
			],
		},
		{
			label: 'the line added under Unreleased in any casing → nothing',
			checked: `# Changelog

## UNRELEASED

- new.

## [1.0.0] - 2026-01-01

### Added

- one.
- two.
`,
			changes: [],
		},
		{
			label: 'a new version absent from the base → nothing',
			checked: `# Changelog

## [Unreleased]

## [1.1.0] - 2026-02-01

### Fixed

- three.

## [1.0.0] - 2026-01-01

### Added

- one.
- two.
`,
			changes: [],
		},
		{
			label: 'trailing spaces only, or one more trailing blank line → nothing',
			checked: `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- one.
- two.

`,
			changes: [],
		},
		{
			label: 'two lines of a released section swapped → a change read as reordered',
			checked: `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- two.
- one.
`,
			changes: [
				{ kind: 'changed', version: '1.0.0', line: 9, added: 0, removed: 0, reordered: true },
			],
		},
		{
			label: "the heading's date changed → a change",
			checked: `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-02

### Added

- one.
- two.
`,
			changes: [
				{ kind: 'changed', version: '1.0.0', line: 5, added: 1, removed: 1, reordered: false },
			],
		},
	])('$label', ({ checked, changes }) => {
		expect(releasedSectionChanges({ checked, tip: ONE_RELEASE })).toEqual(changes)
	})
})

describe('releasedSectionChanges: removals, the merge-base and duplicates', () => {
	it.each([
		{
			label: 'a base section absent from the checked text with no merge-base → removed',
			checked: BEFORE_THE_RELEASE,
			tip: TWO_RELEASES,
			mergeBase: undefined,
			changes: [{ kind: 'removed', version: '1.1.0', line: 5, removed: 3 }],
		},
		{
			label: 'a section the merge-base lacks too, absent from the checked text → nothing',
			checked: BEFORE_THE_RELEASE,
			tip: TWO_RELEASES,
			mergeBase: BEFORE_THE_RELEASE,
			changes: [],
		},
		{
			label: 'the checked text equal to the merge-base and differing from the tip → nothing',
			checked: TWO_RELEASES,
			tip: `# Changelog

## [Unreleased]

## [1.1.0] - 2026-02-01

- three.

## [1.0.0] - 2026-01-01

- one, corrected.
`,
			mergeBase: TWO_RELEASES,
			changes: [],
		},
		{
			label: 'the checked text equal to the tip and differing from the merge-base → nothing',
			checked: TWO_RELEASES,
			tip: TWO_RELEASES,
			mergeBase: BEFORE_THE_RELEASE,
			changes: [],
		},
		{
			label: 'the checked text differing from both, the merge-base lacking the section → flagged',
			checked: `# Changelog

## [Unreleased]

## [1.1.0] - 2026-02-01

- three.
- a stack entry.

## [1.0.0] - 2026-01-01

- one.
`,
			tip: TWO_RELEASES,
			mergeBase: BEFORE_THE_RELEASE,
			changes: [
				{ kind: 'changed', version: '1.1.0', line: 8, added: 1, removed: 0, reordered: false },
			],
		},
		{
			label: 'a heading duplicated in the checked text only → appears twice',
			checked: `# Changelog

## [Unreleased]

## [1.1.0] - 2026-02-01

- three.

## [1.0.0] - 2026-01-01

- one.

## [1.0.0] - 2026-01-01

- one.
`,
			tip: TWO_RELEASES,
			mergeBase: TWO_RELEASES,
			changes: [{ kind: 'duplicated', version: '1.0.0', line: 13 }],
		},
	])('$label', ({ checked, tip, mergeBase, changes }) => {
		expect(releasedSectionChanges({ checked, tip, mergeBase })).toEqual(changes)
	})
})

describe('releasedSectionChanges: text forms and base duplicates', () => {
	it.each([
		{
			label: 'CRLF against LF of the same text → nothing',
			checked: ONE_RELEASE.replace(/\n/g, '\r\n'),
			tip: ONE_RELEASE,
			changes: [],
		},
		{
			label: 'no base text → nothing',
			checked: ONE_RELEASE,
			tip: undefined,
			changes: [],
		},
		{
			label: 'a duplicate the base holds too, unchanged → nothing',
			checked: DUPLICATED_RELEASE,
			tip: DUPLICATED_RELEASE,
			changes: [],
		},
		{
			label: 'a duplicate the base holds too, its second copy edited → flagged',
			checked: `# Changelog

## [0.0.44]

- a.

## [0.0.44]

- b, edited.
`,
			tip: DUPLICATED_RELEASE,
			changes: [
				{ kind: 'changed', version: '0.0.44', line: 9, added: 1, removed: 1, reordered: false },
			],
		},
	])('$label', ({ checked, tip, changes }) => {
		expect(releasedSectionChanges({ checked, tip })).toEqual(changes)
	})
})
