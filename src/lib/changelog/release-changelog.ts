/** The release fold: the Unreleased entries and the fragments become the new version's section of the changelog. */
import { readChangelogParts } from './changelog-parts.ts'
import {
	CHANGELOG_SECTIONS,
	FOLD_REFUSALS,
	UNRELEASED_HEADING,
	UNRELEASED_SOURCE,
} from './changelog.constants.ts'
import { breakingFirst, sectionItemsOf } from './section-items.ts'
import { readSections, reorderedProblem } from './sections.ts'

import type {
	ChangelogParts,
	FoldResult,
	Fragment,
	OrderedSection,
	SourcedEntry,
	SectionEntry,
	SectionsRead,
} from './changelog.types.ts'

/**
 * `text` (a changelog, LF or CRLF) with `## [<version>] - <date>` written under an emptied `## [Unreleased]`: the
 * Unreleased part's summary (its text before the first section) first, then each section in the changelog's order,
 * holding the Unreleased entries, then each fragment's in the fragments' order, its breaking items lifted first and
 * its blocks joined as a markdown formatter leaves them. A changelog with no
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
		...unreleased.sections.map((entry) => ({ ...entry, source: UNRELEASED_SOURCE })),
		...params.fragments.flatMap((fragment) =>
			fragment.sections.map((entry) => ({ ...entry, source: fragment.file })),
		),
	]
	if (entries.length === 0 && unreleased.leading === '') return { refusal: FOLD_REFUSALS.nothing }
	const sections = orderedSections({ entries })
	const refused = sections
		.map((entry) => reorderRefusalOf({ entry }))
		.find((refusal) => refusal !== undefined)
	if (refused !== undefined) return { refusal: refused }
	const release = [
		`## [${params.version}] - ${params.date}`,
		'',
		...(unreleased.leading === '' ? [] : [unreleased.leading, '']),
		...sections.flatMap((entry) =>
			'text' in entry.ordered ? [`### ${entry.section}`, '', entry.ordered.text, ''] : [],
		),
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

/**
 * Each section that holds entries, in the changelog's order, with its blocks (each entry read on its own) ordered
 * breaking first, or the block that order would read otherwise.
 */
function orderedSections(params: { entries: readonly SourcedEntry[] }): OrderedSection[] {
	return CHANGELOG_SECTIONS.flatMap(function orderedSection(section): OrderedSection[] {
		const sourced = params.entries
			.filter((entry) => entry.section === section)
			.flatMap((entry) =>
				sectionItemsOf({ text: entry.text }).map((block) => [block, entry.source] as const),
			)
		if (sourced.length === 0) return []
		const blocks = sourced.map(([block]) => block)
		return [{ section, ordered: breakingFirst({ blocks }), sources: new Map(sourced) }]
	})
}

/**
 * The refusal of a section whose joined blocks read otherwise, naming the file the block comes from and, when another,
 * the file of the block it joins; undefined when the section joins cleanly.
 */
function reorderRefusalOf(params: { entry: OrderedSection }): string | undefined {
	const { entry } = params
	const { ordered, sources } = entry
	if (!('moved' in ordered)) return undefined
	const from = sources.get(ordered.moved) ?? ''
	const after = ordered.after === undefined ? undefined : sources.get(ordered.after)
	return FOLD_REFUSALS.reorderedFrom
		.replace('{problem}', () => reorderedProblem({ section: entry.section, moved: ordered.moved }))
		.replace('{sources}', () =>
			after === undefined || after === from ? from : `${from}, after ${after}`,
		)
}

function trimTrailingBlank(params: { lines: readonly string[] }): string[] {
	const kept = [...params.lines]
	while (kept.length > 0 && kept.at(-1)?.trim() === '') kept.pop()
	return kept
}
