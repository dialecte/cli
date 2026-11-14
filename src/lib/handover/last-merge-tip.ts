import type { ResolvedLot } from './handover.types.ts'

/**
 * The tip of the last lot that merges (its `merge.tip`), the base a rehearsal's contrib judges against; undefined
 * when no lot merges. Only the last merge lot's tip is the base: the lines an earlier merge of another branch brought
 * in count as added by the lots.
 */
export function lastMergeTipOf(lots: readonly ResolvedLot[]): string | undefined {
	const merges = lots.flatMap((lot) => (lot.merge ? [lot.merge] : []))
	return merges.at(-1)?.tip
}
