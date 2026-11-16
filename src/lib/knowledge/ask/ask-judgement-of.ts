import { normaliseText } from '../standard/normalise-text.ts'
import { GOLD_POLARITY_ANSWER_PATTERN } from './ask.constants.ts'

import type { AskJudgement, AskJudgementOfParams } from './ask.types.ts'

/**
 * Whether the readers' agreed answer is right by the gold item (D26): a `not-in-text` item is right only when the
 * readers agreed `not-in-text`, and an item that holds an answer is wrong when they did; a gold answer starting `yes`
 * or `no` is right on that verdict and wrong on the other; a `value` verdict is right when the gold answer holds
 * its value (case and spacing folded). No rule decides the rest (gold answers are free text): `unjudged`.
 */
export function askJudgementOf(params: AskJudgementOfParams): AskJudgement {
	const { item, agreed } = params
	const notInText = agreed.verdict === 'not-in-text'
	if (item.kind === 'not-in-text') return notInText ? 'agreed' : 'wrong'
	if (notInText) return holdsAnAnswer({ item }) ? 'wrong' : 'unjudged'
	if (agreed.verdict === 'value') return valueJudgementOf({ item, value: agreed.value })
	const polarity = item.answer === undefined ? null : GOLD_POLARITY_ANSWER_PATTERN.exec(item.answer)
	if (polarity === null || (agreed.verdict !== 'yes' && agreed.verdict !== 'no')) return 'unjudged'
	return polarity[1].toLowerCase() === agreed.verdict ? 'agreed' : 'wrong'
}

/** Whether the item says the text answers it: a kind other than `not-in-text`, or (no kind) a quote. */
function holdsAnAnswer(params: { item: AskJudgementOfParams['item'] }): boolean {
	const { item } = params
	return item.kind === undefined ? item.expected.length > 0 : item.kind !== 'not-in-text'
}

/** A `value` verdict against the gold answer: its value inside the answer, both normalised and lower-cased. */
function valueJudgementOf(params: {
	item: AskJudgementOfParams['item']
	value: string | null
}): AskJudgement {
	const { item, value } = params
	if (item.answer === undefined || value === null) return 'unjudged'
	return normaliseText(item.answer).toLowerCase().includes(normaliseText(value).toLowerCase())
		? 'agreed'
		: 'wrong'
}
