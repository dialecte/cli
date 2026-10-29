/**
 * A card a person reads before acting: a box, the labels in one column, every value aligned. Plain text
 * (no colour) unless asked for, as when the output is not a terminal.
 */
import type { Card } from './card.types.ts'

export function renderCard(params: { card: Card; colour: boolean }): string {
	const { card, colour } = params
	const labelWidth = Math.max(...card.rows.map((row) => row.label.length))
	const lines = card.rows.flatMap(function rowLines(row) {
		return row.lines.map(function line(text, index) {
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
	].join('\n')
}
