/**
 * R4-5: an extended colour (38, 48, 58) whose mode is neither 2 nor 5 is no colour a terminal reads as one, and its
 * next parameter may be a conceal: the sequence is not passed as it is (the text prints, no raw sequence). The 8 of a
 * real extended colour stays a colour value.
 */
import { relayedTextOf } from './relayed.ts'

import { describe, expect, it } from 'vitest'

const ESC = '\u001b'

/** Sequences whose extended colour has an unknown mode: the sequence must not reach the terminal as written. */
const UNKNOWN_MODE_SEQUENCES = ['38;8', '58;8', '48;8'] as const

/** Real extended colours holding an 8 as a value: kept as they are. */
const KEPT_SEQUENCES = ['38;5;8', '38;2;8;8;8', '48;2;8;8;8'] as const

describe('relayedTextOf, an extended colour with an unknown mode', () => {
	for (const parameters of UNKNOWN_MODE_SEQUENCES)
		it(`ESC[${parameters}m before a word -> the word prints, the sequence is not passed as it is`, () => {
			const printed = relayedTextOf([`a${ESC}[${parameters}mhidden`])

			expect(printed).toContain('hidden')
			expect(printed).not.toContain(`${ESC}[${parameters}m`)
		})
})

describe('relayedTextOf, a real extended colour holding an 8', () => {
	for (const parameters of KEPT_SEQUENCES)
		it(`ESC[${parameters}m -> unchanged`, () => {
			const line = `a${ESC}[${parameters}mb`

			expect(relayedTextOf([line])).toBe(line)
		})
})
