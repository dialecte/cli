/**
 * A terminal the tests write to as a program would: characters wrap at the width (wide ones take two
 * cells, a tab moves to the next multiple of 8), a line feed at the bottom scrolls (the line goes to the
 * scrollback), and the CSI sequences a progress display uses move the cursor, erase lines and set colours.
 */
import { EMOJI_PRESENTATION_BMP, RESET_CODES, TAB_WIDTH } from './emulated-terminal.constants.ts'

import type { Cell, EmulatedRow, EmulatedTerminal } from './emulated-terminal.types.ts'

export function createEmulatedTerminal(params: {
	columns: number
	rows: number
}): EmulatedTerminal {
	let columns = params.columns
	const { rows } = params
	const scrollback: string[] = []
	const grid: Cell[][] = Array.from({ length: rows }, () => [])
	let cursorColumn = 0
	let cursorRow = 0
	let style = ''
	let state: 'text' | 'escape' | 'csi' = 'text'
	let sequence = ''
	let raw = ''
	let maxUsed = 0
	let lastNarrow = false
	let pendingRegional = false
	let bells = 0

	function textOf(row: readonly Cell[]): string {
		let text = ''
		for (let column = 0; column < row.length; column++) text += row[column]?.ch ?? ' '
		return text.trimEnd()
	}
	function lineFeed(): void {
		if (cursorRow === rows - 1) {
			scrollback.push(textOf(grid[0]))
			grid.shift()
			grid.push([])
		} else cursorRow += 1
	}
	function widthOf(ch: string): number {
		const code = ch.codePointAt(0) ?? 0
		const wide =
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x1f300 && code <= 0x1f64f) ||
			(code >= 0x1f680 && code <= 0x1f6ff) ||
			(code >= 0x1f7e0 && code <= 0x1f7eb) ||
			(code >= 0x1f900 && code <= 0x1f9ff) ||
			(code >= 0x1fa70 && code <= 0x1faff) ||
			(code >= 0x20000 && code <= 0x3fffd) ||
			EMOJI_PRESENTATION_BMP.some(([from, to]) => code >= from && code <= to)
		return wide ? 2 : 1
	}
	function put(ch: string): void {
		const code = ch.codePointAt(0) ?? 0
		const regional = code >= 0x1f1e6 && code <= 0x1f1ff
		if (code === 0xfe0f || code === 0x200d || (code >= 0x300 && code <= 0x36f)) {
			// zero width; a variation selector makes the character before it an emoji: two cells
			if (code === 0xfe0f && lastNarrow && cursorColumn < columns) {
				grid[cursorRow][cursorColumn] = { ch: '', style }
				cursorColumn += 1
			}
			lastNarrow = false
			return
		}
		if (regional && pendingRegional) {
			// the second indicator of a flag shares the two cells of the first
			pendingRegional = false
			return
		}
		pendingRegional = regional
		const width = regional ? 2 : widthOf(ch)
		lastNarrow = width === 1
		if (cursorColumn + width > columns) {
			cursorColumn = 0
			lineFeed()
		}
		grid[cursorRow][cursorColumn] = { ch, style }
		if (width === 2) grid[cursorRow][cursorColumn + 1] = { ch: '', style }
		cursorColumn += width
	}
	function clearFrom(params: { row: number; from: number; to: number }): void {
		for (let column = params.from; column < params.to; column++) delete grid[params.row][column]
	}
	function execute(final: string): void {
		const amount = Number(sequence) || 1
		if (final === 'm') style = RESET_CODES.has(sequence) ? '' : sequence
		else if (final === 'K') {
			const mode = sequence === '' ? 0 : Number(sequence)
			if (mode === 2)
				clearFrom({ row: cursorRow, from: 0, to: Math.max(columns, grid[cursorRow].length) })
			else if (mode === 0)
				clearFrom({
					row: cursorRow,
					from: cursorColumn,
					to: Math.max(columns, grid[cursorRow].length),
				})
			else clearFrom({ row: cursorRow, from: 0, to: cursorColumn + 1 })
		} else if (final === 'A') cursorRow = Math.max(0, cursorRow - amount)
		else if (final === 'B') cursorRow = Math.min(rows - 1, cursorRow + amount)
		else if (final === 'G') cursorColumn = Math.min(columns - 1, amount - 1)
		else if (final === 'J') {
			const mode = sequence === '' ? 0 : Number(sequence)
			if (mode === 2)
				for (let row = 0; row < rows; row++) clearFrom({ row, from: 0, to: grid[row].length })
			else {
				clearFrom({
					row: cursorRow,
					from: cursorColumn,
					to: Math.max(columns, grid[cursorRow].length),
				})
				for (let row = cursorRow + 1; row < rows; row++)
					clearFrom({ row, from: 0, to: grid[row].length })
			}
		}
	}
	function feed(ch: string): void {
		if (state === 'escape') {
			if (ch === '[') {
				state = 'csi'
				sequence = ''
				return
			}
			state = 'text'
		} else if (state === 'csi') {
			const code = ch.charCodeAt(0)
			if (code >= 0x30 && code <= 0x3f) {
				sequence += ch
				return
			}
			state = 'text'
			if (code >= 0x40 && code <= 0x7e) {
				execute(ch)
				return
			}
		}
		if (ch === '\u001B') state = 'escape'
		else if (ch === '\u009B') {
			state = 'csi'
			sequence = ''
		} else if (ch === '\u0007') bells += 1
		else if (ch === '\b') cursorColumn = Math.max(0, cursorColumn - 1)
		else if (ch === '\n') {
			cursorColumn = 0
			lineFeed()
		} else if (ch === '\r') cursorColumn = 0
		else if (ch === '\t')
			cursorColumn = Math.min(columns - 1, (Math.floor(cursorColumn / TAB_WIDTH) + 1) * TAB_WIDTH)
		else if (ch.charCodeAt(0) >= 0x20) put(ch)
	}
	function used(): number {
		let last = cursorRow
		for (let row = 0; row < rows; row++) if (textOf(grid[row]) !== '') last = Math.max(last, row)
		return last + 1
	}
	return {
		stream: {
			isTTY: true,
			get columns() {
				return columns
			},
			rows,
			write(text) {
				raw += text
				for (const ch of text) feed(ch)
				maxUsed = Math.max(maxUsed, used())
				return true
			},
		},
		resize(next) {
			columns = next
		},
		transcript() {
			const lines = [...scrollback, ...grid.map(textOf)]
			while (lines.length && lines.at(-1) === '') lines.pop()
			return lines
		},
		screen(): EmulatedRow[] {
			return grid.map((row) => ({
				text: textOf(row),
				styles: Array.from({ length: row.length }, (_unused, column) => row[column]?.style ?? ''),
			}))
		},
		currentStyle: () => style,
		maxUsedRows: () => maxUsed,
		raw: () => raw,
		bells: () => bells,
	}
}
