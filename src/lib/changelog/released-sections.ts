/** The released-section verdict: what a change did to the sections of versions already released. */
import { readChangelogParts } from './changelog-parts.ts'

import type {
	ChangelogParts,
	ReleasedSectionChange,
	ReleasedSectionTexts,
	VersionSection,
} from './changelog.types.ts'

/**
 * The released sections of `checked` the change altered, judged against `tip` (the base branch) and, when given,
 * `mergeBase` (where the change left it). A version `tip` holds is altered when `checked` holds other lines than
 * `tip` and than `mergeBase`, or lacks it while `mergeBase` (or a two-way call) holds it. A version `tip` lacks is
 * new and not judged. A heading `checked` holds more times than `tip` is a duplicate; the k-th copy of a version is
 * compared with the k-th copy of the others. Lines compare with trailing spaces and a section's trailing blank lines
 * dropped.
 *
 * @intent tell which released changelog sections a change altered
 * @internal
 */
export function releasedSectionChanges(params: ReleasedSectionTexts): ReleasedSectionChange[] {
	if (params.tip === undefined) return []
	// a checked state without the file (deleted) holds no section: each one the base released reads as removed
	const checked = readChangelogParts({ text: params.checked ?? '' })
	const tip = versionSectionsOf({ read: readChangelogParts({ text: params.tip }) })
	const twoWay = !('mergeBase' in params) || params.mergeBase === undefined
	const mergeBase =
		params.mergeBase === undefined
			? []
			: versionSectionsOf({ read: readChangelogParts({ text: params.mergeBase }) })
	const sections = versionSectionsOf({ read: checked })
	const judged = tip.flatMap(function judgeSection(section): ReleasedSectionChange[] {
		const own = copyOf({ sections, of: section })
		const before = copyOf({ sections: mergeBase, of: section })
		if (own === undefined) {
			if (!twoWay && before === undefined) return []
			return [
				{
					kind: 'removed',
					version: section.version,
					line: removedLineOf({ sections, tip, removed: section, lineCount: checked.lines.length }),
					removed: section.lines.length,
				},
			]
		}
		if (sameLines({ left: own.lines, right: section.lines })) return []
		if (before !== undefined && sameLines({ left: own.lines, right: before.lines })) return []
		return [changeOf({ own, tip: section })]
	})
	return [...judged, ...duplicatesOf({ sections, tip })]
}

/** Each version's section of a changelog read, with its copy rank and its lines normalised for comparison. */
function versionSectionsOf(params: { read: ChangelogParts }): VersionSection[] {
	const { read } = params
	return read.parts.flatMap(function sectionOf(part, index): VersionSection[] {
		if (part.kind !== 'version') return []
		const copy = read.parts
			.slice(0, index)
			.filter((earlier) => earlier.kind === 'version' && earlier.version === part.version).length
		return [
			{
				version: part.version,
				copy,
				heading: part.heading,
				lines: normalisedLines({ lines: read.lines.slice(part.heading, part.end) }),
			},
		]
	})
}

/** A section's lines with trailing spaces trimmed and its trailing blank lines dropped. */
function normalisedLines(params: { lines: readonly string[] }): string[] {
	const trimmed = params.lines.map((line) => line.trimEnd())
	const end = trimmed.reduce((last, line, index) => (line === '' ? last : index + 1), 0)
	return trimmed.slice(0, end)
}

/** The copy of the same version and rank in `sections`. */
function copyOf(params: {
	sections: readonly VersionSection[]
	of: VersionSection
}): VersionSection | undefined {
	return params.sections.find(
		(section) => section.version === params.of.version && section.copy === params.of.copy,
	)
}

/** Whether two sections hold the same lines in the same order. */
function sameLines(params: { left: readonly string[]; right: readonly string[] }): boolean {
	const { left, right } = params
	return left.length === right.length && left.every((line, index) => line === right[index])
}

/**
 * The change of a section: the lines added and removed against the tip's (a line multiset difference), reordered when
 * both are none, at the first line differing from the tip's.
 */
function changeOf(params: { own: VersionSection; tip: VersionSection }): ReleasedSectionChange {
	const { own, tip } = params
	const added = unmatchedCount({ lines: own.lines, against: tip.lines })
	const removed = unmatchedCount({ lines: tip.lines, against: own.lines })
	const differing = own.lines.findIndex((line, index) => line !== tip.lines[index])
	const offset = differing === -1 ? own.lines.length : differing
	return {
		kind: 'changed',
		version: own.version,
		line: own.heading + offset + 1,
		added,
		removed,
		reordered: added === 0 && removed === 0,
	}
}

/** How many of `lines` find no equal line left in `against`, each line of `against` matched once. */
function unmatchedCount(params: { lines: readonly string[]; against: readonly string[] }): number {
	const { lines, against } = params
	return [...new Set(lines)].reduce(function addUnmatched(sum, line) {
		const extra =
			lines.filter((own) => own === line).length - against.filter((other) => other === line).length
		return sum + Math.max(0, extra)
	}, 0)
}

/**
 * Where a removed section would stand in the checked text: the heading of the next section of the tip the checked
 * text still holds, else its last line.
 */
function removedLineOf(params: {
	sections: readonly VersionSection[]
	tip: readonly VersionSection[]
	removed: VersionSection
	lineCount: number
}): number {
	const later = params.tip.slice(params.tip.indexOf(params.removed) + 1)
	const next = later
		.map((section) => copyOf({ sections: params.sections, of: section }))
		.find((section) => section !== undefined)
	return next === undefined ? params.lineCount : next.heading + 1
}

/** A version heading the checked text holds more times than the tip: one finding at its first extra copy. */
function duplicatesOf(params: {
	sections: readonly VersionSection[]
	tip: readonly VersionSection[]
}): ReleasedSectionChange[] {
	return params.sections.flatMap(function duplicateOf(section): ReleasedSectionChange[] {
		const tipCopies = params.tip.filter((other) => other.version === section.version).length
		if (section.copy !== Math.max(tipCopies, 1)) return []
		return [{ kind: 'duplicated', version: section.version, line: section.heading + 1 }]
	})
}
