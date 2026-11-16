import { agreedOf } from './agreed-of.ts'
import {
	ADJUDICATOR_EFFORT,
	NOT_IN_TEXT_VERDICT,
	PERSON_REASONS,
	ROUND_CEILING,
	ROUNDS_AT_EFFORT,
} from './ask.constants.ts'
import { hasPolarityConflict, reportsAgree, valuesAgree } from './reports-agree.ts'

import type { AcceptedReport, AskKind, RoundOutcome, RoundOutcomeOfParams } from './ask.types.ts'

/**
 * What a closed round of document readers came to at the ask's effort (section 8): answered, another round, the
 * adjudicator, or the person.
 */
export function roundOutcomeOf(params: RoundOutcomeOfParams): RoundOutcome {
	const { effort, round, accepted } = params
	const kind = params.kind ?? 'semantic'
	const high = effort === ADJUDICATOR_EFFORT
	// a polarity conflict never counts toward agreement: the adjudicator reads it at high, else the person (D19)
	if (accepted.some((report) => hasPolarityConflict({ report })))
		return high
			? { state: 'needs-adjudicator', reason: 'polarity-conflict' }
			: { state: 'needs-person', reason: PERSON_REASONS.polarityConflict }
	const answering = accepted.filter(isAnswering)
	if (answering.length === 0) {
		// nothing verified: search again while something is left, at every effort, up to the ceiling (32, 32b)
		if (params.anythingLeft && round < ROUND_CEILING)
			return { state: 'next-round', reason: 'not-in-text' }
		return {
			state: 'needs-person',
			reason: params.anythingLeft ? PERSON_REASONS.ceiling : PERSON_REASONS.nothingFound,
		}
	}
	const agreement = agreementOf({ answering, kind })
	if ('agreeing' in agreement)
		return { state: 'answered', agreed: agreedOf({ reports: agreement.agreeing }) }
	// another round only while it has something to give: else the adjudicator (high) or the person (R1-3)
	if (params.anythingLeft && round < ROUNDS_AT_EFFORT[effort] && round < ROUND_CEILING)
		return { state: 'next-round', reason: agreement.dissent ? 'dissent' : 'disagreement' }
	return high
		? { state: 'needs-adjudicator', reason: 'no-agreement' }
		: { state: 'needs-person', reason: PERSON_REASONS.noAgreement }
}

/** A report that answers: a verdict other than `not-in-text` backed by a verified claim. */
function isAnswering(report: AcceptedReport): boolean {
	return (
		report.report.verdict !== NOT_IN_TEXT_VERDICT && report.claims.some((claim) => claim.verified)
	)
}

/**
 * The readers that agree (a pair agreeing, and every other answering reader agreeing with them), or no agreement:
 * none agrees, or another answering reader holds a verified claim for another verdict or value (a dissent, case
 * 29: two votes never outvote it). A reader of the same verdict and value without a shared cite is no dissent.
 */
function agreementOf(params: {
	answering: AcceptedReport[]
	kind: AskKind
}): { agreeing: AcceptedReport[] } | { dissent: boolean } {
	const { answering, kind } = params
	const pair = pairOf({ answering, kind })
	if (pair === undefined) return { dissent: false }
	const [first] = pair
	const others = answering.filter((report) => !pair.includes(report))
	const dissent = others.some(
		(report) =>
			report.report.verdict !== first.report.verdict ||
			!valuesAgree({ first: report.report.value, second: first.report.value, kind }),
	)
	if (dissent) return { dissent: true }
	const joined = others.filter((report) => reportsAgree({ first, second: report, kind }))
	return {
		agreeing: answering.filter((report) => pair.includes(report) || joined.includes(report)),
	}
}

/** The first two answering reports that agree, in the order of the reports; undefined when none does. */
function pairOf(params: {
	answering: AcceptedReport[]
	kind: AskKind
}): [AcceptedReport, AcceptedReport] | undefined {
	const { answering, kind } = params
	for (const [index, first] of answering.entries())
		for (const second of answering.slice(index + 1))
			if (reportsAgree({ first, second, kind })) return [first, second]
	return undefined
}
