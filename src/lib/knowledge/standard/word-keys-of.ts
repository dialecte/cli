import {
	ACRONYM_PATTERN,
	ACRONYM_PLURAL_PATTERN,
	CAMEL_CASE_BOUNDARY_PATTERN,
	DOUBLED_CONSONANT_PATTERN,
	DOUBLED_CONSONANT_REPLACEMENT,
	FINAL_E_PATTERN,
	INFLECTION_PATTERN,
	MINIMUM_WORD_LENGTH,
	PAST_IED_PATTERN,
	PAST_IED_REPLACEMENT,
	PLURAL_ES_PATTERN,
	PLURAL_ES_REPLACEMENT,
	PLURAL_IES_PATTERN,
	PLURAL_IES_REPLACEMENT,
	PLURAL_S_PATTERN,
	PLURAL_S_REPLACEMENT,
	PROGRESSIVE_YING_PATTERN,
	STEM_MINIMUM_LENGTH,
	STEM_VOWEL_PATTERN,
	STOP_WORDS,
	WORD_PART_SEPARATOR,
} from './standard-search.constants.ts'

/**
 * The keys a word is searched by. An acronym (capitals and digits only, at least two capitals) is kept
 * whatever its length, never split, stemmed nor dropped as a stop word: its key is its lowercase; its plural
 * (the acronym and one lowercase `s`) has the acronym's key. Any other word
 * is lowercased, dropped when it is a stop word or under the minimum length, then stemmed. With `split`,
 * the word's parts (split on underscores and camel case boundaries) give keys too. Distinct keys, the
 * whole word's first.
 */
export function wordKeysOf(params: { token: string; split: boolean }): string[] {
	const { token, split } = params
	const acronym = acronymOf(token)
	if (acronym !== undefined) return [acronym]
	const words = split ? [token, ...partsOf(token)] : [token]
	const keys = new Set<string>()
	for (const word of words) {
		const lower = word.toLowerCase()
		const partAcronym = acronymOf(word)
		if (partAcronym !== undefined) {
			keys.add(partAcronym)
			continue
		}
		if (lower.length < MINIMUM_WORD_LENGTH || STOP_WORDS.has(lower)) continue
		keys.add(stemOf(lower))
	}
	return [...keys]
}

/** The key of an acronym or of its plural (the acronym and one lowercase `s`): the acronym lowercased. */
function acronymOf(word: string): string | undefined {
	const acronym = ACRONYM_PLURAL_PATTERN.test(word) ? word.slice(0, -1) : word
	return ACRONYM_PATTERN.test(acronym) ? acronym.toLowerCase() : undefined
}

function partsOf(token: string): string[] {
	const parts = token
		.split(WORD_PART_SEPARATOR)
		.flatMap((part) => part.split(CAMEL_CASE_BOUNDARY_PATTERN))
	return parts.length > 1 ? parts : []
}

/**
 * The stem of a lowercase word: its plural ending removed (`ies` to `y`, then `es` after `s`, `x`, `z`,
 * `ch`, `sh` dropped, then a final `s` dropped unless the word ends in `ss`, `us` or `is`), then its
 * inflection, then a final `e` dropped when the word stays at the stem's minimum length.
 */
function stemOf(word: string): string {
	const singular = word
		.replace(PLURAL_IES_PATTERN, PLURAL_IES_REPLACEMENT)
		.replace(PLURAL_ES_PATTERN, PLURAL_ES_REPLACEMENT)
		.replace(PLURAL_S_PATTERN, PLURAL_S_REPLACEMENT)
	const uninflected = withoutInflection(singular)
	return FINAL_E_PATTERN.test(uninflected) && uninflected.length > STEM_MINIMUM_LENGTH
		? uninflected.replace(FINAL_E_PATTERN, '')
		: uninflected
}

/**
 * A word without its `-ed` or `-ing`: `ied` to `y`; `ying` to `y`; else a final `ing` or `ed` removed when
 * the rest is at the stem's minimum length and holds a vowel, a doubled final consonant then undoubled
 * (but `l`, `s`, `z`).
 */
function withoutInflection(word: string): string {
	if (PAST_IED_PATTERN.test(word)) return word.replace(PAST_IED_PATTERN, PAST_IED_REPLACEMENT)
	if (PROGRESSIVE_YING_PATTERN.test(word)) return word.replace(PROGRESSIVE_YING_PATTERN, '')
	const rest = word.replace(INFLECTION_PATTERN, '')
	if (rest === word || rest.length < STEM_MINIMUM_LENGTH || !STEM_VOWEL_PATTERN.test(rest))
		return word
	return rest.replace(DOUBLED_CONSONANT_PATTERN, DOUBLED_CONSONANT_REPLACEMENT)
}
