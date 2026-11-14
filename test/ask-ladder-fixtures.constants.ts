/** Constants of the ask ladder's tests: catalogues, api indexes, hashes, and the blocks of a synthetic standard. */
import { EXAMPLE_CODE } from './ask-fixtures.constants.ts'

import type { AskStandard } from '../src/lib/knowledge/ask/ask.types.ts'
import type { Catalogues } from '../src/lib/run/explain-code.types.ts'
import type { SyntheticBlock } from './synthetic-standard.types.ts'

/** The hashes the setup names for the catalogues and the api index it holds. */
export const CATALOGUE_HASH = `sha256:${'c'.repeat(64)}`
export const API_INDEX_HASH = `sha256:${'d'.repeat(64)}`

/** The installed version of the multi-declared dialecte's package. */
export const DIALECTE_VERSION = '1.2.3'

/** The clock of the setup. */
export const SETUP_NOW = new Date('2026-11-13T10:00:00.000Z')

export const EXAMPLE_MESSAGE = 'The example failed.'
export const EXAMPLE_FIX = 'Run the example again.'

/** The export of the dialecte's own error catalogue, as a dialecte names it (not after its package). */
export const OWN_CATALOGUE_EXPORT = 'TEST_ERRORS'

/** One error catalogue holding one entry of `EX0001`. */
export const CATALOGUES: Catalogues = {
	errors: [
		{
			name: OWN_CATALOGUE_EXPORT,
			entries: {
				EXAMPLE_FAILURE: {
					code: EXAMPLE_CODE,
					message: EXAMPLE_MESSAGE,
					explanation: { when: 'The example ran.', fix: EXAMPLE_FIX },
				},
			},
		},
	],
	diagnostics: [],
}

/** `EX0001` named by an error catalogue and by a diagnostic catalogue: two entries. */
export const TWICE_NAMED_CATALOGUES: Catalogues = {
	errors: CATALOGUES.errors,
	diagnostics: [
		{
			name: 'DIAGNOSTICS',
			source: 'example',
			codes: { [EXAMPLE_CODE]: { severity: 'error', family: 'example', message: 'Seen twice.' } },
		},
	],
}

/** The catalogue of `CATALOGUES` after the entry's message changed. */
export const CHANGED_CATALOGUES: Catalogues = {
	errors: [
		{
			name: OWN_CATALOGUE_EXPORT,
			entries: {
				EXAMPLE_FAILURE: {
					code: EXAMPLE_CODE,
					message: 'The example failed in another way.',
					explanation: { when: 'The example ran.', fix: EXAMPLE_FIX },
				},
			},
		},
	],
	diagnostics: [],
}

export const INFO_METHOD_PATH = 'doc.query.info.of'

/** The methods of an index whose `info.of` holds the intents `read` and `information`: path and one intent. */
export const INFO_METHOD_ROWS: { path: string; intent: string }[] = [
	{ path: INFO_METHOD_PATH, intent: 'read the information of an element' },
	{ path: 'doc.query.tree.of', intent: 'read the tree of an element' },
]

/** Six methods whose intents share `read` with the need and none its second word. */
export const CROWDED_METHOD_ROWS: { path: string; intent: string }[] = [
	{ path: 'doc.query.read1', intent: 'read alpha1' },
	{ path: 'doc.query.read2', intent: 'read alpha2' },
	{ path: 'doc.query.read3', intent: 'read alpha3' },
	{ path: 'doc.query.read4', intent: 'read alpha4' },
	{ path: 'doc.query.read5', intent: 'read alpha5' },
	{ path: 'doc.query.read6', intent: 'read alpha6' },
]

/** The package the api indexes belong to. */
export const API_PACKAGE = '@dialecte/core-test'

/** The definition AA_1 holds, the first clause names `AA_1`, the second holds `closing`. */
export const SCOPE_AND_CLOSING_BLOCKS: SyntheticBlock[] = [
	{ kind: 'heading', number: '1', title: 'Scope' },
	{ kind: 'blank' },
	{ kind: 'raw', lines: ['The element AA_1 holds D and DD_1.'] },
	{ kind: 'blank' },
	{ kind: 'heading', number: '2', title: 'Closing' },
	{ kind: 'blank' },
	{ kind: 'raw', lines: ['Unrelated closing passage.'] },
	{ kind: 'blank' },
]

/** The standard folder the documents are read from, and its files key. */
export const DOCUMENT_FOLDERS = [{ id: 'example-0000', files: `sha256:${'e'.repeat(64)}` }]

/** No documents: the dialecte declares no standard. */
export const NO_DOCUMENTS: AskStandard = { kind: 'none', name: null, key: null }

/** The package of core, whose catalogue is named `core` (D10b). */
export const CORE_PACKAGE = '@dialecte/core'

/** `EX0001` explained by core's own error catalogue only. */
export const CORE_CATALOGUES: Catalogues = {
	errors: [
		{
			name: 'core',
			entries: {
				EXAMPLE_FAILURE: {
					code: EXAMPLE_CODE,
					message: EXAMPLE_MESSAGE,
					explanation: { when: 'The example ran.', fix: EXAMPLE_FIX },
				},
			},
		},
	],
	diagnostics: [],
}

/** The question every ladder case asks unless it names another, and its subject's package. */
export const CHILDREN_QUESTION = 'children of AA_1'
export const DIALECTE_PACKAGE = '@dialecte/core-test'
