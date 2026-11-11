import { PLAN_HEADING } from './brief-workspace.constants.ts'
import { FORGED_WORD } from './print-table.constants.ts'

/**
 * Text a file can hold on one line: a carriage return, an escape sequence and an override, with no line feed
 * (a ledger row is one line). Written with escapes only.
 */
export const FORGED_CELL = 'cell\r\u001b[2J\u{202e} FORGED'

/** Forged text a lots file accepts (it refuses a line feed or a carriage return): an escape sequence and an override. */
export const FORGED_ONE_LINE = 'feat/x\u001b[2J\u{202e} FORGED'

/** The header of the findings ledger the recap reads. */
export const LEDGER_HEADER =
	'# Findings ledger - lot\n\n| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

/** The ledger rows of the recap rows: the forged cell in the id, the severity, the finding text, the file cell or the state. */
export const LEDGER_ROWS = {
	id: [`R1-${FORGED_CELL}`, '1', 'nit', 'src/a.ts:1', 'a finding', 'open'],
	severity: ['R1-1', '1', FORGED_CELL, 'src/a.ts:1', 'a finding', 'open'],
	finding: ['R1-1', '1', 'blocking', 'src/a.ts:1', FORGED_CELL, 'open'],
	location: ['R1-1', '1', 'nit', `src/${FORGED_CELL}.ts:1`, 'a finding', 'open'],
	logged: ['R1-1', '1', 'nit', 'src/a.ts:1', FORGED_CELL, 'logged - a follow-up'],
	reason: ['R1-1', '1', 'nit', 'src/a.ts:1', 'a finding', `accepted (${FORGED_CELL})`],
	state: ['R1-1', '1', 'nit', 'src/a.ts:1', 'a finding', FORGED_CELL],
} as const

/** The lot declaration of a recap row: its accepted and revised cases carry the forged value as case and reason. */
export const FORGED_LOT_DECLARATION = {
	accept: [{ case: `src/a.test.ts::${FORGED_WORD}`, reason: FORGED_WORD }],
	revised: [{ case: `src/b.test.ts::${FORGED_WORD}`, reason: FORGED_WORD }],
}

/** The lot declaration whose accept entry holds a key no entry has: the recap refuses and quotes the key. */
export const FORGED_KEY_DECLARATION = {
	accept: [{ case: 'src/a.test.ts::a case', reason: 'a reason', [FORGED_WORD]: 1 }],
}

/** The steps of a brief whose first behaviour is the forged text. */
export const FORGED_STEPS = [
	{
		title: 'a step',
		spec: PLAN_HEADING,
		behaviours: [FORGED_WORD, 'a state -> an outcome'],
	},
]

/** The open real lot the wouldRefuse row's brief meets, and its scope. */
export const OPEN_LOT_NAME = '0007-repo-open'
export const OPEN_LOT_SCOPE: readonly string[] = ['src/dataflow/']

/** The word the `api find` row searches for: the index it reads is the forged one. */
export const API_SEARCH_WORD = 'word'

/** Where the forged api index lives in the scratch package, relative to it. */
export const FORGED_API_INDEX_FILE = 'skills/scratch/references/api.json'

/** What the escape character of the forged values prints as once escaped, for the rows whose value has no override. */
export const ESCAPED_ESCAPE_CHARACTER = '\\u{1b}'
