import {
	ANY_LINE_END_PATTERN,
	RENDERER_COMMENT_PATTERN,
} from '../change-request/change-request.constants.ts'
/**
 * The one reader of a brief's reviewer sections (`sections`): the shape the start, `lot brief` and every render of the
 * change request share. Pure.
 */
import { readMarkdownBlocks } from '../changelog/markdown-blocks.ts'
import {
	DETAILS_CLOSE_PATTERN,
	DETAILS_OPEN_PATTERN,
	LINE_BREAK_PATTERN,
	SECTION_FAULTS,
	SECTION_HEADING_MAX_LENGTH,
	SECTION_KEYS,
	SECTIONS_FIELD,
	SECTIONS_MAX_COUNT,
	SECTIONS_MAX_LENGTH,
	SPACE_RUN_PATTERN,
	TASK_MARKER_PATTERN,
} from './brief.constants.ts'

import type { BriefSection, BriefSectionsRead } from './brief.types.ts'
import type { Refusal } from './store.types.ts'

/**
 * The sections a brief value holds and every refusal of their shape; no sections and no refusal when absent.
 *
 * @intent read a lot's reviewer sections the same way wherever its brief is read
 * @internal
 */
export function sectionsOf(params: { value: unknown }): BriefSectionsRead {
	const { value } = params
	if (value === undefined) return { sections: undefined, refused: [] }
	if (!Array.isArray(value) || value.length > SECTIONS_MAX_COUNT)
		return {
			sections: undefined,
			refused: [shapeFault({ field: SECTIONS_FIELD, detail: SECTION_FAULTS.list })],
		}
	const items = value.map(function itemOf(item: unknown, index) {
		return isSection(item) ? item : index
	})
	const malformed = items.filter((item): item is number => typeof item === 'number')
	if (malformed.length > 0)
		return {
			sections: undefined,
			refused: malformed.map((index) =>
				shapeFault({ field: `${SECTIONS_FIELD}[${index}]`, detail: SECTION_FAULTS.item }),
			),
		}
	const sections = items.filter((item): item is BriefSection => typeof item !== 'number')
	const refused = [
		...sections.flatMap((section, index) => [
			...headingFaults({ sections, index }),
			...sectionTextFaults({ text: section.text, field: `${SECTIONS_FIELD}[${index}].text` }),
		]),
		...lengthFaults(sections),
	]
	return refused.length > 0 ? { sections: undefined, refused } : { sections, refused }
}

/** The text of a heading as two headings are compared: trimmed, spaces folded, lower case. */
export function headingKeyOf(heading: string): string {
	return heading.trim().replace(SPACE_RUN_PATTERN, ' ').toLowerCase()
}

/** Whether a value is a section: an object of exactly a heading and a text, both strings. */
function isSection(value: unknown): value is BriefSection {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const keys = Object.keys(value)
	const record = value as Record<string, unknown>
	return (
		keys.length === SECTION_KEYS.length &&
		SECTION_KEYS.every((key) => typeof record[key] === 'string')
	)
}

/** The faults of the heading of the section at `index`: its form, or a heading an earlier section already holds. */
function headingFaults(params: { sections: readonly BriefSection[]; index: number }): Refusal[] {
	const { heading } = params.sections[params.index]
	const field = `${SECTIONS_FIELD}[${params.index}].heading`
	const trimmed = heading.trim()
	if (
		trimmed === '' ||
		LINE_BREAK_PATTERN.test(heading) ||
		trimmed.startsWith('#') ||
		trimmed.length > SECTION_HEADING_MAX_LENGTH
	)
		return [shapeFault({ field, detail: SECTION_FAULTS.heading })]
	const key = headingKeyOf(heading)
	const earlier = params.sections
		.slice(0, params.index)
		.some((section) => headingKeyOf(section.heading) === key)
	return earlier ? [shapeFault({ field, detail: SECTION_FAULTS.twice })] : []
}

// dialecte-allow duplicate-read: the shape of a section's markdown; briefTextFaults checks its words as public text
/** The faults of a section's text: empty, a renderer line, a block it never closes, a task box. */
function sectionTextFaults(params: { text: string; field: string }): Refusal[] {
	const { text, field } = params
	if (text.trim() === '') return [shapeFault({ field, detail: SECTION_FAULTS.empty })]
	const lines = text.replace(ANY_LINE_END_PATTERN, '\n').split('\n')
	if (lines.some((line) => RENDERER_COMMENT_PATTERN.test(line.trim())))
		return [shapeFault({ field, detail: SECTION_FAULTS.rendererLine })]
	const blocks = readMarkdownBlocks({ text, scanHtml: false })
	if (blocks.unclosedComment !== undefined || blocks.unclosedBlock !== undefined)
		return [shapeFault({ field, detail: SECTION_FAULTS.open })]
	const opened = text.match(DETAILS_OPEN_PATTERN)?.length ?? 0
	const closed = text.match(DETAILS_CLOSE_PATTERN)?.length ?? 0
	if (opened !== closed) return [shapeFault({ field, detail: SECTION_FAULTS.details })]
	if (lines.some((line) => TASK_MARKER_PATTERN.test(line)))
		return [shapeFault({ field, detail: SECTION_FAULTS.taskBox })]
	return []
}

/** The fault of sections longer than `SECTIONS_MAX_LENGTH` characters, headings and texts together. */
function lengthFaults(sections: readonly BriefSection[]): Refusal[] {
	const length = sections.reduce(
		(total, section) => total + section.heading.length + section.text.length,
		0,
	)
	return length > SECTIONS_MAX_LENGTH
		? [shapeFault({ field: SECTIONS_FIELD, detail: SECTION_FAULTS.length })]
		: []
}

/** A shape refusal of `field`, its detail filled with the field. */
function shapeFault(params: { field: string; detail: string }): Refusal {
	return {
		field: params.field,
		rule: 'shape',
		detail: params.detail.replace('{field}', params.field),
	}
}
