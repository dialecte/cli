import {
	CITE_MAX_COUNTED_LINES,
	QUOTE_MAX_WORDS,
	QUOTE_MIN_WORDS,
	WHOLE_LINE_KINDS,
	WORD_CHARACTER_PATTERN,
	WORD_SEPARATOR,
} from './ask.constants.ts'
import { foldedTextOf } from './folded-text-of.ts'

import type {
	CheckCiteParams,
	CheckedCite,
	CiteRefusal,
	GivenSlice,
	RangeText,
	ReportCite,
} from './ask.types.ts'

/**
 * Checks one cite in order, the first failure refusing it: the file is in the manifest with the same checksum, the
 * range lies in the file and holds at most 40 non-noise lines, it lies inside a slice given to this reader, and the
 * quote is in the folded text of the range at 8 to 40 words (or is one whole table row or code line).
 */
export function checkCite(params: CheckCiteParams): CheckedCite {
	const { cite, context } = params
	const file = context.manifest.find((entry) => entry.id === cite.file)
	if (file === undefined) return refusedCite({ cite, refused: 'unknown-file' })
	const current = context.current.find((entry) => entry.id === cite.file)
	if (current === undefined || current.sha256 !== file.sha256)
		return refusedCite({ cite, refused: 'file-changed' })
	if (!Number.isInteger(cite.from) || !Number.isInteger(cite.to))
		return refusedCite({ cite, refused: 'out-of-range' })
	if (cite.from < 1 || cite.from > cite.to || cite.to > file.lines)
		return refusedCite({ cite, refused: 'out-of-range' })
	const range = context.rangeOf({ file: cite.file, from: cite.from, to: cite.to })
	if (range.counted > CITE_MAX_COUNTED_LINES)
		return refusedCite({ cite, refused: 'range-too-wide' })
	const slice = context.given.find((given) => sliceHolds({ slice: given, cite }))
	if (slice === undefined) return refusedCite({ cite, refused: 'not-given' })
	const quote = foldedTextOf({ text: cite.quote })
	// a quote that folds to nothing (`""`, markup only, a row of bars) quotes no word: refused before the whole-line check
	if (quote === '') return refusedCite({ cite, refused: 'quote-length' })
	if (!onWordBoundaries({ quote, text: foldedTextOf({ text: rangeTextOf({ range }) }) }))
		return refusedCite({ cite, refused: 'quote-not-found' })
	if (!quoteLengthAllowed({ quote, range })) return refusedCite({ cite, refused: 'quote-length' })
	return { cite, verified: true, slice }
}

/** A cite refused for a reason. */
function refusedCite(params: { cite: ReportCite; refused: CiteRefusal }): CheckedCite {
	return { cite: params.cite, verified: false, refused: params.refused }
}

/** True when the slice is of the cite's file and covers every line of its range. */
function sliceHolds(params: { slice: GivenSlice; cite: ReportCite }): boolean {
	const { slice, cite } = params
	return slice.file === cite.file && slice.from <= cite.from && cite.to <= slice.to
}

/**
 * True when the folded quote is in the folded range text on word boundaries (R1-1): at some place where no word
 * character runs on past either end of the quote (a space, a punctuation mark or the text's end next to it), so a
 * quote starting or ending inside a word of the range (`AA_1` in `AA_10`, `bounded` in `unbounded`) is not in it.
 * The quote is never empty here: an empty one is refused `quote-length` before.
 */
function onWordBoundaries(params: { quote: string; text: string }): boolean {
	const { quote, text } = params
	for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
		const before = text.slice(Math.max(0, at - 1), at)
		const after = text.slice(at + quote.length, at + quote.length + 1)
		const startsClear = !joinsWord({ edge: quote.slice(0, 1), next: before })
		if (startsClear && !joinsWord({ edge: quote.slice(-1), next: after })) return true
	}
	return false
}

/** True when a quote's edge character and the range character next to it are both word characters. */
function joinsWord(params: { edge: string; next: string }): boolean {
	return WORD_CHARACTER_PATTERN.test(params.edge) && WORD_CHARACTER_PATTERN.test(params.next)
}

/** The text of a range: its logical lines side by side. */
function rangeTextOf(params: { range: RangeText }): string {
	return params.range.lines.map((line) => line.text).join(WORD_SEPARATOR)
}

/** True when the quote has 8 to 40 words, or is exactly one whole table row or code line of the range. */
function quoteLengthAllowed(params: { quote: string; range: RangeText }): boolean {
	const words = params.quote.split(WORD_SEPARATOR).length
	if (words >= QUOTE_MIN_WORDS && words <= QUOTE_MAX_WORDS) return true
	return params.range.lines.some(
		(line) =>
			WHOLE_LINE_KINDS.includes(line.kind) && foldedTextOf({ text: line.text }) === params.quote,
	)
}
