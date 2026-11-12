/** The token fields a station end may report (spec 6): parts of the input and output, and the vendor's total. */
export type TokenField = 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'total'

/** What a station end reports: any field may be missing or `null`. */
export type ReportedTokens = Partial<Record<TokenField, number | null>>

/** How sure a station's total is: reported or all four parts (`exact`), some parts (`atLeast`), nothing (`unknown`). */
export type TokenExactness = 'exact' | 'atLeast' | 'unknown'

/** A station's total: `value` is `null` exactly when `exactness` is `unknown`; a reported `0` is `0`. */
export type StationTokenTotal = { value: number | null; exactness: TokenExactness }

/** One field summed over the stations that reported it; `known` is `null` when no station did. */
export type FieldSum = { known: number | null; unknownStations: number }

/** A lot's or a feature's total: the station totals added, with how many stations were not exact. */
export type LotTokenTotal = {
	/** `null` when no station reported anything. */
	value: number | null
	/** True only when every station's total is exact (and there is at least one). */
	exact: boolean
	/** Stations whose total is `atLeast` or `unknown`. */
	notExact: number
	stations: number
}

/** The lot's tokens: the total, and each field beside it. */
export type LotTokenTotals = {
	total: LotTokenTotal
	fields: Record<TokenField, FieldSum>
}

/** Money as a station reports it. */
export type ReportedMoney = { amount: number; currency: string }

/**
 * The money of a lot: one sum per currency, in currency order, each with how many of the stations summed reported no
 * money at all when some did not (the sum is then a lower bound); left out when every station reported money.
 */
export type MoneySum = { currency: string; amount: number; unknownStations?: number }
