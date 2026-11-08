import { SCORE_DECIMALS } from './standard-search.constants.ts'

/** A score rounded to the decimals scores are shown and compared with. */
export function roundScore(score: number): number {
	const scale = 10 ** SCORE_DECIMALS
	return Math.round(score * scale) / scale
}
