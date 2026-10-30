/** The live region on a real terminal's rules: what one line takes on screen, what a redraw leaves behind. */
import { createEmulatedTerminal } from '../../../test/emulated-terminal.ts'
import { createStreamLiveOutput } from './stream-live-output.ts'

import { describe, expect, it } from 'vitest'

const SPINNER = '⠋ step 1.0 s'

/** An escape that does not end in a command letter before the next one (a cut sequence). */
function hasCutEscape(raw: string): boolean {
	const escape = '\u001B'
	for (let at = raw.indexOf(escape); at !== -1; at = raw.indexOf(escape, at + 1))
		if (!/^\[[0-9;]*[A-Za-z]/.test(raw.slice(at + 1))) return true
	return false
}

describe('the live region on a terminal', () => {
	it('a hook line holding tabs → counted by where its tabs take the text, one row per region line, the result replaces the whole region', () => {
		const terminal = createEmulatedTerminal({ columns: 20, rows: 12 })
		const output = createStreamLiveOutput(terminal.stream)

		output.rewriteLines([SPINNER, '  │ x\t\tfoo bar baz', '  │ y\t\tqux quux corge'])
		const used = terminal.maxUsedRows()
		output.rewriteLines([SPINNER, '  │ x\t\tfoo bar baz', '  │ y\t\tqux quux grault'])
		output.writeLine('✓ done')

		expect(used).toBe(3)
		expect(terminal.maxUsedRows()).toBe(3)
		expect(terminal.transcript()).toEqual(['✓ done'])
	})

	it('a coloured hook line longer than the width → no colour on the spinner or the result, no cut escape, the visible text a prefix of the plain one', () => {
		const terminal = createEmulatedTerminal({ columns: 30, rows: 12 })
		const output = createStreamLiveOutput(terminal.stream)
		const plain = '  │ error: something went wrong in a very long line of output'
		const coloured = `  │ \u001B[31merror: something went wrong\u001B[0m in a \u001B[1;32mvery long line\u001B[0m of output`

		output.rewriteLines([SPINNER, coloured])
		const region = terminal.screen().slice(0, 2)
		const styleAfterDraw = terminal.currentStyle()
		output.writeLine('✓ done')
		const result = terminal.screen().find((row) => row.text === '✓ done')

		expect(region.map((row) => row.text.length <= 29)).toEqual([true, true])
		expect(plain.startsWith(region[1].text)).toBe(true)
		expect(region[0].styles.every((style) => style === '')).toBe(true)
		expect(styleAfterDraw).toBe('')
		expect(result?.styles.every((style) => style === '')).toBe(true)
		expect(hasCutEscape(terminal.raw())).toBe(false)
		expect(terminal.transcript()).toEqual(['✓ done'])
	})

	it('a line of wide characters and an emoji → counted by the cells it takes, one row per region line, nothing left behind', () => {
		const terminal = createEmulatedTerminal({ columns: 30, rows: 12 })
		const output = createStreamLiveOutput(terminal.stream)

		output.rewriteLines([SPINNER, `  │ ${'漢字'.repeat(20)}`, `  │ ${'🙂 ok '.repeat(10)}`])
		const used = terminal.maxUsedRows()
		output.rewriteLines([SPINNER, `  │ ${'漢字'.repeat(25)}`, `  │ ${'🙂'.repeat(30)}`])
		output.writeLine('✓ done')

		expect(used).toBe(3)
		expect(terminal.maxUsedRows()).toBe(3)
		expect(terminal.transcript()).toEqual(['✓ done'])
	})

	it('a resize between two redraws → the second is cut to the new width, one row per line, nothing left behind', () => {
		const terminal = createEmulatedTerminal({ columns: 60, rows: 12 })
		const output = createStreamLiveOutput(terminal.stream)
		const lines = [SPINNER, `  │ ${'a'.repeat(50)}`, `  │ ${'b'.repeat(50)}`]

		output.rewriteLines(lines)
		terminal.resize(30)
		output.rewriteLines(lines)
		const used = terminal.maxUsedRows()
		output.writeLine('✓ done')

		expect(used).toBe(3)
		expect(terminal.transcript()).toEqual(['✓ done'])
	})

	it('25 hook lines on a 10-row terminal → the region never fills the screen (rows - 1 at most), nothing in the scrollback after the result', () => {
		const terminal = createEmulatedTerminal({ columns: 40, rows: 10 })
		const output = createStreamLiveOutput(terminal.stream)
		const hookLines = Array.from({ length: 25 }, (_unused, index) => `  │ line ${index + 1}`)

		output.rewriteLines([SPINNER, ...hookLines])
		output.rewriteLines([SPINNER, ...hookLines.slice(1), '  │ line 26'])
		const used = terminal.maxUsedRows()
		output.writeLine('✓ done')

		expect(used).toBeLessThanOrEqual(9)
		expect(terminal.transcript()).toEqual(['✓ done'])
	})

	it('closed with a region open (an interrupt) → the output ends with a newline: the prompt does not land on the spinner', () => {
		const terminal = createEmulatedTerminal({ columns: 40, rows: 10 })
		const output = createStreamLiveOutput(terminal.stream)

		output.rewriteLines([SPINNER, '  │ line 1'])
		output.close?.()

		expect(terminal.raw().endsWith('\n')).toBe(true)
		expect(terminal.transcript()).toEqual([SPINNER, '  │ line 1'])
	})
})

describe('the live region and emoji', () => {
	const EMOJI: Record<string, string> = {
		'rocket 🚀 (U+1F680)': '🚀',
		'melting face 🫠 (U+1FAE0)': '🫠',
		'a flag (two regional indicators)': '🇫🇷',
		'check mark ✅': '✅',
		'cross mark ❌': '❌',
		'high voltage ⚡': '⚡',
		'hourglass ⏳': '⏳',
		'star ⭐': '⭐',
		'sparkles ✨': '✨',
		'exclamation ❗': '❗',
		'warning sign with a variation selector ⚠️ (U+26A0 U+FE0F)': '\u26A0\uFE0F',
	}

	for (const [name, emoji] of Object.entries(EMOJI))
		it(`${name}, several times at full width → one row per region line, no stale row after the result`, () => {
			const terminal = createEmulatedTerminal({ columns: 30, rows: 12 })
			const output = createStreamLiveOutput(terminal.stream)
			const lines = [
				SPINNER,
				`  │ ${emoji.repeat(40)}`,
				`  │ ok ${emoji.repeat(7)} ${emoji.repeat(40)}`,
			]

			output.rewriteLines(lines)
			const used = terminal.maxUsedRows()
			output.rewriteLines(lines)
			output.writeLine('✓ done')

			expect(used).toBe(3)
			expect(terminal.maxUsedRows()).toBe(3)
			expect(terminal.transcript()).toEqual(['✓ done'])
		})

	it('a hook line with a backspace, a bell and a C1 control → none moves the cursor or rings: the text stays where it is, the spinner row is untouched', () => {
		const terminal = createEmulatedTerminal({ columns: 40, rows: 12 })
		const output = createStreamLiveOutput(terminal.stream)

		output.rewriteLines([SPINNER, '  │ a\bb\u0007c\u009B2Kd'])
		const rows = terminal.screen().map((row) => row.text)
		output.writeLine('✓ done')

		expect(rows[0]).toBe(SPINNER)
		expect(rows[1]).toMatch(/^ {2}│ ab.*c.*d/)
		expect(terminal.bells()).toBe(0)
		expect(terminal.transcript()).toEqual(['✓ done'])
	})
})
