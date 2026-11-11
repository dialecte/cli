/** The report's one token formatter (33L0 section 7): `182k`, `1.4M`, `unknown`, `≥ 410k`; never a `0` for a total nobody reported. */
import { formatTokens, formatTokenTotal } from './format-tokens.ts'

import { describe, expect, it } from 'vitest'

const COUNT_ROWS: [number, string][] = [
	[0, '0'],
	[999, '999'],
	[1_000, '1k'],
	[1_500, '2k'],
	[12_000, '12k'],
	[182_000, '182k'],
	[182_400, '182k'],
	[182_500, '183k'],
	[410_000, '410k'],
	[999_499, '999k'],
	[999_500, '1M'],
	[1_000_000, '1M'],
	[1_400_000, '1.4M'],
	[1_440_000, '1.4M'],
	[1_449_000, '1.4M'],
	[1_950_000, '2M'],
	[12_300_000, '12.3M'],
]

describe('formatTokens', () => {
	for (const [count, text] of COUNT_ROWS)
		it(`${count} tokens → ${text}`, () => {
			expect(formatTokens(count)).toBe(text)
		})
})

describe('formatTokenTotal', () => {
	it('an exact total → the count as formatTokens prints it', () => {
		expect(formatTokenTotal({ value: 182_000, exactness: 'exact' })).toBe('182k')
	})

	it('a lower bound → ≥ and the count', () => {
		expect(formatTokenTotal({ value: 410_000, exactness: 'atLeast' })).toBe('≥ 410k')
	})

	it('nothing reported → unknown, never 0', () => {
		expect(formatTokenTotal({ value: null, exactness: 'unknown' })).toBe('unknown')
	})

	it('a reported total of 0 → 0', () => {
		expect(formatTokenTotal({ value: 0, exactness: 'exact' })).toBe('0')
	})
})
