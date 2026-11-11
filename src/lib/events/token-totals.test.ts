/** Tokens and money (33L0 section 6; cases 20, 21, 22): per station, per field, per lot; unknown is never 0. */
import { lotTokenTotals, stationTokenTotal, sumMoney } from './token-totals.ts'

import { describe, expect, it } from 'vitest'

import type { ReportedTokens, StationTokenTotal } from './token-totals.types.ts'

type StationRow = {
	name: string
	tokens: ReportedTokens | null | undefined
	expected: StationTokenTotal
}

const STATION_ROWS: StationRow[] = [
	{
		name: 'a reported total of 100 → 100, exact',
		tokens: { total: 100 },
		expected: { value: 100, exactness: 'exact' },
	},
	{
		name: 'input 10 and output 5 only → 15 as a lower bound (at least)',
		tokens: { input: 10, output: 5 },
		expected: { value: 15, exactness: 'atLeast' },
	},
	{
		name: 'no tokens at all (null) → unknown, never 0',
		tokens: null,
		expected: { value: null, exactness: 'unknown' },
	},
	{
		name: 'an empty tokens object → unknown, never 0',
		tokens: {},
		expected: { value: null, exactness: 'unknown' },
	},
	{
		name: 'every field null → unknown, never 0',
		tokens: { input: null, output: null, cacheRead: null, cacheWrite: null, total: null },
		expected: { value: null, exactness: 'unknown' },
	},
	{
		name: 'a reported total of 0 → 0, exact (a reported 0 is 0)',
		tokens: { total: 0 },
		expected: { value: 0, exactness: 'exact' },
	},
	{
		name: 'the four parts all known and no total → their sum, exact',
		tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		expected: { value: 10, exactness: 'exact' },
	},
	{
		name: 'three of the four parts known and no total → their sum as a lower bound (at least)',
		tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: null },
		expected: { value: 6, exactness: 'atLeast' },
	},
	{
		name: 'only input reported and it is 0 → a known 0 as a lower bound (at least), not unknown',
		tokens: { input: 0 },
		expected: { value: 0, exactness: 'atLeast' },
	},
	{
		name: 'a total and some parts → the total, exact (the total wins)',
		tokens: { total: 50, input: 10 },
		expected: { value: 50, exactness: 'exact' },
	},
]

describe('stationTokenTotal: one station (case 20)', () => {
	for (const row of STATION_ROWS)
		it(row.name, () => {
			expect(stationTokenTotal({ tokens: row.tokens })).toEqual(row.expected)
		})
})

describe('lotTokenTotals: the lot (cases 20, 21)', () => {
	const FOUR_STATIONS = [{ total: 100 }, { input: 10, output: 5 }, null, { total: 0 }]

	it('totals 100, 15 as a lower bound, nothing and 0 → 115 not exact, 2 of 4 stations not exact', () => {
		expect(lotTokenTotals({ stations: FOUR_STATIONS }).total).toEqual({
			value: 115,
			exact: false,
			notExact: 2,
			stations: 4,
		})
	})

	it('the same four stations → each field summed over the stations that reported it, with the count that did not', () => {
		expect(lotTokenTotals({ stations: FOUR_STATIONS }).fields).toEqual({
			input: { known: 10, unknownStations: 3 },
			output: { known: 5, unknownStations: 3 },
			cacheRead: { known: null, unknownStations: 4 },
			cacheWrite: { known: null, unknownStations: 4 },
			total: { known: 100, unknownStations: 2 },
		})
	})

	it('a station reporting input 0 → the input field is a known 0 (not null), the total stays unknown', () => {
		expect(lotTokenTotals({ stations: [{ input: 0 }] })).toMatchObject({
			fields: { input: { known: 0, unknownStations: 0 } },
			total: { value: 0, exact: false, notExact: 1, stations: 1 },
		})
	})

	it('no station reported tokens → the lot total is unknown (null), not 0, every station not exact', () => {
		expect(lotTokenTotals({ stations: [null, {}] }).total).toEqual({
			value: null,
			exact: false,
			notExact: 2,
			stations: 2,
		})
	})

	it('no station at all → the lot total is unknown (null), not 0', () => {
		expect(lotTokenTotals({ stations: [] }).total).toEqual({
			value: null,
			exact: false,
			notExact: 0,
			stations: 0,
		})
	})

	it('every station exact → the sum, exact, nothing not exact', () => {
		expect(lotTokenTotals({ stations: [{ total: 1 }, { total: 2 }] }).total).toEqual({
			value: 3,
			exact: true,
			notExact: 0,
			stations: 2,
		})
	})

	it('a lot whose only reported total is 0 → 0, exact (a reported 0 is 0)', () => {
		expect(lotTokenTotals({ stations: [{ total: 0 }] }).total).toEqual({
			value: 0,
			exact: true,
			notExact: 0,
			stations: 1,
		})
	})
})

describe('sumMoney: money per currency (case 22)', () => {
	it('two currencies in three stations → two sums, in currency order', () => {
		expect(
			sumMoney({
				money: [
					{ amount: 1.5, currency: 'USD' },
					{ amount: 2, currency: 'EUR' },
					null,
					{ amount: 0.5, currency: 'USD' },
				],
			}),
		).toEqual([
			{ currency: 'EUR', amount: 2 },
			{ currency: 'USD', amount: 2 },
		])
	})

	it('0.1 and 0.2 of one currency → exactly 0.3 (a decimal sum, never 0.30000000000000004)', () => {
		expect(
			sumMoney({
				money: [
					{ amount: 0.1, currency: 'EUR' },
					{ amount: 0.2, currency: 'EUR' },
				],
			}),
		).toEqual([{ currency: 'EUR', amount: 0.3 }])
	})

	it('0.0042 and 0.0013 (sub-cent API costs) → exactly 0.0055, no rounding to the cent', () => {
		expect(
			sumMoney({
				money: [
					{ amount: 0.0042, currency: 'USD' },
					{ amount: 0.0013, currency: 'USD' },
				],
			}),
		).toEqual([{ currency: 'USD', amount: 0.0055 }])
	})

	it('1.5 and 0.000001 → exactly 1.500001 (six decimal places are kept)', () => {
		expect(
			sumMoney({
				money: [
					{ amount: 1.5, currency: 'USD' },
					{ amount: 0.000001, currency: 'USD' },
				],
			}),
		).toEqual([{ currency: 'USD', amount: 1.500001 }])
	})

	it('an amount of 7 decimal places (0.0000005) beside 1 → rounded half-up to 6 places: 1.000001', () => {
		expect(
			sumMoney({
				money: [
					{ amount: 1, currency: 'USD' },
					{ amount: 0.0000005, currency: 'USD' },
				],
			}),
		).toEqual([{ currency: 'USD', amount: 1.000001 }])
	})

	it('no station reported money → no sums (nothing summed to 0)', () => {
		expect(sumMoney({ money: [null, undefined] })).toEqual([])
	})
})
