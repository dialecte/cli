import {
	DECIMAL_BASE,
	EXPONENT_PATTERN,
	HALF_UP_DIGIT,
	MONEY_DECIMAL_LIMIT,
	TOKEN_FIELDS,
	TOKEN_PARTS,
} from './token-totals.constants.ts'

import type {
	FieldSum,
	LotTokenTotal,
	LotTokenTotals,
	MoneySum,
	ReportedMoney,
	ReportedTokens,
	StationTokenTotal,
	TokenField,
} from './token-totals.types.ts'

/** One station's total (spec 6): `total` when reported, else the four parts when all known, else the known parts as a lower bound, else unknown. */
export function stationTokenTotal(params: {
	tokens: ReportedTokens | null | undefined
}): StationTokenTotal {
	const tokens = params.tokens ?? {}
	const total = knownOf({ value: tokens.total })
	if (total !== null) return { value: total, exactness: 'exact' }
	const parts = TOKEN_PARTS.map((field) => knownOf({ value: tokens[field] }))
	const known = parts.filter((part): part is number => part !== null)
	if (known.length === 0) return { value: null, exactness: 'unknown' }
	const value = known.reduce((sum, part) => sum + part, 0)
	return { value, exactness: known.length === TOKEN_PARTS.length ? 'exact' : 'atLeast' }
}

/** The lot's total and each field's sum with the count of stations that did not report it; a station that reported nothing is `null`. */
export function lotTokenTotals(params: {
	stations: readonly (ReportedTokens | null | undefined)[]
}): LotTokenTotals {
	const totals = params.stations.map((tokens) => stationTokenTotal({ tokens }))
	const values = totals
		.map((total) => total.value)
		.filter((value): value is number => value !== null)
	const notExact = totals.filter((total) => total.exactness !== 'exact').length
	const fields = Object.fromEntries(
		TOKEN_FIELDS.map((field) => [field, fieldSumOf({ stations: params.stations, field })]),
	) as Record<TokenField, FieldSum>
	return {
		total: {
			value: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0),
			exact: totals.length > 0 && notExact === 0,
			notExact,
			stations: totals.length,
		},
		fields,
	}
}

/** Totals added up (a station's runs, a feature's stations): exact when every one is, unknown when none reported, else at least. */
export function sumStationTotals(params: {
	totals: readonly StationTokenTotal[]
}): StationTokenTotal {
	const known = params.totals.filter((total) => total.value !== null)
	if (known.length === 0) return { value: null, exactness: 'unknown' }
	const value = known.reduce((sum, total) => sum + (total.value ?? 0), 0)
	const exact = params.totals.every((total) => total.exactness === 'exact')
	return { value, exactness: exact ? 'exact' : 'atLeast' }
}

/** Lot totals added up (a feature's lots): exact only when every lot is; `null` when no lot reported anything. */
export function sumLotTotals(params: { totals: readonly LotTokenTotal[] }): LotTokenTotal {
	const values = params.totals
		.map((total) => total.value)
		.filter((value): value is number => value !== null)
	return {
		value: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0),
		exact: params.totals.length > 0 && params.totals.every((total) => total.exact),
		notExact: params.totals.reduce((sum, total) => sum + total.notExact, 0),
		stations: params.totals.reduce((sum, total) => sum + total.stations, 0),
	}
}

/** Money summed per currency, reported only; `null` entries (a station without money) are skipped. */
export function sumMoney(params: {
	money: readonly (ReportedMoney | null | undefined)[]
}): MoneySum[] {
	const byCurrency = new Map<string, number[]>()
	for (const money of params.money) {
		if (money === null || money === undefined) continue
		const amounts = byCurrency.get(money.currency) ?? []
		amounts.push(money.amount)
		byCurrency.set(money.currency, amounts)
	}
	return [...byCurrency.keys()].sort().map((currency) => ({
		currency,
		amount: decimalSum({ amounts: byCurrency.get(currency) ?? [] }),
	}))
}

/**
 * The lot's money (`sumMoney`), each sum carrying how many stations reported none (`unknownStations`, left out when
 * every station reported money).
 */
export function sumLotMoney(params: {
	money: readonly (ReportedMoney | null | undefined)[]
}): MoneySum[] {
	const unknownStations = params.money.filter(
		(money) => money === null || money === undefined,
	).length
	return sumMoney(params).map((sum) => ({
		...sum,
		...(unknownStations > 0 && { unknownStations }),
	}))
}

/** A reported token count, or `null` when the field holds no number. */
function knownOf(params: { value: number | null | undefined }): number | null {
	return typeof params.value === 'number' ? params.value : null
}

/** One field summed over the stations that reported it, with the count of stations that did not. */
function fieldSumOf(params: {
	stations: readonly (ReportedTokens | null | undefined)[]
	field: TokenField
}): FieldSum {
	let known: number | null = null
	let unknownStations = 0
	for (const tokens of params.stations) {
		const value = knownOf({ value: tokens?.[params.field] })
		if (value === null) unknownStations += 1
		else known = (known ?? 0) + value
	}
	return { known, unknownStations }
}

/** The exact decimal sum of amounts: integer units of the most decimal places among them (at most six, half-up). */
function decimalSum(params: { amounts: readonly number[] }): number {
	const written = params.amounts.map((amount) => plainDecimalOf({ amount }))
	const places = Math.min(
		MONEY_DECIMAL_LIMIT,
		Math.max(0, ...written.map((text) => (text.split('.')[1] ?? '').length)),
	)
	const units = written.reduce((sum, text) => sum + unitsOf({ text, places }), 0)
	return units / DECIMAL_BASE ** places
}

/** An amount written without an exponent, with exactly the decimal places its shortest form holds. */
function plainDecimalOf(params: { amount: number }): string {
	const shortest = String(params.amount)
	const match = EXPONENT_PATTERN.exec(shortest)
	if (match === null) return shortest
	const places = (match[2] ?? '').length - Number(match[3])
	return params.amount.toFixed(Math.max(0, places))
}

/** A plain decimal as integer units of `places` decimal places, a dropped digit of 5 or more rounding up. */
function unitsOf(params: { text: string; places: number }): number {
	const [whole = '0', fraction = ''] = params.text.split('.')
	const kept = Number(`${whole}${fraction.slice(0, params.places).padEnd(params.places, '0')}`)
	const dropped = Number(fraction.charAt(params.places) || '0')
	return dropped >= HALF_UP_DIGIT ? kept + 1 : kept
}
