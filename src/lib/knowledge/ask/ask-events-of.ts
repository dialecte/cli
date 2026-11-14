import { makeEnvelope } from '../../events/write-event.ts'
import { readCliVersion } from '../../read-cli-version.ts'
import { factKeyOf } from '../facts/fact-key.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { ASK_EVENT_KINDS, RUNG_PASSED, STALE_CANDIDATE_START } from './ask.constants.ts'

import type { LotEvent } from '../../events/event.types.ts'
import type { AskCandidate, AskEventsOfParams, AskOutcome, RungTiming } from './ask.types.ts'

/**
 * The events of one ask in order: `ask.parsed`, one `ask.rung` per rung run, `ask.fact`, `ask.state`. None holds the
 * question's text (its key hash and its length only), an answer, a quote, a slice or a term of an angle; `ask.state`
 * says whether the ask flagged a standard-vs-XSD conflict (D29), never what it named.
 */
export function askEventsOf(params: AskEventsOfParams): LotEvent[] {
	const { ask, outcome, request } = params
	const cli = readCliVersion()
	function eventOf(event: { kind: string; fields: Record<string, unknown> }): LotEvent {
		const { kind, fields } = event
		return {
			...makeEnvelope({
				lot: params.lot,
				kind,
				by: 'cli',
				cli,
				simulated: false,
				hostEvent: null,
				now: params.now,
			}),
			ask,
			...fields,
		}
	}
	const { subject, context } = outcome
	return [
		eventOf({
			kind: ASK_EVENT_KINDS.parsed,
			fields: {
				key: factKeyOf({
					question: request.question,
					subject,
					kind: outcome.kind,
					package: subject.package,
				}),
				length: request.question.length,
				subject: {
					tags: subject.tags.length,
					attributes: subject.attributes.length,
					codes: subject.codes.length,
					methods: subject.methods.length,
				},
				context: { package: context.package, resolved: context.resolved },
				// the question's kind: `kind` is the envelope's (the event kind), so the field takes its own name
				questionKind: outcome.kind,
				decision: outcome.decision,
			},
		}),
		...params.rungs.map((timing) =>
			eventOf({
				kind: ASK_EVENT_KINDS.rung,
				fields: {
					rung: timing.rung,
					outcome: rungOutcomeOf({ timing, outcome }),
					durationMs: timing.durationMs,
				},
			}),
		),
		eventOf({
			kind: ASK_EVENT_KINDS.fact,
			fields: {
				hit: outcome.rung === 0 ? outcome.fact : null,
				candidates: outcome.candidates.length,
				new: outcome.rung === 0 ? null : outcome.fact,
				stale: outcome.candidates.filter(isStaleCandidate).length,
			},
		}),
		eventOf({
			kind: ASK_EVENT_KINDS.state,
			// D29: whether prose named what the definition rejects; never the fact nor the items
			fields: { state: outcome.state, rung: outcome.rung, conflict: outcome.conflict !== null },
		}),
	]
}

/** What a rung run came to: the ask's state at the rung it stopped at (`answered` there), `passed` before it. */
function rungOutcomeOf(params: { timing: RungTiming; outcome: AskOutcome }): string {
	const { timing, outcome } = params
	return timing.rung === outcome.rung ? outcome.state : RUNG_PASSED
}

/** A candidate whose reason says it is stale. */
function isStaleCandidate(candidate: AskCandidate): boolean {
	return candidate.why.startsWith(
		fillMessage({ template: STALE_CANDIDATE_START, values: { fact: candidate.fact } }),
	)
}
