/** The release fold: the Unreleased entries and the fragments become the new version's section of the changelog. */
import { readChangelogParts } from './changelog-parts.ts'
import { CHANGELOG_SECTIONS, FOLD_REFUSALS, UNRELEASED_HEADING } from './changelog.constants.ts'
import { readSections } from './sections.ts'

import type {
	ChangelogParts,
	FoldResult,
	Fragment,
	SectionEntry,
	SectionsRead,
} from './changelog.types.ts'

/**
 * `text` (a changelog, LF or CRLF) with `## [<version>] - <date>` written under an emptied `## [Unreleased]`: the
 * Unreleased part's summary (its text before the first section) first, then each section in the changelog's order,
 * holding the Unreleased entries, then each fragment's in the fragments' order, one per line. A changelog with no
 * Unreleased heading gets one above its first version (or its link block, or at its end). Refused when the version is
 * already there, the Unreleased part cannot be read, or there is nothing to release.
 *
 * @intent write a release's changelog section from the fragments
 * @internal
 */
export function foldChangelog(params: {
	text: string
	version: string
	date: string
	fragments: readonly Fragment[]
}): FoldResult {
	const read = readChangelogParts({ text: params.text })
	const { lines } = read
	if (read.parts.some((part) => part.kind === 'version' && part.version === params.version))
		return { refusal: FOLD_REFUSALS.released.replace('{version}', params.version) }
	const part = unreleasedPart({ read })
	const unreleased = readUnreleased({ lines: lines.slice(part.from, part.to) })
	if ('problem' in unreleased)
		return { refusal: FOLD_REFUSALS.unreleased.replace('{problem}', unreleased.problem) }
	const entries = [
		...unreleased.sections,
		...params.fragments.flatMap((fragment) => fragment.sections),
	]
	if (entries.length === 0 && unreleased.leading === '') return { refusal: FOLD_REFUSALS.nothing }
	const release = [
		`## [${params.version}] - ${params.date}`,
		'',
		...(unreleased.leading === '' ? [] : [unreleased.leading, '']),
		...renderSections({ entries }),
	]
	const before = trimTrailingBlank({ lines: lines.slice(0, part.heading) })
	return {
		text: [
			...before,
			...(before.length > 0 ? [''] : []),
			UNRELEASED_HEADING,
			'',
			...release,
			...lines.slice(part.to),
		].join('\n'),
	}
}

/**
 * The Unreleased part of the changelog `text` read as `foldChangelog` reads it: its summary and its sections (a
 * repeated section merged), or the problem that refuses a release.
 *
 * @intent check the Unreleased part before a release folds it
 * @internal
 */
export function readUnreleasedOf(params: { text: string }): SectionsRead {
	const read = readChangelogParts({ text: params.text })
	const part = unreleasedPart({ read })
	return readUnreleased({ lines: read.lines.slice(part.from, part.to) })
}

/**
 * Where the Unreleased part is: its heading line (`heading`, where a missing one is inserted), its first and its
 * end line (excluded), as the parts reader cut it. With no Unreleased heading, the insertion point is the first
 * version heading or the link block, whichever comes first, else the end.
 */
function unreleasedPart(params: { read: ChangelogParts }): {
	heading: number
	from: number
	to: number
} {
	const { read } = params
	const found = read.parts.find((part) => part.kind === 'unreleased')
	if (found) return { heading: found.heading, from: found.heading + 1, to: found.end }
	const at = Math.min(
		read.parts[0]?.heading ?? read.lines.length,
		read.linkLine ?? read.lines.length,
	)
	return { heading: at, from: at, to: at }
}

function readUnreleased(params: { lines: readonly string[] }): SectionsRead {
	return readSections({ text: params.lines.join('\n'), mode: 'unreleased' })
}

/** Each section that holds entries, in the changelog's order: its heading, a blank line, its entries, a blank line. */
function renderSections(params: { entries: readonly SectionEntry[] }): string[] {
	return CHANGELOG_SECTIONS.flatMap(function sectionLines(section) {
		const texts = params.entries
			.filter((entry) => entry.section === section)
			.map((entry) => entry.text)
		return texts.length === 0 ? [] : [`### ${section}`, '', texts.join('\n'), '']
	})
}

function trimTrailingBlank(params: { lines: readonly string[] }): string[] {
	const kept = [...params.lines]
	while (kept.length > 0 && kept.at(-1)?.trim() === '') kept.pop()
	return kept
}
