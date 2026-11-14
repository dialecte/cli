/**
 * Shared by the fix round 1 cases of the `ask` command: facts recorded into the workspace's ledger.
 */
import { factsFolder } from '../src/lib/knowledge/facts/data-folder.ts'
import { recordFact } from '../src/lib/knowledge/facts/record-fact.ts'
import {
	FACT_ANSWER_TEXT,
	LACKING_ATTRIBUTE_ANSWER_TEXT,
	LACKING_ATTRIBUTE_QUESTION,
} from './ask-fix-1.constants.ts'
import { SETUP_NOW } from './ask-ladder-fixtures.constants.ts'
import { factDraft } from './fact-fixtures.ts'

import type { FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'
import type { AskCommandWorkspace } from './ask-command-workspace.types.ts'

/** The facts folder the workspace's ask reads. */
export function workspaceFactsFolder(params: { workspace: AskCommandWorkspace }): string {
	return factsFolder({ environment: params.workspace.environment })
}

/** Records an outside fact (stored `unchecked`) of the package into the workspace's ledger; answers its id. */
export function recordUncheckedFact(params: {
	workspace: AskCommandWorkspace
	packageName: string
	question: string
}): string {
	const draft: FactDraft = factDraft({
		question: params.question,
		subject: {
			package: params.packageName,
			tags: [{ tag: 'D', parent: 'A' }],
			attributes: [],
			codes: [],
			methods: [],
		},
		answer: { verdict: 'yes', value: null, text: FACT_ANSWER_TEXT },
		source: 'outside',
		sources: [{ kind: 'model' }],
	})
	return recordFact({
		folder: workspaceFactsFolder({ workspace: params.workspace }),
		draft,
		now: () => SETUP_NOW,
	}).id
}

/**
 * Records a person's fact keyed to the question `is aAAA_1 required on AA_1` of the dialecte's package, a fact the
 * ladder's rung 0 would reuse; answers its id.
 */
export function recordLackingAttributeFact(params: {
	workspace: AskCommandWorkspace
	packageName: string
}): string {
	const draft: FactDraft = factDraft({
		question: LACKING_ATTRIBUTE_QUESTION,
		subject: {
			package: params.packageName,
			tags: [{ tag: 'AA_1', parent: null }],
			attributes: ['aAAA_1'],
			codes: [],
			methods: [],
		},
		kind: 'required',
		answer: { verdict: 'yes', value: 'aAAA_1', text: LACKING_ATTRIBUTE_ANSWER_TEXT },
		source: 'person',
		sources: [],
	})
	return recordFact({
		folder: workspaceFactsFolder({ workspace: params.workspace }),
		draft,
		now: () => SETUP_NOW,
	}).id
}
