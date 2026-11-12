/** Whole facts built by hand (no ledger step), and the key of a draft, for the tests of the check and of the reads. */
import { factKeyOf } from '../src/lib/knowledge/facts/fact-key.ts'
import { factDraft } from './fact-fixtures.ts'

import type { Fact, FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'

/** A whole fact F-0001 of the draft, valid, never superseded; `changes` replace members whole. */
export function wholeFactOf(params: { draft?: FactDraft; changes?: Partial<Fact> } = {}): Fact {
	return {
		...(params.draft ?? factDraft()),
		id: 'F-0001',
		key: 'a'.repeat(64),
		at: '2026-11-11T10:00:00.000Z',
		state: 'valid',
		supersedes: null,
		supersededBy: null,
		...params.changes,
	}
}

/** The key of a draft, as the ledger derives it. */
export function keyOfDraft(draft: FactDraft): string {
	return factKeyOf({
		question: draft.question,
		subject: draft.subject,
		kind: draft.kind,
		package: draft.subject.package,
	})
}
