/** The one token formatter of the report (33L0 section 7): `182k`, `1.4M`, `unknown`, `≥ 410k`. */
import {
	AT_LEAST_PREFIX,
	TOKENS_PER_K,
	TOKENS_PER_M,
	TOKENS_PER_TENTH_M,
	TOKENS_WORD,
	UNKNOWN_TEXT,
} from './format-tokens.constants.ts'

import type { LotTokenTotal, StationTokenTotal } from './token-totals.types.ts'

/** A count of tokens as the report prints it: below 1000 as it is, thousands as `182k`, millions as `1.4M`. */
export function formatTokens(count: number): string {
	if (count < TOKENS_PER_K) return String(count)
	const thousands = Math.round(count / TOKENS_PER_K)
	if (thousands < TOKENS_PER_M / TOKENS_PER_K) return `${thousands}k`
	const tenths = Math.round(count / TOKENS_PER_TENTH_M)
	return `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)}M`
}

/**
 * A lot's total as a phrase: `tokens unknown` when no station reported anything, `1.2M tokens` when every station
 * is exact, else `≥ 1.5M tokens (1 of 4 not exact)` (the report's agents line, the card's usage row).
 */
export function formatLotTokens(params: { total: LotTokenTotal }): string {
	const { total } = params
	if (total.value === null) return `${TOKENS_WORD} ${UNKNOWN_TEXT}`
	const count = `${formatTokens(total.value)} ${TOKENS_WORD}`
	return total.exact
		? count
		: `${AT_LEAST_PREFIX}${count} (${total.notExact} of ${total.stations} not exact)`
}

/** A station's or lot's total: `unknown` when nothing was reported, `≥ n` for a lower bound, else the count. */
export function formatTokenTotal(total: StationTokenTotal): string {
	if (total.value === null) return UNKNOWN_TEXT
	const count = formatTokens(total.value)
	return total.exactness === 'atLeast' ? `${AT_LEAST_PREFIX}${count}` : count
}
