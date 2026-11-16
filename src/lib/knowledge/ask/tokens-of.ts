import { matchableTextOf } from '../standard/matchable-text-of.ts'
import { REPORT_WORD_PATTERN } from './ask.constants.ts'

/** The words of a text, lower-cased, as the polarity cues and their window are counted (markup stripped). */
export function tokensOf(params: { text: string }): string[] {
	return matchableTextOf(params.text).match(REPORT_WORD_PATTERN) ?? []
}
