/** Reading `### <section>` blocks: a fragment's text, or the Unreleased part of the changelog. */
import { lineKinds, unclosedCommentLine } from './changelog-parts.ts'
import {
	CHANGELOG_SECTIONS,
	FRAGMENT_PROBLEMS,
	SECTION_HEADING_PATTERN,
} from './changelog.constants.ts'

import type {
	ChangelogSection,
	SectionEntry,
	SectionsMode,
	SectionsRead,
} from './changelog.types.ts'

/**
 * The sections of `text` in the order written, each one's text trimmed, a heading inside a code fence or an HTML comment being text; or
 * the first problem: a heading that is no changelog section, an empty section, and in a fragment text before the first
 * heading or a repeated section. The Unreleased part (`unreleased`) keeps its text before the first heading (the
 * release's summary) and merges a repeated section into the first. No section at all is `sections: []`.
 *
 * @intent read the changelog entries of a fragment or of the Unreleased part
 * @internal
 */
export function readSections(params: { text: string; mode: SectionsMode }): SectionsRead {
	const opened: { section: ChangelogSection; lines: string[] }[] = []
	const leading: string[] = []
	const lines = params.text.split('\n')
	// a comment that never closes would hide what follows it: refused, never read as text
	if (unclosedCommentLine({ lines }) !== undefined)
		return { problem: FRAGMENT_PROBLEMS.unclosedComment }
	const outside = lineKinds({ lines })
	for (const [index, line] of lines.entries()) {
		const heading = outside[index] ? SECTION_HEADING_PATTERN.exec(line)?.[1] : undefined
		if (heading === undefined) {
			const current = opened.at(-1)
			if (current) current.lines.push(line)
			else if (line.trim() !== '' && params.mode === 'fragment')
				return { problem: FRAGMENT_PROBLEMS.looseText }
			else leading.push(line)
			continue
		}
		const section = sectionNamed({ name: heading })
		if (section === undefined)
			return { problem: FRAGMENT_PROBLEMS.unknownHeading.replace('{heading}', () => heading) }
		opened.push({ section, lines: [] })
	}
	const sections = opened.map((open) => ({
		section: open.section,
		text: open.lines.join('\n').trim(),
	}))
	const empty = sections.find((entry) => entry.text === '')
	if (empty) return { problem: FRAGMENT_PROBLEMS.emptySection.replace('{section}', empty.section) }
	const repeated = sections.find(
		(entry, index) => sections.findIndex((other) => other.section === entry.section) !== index,
	)
	if (repeated && params.mode === 'fragment')
		return { problem: FRAGMENT_PROBLEMS.repeatedSection.replace('{section}', repeated.section) }
	return { sections: mergedSections({ sections }), leading: leading.join('\n').trim() }
}

/** The changelog section of that name; undefined for any other heading. */
function sectionNamed(params: { name: string }): ChangelogSection | undefined {
	return CHANGELOG_SECTIONS.find((section) => section === params.name)
}

/** One entry per section, in first-seen order, a repeated section's text after the first's, a blank line between. */
function mergedSections(params: { sections: readonly SectionEntry[] }): SectionEntry[] {
	const merged: SectionEntry[] = []
	for (const entry of params.sections) {
		const first = merged.find((kept) => kept.section === entry.section)
		if (first) first.text = `${first.text}\n\n${entry.text}`
		else merged.push({ ...entry })
	}
	return merged
}
