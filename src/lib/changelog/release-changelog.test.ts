/** The release fold: the fragments and the Unreleased entries become the new version's section. */
import { foldChangelog } from './release-changelog.ts'

import { describe, expect, it } from 'vitest'

import type { Fragment } from './changelog.types.ts'

const HEAD = '# Changelog\n\nAll notable changes.\n'

const OLD_RELEASE = '## [0.7.0] - 2026-11-14\n\n### Added\n\n- the old entry.\n'

const FRAGMENTS = [
	{ file: 'changes/a.md', sections: [{ section: 'Fixed' as const, text: '- fragment a.' }] },
	{
		file: 'changes/b.md',
		sections: [
			{ section: 'Added' as const, text: '- fragment b.' },
			{ section: 'Fixed' as const, text: '- fragment b, fixed.' },
		],
	},
]

/** A fragment holding only a Changed section. */
function changed(file: string, text: string): Fragment {
	return { file, sections: [{ section: 'Changed', text }] }
}

describe('foldChangelog', () => {
	it.each([
		{
			label:
				'Unreleased entries and two fragments → one version section, sections in changelog order, entries one per line, Unreleased left empty',
			text: `${HEAD}\n## [Unreleased]\n\n### Fixed\n\n- an entry written before fragments.\n\n${OLD_RELEASE}`,
			fragments: FRAGMENTS,
			folded: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n### Added\n\n- fragment b.\n\n### Fixed\n\n- an entry written before fragments.\n- fragment a.\n- fragment b, fixed.\n\n${OLD_RELEASE}`,
		},
		{
			label:
				'the Unreleased part holding the same section twice (hand-written) → merged in its first place',
			text: `${HEAD}\n## [Unreleased]\n\n### Changed\n\n- one.\n\n### Added\n\n- two.\n\n### Changed\n\n- three.\n\n${OLD_RELEASE}`,
			fragments: [],
			folded: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n### Added\n\n- two.\n\n### Changed\n\n- one.\n- three.\n\n${OLD_RELEASE}`,
		},
		{
			label:
				'a summary before the first section, an `## UNRELEASED` heading → the summary opens the version, the heading written `## [Unreleased]`',
			text: `${HEAD}\n## UNRELEASED\n\nBreaking: one thing.\n\n### Added\n\n- x.\n\n${OLD_RELEASE}`,
			fragments: [],
			folded: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\nBreaking: one thing.\n\n### Added\n\n- x.\n\n${OLD_RELEASE}`,
		},
		{
			label: 'no Unreleased heading → one written above the first version',
			text: `${HEAD}\n${OLD_RELEASE}`,
			fragments: FRAGMENTS.slice(0, 1),
			folded: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n### Fixed\n\n- fragment a.\n\n${OLD_RELEASE}`,
		},
		{
			label:
				'Unreleased the last part, a link block at the end → the block stays at the end, out of the version',
			text: `${HEAD}\n## [Unreleased]\n\n### Added\n\n- x.\n\n[Unreleased]: https://example.test/compare\n`,
			fragments: [],
			folded: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n### Added\n\n- x.\n\n[Unreleased]: https://example.test/compare\n`,
		},
		{
			label:
				'a code fence holding "### Example" and "## [9.9.9]" lines → kept as text of its section',
			text: `${HEAD}\n## [Unreleased]\n\n### Added\n\n- x:\n\n\`\`\`md\n### Example\n## [9.9.9]\n\`\`\`\n\n${OLD_RELEASE}`,
			fragments: [],
			folded: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n### Added\n\n- x:\n\n\`\`\`md\n### Example\n## [9.9.9]\n\`\`\`\n\n${OLD_RELEASE}`,
		},
		{
			label: 'a CRLF changelog → read alike, written with LF',
			text: `${HEAD}\n## [Unreleased]\n\n### Added\n\n- x.\n\n${OLD_RELEASE}`.replace(
				/\n/g,
				'\r\n',
			),
			fragments: [],
			folded: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n### Added\n\n- x.\n\n${OLD_RELEASE}`,
		},
	])('$label', ({ text, fragments, folded }) => {
		expect(foldChangelog({ text, version: '0.8.0', date: '2026-11-16', fragments })).toEqual({
			text: folded,
		})
	})

	it.each([
		{
			label:
				"a later fragment holding a breaking item → that item first in its section, the earlier fragment's items after it in order",
			unreleased: '',
			added: '',
			fragments: [
				changed('changes/a.md', '- a one.\n- a two.'),
				changed('changes/b.md', '- **Breaking:** b.'),
			],
			section: '- **Breaking:** b.\n- a one.\n- a two.',
		},
		{
			label:
				"breaking items in the Unreleased part and in a fragment → the Unreleased one first, then the fragment's, then the rest in order",
			unreleased: '### Changed\n\n- u plain.\n- **Breaking:** u.\n\n',
			added: '',
			fragments: [changed('changes/a.md', '- **Breaking:** a.\n- a plain.')],
			section: '- **Breaking:** u.\n- **Breaking:** a.\n- u plain.\n- a plain.',
		},
		{
			label: 'a plain item then a breaking one in one fragment → the breaking one lifted above it',
			unreleased: '',
			added: '',
			fragments: [changed('changes/a.md', '- plain.\n- **Breaking:** lifted.')],
			section: '- **Breaking:** lifted.\n- plain.',
		},
		{
			label: 'the marker forms of other changelogs → lifted alike',
			unreleased: '',
			added: '',
			fragments: [
				changed('changes/a.md', '- plain.'),
				changed('changes/b.md', '- **Breaking: a whole sentence.**\n- **BREAKING**: shouted.'),
				changed(
					'changes/c.md',
					'- **Breaking** - dashed.\n- Breaking a long line no longer wraps.',
				),
			],
			section:
				'- **Breaking: a whole sentence.**\n- **BREAKING**: shouted.\n- **Breaking** - dashed.\n- plain.\n- Breaking a long line no longer wraps.',
		},
		{
			label:
				'an item holding a second paragraph, then one-line items of other fragments → one blank line after it only',
			unreleased: '',
			added: '',
			fragments: [
				changed('changes/a.md', '- a.\n\n  more of a.'),
				changed('changes/b.md', '- b.'),
				changed('changes/c.md', '- c.'),
			],
			section: '- a.\n\n  more of a.\n\n- b.\n- c.',
		},
		{
			label:
				'an ordered list next to a fragment of bullets → a blank line between, its order and numbers kept, its breaking-looking line not lifted',
			unreleased: '',
			added: '',
			fragments: [
				changed('changes/a.md', '1. first.\n2. **Breaking:** second.'),
				changed('changes/b.md', '- b.'),
			],
			section: '1. first.\n2. **Breaking:** second.\n\n- b.',
		},
		{
			label:
				'a breaking item under an intro paragraph → lifted above the intro, the intro and the plain item after it',
			unreleased: '',
			added: '',
			fragments: [changed('changes/a.md', 'Intro:\n\n- a.\n- **Breaking:** b.')],
			section: '- **Breaking:** b.\n\nIntro:\n\n- a.',
		},
		{
			label:
				'a breaking-looking line inside an HTML comment → never lifted, the comment kept whole after the items',
			unreleased: '',
			added: '',
			fragments: [
				changed('changes/a.md', '- a.\n<!--\n- **Breaking:** hidden.\n-->'),
				changed('changes/b.md', '- **Breaking:** b.'),
			],
			section: '- **Breaking:** b.\n- a.\n\n<!--\n- **Breaking:** hidden.\n-->',
		},
		{
			label:
				'a section heading inside an HTML comment of the Unreleased part → kept inside the comment, the real section after it',
			unreleased:
				'### Changed\n\n- a.\n<!--\n### Fixed\n- y.\n-->\n\n### Fixed\n\n- **Breaking:** real.\n\n',
			added: '',
			fragments: [],
			section: '- a.\n\n<!--\n### Fixed\n- y.\n-->\n\n### Fixed\n\n- **Breaking:** real.',
		},
		{
			label:
				'an HTML comment in the Unreleased part that never closes → it hides nothing, the older release stays where it was',
			unreleased: '### Changed\n\n- a.\n<!--\n- not hidden.\n\n',
			added: '',
			fragments: [],
			section: '- a.\n\n<!--\n\n- not hidden.',
		},
		{
			label:
				'a four-backtick fence holding a three-backtick fence and a section heading → kept as text of its section',
			unreleased: '### Changed\n\n- x:\n\n````md\n```\n### Fixed\n```\n````\n\n',
			added: '',
			fragments: [],
			section: '- x:\n\n````md\n```\n### Fixed\n```\n````',
		},
		{
			label:
				'a breaking item under a sub-heading of its fragment → lifted above the plain item, the sub-heading after them',
			unreleased: '',
			added: '',
			fragments: [changed('changes/a.md', '- a.\n\n#### Migration\n\n- **Breaking:** b.')],
			section: '- **Breaking:** b.\n- a.\n\n#### Migration',
		},
		{
			label: 'a loose fragment list of one-line items → written tight',
			unreleased: '',
			added: '',
			fragments: [changed('changes/a.md', '- a.\n\n- b.')],
			section: '- a.\n- b.',
		},
		{
			label:
				'an Unreleased section written twice, each a paragraph → two paragraphs, a blank line between',
			unreleased:
				'### Changed\n\nFirst paragraph.\n\n### Added\n\n- x.\n\n### Changed\n\nSecond paragraph.\n\n',
			added: '### Added\n\n- x.\n\n',
			fragments: [],
			section: 'First paragraph.\n\nSecond paragraph.',
		},
		{
			label:
				'an item whose indented fence holds a blank line, then a one-line item → still tight (the fenced blank is no second block)',
			unreleased: '',
			added: '',
			fragments: [
				changed('changes/a.md', '- a:\n  ```ts\n  const a = 1\n\n  const b = 2\n  ```'),
				changed('changes/b.md', '- b.'),
			],
			section: '- a:\n  ```ts\n  const a = 1\n\n  const b = 2\n  ```\n- b.',
		},
	])('$label', ({ unreleased, added, fragments, section }) => {
		expect(
			foldChangelog({
				text: `${HEAD}\n## [Unreleased]\n\n${unreleased}${OLD_RELEASE}`,
				version: '0.8.0',
				date: '2026-11-16',
				fragments,
			}),
		).toEqual({
			text: `${HEAD}\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n${added}### Changed\n\n${section}\n\n${OLD_RELEASE}`,
		})
	})

	it.each([
		{
			label: 'the version is already released',
			text: `${HEAD}\n## [Unreleased]\n\n### Added\n\n- x.\n\n${OLD_RELEASE}`,
			version: '0.7.0',
			refusal: 'CHANGELOG.md already holds version 0.7.0',
		},
		{
			label: 'nothing to release',
			text: `${HEAD}\n## [Unreleased]\n\n${OLD_RELEASE}`,
			version: '0.8.0',
			refusal: 'nothing to release: no fragment and no Unreleased entry',
		},
		{
			label: 'the Unreleased part holding a heading that is no section',
			text: `${HEAD}\n## [Unreleased]\n\n### Improved\n\n- x.\n\n${OLD_RELEASE}`,
			version: '0.8.0',
			refusal:
				'the Unreleased part of CHANGELOG.md: heading "### Improved" is no section: Added, Changed, Deprecated, Removed, Fixed, Security',
		},
	])('$label → refused, nothing folded', ({ text, version, refusal }) => {
		expect(foldChangelog({ text, version, date: '2026-11-16', fragments: [] })).toEqual({ refusal })
	})
})
