import { definitionHash } from '../../schema/definition-hash.ts'
import { stableJson } from '../../stable-json.ts'
import { CHECK_REASON_SEPARATOR, SCHEMA_SOURCE_KIND } from '../facts/facts.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	ANSWER_VALUE_TEMPLATE,
	DIALECTE_SOURCE_KIND,
	NO_ANSWER_VALUE,
	RECHECK_REASONS,
} from './ask.constants.ts'
import { rerunRung } from './rerun-rung.ts'

import type { CheckOutcome, Fact, FactCheck, FactSource } from '../facts/facts.types.ts'
import type { AskSetup, LadderCheckOfParams, OwnSourceOutcome } from './ask.types.ts'

/**
 * The check of a fact's sources the ladder applies (D9): standard sources as the base check says; a schema or
 * Dialecte source whose hash moved re-runs the rung on the fact's subject and kind.
 */
export function ladderCheckOf(params: LadderCheckOfParams): FactCheck {
	const { setup } = params
	return function ladderCheck({ fact }): CheckOutcome {
		const own = new Map<number, OwnSourceOutcome>()
		const rest: FactSource[] = []
		for (const [index, source] of fact.sources.entries()) {
			const outcome = ownSourceOutcomeOf({ fact, source, setup })
			if (outcome === undefined) rest.push(source)
			else own.set(index, outcome)
		}
		const base: CheckOutcome =
			rest.length === 0 ? { state: 'valid' } : setup.baseCheck({ fact: { ...fact, sources: rest } })
		const outcomes: CheckOutcome[] = [
			base,
			...[...own.values()].map((outcome) =>
				outcome.state === 'valid' ? { state: outcome.state } : outcome,
			),
		]
		const state = worstStateOf({ outcomes })
		if (state !== 'valid') {
			const reasons = outcomes.flatMap((outcome) =>
				outcome.state === state && outcome.reason !== undefined ? [outcome.reason] : [],
			)
			return { state, reason: reasons.join(CHECK_REASON_SEPARATOR) }
		}
		const sources = sourcesNowOf({ fact, own, rest: base.sources ?? rest })
		return stableJson(sources) === stableJson(fact.sources) ? { state } : { state, sources }
	}
}

/**
 * What the ladder says of a source it checks itself: a schema source of a loaded dialecte against its definition
 * hash, a Dialecte source against the catalogue or api index hash; a moved hash re-runs the rung, and the fact
 * holds when the rung answers the same verdict and value. Undefined for any other source (the base check's).
 */
function ownSourceOutcomeOf(params: {
	fact: Fact
	source: FactSource
	setup: AskSetup
}): OwnSourceOutcome | undefined {
	const { fact, source, setup } = params
	if (source.kind === SCHEMA_SOURCE_KIND) {
		const dialecte = setup.dialectes.find((loaded) => loaded.packageName === source.package)
		if (dialecte === undefined) return undefined
		if (source.definitionHash === definitionHash({ config: dialecte.config }))
			return { state: 'valid', source }
		return rerunOutcomeOf({ fact, source, setup, rung: 1 })
	}
	if (source.kind !== DIALECTE_SOURCE_KIND) return undefined
	const holds =
		source.catalogue !== undefined
			? source.catalogue === setup.catalogueHash
			: setup.apiIndexes.some((entry) => entry.hash === source.apiJson)
	if (holds) return { state: 'valid', source }
	return rerunOutcomeOf({ fact, source, setup, rung: 2 })
}

/** The fact's question asked again at its rung: the same verdict and value hold with the rung's source now. */
function rerunOutcomeOf(params: {
	fact: Fact
	source: FactSource
	setup: AskSetup
	rung: 1 | 2
}): OwnSourceOutcome {
	const { fact, source, setup, rung } = params
	const rerun = rerunRung({
		question: fact.question,
		subject: fact.subject,
		kind: fact.kind,
		rung,
		setup,
	})
	const values = { package: String(source.package), fact: fact.id }
	if ('unanswered' in rerun)
		return {
			state: 'stale',
			reason: fillMessage({
				template:
					rung === 1 ? RECHECK_REASONS.schemaUnanswered : RECHECK_REASONS.dialecteUnanswered,
				values,
			}),
		}
	const { answer, sources } = rerun.answer
	const same = answer.verdict === fact.answer.verdict && answer.value === fact.answer.value
	const now = sources.find((candidate) => candidate.kind === source.kind)
	if (same && now !== undefined) return { state: 'valid', source: now }
	return {
		state: 'stale',
		reason: fillMessage({
			template: rung === 1 ? RECHECK_REASONS.schemaChanged : RECHECK_REASONS.dialecteChanged,
			values: {
				...values,
				now: answerValueOf({ value: answer.value }),
				was: answerValueOf({ value: fact.answer.value }),
			},
		}),
	}
}

/** An answer's value as a reason names it. */
function answerValueOf(params: { value: string | null }): string {
	return params.value === null
		? NO_ANSWER_VALUE
		: fillMessage({ template: ANSWER_VALUE_TEMPLATE, values: { value: params.value } })
}

/** Stale when a source moved, else unverifiable when one cannot be compared, else valid. */
function worstStateOf(params: { outcomes: CheckOutcome[] }): CheckOutcome['state'] {
	const states = params.outcomes.map((outcome) => outcome.state)
	if (states.includes('stale')) return 'stale'
	return states.includes('unverifiable') ? 'unverifiable' : 'valid'
}

/**
 * The fact's sources now, in their order: each source the ladder checked as it holds now, the others as the base
 * check gave them back (any it added after them).
 */
function sourcesNowOf(params: {
	fact: Fact
	own: Map<number, OwnSourceOutcome>
	rest: FactSource[]
}): FactSource[] {
	const rest = [...params.rest]
	const sources = params.fact.sources.flatMap(function sourceNow(_source, index): FactSource[] {
		const outcome = params.own.get(index)
		if (outcome !== undefined) return outcome.state === 'valid' ? [outcome.source] : []
		const next = rest.shift()
		return next === undefined ? [] : [next]
	})
	return [...sources, ...rest]
}
