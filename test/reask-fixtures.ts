/**
 * Shared by the re-ask tests: a facts folder holding `unchecked` facts of two packages (an outside fact, a person's
 * fact flagged unchecked), one of them already re-asked, and a claim that records the questions it is given.
 */
import { appendHistory, historyPathOf } from '../src/lib/knowledge/facts/fact-history.ts'
import { recordFact } from '../src/lib/knowledge/facts/record-fact.ts'
import { SETUP_NOW } from './ask-ladder-fixtures.constants.ts'
import { newFactsFolder } from './ask-ladder-fixtures.ts'
import { factDraft } from './fact-fixtures.ts'
import {
	CLAIMED_ASKS,
	OTHER_PACKAGE,
	REASK_PACKAGE,
	REASK_QUESTIONS,
} from './standard-selection.constants.ts'

import type { FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'
import type { ReaskScenario } from './reask-fixtures.types.ts'

/** The clock of the re-ask cases. */
export function fixedNow(): Date {
	return SETUP_NOW
}

/** The draft of a fact of `packageName` about `question`; `changes` replace members whole. */
function draftOf(params: {
	question: string
	packageName: string
	changes?: Partial<FactDraft>
}): FactDraft {
	return factDraft({
		question: params.question,
		subject: {
			package: params.packageName,
			tags: [{ tag: 'D', parent: 'A' }],
			attributes: [],
			codes: [],
			methods: [],
		},
		...params.changes,
	})
}

/** An outside fact (stored `unchecked`) of the package, about the question. */
function outsideDraftOf(params: { question: string; packageName: string }): FactDraft {
	return draftOf({
		...params,
		changes: { source: 'outside', sources: [{ kind: 'model' }] },
	})
}

/** A person's fact flagged `unchecked: true` (stored `valid`, the flag kept). */
function personDraftOf(params: { question: string; packageName: string }): FactDraft {
	return draftOf({
		...params,
		changes: { source: 'person', sources: [], unchecked: true },
	})
}

/**
 * A facts folder holding: F-0001 an outside fact and F-0002 a person's unchecked fact of the re-asked package,
 * F-0003 an outside fact of another package, F-0004 an outside fact of the re-asked package that was already
 * re-asked for its documents, F-0005 a standard fact of the re-asked package. The claim hands out `CLAIMED_ASKS`.
 */
export function reaskScenario(): ReaskScenario {
	const folder = newFactsFolder()
	const drafts: FactDraft[] = [
		outsideDraftOf({ question: REASK_QUESTIONS.first, packageName: REASK_PACKAGE }),
		personDraftOf({ question: REASK_QUESTIONS.second, packageName: REASK_PACKAGE }),
		outsideDraftOf({ question: REASK_QUESTIONS.elsewhere, packageName: OTHER_PACKAGE }),
		outsideDraftOf({ question: REASK_QUESTIONS.reasked, packageName: REASK_PACKAGE }),
		draftOf({
			question: 'Does the fifth example element hold a name?',
			packageName: REASK_PACKAGE,
		}),
	]
	for (const draft of drafts) recordFact({ folder, draft, now: fixedNow })
	appendHistory({
		file: historyPathOf({ folder, id: 'F-0004' }),
		line: {
			at: SETUP_NOW.toISOString(),
			event: 'rechecked',
			fact: 'F-0004',
			lot: null,
			ask: 'A-0090',
			reason: 'documents',
		},
	})
	return { folder, ...claimerOf() }
}

/**
 * A facts folder holding: F-0001 an outside fact whose history holds a `rechecked` line of another reason, F-0002
 * one whose `rechecked` line has no reason, F-0003 an outside fact superseded by F-0004 (a standard fact of the same
 * key). All of the re-asked package. The claim hands out `CLAIMED_ASKS`.
 */
export function reaskEdgeScenario(): ReaskScenario {
	const folder = newFactsFolder()
	const packageName = REASK_PACKAGE
	const superseded = outsideDraftOf({ question: REASK_QUESTIONS.superseded, packageName })
	const drafts: FactDraft[] = [
		outsideDraftOf({ question: REASK_QUESTIONS.otherReason, packageName }),
		outsideDraftOf({ question: REASK_QUESTIONS.noReason, packageName }),
		superseded,
		draftOf({ question: REASK_QUESTIONS.superseded, packageName }),
	]
	for (const draft of drafts) recordFact({ folder, draft, now: fixedNow })
	const line = {
		at: SETUP_NOW.toISOString(),
		event: 'rechecked' as const,
		lot: null,
		ask: 'A-0090',
	}
	appendHistory({
		file: historyPathOf({ folder, id: 'F-0001' }),
		line: { ...line, fact: 'F-0001', reason: 'definition' },
	})
	appendHistory({
		file: historyPathOf({ folder, id: 'F-0002' }),
		line: { ...line, fact: 'F-0002' },
	})
	return { folder, ...claimerOf() }
}

/** A claim handing out `CLAIMED_ASKS` in order, and the questions it was given. */
function claimerOf(): Pick<ReaskScenario, 'claim' | 'claimed'> {
	const claimed: { question: string }[] = []
	return {
		claimed,
		claim: function claimAsk(params) {
			claimed.push(params)
			return CLAIMED_ASKS[claimed.length - 1]
		},
	}
}
