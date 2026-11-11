/**
 * A card in sections a person reads before acting: a titled box, each section opened by a
 * `├─ <name> ─┤` rule, a closing rule carrying a short text (too long for it: in the box above
 * a plain closing rule). With a width, the box is exactly that wide: every line wraps inside it
 * with a hanging indent under its text column, never into fewer than `MINIMUM_TEXT_COLUMNS`
 * columns (the hang reduced, a stacked line's text put under its lead), a word wider than the
 * room cut (no character lost), or a line marked so cut to one row with `…` when the cut keeps
 * that room; a mark sits at the right edge of a line's first row. Colour only when asked for,
 * as on a terminal: a line's first word in its emphasis.
 */
import { escapeControlCharacters } from '../print/print.ts'
import { relayedTextOf } from '../print/relayed.ts'
import {
	BOLD_RESET_CODE,
	COLOUR_RESET_CODE,
	CUT_MARK,
	EMPHASIS_CODES,
	DEFAULT_CARD_COLUMNS,
	MINIMUM_TEXT_COLUMNS,
	STACKED_INDENT,
	TRAILING_GAP,
} from './card.constants.ts'

import type { PrintedText } from '../print/print.types.ts'
import type { BoxRow, BoxRule, CardEmphasis, CardLine, SectionCard } from './card.types.ts'

/**
 * The card as printed: every value escaped first (the box is laid out on what prints), then the card's own colour
 * sequences; the boundary keeps those colour sequences and nothing else.
 */
export function renderSectionCard(params: {
	card: SectionCard
	colour: boolean
	/**
	 * The width of the box: every line exactly as wide. Default: as wide as the content, nothing
	 * wrapped.
	 */
	width?: number
}): PrintedText {
	return relayedTextOf(sectionCardLinesOf({ ...params, card: escapedSectionCardOf(params.card) }))
}

/** The card with its title, footer, section names, line texts and marks escaped as the boundary prints them. */
function escapedSectionCardOf(card: SectionCard): SectionCard {
	function escaped(text: string): string {
		return escapeControlCharacters({ text })
	}
	return {
		title: escaped(card.title),
		footer: escaped(card.footer),
		sections: card.sections.map((section) => ({
			...section,
			...(section.name === undefined ? {} : { name: escaped(section.name) }),
			lines: section.lines.map((line) => ({
				...line,
				text: escaped(line.text),
				...(line.trailing === undefined ? {} : { trailing: escaped(line.trailing) }),
			})),
		})),
	}
}

/** The lines of a card whose values are escaped already. */
function sectionCardLinesOf(params: {
	card: SectionCard
	colour: boolean
	width?: number
}): string[] {
	const { card, colour, width } = params
	function style(params: { text: string; emphasis?: CardEmphasis }): string {
		if (!colour || !params.emphasis) return params.text
		const match = /^(\s*)(\S+)([\s\S]*)$/.exec(params.text)
		if (!match) return params.text
		const reset = params.emphasis === 'strong' ? BOLD_RESET_CODE : COLOUR_RESET_CODE
		return `${match[1]}\u001B[${EMPHASIS_CODES[params.emphasis]}m${match[2]}\u001B[${reset}m${match[3]}`
	}
	const title = buildRule({ left: '┌', right: '┐', text: card.title, width, colour })
	const footer = buildRule({ left: '└', right: '┘', text: card.footer, width, colour: false })
	const sections = card.sections.map(function sectionRows(section, index) {
		const rule = section.name
			? buildRule({ left: '├', right: '┤', text: section.name, width, colour: false })
			: undefined
		const rows = section.lines.flatMap((line) => wrapCardLine({ line, width }))
		return {
			rule,
			rows: [...(index === 0 ? title.overflow : []), ...(rule?.overflow ?? []), ...rows],
		}
	})
	const allRows = [...sections.flatMap((section) => section.rows), ...footer.overflow]
	// the box takes 4 columns (`│ `, ` │`); a rule needs its text, 2 spaces and a dash besides
	const inner =
		width === undefined
			? Math.max(
					...allRows.map(rowWidth),
					card.title.length + 2,
					card.footer.length + 2,
					...card.sections.map((section) => (section.name?.length ?? 0) + 2),
				)
			: Math.max(width - 4, 1)
	function boxed(row: BoxRow): string {
		const trailing = row.trailing ?? ''
		return `│ ${style(row)}${' '.repeat(Math.max(inner - row.text.length - trailing.length, 0))}${trailing} │`
	}
	// a footer too long for its rule: its rows under a plain rule of their own, above a plain bottom
	const footerRows = footer.overflow.length
		? [`├${'─'.repeat(inner + 2)}┤`, ...footer.overflow.map(boxed)]
		: []
	return [
		title.border(inner),
		...sections.flatMap((section) => [
			...(section.rule ? [section.rule.border(inner)] : []),
			...section.rows.map(boxed),
		]),
		...footerRows,
		footer.border(inner),
	]
}

