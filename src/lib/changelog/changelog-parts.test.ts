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
})
