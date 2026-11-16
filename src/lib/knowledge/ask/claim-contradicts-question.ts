import { anchorsOf, subjectNamesOf } from './anchors-of.ts'
import { NEGATION_CUES, POLARITY_VERDICTS } from './ask.constants.ts'
import { cueCountOf } from './cue-count-of.ts'

import type { AskSubjectTerms, ReportVerdict } from './ask.types.ts'

/** True when the text holds an odd number of negation cues near its anchors. */
export function isNegated(params: { text: string; anchors: string[] }): boolean {
	return cueCountOf({ ...params, cues: NEGATION_CUES }) % 2 === 1
}

/**
 * Comparison 2 of the polarity checks: a claim whose negation parity equals the question's supports `yes`, one
 * whose parity differs supports `no`; a yes or no claim that backs the other is a conflict. Other verdicts are
 * not compared.
 */
export function claimContradictsQuestion(params: {
	claimText: string
	supports: ReportVerdict | 'not-known'
	question: string
	subject: AskSubjectTerms
	fallback: string | undefined
}): boolean {
	if (!POLARITY_VERDICTS.includes(params.supports)) return false
	const names = subjectNamesOf({ subject: params.subject })
	const claimNegated = isNegated({
		text: params.claimText,
		anchors: anchorsOf({ text: params.claimText, names, fallback: params.fallback }),
	})
	const questionNegated = isNegated({
		text: params.question,
		anchors: anchorsOf({ text: params.question, names, fallback: params.fallback }),
	})
	const expected = claimNegated === questionNegated ? 'yes' : 'no'
	return params.supports !== expected
}
