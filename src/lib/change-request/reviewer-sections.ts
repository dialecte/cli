/**
 * A lot's reviewer sections in its change request body (the brief's `sections`): their lines, under headings at the level
 * of the template heading above them, and the clash with the template that refuses them. Pure.
 */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { headingKeyOf } from '../store/brief-sections.ts'
import {
	ANY_LINE_END_PATTERN,
	CHANGE_REQUEST_LINES,
	DEFAULT_SECTION_LEVEL,
	ATX_HEADING_PATTERN,
	TRAILING_SPACE_PATTERN,
} from './change-request.constants.ts'

import type { HostNouns } from '../host/host.types.ts'
import type { BriefSection } from '../store/brief.types.ts'

/**
 * The lines of the sections placed below `lines[at - 1]`: each a heading at the level of the nearest heading line above
 * `at` (`DEFAULT_SECTION_LEVEL` with none), a blank line, its text with its line ends read as `\n` and its trailing blank
 * lines dropped; one blank line between two sections. No line for no section.
 *
 * @intent show a lot's reviewer sections verbatim where its template places them
 * @internal
 */
export function sectionLinesOf(params: {
	sections: readonly BriefSection[]
	/** The template's lines. */
	lines: readonly string[]
	/** The index of the template line the sections stand for (the marker, else the kept marker). */
	at: number
}): string[] {
	const level = levelAbove({ lines: params.lines, at: params.at })
	return params.sections.flatMap(function sectionLines(section, index) {
		const text = section.text
			.replace(ANY_LINE_END_PATTERN, '\n')
			.replace(TRAILING_SPACE_PATTERN, '')
			.split('\n')
		return [
			...(index === 0 ? [] : ['']),
			`${'#'.repeat(level)} ${section.heading.trim()}`,
			'',
			...text,
		]
	})
}

/**
 * Why the sections cannot render over `template`: a heading whose text is a heading of the template (those after the
 * kept marker included), or a text line equal to the line the kept part starts at (`anchor`); undefined otherwise.
 *
 * @intent keep a section from passing for the template's own part or moving the kept part
 * @internal
 */
export function sectionClashOf(params: {
	sections: readonly BriefSection[]
	/** The template's lines. */
	lines: readonly string[]
	/** The first line after the kept marker: where the kept part of a body starts. */
	anchor: string | undefined
	nouns: HostNouns
}): string | undefined {
	const headings = params.lines.flatMap(function headingOf(line) {
		const text = ATX_HEADING_PATTERN.exec(line.trim())?.[2]
		return text === undefined ? [] : [text]
	})
	for (const [index, section] of params.sections.entries()) {
		const clash = headings.find(
			(heading) => headingKeyOf(heading) === headingKeyOf(section.heading),
		)
		if (clash !== undefined)
			return fillMessage({
				template: CHANGE_REQUEST_LINES.sectionHeadingClash,
				values: { ...params.nouns, index: String(index), heading: clash },
			})
		const anchor = params.anchor?.trim()
		const moves = section.text
			.replace(ANY_LINE_END_PATTERN, '\n')
			.split('\n')
			.some((line) => anchor !== undefined && line.trim() === anchor)
		if (moves && anchor !== undefined)
			return fillMessage({
				template: CHANGE_REQUEST_LINES.sectionKeptLine,
				values: { ...params.nouns, index: String(index), line: anchor },
			})
	}
	return undefined
}

/** The level of the nearest heading line above `at`; `DEFAULT_SECTION_LEVEL` when none stands above it. */
function levelAbove(params: { lines: readonly string[]; at: number }): number {
	const above = params.lines
		.slice(0, params.at)
		.map((line) => ATX_HEADING_PATTERN.exec(line.trim())?.[1])
		.filter((marks): marks is string => marks !== undefined)
		.at(-1)
	return above?.length ?? DEFAULT_SECTION_LEVEL
}
