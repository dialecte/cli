/** One reader of a changelog's parts: the Unreleased part and each version's section. */
import { readChangelogParts } from './changelog-parts.ts'

import { describe, expect, it } from 'vitest'

describe('readChangelogParts', () => {
	it.each([
		{
			label:
				'an Unreleased heading then a dated version heading → one version part keyed by its version, the Unreleased part apart',
			text: '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- x.\n\n## [1.0.0] - 2026-01-01\n\n### Fixed\n\n- y.\n',
			parts: [
				{ kind: 'unreleased', heading: 2, end: 8 },
				{ kind: 'version', version: '1.0.0', heading: 8, end: 14 },
			],
		},
		{
			label: 'a version heading inside a code fence → text of its part',
			text: '## [1.0.0]\n\n```md\n## [0.1.0]\n```\n',
			parts: [{ kind: 'version', version: '1.0.0', heading: 0, end: 6 }],
		},
		{
			label: 'a version heading inside a column-0 HTML comment → text of its part',
			text: '## [1.0.0]\n\n<!--\n## [0.1.0]\n-->\n',
			parts: [{ kind: 'version', version: '1.0.0', heading: 0, end: 6 }],
		},
		{
			label: 'a version heading inside an HTML comment indented by one space → text of its part',
			text: '## [1.0.0]\n\n <!--\n## [0.1.0]\n -->\n',
			parts: [{ kind: 'version', version: '1.0.0', heading: 0, end: 6 }],
		},
		{
			label:
				'a comment opened under an item, then a column-0 version heading → the comment ends with its item, the heading read',
			text: '## [1.0.0]\n\n- c.\n\n  <!--\n## [0.1.0]\n  -->\n',
			parts: [
				{ kind: 'version', version: '1.0.0', heading: 0, end: 5 },
				{ kind: 'version', version: '0.1.0', heading: 5, end: 8 },
			],
		},
		{
			label: 'two comments that never close, then a version heading → the comments hide nothing',
			text: '<!-- a\n<!-- b\n\n## [1.0.0]\n',
			parts: [{ kind: 'version', version: '1.0.0', heading: 3, end: 5 }],
		},
		{
			label:
				'a released changelog holding a comment opener indented by one space that never closes → it hides no later version',
			text: '# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-22\n\n### Changed\n\n- **Breaking:** hidden\n -->\n- a\n\n <!--\n\n- b\n\n## [0.1.0] - 2026-01-01\n\n### Added\n\n- x\n',
			parts: [
				{ kind: 'unreleased', heading: 2, end: 4 },
				{ kind: 'version', version: '0.2.0', heading: 4, end: 16 },
				{ kind: 'version', version: '0.1.0', heading: 16, end: 22 },
			],
		},
		{
			label:
				'a released changelog holding a column-0 comment that never closes → it hides no later version',
			text: '# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-22\n\n### Changed\n\n- **Breaking:** hidden?\n- a\n\n<!-- todo\n\n- b\n\n## [0.1.0] - 2026-01-01\n\n### Added\n\n- x\n',
			parts: [
				{ kind: 'unreleased', heading: 2, end: 4 },
				{ kind: 'version', version: '0.2.0', heading: 4, end: 15 },
				{ kind: 'version', version: '0.1.0', heading: 15, end: 21 },
			],
		},
		{
			label: 'a version heading indented by one space → a version part, as CommonMark reads it',
			text: '## [Unreleased]\n\n ## [0.1.0] - 2026-01-01\n\n### Added\n\n- x\n',
			parts: [
				{ kind: 'unreleased', heading: 0, end: 2 },
				{ kind: 'version', version: '0.1.0', heading: 2, end: 8 },
			],
		},
		{
			label:
				'a link reference definition among the Unreleased entries → no part ends there, the entries after it stay in it',
			text: '## [Unreleased]\n\n- a [x].\n\n[x]: https://e.example\n\n- **Breaking:** b.\n\n## [0.1.0]\n',
			parts: [
				{ kind: 'unreleased', heading: 0, end: 8 },
				{ kind: 'version', version: '0.1.0', heading: 8, end: 10 },
			],
		},
		{
			label: 'a comment that never closes → it hides nothing: the version heading after it is read',
			text: '## [1.0.0]\n<!--\n## [0.1.0]\n',
			parts: [
				{ kind: 'version', version: '1.0.0', heading: 0, end: 2 },
				{ kind: 'version', version: '0.1.0', heading: 2, end: 4 },
			],
		},
		{
			label: 'an integer version heading → keyed by it',
			text: '## [60]\n\n- a.\n',
			parts: [{ kind: 'version', version: '60', heading: 0, end: 4 }],
		},
		{
			label: 'the same version heading twice → two parts with that key, in order',
			text: '## [0.0.44]\n- a.\n## [0.0.44]\n- b.\n',
			parts: [
				{ kind: 'version', version: '0.0.44', heading: 0, end: 2 },
				{ kind: 'version', version: '0.0.44', heading: 2, end: 5 },
			],
		},
		{
			label:
				'a second bracketless Unreleased heading inside the Unreleased part → still the Unreleased part',
			text: '## [Unreleased]\n- a.\n## Unreleased\n- b.\n## [1.0.0]\n',
			parts: [
				{ kind: 'unreleased', heading: 0, end: 4 },
				{ kind: 'version', version: '1.0.0', heading: 4, end: 6 },
			],
		},
		{
			label:
				'a second bracketed Unreleased heading → ends the first Unreleased part, as the release fold reads it today',
			text: '## [Unreleased]\n- a.\n## [Unreleased]\n- b.\n## [1.0.0]\n',
			parts: [
				{ kind: 'unreleased', heading: 0, end: 2 },
				{ kind: 'unreleased', heading: 2, end: 4 },
				{ kind: 'version', version: '1.0.0', heading: 4, end: 6 },
			],
		},
	])('$label', ({ text, parts }) => {
		expect(readChangelogParts({ text }).parts).toEqual(parts)
	})

	it.each([
		{
			label: 'a link block at the end of the changelog',
			text: '## [1.0.0]\n\n- a\n\n[1.0.0]: https://e.example/1.0.0\n',
			linkLine: 4,
		},
		{
			label: 'a link block followed by a closing comment',
			text: '## [0.1.0]\n\n- x\n\n[unreleased]: https://e.example/u\n[0.1.0]: https://e.example/0\n\n<!-- end -->\n',
			linkLine: 4,
		},
		{
			label: 'a link reference line inside an item paragraph (no blank line before it)',
			text: '## [0.1.0]\n\n- x\n[x]: https://e.example\n',
			linkLine: undefined,
		},
		{
			label: 'a link reference definition among entries, no link block at the end',
			text: '## [1.0.0]\n\n- a [x].\n\n[x]: https://e.example\n\n- b.\n',
			linkLine: undefined,
		},
	])('$label → the link block starts at line $linkLine', ({ text, linkLine }) => {
		expect(readChangelogParts({ text }).linkLine).toBe(linkLine)
	})

	it.each([
		{
			label: 'a link line between an entry and trailing text',
			text: '## [0.1.0]\n\n- x\n\n[0.1.0]: https://e.example/v0.1.0\n\nFooter text.\n',
			lines: [4],
		},
		{
			label: 'a definition with its title on the next line',
			text: '## [0.1.0]\n\n- x\n\n[a]: https://e.example\n  "title"\n',
			lines: [4, 5],
		},
		{
			label: 'a definition line inside an item paragraph (no blank line before it)',
			text: '## [0.1.0]\n\n- x\n[x]: https://e.example\n',
			lines: [],
		},
	])('$label → definition lines $lines', ({ text, lines }) => {
		expect([...readChangelogParts({ text }).definitionLines]).toEqual(lines)
	})
})
