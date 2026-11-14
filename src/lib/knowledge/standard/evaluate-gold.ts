import { logicalLinesIn } from './logical-lines-in.ts'
import { matchableTextOf } from './matchable-text-of.ts'
import { MISS_REASON_ORDER, MISS_REASONS, RECALL_RANKS } from './standard-search.constants.ts'

import type { StandardFileIndex } from './standard-index.types.ts'
import type {
	EvaluateGoldParams,
	StandardEvaluation,
	StandardGoldExpected,
	StandardGoldItem,
	StandardMiss,
	StandardMissReason,
	StandardRankedMiss,
	StandardSlice,
} from './standard-search.types.ts'

/**
 * Scores a gold set: recall at 5 and 10 over the items with expected quotes, and why each item not found
 * within rank 10 was missed. A quote is found at rank r when the slice at rank r (direct then linked, as
 * find returns them) is of its file and its logical lines, joined by one space, hold it, both sides without
 * their markup, normalised and case-folded. An item's expected quotes are alternatives: its rank is the
 * best of theirs, and a missed item reports the quote that came closest. The finds are injected so the
 * scoring stays pure; the wide one only runs for a miss.
 */
export function evaluateGold(params: EvaluateGoldParams): StandardEvaluation {
	const { items, find, findWide } = params
	const files = new Map(params.files.map((file) => [file.fileId, file]))
	const evaluated = items.filter((item) => item.expected.length > 0)
	const fileTexts = new Map<string, string>()
	const misses: StandardMiss[] = []
	let foundNear = 0
	let foundFar = 0
	for (const item of evaluated) {
		const slices = find({ item })
		const quotes = item.expected.map((expected) => {
			const file = files.get(expected.file)
			const quote = matchableTextOf(expected.quote)
			return { expected, file, quote, rank: file ? rankOf({ slices, file, quote }) : null }
		})
		// the expected quotes are alternatives: the item is found at the best rank of any of them
		const best = Math.min(...quotes.map((entry) => entry.rank ?? Number.POSITIVE_INFINITY))
		if (best <= RECALL_RANKS.near) foundNear++
		if (best <= RECALL_RANKS.far) foundFar++
		if (best <= RECALL_RANKS.far) continue
		let wide: StandardSlice[] | null = null
		const candidates = quotes.map((entry) => {
			// the text of a whole file is folded once per evaluation
			const text =
				entry.file === undefined
					? undefined
					: (fileTexts.get(entry.file.fileId) ?? textOf(entry.file.logicalLines))
			if (entry.file !== undefined && text !== undefined) fileTexts.set(entry.file.fileId, text)
			const inText = text?.includes(entry.quote) ?? false
			if (inText && entry.rank === null) wide ??= findWide({ item })
			return missOf({ item, ...entry, inText, wide })
		})
		misses.push(bestMiss(candidates))
	}
	return {
		items: evaluated.length,
		notInText: items.length - evaluated.length,
		recallAt5: recallOf({ found: foundNear, total: evaluated.length }),
		recallAt10: recallOf({ found: foundFar, total: evaluated.length }),
		misses,
	}
}

/** The 1-based rank of the first slice of the file holding the quote, null when none does. */
function rankOf(params: {
	slices: StandardSlice[]
	file: StandardFileIndex
	quote: string
}): number | null {
	const { slices, file, quote } = params
	for (const [index, slice] of slices.entries()) {
		if (slice.file !== file.fileId) continue
		const lines = logicalLinesIn({ file, from: slice.from, to: slice.to })
		if (textOf(lines).includes(quote)) return index + 1
	}
	return null
}

function missOf(params: {
	item: StandardGoldItem
	expected: StandardGoldExpected
	file: StandardFileIndex | undefined
	quote: string
	rank: number | null
	inText: boolean
	wide: StandardSlice[] | null
}): StandardRankedMiss {
	const { item, expected } = params
	const reason = whyMissed(params)
	return {
		miss: {
			question: item.question,
			file: expected.file,
			quote: expected.quote,
			why:
				reason.kind === 'unknownFile'
					? `${MISS_REASONS.unknownFile} ${expected.file}`
					: reason.kind === 'ranked'
						? `${MISS_REASONS.ranked} ${reason.rank}`
						: MISS_REASONS[reason.kind],
		},
		reason,
	}
}

/**
 * Why a quote was missed, in this order: its file unknown, the quote in none of its file's lines, ranked
 * past 10 (by the find, else by the wide find), or not found by either.
 */
function whyMissed(params: {
	file: StandardFileIndex | undefined
	quote: string
	rank: number | null
	inText: boolean
	wide: StandardSlice[] | null
}): StandardMissReason {
	const { file, quote, rank, inText, wide } = params
	if (!file) return { kind: 'unknownFile', rank: null }
	if (!inText) return { kind: 'notInText', rank: null }
	if (rank !== null) return { kind: 'ranked', rank }
	const wideRank = wide === null ? null : rankOf({ slices: wide, file, quote })
	return wideRank === null ? { kind: 'notFound', rank: null } : { kind: 'ranked', rank: wideRank }
}

/** The miss of the quote that came closest: the best reason, then the best rank, then the first quote. */
function bestMiss(candidates: StandardRankedMiss[]): StandardMiss {
	let best = candidates[0]
	for (const candidate of candidates.slice(1))
		if (compareReasons({ left: candidate.reason, right: best.reason }) < 0) best = candidate
	return best.miss
}

function compareReasons(params: { left: StandardMissReason; right: StandardMissReason }): number {
	const { left, right } = params
	const order = MISS_REASON_ORDER.indexOf(left.kind) - MISS_REASON_ORDER.indexOf(right.kind)
	if (order !== 0) return order
	return (left.rank ?? 0) - (right.rank ?? 0)
}

/** The logical lines' texts, each without its markup and folded, joined by one space. */
function textOf(lines: StandardFileIndex['logicalLines']): string {
	return lines.map((line) => matchableTextOf(line.text)).join(' ')
}

function recallOf(params: { found: number; total: number }): number {
	return params.total === 0 ? 0 : params.found / params.total
}