/** A rule `<left>─ <text> ─…<right>`; a text too long for it goes in rows under a plain rule. */
function buildRule(params: {
	left: string
	right: string
	text: string
	width: number | undefined
	/** The text in bold (the title on a terminal). */
	colour: boolean
}): BoxRule {
	const { left, right, text } = params
	const fits = params.width === undefined || text.length + 6 <= params.width
	if (fits)
		return {
			border: (innerWidth) =>
				`${left}─ ${params.colour ? `\u001B[${EMPHASIS_CODES.strong}m${text}\u001B[${BOLD_RESET_CODE}m` : text} ${'─'.repeat(innerWidth - text.length - 1)}${right}`,
			overflow: [],
		}
	return {
		border: (innerWidth) => `${left}${'─'.repeat(innerWidth + 2)}${right}`,
		overflow: wrapCardLine({ line: { text, hang: 0 }, width: params.width }),
	}
}

/** The columns a row takes: its text, and its mark at the right edge after the least gap. */
function rowWidth(row: BoxRow): number {
	return row.text.length + (row.trailing ? row.trailing.length + TRAILING_GAP : 0)
}

/**
 * The rows of a card line: as it is without a width, else wrapped to the box's text width (less the
 * room its right-edge mark takes), stacked under its lead when its hang leaves too little room, or cut to
 * one row when the cut keeps enough room after its hang; the mark on the first row.
 */
function wrapCardLine(params: { line: CardLine; width: number | undefined }): BoxRow[] {
	const { line } = params
	const mark = line.trailing ? { trailing: line.trailing } : {}
	if (params.width === undefined) return [{ text: line.text, emphasis: line.emphasis, ...mark }]
	const room = Math.max(
		params.width - 4 - (line.trailing ? line.trailing.length + TRAILING_GAP : 0),
		1,
	)
	const texts = cardLineTexts({ line, room })
	return texts.map((text, index) =>
		index === 0 ? { text, emphasis: line.emphasis, ...mark } : { text },
	)
}

/** The texts of a card line's rows in `room` columns: cut, stacked or wrapped. */
function cardLineTexts(params: { line: CardLine; room: number }): string[] {
	const { line, room } = params
	if (line.cut) {
		const cut = cutText({ text: line.text, width: room })
		const keptAfterHang =
			cut.length - ` ${CUT_MARK}`.length - hangWithin({ hang: line.hang, width: room })
		if (cut === line.text || keptAfterHang >= MINIMUM_TEXT_COLUMNS) return [cut]
	}
	if (line.stack && room - line.hang < MINIMUM_TEXT_COLUMNS) {
		const lead = line.text.slice(0, line.hang).trimEnd()
		const rest = line.text.slice(line.hang).trimStart()
		const indent = ' '.repeat(STACKED_INDENT)
		return [
			...(lead.trim() ? wrapLead({ lead, room }) : []),
			...wrapText({ text: `${indent}${rest}`, hang: STACKED_INDENT, width: room }),
		]
	}
	return wrapText({ text: line.text, hang: line.hang, width: room })
}

/**
 * A stacked line's lead in `room` columns: broken only between its columns (runs of two spaces or more,
 * so `+310 −87` stays together), each continuation row `STACKED_INDENT` columns in; a column wider than
 * its row wrapped by words.
 */
function wrapLead(params: { lead: string; room: number }): string[] {
	const { room } = params
	const indent = ' '.repeat(STACKED_INDENT)
	const parts = params.lead.split(/( {2,})/)
	const rows: string[] = []
	let current = parts[0]
	for (let index = 1; index < parts.length; index += 2) {
		const column = parts[index + 1]
		const joined = `${current}${parts[index]}${column}`
		if (joined.length <= room || !current.trim()) current = joined
		else {
			rows.push(current)
			current = `${indent}${column}`
		}
	}
	rows.push(current)
	return rows.flatMap((row) =>
		row.length <= room ? [row] : wrapText({ text: row, hang: STACKED_INDENT, width: room }),
	)
}

/**
 * The text as it is when it fits `width`, else cut after its last whole word that leaves room for
 * ` …` (a first word too wide for that cut inside it).
 */
function cutText(params: { text: string; width: number }): string {
	const { text, width } = params
	if (text.length <= width) return text
	const suffix = ` ${CUT_MARK}`
	let kept = ''
	let end = 0
	for (const token of text.match(/\s+|\S+/g) ?? []) {
		end += token.length
		if (/^\S/.test(token) && end + suffix.length <= width) kept = text.slice(0, end)
	}
	if (kept.trim()) return `${kept}${suffix}`
	return `${text.slice(0, Math.max(width - CUT_MARK.length, 0))}${CUT_MARK}`
}

/**
 * The text in lines no wider than `width`: broken between words, each continuation line indented
 * by `hang` (less when it would leave fewer than `MINIMUM_TEXT_COLUMNS` columns: the text's own
 * leading spaces then reduced with it), a word wider than the room after the hang on a row of its
 * own `STACKED_INDENT` columns in when it fits there (the next words fill that row), else cut; the
 * leading spaces of the text kept.
 */
export function wrapText(params: { text: string; hang: number; width: number }): string[] {
	const { width } = params
	const hang = hangWithin({ hang: params.hang, width })
	const indent = ' '.repeat(hang)
	const leading = /^\s*/.exec(params.text)?.[0] ?? ''
	const text =
		hang < params.hang && leading.length > hang
			? `${' '.repeat(hang)}${params.text.slice(leading.length)}`
			: params.text
	const lines: string[] = []
	let current = ''
	let started = false
	let space = ''
	for (const token of text.match(/\s+|\S+/g) ?? ['']) {
		if (/^\s/.test(token)) {
			space = token
			continue
		}
		const joined = `${current}${space}${token}`
		if (joined.length <= width) {
			current = joined
			started = true
			space = ''
			continue
		}
		if (started) {
			lines.push(current)
			current = indent
		} else current = `${current}${space}`
		space = ''
		let word = token
		if (started && word.length > width - indent.length && STACKED_INDENT + word.length <= width) {
			current = `${' '.repeat(STACKED_INDENT)}${word}`
			continue
		}
		while (current.length + word.length > width) {
			const room = width - current.length
			if (room <= 0) {
				lines.push(current)
				current = indent
				continue
			}
			lines.push(`${current}${word.slice(0, room)}`)
			word = word.slice(room)
			current = indent
		}
		current = `${current}${word}`
		started = true
	}
	lines.push(current)
	return lines
}

/** A hanging indent within `width`: reduced so that it leaves at least `MINIMUM_TEXT_COLUMNS` columns. */
function hangWithin(params: { hang: number; width: number }): number {
	return Math.max(Math.min(params.hang, params.width - MINIMUM_TEXT_COLUMNS), 0)
}

/** The width a card takes: the terminal's columns, else `$COLUMNS` when set, else the default. */
export function resolveCardColumns(params: {
	terminalColumns: number | undefined
	environmentColumns: string | undefined
}): number {
	if (params.terminalColumns) return params.terminalColumns
	const fromEnvironment = Number(params.environmentColumns)
	return Number.isInteger(fromEnvironment) && fromEnvironment > 0
		? fromEnvironment
		: DEFAULT_CARD_COLUMNS
}
