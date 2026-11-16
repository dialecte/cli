import { OUTSIDE_SOURCE_ORDER, STANDARD_SOURCE_KIND } from './ask.constants.ts'

import type { FactDraft, FactSource } from '../facts/facts.types.ts'
import type { FactDraftOfParams, OutsideFactSources, ReaderFactBy } from './ask.types.ts'

/**
 * The fact an agreed answer is recorded as: the agreeing verdict, the union of verified cites as evidence, the
 * shortest agreeing answer; a standard fact by folder keys, or an unchecked outside fact by source kind.
 */
export function factDraftOf(params: FactDraftOfParams): FactDraft {
	const { request, agreed, outside } = params
	const by: ReaderFactBy = {
		rung: params.adjudicator ? 5 : 4,
		readers: agreed.letters.length,
		rounds: params.rounds,
		adjudicator: params.adjudicator,
		person: null,
		tiers: params.tiers,
	}
	const draft: FactDraft = {
		question: request.question,
		subject: params.subject,
		kind: request.kind,
		answer: { verdict: agreed.verdict, value: agreed.value, text: agreed.answer },
		source: 'standard',
		effort: request.effort,
		evidence: agreed.cites,
		by,
		sources: params.standards.map((folder) => ({
			kind: STANDARD_SOURCE_KIND,
			standard: folder.id,
			files: folder.files,
		})),
	}
	if (outside === null) return draft
	return {
		...draft,
		source: 'outside',
		unchecked: true,
		evidence: outside.cites,
		sources: outsideSourcesOf({ outside }),
	}
}

/** The kinds the outside readers answered from, model first then web, the web's urls each once. */
function outsideSourcesOf(params: { outside: OutsideFactSources }): FactSource[] {
	return OUTSIDE_SOURCE_ORDER.flatMap(function sourceOf(kind): FactSource[] {
		const readers = params.outside.sources.filter((entry) => entry.source === kind)
		if (readers.length === 0) return []
		const urls = [...new Set(readers.flatMap((entry) => entry.urls))]
		return [kind === 'web' ? { kind, urls } : { kind }]
	})
}
