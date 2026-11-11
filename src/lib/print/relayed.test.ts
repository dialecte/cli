/** The relayed boundary: colours kept, every other control escaped, written on the given stream only. */
import { writesOf } from '../../../test/print-capture.ts'
import {
	CONCEAL_SAMPLES,
	ESCAPED_RELAYED_SAMPLES,
	KEPT_SGR_SAMPLES,
} from '../../../test/relayed-samples.constants.ts'
import { printRelayed, relayedTextOf } from './relayed.ts'

import { describe, expect, it } from 'vitest'

describe('relayedTextOf', () => {
	for (const sample of KEPT_SGR_SAMPLES)
		it(`a line holding ${sample.title} -> the sequence kept as it is`, () => {
			expect(relayedTextOf([sample.line])).toBe(sample.printed)
		})

	for (const sample of ESCAPED_RELAYED_SAMPLES)
		it(`a line holding ${sample.title} -> the control escaped`, () => {
			expect(relayedTextOf([sample.line])).toBe(sample.printed)
		})

	for (const sample of CONCEAL_SAMPLES)
		it(`a line holding ${sample.title} -> printed as the literal expects`, () => {
			expect(relayedTextOf([sample.line])).toBe(sample.printed)
		})

	it('a line without controls -> the line unchanged', () => {
		expect(relayedTextOf(['plain line: 1/2 (3).'])).toBe('plain line: 1/2 (3).')
	})

	it('three lines -> joined with one line feed between them, none at the end', () => {
		expect(relayedTextOf(['first', '\u001b[32msecond\u001b[0m', 'third'])).toBe(
			'first\n\u001b[32msecond\u001b[0m\nthird',
		)
	})

	it('no line -> an empty text', () => {
		expect(relayedTextOf([])).toBe('')
	})
})

describe('printRelayed', () => {
	it('lines to stdout -> the relayed text and a line feed on stdout, nothing on stderr', () => {
		expect(
			writesOf(() => printRelayed({ stream: 'stdout', lines: ['\u001b[32mok\u001b[0m', 'a\rb'] })),
		).toEqual({ stdout: ['\u001b[32mok\u001b[0m\na\\u{d}b\n'], stderr: [] })
	})

	it('lines to stderr -> the relayed text and a line feed on stderr, nothing on stdout', () => {
		expect(writesOf(() => printRelayed({ stream: 'stderr', lines: ['\u001b[2Jgone'] }))).toEqual({
			stdout: [],
			stderr: ['\\u{1b}[2Jgone\n'],
		})
	})
})
