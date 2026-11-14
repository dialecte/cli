import { parseCaption } from './parse-caption.ts'
import { parseHeadingCandidate } from './parse-heading-candidate.ts'
import {
	ANNEX_HEADING_PATTERN,
	ANNEX_SUB_HEADING_PATTERN,
	CODE_LINE_START,
	DEFINITION_PATTERN,
	DOT_LEADER_PATTERN,
	FENCE_MARKER,
	HEADING_MARKER_PATTERN,
	LEADING_MARKERS_PATTERN,
	LETTER_SPACED_MINIMUM_SHARE,
	LETTER_SPACED_MINIMUM_TOKENS,
	LIST_ITEM_PATTERN,
	NUMBERED_HEADING_PATTERN,
	TABLE_LINE_START,
	TERMS_TITLE_PATTERN,
	WHITESPACE_PATTERN,
	WIDE_GAP_PATTERN,
	WRAPPING_MARKERS,
} from './standard-index.constants.ts'

import type { StandardClassifiedLine, StandardClassifyState } from './standard-index.types.ts'

/**
 * Classifies each original line on its own, in file order: blank, table, code (an angle bracket first,
 * or inside a fence), then on the line without its leading markdown markers: toc (a heading-shaped
 * line with a dot leader), caption, definition (inside the terms clause), heading candidate, prose. A
 * letter-spaced prose line is rebuilt and classified again. The terms clause runs from a top-level
 * candidate whose title starts with the terms word to the next top-level candidate.
 *
 * The heading style is the file's own: when one of its top-level numbered candidates is marked (`#`) or
 * written without a dot (`1 Title`), its unmarked one-part dotted lines (`1. `) are markdown list items
 * (prose, flagged `listItem` when they were heading-shaped); when none is, they are ordinary candidates.
 */
export function classifyStandardLines(params: { lines: string[] }): StandardClassifiedLine[] {
	const asCandidates = classifyAll({ lines: params.lines, listItems: false })
	const otherStyle = asCandidates.some(
		(classified, index) =>
			classified.candidate?.depth === 1 &&
			classified.candidate.top !== null &&
			(HEADING_MARKER_PATTERN.test(params.lines[index].trim()) ||
				!LIST_ITEM_PATTERN.test(classified.content)),
	)
	return otherStyle ? classifyAll({ lines: params.lines, listItems: true }) : asCandidates
}

function classifyAll(params: { lines: string[]; listItems: boolean }): StandardClassifiedLine[] {
	const classified: StandardClassifiedLine[] = []
	let state: StandardClassifyState = {
		inFence: false,
		termsClause: null,
		listItems: params.listItems,
	}
	for (const [index, original] of params.lines.entries()) {
		const next = classifyLine({ original, line: index + 1, state })
		classified.push(next.classified)
		state = next.state
	}
	return classified
}

/** The line classified, and the state the next line starts from. */
function classifyLine(params: { original: string; line: number; state: StandardClassifyState }): {
	classified: StandardClassifiedLine
	state: StandardClassifyState
} {
	const { line, state } = params
	const trimmed = params.original.trim()
	if (state.inFence || trimmed.startsWith(FENCE_MARKER)) {
		const inFence = trimmed.startsWith(FENCE_MARKER) ? !state.inFence : state.inFence
		return {
			classified: lineOf({ line, content: trimmed, kind: 'code' }),
			state: { ...state, inFence },
		}
	}
	if (trimmed.startsWith(TABLE_LINE_START))
		return { classified: lineOf({ line, content: trimmed, kind: 'table' }), state }
	if (trimmed.startsWith(CODE_LINE_START))
		return { classified: lineOf({ line, content: trimmed, kind: 'code' }), state }
	const content = stripMarkdownMarkers(trimmed)
	if (content.length === 0) return { classified: lineOf({ line, content, kind: 'blank' }), state }
	const listItems = state.listItems && !HEADING_MARKER_PATTERN.test(trimmed)
	const classified = classifyContent({ content, line, termsClause: state.termsClause, listItems })
	const settled =
		classified.kind === 'prose' && !classified.listItem && isLetterSpaced(content)
			? classifyRebuilt({ content: rebuildLetterSpaced(content), line, state, listItems })
			: classified
	if (settled.candidate?.depth !== 1) return { classified: settled, state }
	const termsClause = TERMS_TITLE_PATTERN.test(settled.candidate.title)
		? settled.candidate.number
		: null
	return { classified: settled, state: { ...state, termsClause } }
}

