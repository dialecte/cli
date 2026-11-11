/**
 * A card a person reads before acting: a box, the labels in one column, every value aligned. Plain text
 * (no colour) unless asked for, as when the output is not a terminal.
 */
import { escapeControlCharacters } from '../print/print.ts'
import { relayedTextOf } from '../print/relayed.ts'

import type { PrintedText } from '../print/print.types.ts'
import type { Card } from './card.types.ts'

/**
 * The card as printed: every value escaped first (the box is laid out on what prints), then the card's own bold
 * sequences around the title and labels; the boundary keeps those colour sequences and nothing else.
 */
export function renderCard(params: {
	card: Card
	colour: boolean
	/** The terminal's width: values wrap so that no line is wider. Default: as wide as the content. */
	width?: number
}): PrintedText {
	return relayedTextOf(cardLinesOf({ ...params, card: escapedCardOf(params.card) }))
}

/** The card with its title, labels and lines escaped as the boundary prints them. */
function escapedCardOf(card: Card): Card {
	function escaped(text: string): string {
		return escapeControlCharacters({ text })
	}
	return {
		...card,
		title: escaped(card.title),
		rows: card.rows.map((row) => ({
			...row,
			label: escaped(row.label),
			lines: row.lines.map(escaped),
		})),
	}
}

/** The lines of a card whose values are escaped already. */
function cardLinesOf(params: { card: Card; colour: boolean; width?: number }): string[] {
	const { card, colour } = params
	const labelWidth = Math.max(...card.rows.map((row) => row.label.length))
	// the box takes 4 columns (`│ `, ` │`), the label column and its 2 spaces the rest
	const textWidth =
		params.width === undefined ? undefined : Math.max(params.width - 4 - labelWidth - 2, 1)
	const lines = card.rows.flatMap(function rowLines(row) {
		return row.lines
			.flatMap((text) => (textWidth === undefined ? [text] : wrapText({ text, width: textWidth })))
			.map(function line(text, index) {
				const label = (index === 0 ? row.label : '').padEnd(labelWidth)
				return { label, text }
			})
	})
	const width = Math.max(
		card.title.length + 2,
		...lines.map((line) => line.label.length + 2 + line.text.length),
	)
	function bold(text: string): string {
		return colour ? `\u001B[1m${text}\u001B[22m` : text
	}
	return [
		`┌─ ${bold(card.title)} ${'─'.repeat(width - card.title.length - 1)}┐`,
		...lines.map(
			(line) =>
				`│ ${bold(line.label)}  ${line.text}${' '.repeat(width - line.label.length - 2 - line.text.length)} │`,
		),
		`└${'─'.repeat(width + 2)}┘`,
	]
}

/** The text in lines no wider than `width`: broken at spaces, a word wider than the width cut. */
function wrapText(params: { text: string; width: number }): string[] {
	const { width } = params
	const lines: string[] = []
	let current = ''
	for (const word of params.text.split(' ')) {
		const candidate = current ? `${current} ${word}` : word
		if (candidate.length <= width) {
			current = candidate
			continue
		}
		if (current) lines.push(current)
		let rest = word
		while (rest.length > width) {
			lines.push(rest.slice(0, width))
			rest = rest.slice(width)
		}
		current = rest
	}
	lines.push(current)
	return lines
}
