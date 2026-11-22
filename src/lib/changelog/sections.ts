/** Reading `### <section>` blocks: a fragment's text, or the Unreleased part of the changelog. */
import {
	CHANGELOG_SECTIONS,
	FRAGMENT_PROBLEMS,
	SECTION_HEADING_MARKUP,
	SHOWN_HTML_LENGTH,
} from './changelog.constants.ts'
import { readMarkdownBlocks } from './markdown-blocks.ts'

import type {
	ChangelogSection,
	SectionEntry,
	MarkdownBlocks,
	SectionsMode,
	SectionsRead,
} from './changelog.types.ts'

/**
 * The sections of `text` in the order written, each one's text trimmed; a section heading is a top-level level-3 ATX
 * heading as CommonMark reads it (one inside a fence, an HTML block, a list or a quote is text), its name the heading's
 * text. Or the first problem: an HTML comment, a code fence or an HTML block that never closes (it would hide what
 * follows it once folded), raw HTML a block or item holds other than whole comments and balanced bare inert tags, a heading that is no changelog section, an empty section, and in a fragment text before
 * the first heading or a repeated section. The Unreleased part (`unreleased`) keeps its text before the first heading (the
 * release's summary) and merges a repeated section into the first. No section at all is `sections: []`.
 *
 * @intent read the changelog entries of a fragment or of the Unreleased part
 * @internal
 */
export function readSections(params: { text: string; mode: SectionsMode }): SectionsRead {
	const opened: { section: ChangelogSection; lines: string[] }[] = []
	const leading: string[] = []
	const blocks = readMarkdownBlocks({ text: params.text })
	const unclosed = unclosedProblemOf({ blocks })
	if (unclosed !== undefined) return { problem: unclosed }
	const headings = sectionHeadingsOf({ blocks })
	for (const [index, line] of blocks.lines.entries()) {
		const heading = headings.get(index)
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

/** Why a text is refused before its sections are read: something opened in it never closes; undefined otherwise. */
function unclosedProblemOf(params: { blocks: MarkdownBlocks }): string | undefined {
	const { blocks } = params
	if (blocks.unclosedComment !== undefined) return FRAGMENT_PROBLEMS.unclosedComment
	if (blocks.unclosedBlock === 'fence') return FRAGMENT_PROBLEMS.unclosedFence
	if (blocks.unclosedBlock === 'html') return FRAGMENT_PROBLEMS.unclosedHtml
	if (blocks.unclosedBlock === 'nesting')
		return FRAGMENT_PROBLEMS.tooDeep.replace('{levels}', String(blocks.maxNesting))
	if (blocks.unclosedBlock === 'open-html') {
		const piece = shownPiece({ piece: blocks.openHtml ?? '' })
		return FRAGMENT_PROBLEMS.openHtml.replace('{piece}', () => piece)
	}
	return undefined
}

/** A refused HTML piece on one line: white space runs collapsed, cut with `…` past the shown length. */
function shownPiece(params: { piece: string }): string {
	const line = params.piece.replace(/\s+/g, ' ').trim()
	return line.length > SHOWN_HTML_LENGTH ? `${line.slice(0, SHOWN_HTML_LENGTH - 1)}…` : line
}

/** Each section heading's line and its name: the top-level `###` headings, named by their inline text. */
function sectionHeadingsOf(params: { blocks: MarkdownBlocks }): Map<number, string> {
	const { tokens } = params.blocks
	const headings = new Map<number, string>()
	for (const [index, token] of tokens.entries()) {
		const line = token.map?.[0]
		if (token.type !== 'heading_open' || token.level !== 0 || line === undefined) continue
		if (token.markup === SECTION_HEADING_MARKUP)
			headings.set(line, tokens[index + 1]?.content ?? '')
	}
	return headings
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
