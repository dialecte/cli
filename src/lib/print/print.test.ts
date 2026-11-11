/** The print boundary: lines escaped once and joined, JSON never escaped, the one writer of standard output and error. */
import { writesOf } from '../../../test/print-capture.ts'
import {
	ESCAPED_SAMPLES,
	KEPT_LINES,
	PRINTED_AS_IS,
} from '../../../test/print-samples.constants.ts'
import { jsonOf, linesOf, printLines, printOut, textOf } from './print.ts'

import { describe, expect, it } from 'vitest'

describe('textOf', () => {
	it('a printable line -> the line unchanged', () => {
		expect(textOf(['a printable line, with punctuation: 1/2 (3).'])).toBe(
			'a printable line, with punctuation: 1/2 (3).',
		)
	})

	it('three lines -> joined with one line feed between them, none at the end', () => {
		expect(textOf(['first', 'second', 'third'])).toBe('first\nsecond\nthird')
	})

	it('no line -> an empty text', () => {
		expect(textOf([])).toBe('')
	})

	for (const sample of ESCAPED_SAMPLES)
		it(`a line holding ${sample.title} -> the character written as ${sample.escaped}`, () => {
			expect(textOf([`a${sample.character}b`])).toBe(`a${sample.escaped}b`)
		})

	for (const kept of KEPT_LINES)
		it(`a line of ${kept.title} -> printed as it is`, () => {
			expect(textOf([kept.line])).toBe(kept.line)
		})

	it('a terminal escape sequence inside a sentence -> the escape written as \\u{1b}, the rest kept', () => {
		expect(textOf(['ok\u{202e}evil\u001b[2J'])).toBe('ok\\u{202e}evil\\u{1b}[2J')
	})

	it('a line holding characters next to the escaped ranges and plain text -> printed as they are', () => {
		expect(textOf([PRINTED_AS_IS.join('')])).toBe(PRINTED_AS_IS.join(''))
	})

	it('a line holding a line feed -> one printed line, the line feed written as \\u{a}', () => {
		expect(textOf(['first\nnext: forged', 'second']).split('\n')).toEqual([
			'first\\u{a}next: forged',
			'second',
		])
	})

	it('a hostile line (carriage return, escape sequence, override) -> no raw character is left', () => {
		expect(textOf(['x\r\u001b[2J\u{202e}\nnext: FORGED'])).toBe(
			'x\\u{d}\\u{1b}[2J\\u{202e}\\u{a}next: FORGED',
		)
	})

	it('a text already escaped, escaped again -> the same text (the backslash is never escaped)', () => {
		expect(textOf(linesOf(textOf(['a\tb', 'c\u{202e}d'])))).toBe('a\\u{9}b\nc\\u{202e}d')
	})
})

describe('linesOf', () => {
	it('the text of lines holding controls -> the escaped lines, one entry per line', () => {
		expect(linesOf(textOf(['a\u{202e}', 'b\tc', 'plain']))).toEqual([
			'a\\u{202e}',
			'b\\u{9}c',
			'plain',
		])
	})

	it('a line holding a line feed -> still one entry, with the line feed escaped', () => {
		expect(linesOf(textOf(['x\ny', 'z']))).toEqual(['x\\u{a}y', 'z'])
	})

	it('empty lines between lines -> kept as empty entries', () => {
		expect(linesOf(textOf(['top', '', 'bottom', '']))).toEqual(['top', '', 'bottom', ''])
	})

	it('a card quoted inside another text -> its lines spliced, each line escaped once', () => {
		expect(textOf(['result', ...linesOf(textOf(['card: a\tb', 'next: c\nd']))])).toBe(
			'result\ncard: a\\u{9}b\nnext: c\\u{a}d',
		)
	})
})

describe('jsonOf', () => {
	const VALUE = { name: 'x\n\r\u001b[2J\u{202e}', count: 2, list: ['a', null] }

	it('a value with no indent -> JSON.stringify of it, on one line', () => {
		expect(jsonOf(VALUE)).toBe(JSON.stringify(VALUE))
	})

	it('a value with an indent of 2 -> JSON.stringify of it with that indent', () => {
		expect(jsonOf(VALUE, 2)).toBe(JSON.stringify(VALUE, null, 2))
	})

	it('a value with a tab indent -> JSON.stringify of it with that indent', () => {
		expect(jsonOf(VALUE, '\t')).toBe(JSON.stringify(VALUE, null, '\t'))
	})

	it('a string holding a line feed and an escape -> JSON encodes them, nothing of the boundary is added', () => {
		expect(jsonOf('x\n\u001b')).toBe('"x\\n\\u001b"')
	})

	it('a string holding an override -> kept raw as JSON.stringify keeps it, never written as \\u{202e}', () => {
		expect(jsonOf('a\u{202e}b')).toBe('"a\u{202e}b"')
	})
})

describe('printOut', () => {
	it('stdout -> the text and one line feed written to standard output only', () => {
		expect(writesOf(() => printOut({ stream: 'stdout', text: textOf(['one', 'two']) }))).toEqual({
			stdout: ['one\ntwo\n'],
			stderr: [],
		})
	})

	it('stderr -> the text and one line feed written to standard error only', () => {
		expect(writesOf(() => printOut({ stream: 'stderr', text: jsonOf({ a: 1 }) }))).toEqual({
			stdout: [],
			stderr: ['{"a":1}\n'],
		})
	})
})

describe('printLines', () => {
	it('lines holding controls -> each escaped once, joined, one line feed at the end, on the given stream', () => {
		expect(
			writesOf(() => printLines({ stream: 'stderr', lines: ['a\u001b[2J', 'b\nnext: forged'] })),
		).toEqual({
			stdout: [],
			stderr: ['a\\u{1b}[2J\nb\\u{a}next: forged\n'],
		})
	})
})
