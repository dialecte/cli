/** The production file of the tdd step-event cases: a stub (red), then the real code (green). */
export const ADD_FILE = 'src/add.ts'

/** The stub a test station leaves: the test fails on it for a real reason. */
export const ADD_STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"

/** The code the implementer writes. */
export const ADD_CODE =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'

/** The test file the red run records; it holds one case. */
export const ADD_TEST_FILE = 'src/add.test.ts'

export const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'})',
	'',
].join('\n')

/** The git file the tdd ledger lives in. */
export const TDD_LEDGER_FILE = 'dialecte-tdd.json'

/** The line a step recorder says when an event could not be written (spec 4, D11). */
export const NOT_RECORDED_PREFIX = 'events: not recorded: '

/** The time every receipt of these cases records. */
export const TDD_NOW = new Date('2026-11-10T12:00:00.000Z')
