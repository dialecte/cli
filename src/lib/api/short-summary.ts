import { SHORT_SUMMARY_MAX_LENGTH } from './api-json.constants.ts'

/** A summary on one short line: its first sentence, cut with an ellipsis past the limit. */
export function shortSummary(summary: string): string {
	const sentence = firstSentence(summary)
	return sentence.length > SHORT_SUMMARY_MAX_LENGTH
		? `${sentence.slice(0, SHORT_SUMMARY_MAX_LENGTH - 1)}…`
		: sentence
}

/** The first sentence of a text: up to the first `.`, `!` or `?` before a space or the end; the whole text without one. */
export function firstSentence(text: string): string {
	return text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text
}