function classifyRebuilt(params: {
	content: string
	line: number
	state: StandardClassifyState
	listItems: boolean
}): StandardClassifiedLine {
	const { content, line, state, listItems } = params
	if (content.startsWith(CODE_LINE_START)) return lineOf({ line, content, kind: 'code' })
	return classifyContent({ content, line, termsClause: state.termsClause, listItems })
}

/**
 * `listItems`: the file writes its headings in another style and this line has no `#` marker, so a one-part
 * number followed by a dot and whitespace is a markdown ordered list item: prose, never a heading candidate.
 */
function classifyContent(params: {
	content: string
	line: number
	termsClause: string | null
	listItems: boolean
}): StandardClassifiedLine {
	const { content, line, termsClause } = params
	if (DOT_LEADER_PATTERN.test(content) && isHeadingShaped(content))
		return lineOf({ line, content, kind: 'toc' })
	if (parseCaption(content)) return lineOf({ line, content, kind: 'caption' })
	if (termsClause !== null) {
		const definition = DEFINITION_PATTERN.exec(content)
		if (definition && definition[1] === termsClause)
			return {
				...lineOf({ line, content, kind: 'definition' }),
				definition: { number: `${definition[1]}${definition[2]}`, term: definition[3] ?? '' },
			}
	}
	const candidate = parseHeadingCandidate({ content, line })
	if (params.listItems && LIST_ITEM_PATTERN.test(content))
		return { ...lineOf({ line, content, kind: 'prose' }), listItem: candidate !== null }
	if (candidate) return { ...lineOf({ line, content, kind: 'heading' }), candidate }
	return lineOf({ line, content, kind: 'prose' })
}

function lineOf(params: {
	line: number
	content: string
	kind: StandardClassifiedLine['kind']
}): StandardClassifiedLine {
	return { ...params, candidate: null, definition: null, listItem: false }
}

/** The line without its leading `#` runs and `>` markers, and without a `**` or `__` wrapping it whole. */
function stripMarkdownMarkers(trimmed: string): string {
	const unmarked = trimmed.replace(LEADING_MARKERS_PATTERN, '')
	for (const marker of WRAPPING_MARKERS)
		if (
			unmarked.length > marker.length * 2 &&
			unmarked.startsWith(marker) &&
			unmarked.endsWith(marker)
		)
			return unmarked.slice(marker.length, -marker.length).trim()
	return unmarked
}

function isHeadingShaped(content: string): boolean {
	return (
		ANNEX_HEADING_PATTERN.test(content) ||
		NUMBERED_HEADING_PATTERN.test(content) ||
		ANNEX_SUB_HEADING_PATTERN.test(content)
	)
}

/** At least the minimum number of tokens, and the minimum share of them one character long. */
function isLetterSpaced(content: string): boolean {
	const tokens = content.split(WHITESPACE_PATTERN)
	if (tokens.length < LETTER_SPACED_MINIMUM_TOKENS) return false
	const single = tokens.filter((token) => token.length === 1).length
	return single >= tokens.length * LETTER_SPACED_MINIMUM_SHARE
}

/** Words apart by two spaces or more, the single spaces inside each removed; else every space removed. */
function rebuildLetterSpaced(content: string): string {
	return content
		.split(WIDE_GAP_PATTERN)
		.map((word) => word.split(WHITESPACE_PATTERN).join(''))
		.join(' ')
}
