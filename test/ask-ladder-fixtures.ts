/**
 * Shared by the ask ladder's tests: a setup built in memory (the multi-declared dialecte, catalogues, an api index,
 * documents of a synthetic standard), a request, the draft of a fact of the key, and the entries of a facts folder.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	API_INDEX_HASH,
	API_PACKAGE,
	CATALOGUE_HASH,
	CATALOGUES,
	CHILDREN_QUESTION,
	DIALECTE_PACKAGE,
	DIALECTE_VERSION,
	DOCUMENT_FOLDERS,
	INFO_METHOD_ROWS,
	NO_DOCUMENTS,
	SCOPE_AND_CLOSING_BLOCKS,
	SETUP_NOW,
} from './ask-ladder-fixtures.constants.ts'
import { factDraft } from './fact-fixtures.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { SYNTHETIC_VOCABULARY } from './search-synthetic-standard.constants.ts'
import { padded, searchSynthetic } from './search-synthetic-standard.ts'

import type { ApiJson } from '../src/lib/api/api-json.types.ts'
import type { AskRequest, AskSetup, AskStandard } from '../src/lib/knowledge/ask/ask.types.ts'
import type { FactCheck, FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'
import type { StandardSearchIndex } from '../src/lib/knowledge/standard/standard-search.types.ts'
import type { LoadedDialecte } from '../src/lib/schema/schema.types.ts'

/** A base check that finds every fact valid, as it stands. */
export function everythingValid(): ReturnType<FactCheck> {
	return { state: 'valid' }
}

/** The facts folder of a test: a path under the test's temporary folder, not made yet. */
export function newFactsFolder(): string {
	return join(temporaryFolder('dialecte-ask-ladder-'), 'facts')
}

/** The file names a facts folder holds, sorted; none when the folder does not exist yet. */
export function folderEntriesOf(params: { folder: string }): string[] {
	return existsSync(params.folder) ? readdirSync(params.folder).sort() : []
}

/** An api index of one package from rows of a path and one intent each. */
export function apiIndexOf(params: {
	rows: { path: string; intent: string }[]
	packageName?: string
}): ApiJson {
	return {
		package: params.packageName ?? API_PACKAGE,
		methods: params.rows.map((row) => ({
			root: 'doc',
			path: row.path,
			otherRoutes: [],
			signature: '() => void',
			summary: undefined,
			intents: [row.intent],
			declaredAt: undefined,
			example: undefined,
		})),
	}
}

/** The search index of the synthetic standard whose first clause names `AA_1` and the second `closing`. */
export function scopeIndex(): StandardSearchIndex {
	return searchSynthetic({
		files: padded(SCOPE_AND_CLOSING_BLOCKS)[0],
		vocabulary: SYNTHETIC_VOCABULARY,
	})
}

/** Documents the ask may read: the synthetic standard under one folder. */
export function documentsOf(): AskStandard {
	return { kind: 'documents', indexes: [scopeIndex()], folders: DOCUMENT_FOLDERS }
}

/** A setup in memory; every member the case does not name is the plain one. */
export function setupOf(params: {
	dialecte: LoadedDialecte
	factsFolder: string
	standard?: AskStandard
	catalogues?: AskSetup['catalogues']
	apiIndex?: ApiJson
	baseCheck?: FactCheck
}): AskSetup {
	return {
		dialectes: [params.dialecte],
		versions: { [params.dialecte.packageName]: DIALECTE_VERSION },
		factsFolder: params.factsFolder,
		catalogues: params.catalogues ?? CATALOGUES,
		catalogueHash: CATALOGUE_HASH,
		apiIndexes: [
			{ index: params.apiIndex ?? apiIndexOf({ rows: INFO_METHOD_ROWS }), hash: API_INDEX_HASH },
		],
		standard: params.standard ?? NO_DOCUMENTS,
		baseCheck: params.baseCheck ?? everythingValid,
		now: () => SETUP_NOW,
	}
}

/** A request at medium effort with facts on; `changes` replace members whole. */
export function requestOf(changes: Partial<AskRequest> = {}): AskRequest {
	return {
		question: CHILDREN_QUESTION,
		decision: false,
		effort: 'medium',
		noFacts: false,
		limit: 10,
		noStandard: false,
		personOnly: false,
		...changes,
	}
}

/**
 * A draft of the fact the ask `children of AA_1` keys to (the key's package is the dialecte's); `changes` replace
 * members whole.
 */
export function childrenDraftOf(changes: Partial<FactDraft> = {}): FactDraft {
	return factDraft({
		question: CHILDREN_QUESTION,
		subject: {
			package: DIALECTE_PACKAGE,
			tags: [{ tag: 'AA_1', parent: null }],
			attributes: [],
			codes: [],
			methods: [],
		},
		kind: 'children',
		answer: {
			verdict: 'value',
			value: 'AAA_1, AAA_2, AAA_3',
			text: 'AA_1 may hold AAA_1, AAA_2, AAA_3.',
		},
		...changes,
	})
}

/** The dialecte with a definition that moved but still says what `AA_1` may hold: `D` documents itself. */
export function movedSameDialecte(params: { dialecte: LoadedDialecte }): LoadedDialecte {
	const { dialecte } = params
	const { definition } = dialecte.config
	return {
		...dialecte,
		config: {
			...dialecte.config,
			definition: {
				...definition,
				D: { ...definition.D, documentation: 'Changed documentation.' },
			},
		},
	}
}

/** The dialecte with a definition that moved so that `AA_1` no longer holds `AAA_3`. */
export function movedDifferentDialecte(params: { dialecte: LoadedDialecte }): LoadedDialecte {
	const { dialecte } = params
	const { definition } = dialecte.config
	const element = definition.AA_1
	return {
		...dialecte,
		config: {
			...dialecte.config,
			definition: {
				...definition,
				AA_1: {
					...element,
					children: {
						...element.children,
						sequence: element.children.sequence.filter((tag) => tag !== 'AAA_3'),
					},
				},
			},
		},
	}
}
