import { SHORT_SUMMARY_MAX_LENGTH } from './api-json.constants.ts'

/** A summary on one short line: its first sentence, cut with an ellipsis past the limit. */
export function shortSummary(summary: string): string {
	const sentence = summary.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? summary
	return sentence.length > SHORT_SUMMARY_MAX_LENGTH
		? `${sentence.slice(0, SHORT_SUMMARY_MAX_LENGTH - 1)}…`
		: sentence
}
