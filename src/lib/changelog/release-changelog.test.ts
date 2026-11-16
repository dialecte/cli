/** The release fold: the fragments and the Unreleased entries become the new version's section. */
import { foldChangelog } from './release-changelog.ts'

import { describe, expect, it } from 'vitest'

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
