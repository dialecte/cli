import { unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { filesMovedBack, isRollbackGreen, readProductionState } from './production-states.ts'
import { hashProduction, hashText } from './tdd-files.ts'

import { describe, expect, it } from 'vitest'

import type {
	ProductionState,
	ReceiptFlag,
	ReceiptKind,
	TddLedger,
	TddReceipt,
	TestCaseId,
} from './tdd.types.ts'

/** The base the states of the rows are read with, unless a row names another. */
const BASE = 'base-1'

/** A red receipt of one case of `add`, taken at the production state `productionHash`. */
function receiptAt(productionHash: string): TddReceipt {
	return {
		kind: 'red',
		file: 'src/add.test.ts',
		name: 'add > one plus two',
		project: '',
		testFileHash: 'test',
		caseHash: 'case',
		productionHash,
		at: '2026-11-01T12:00:00.000Z',
	}
}

/** The states of a ledger under their base: `BASE` unless `bases` names another. */
function statesOf(params: {
	production: Record<string, Record<string, string>>
	bases?: Record<string, string>
}): Record<string, Record<string, Record<string, string>>> {
	const states: Record<string, Record<string, Record<string, string>>> = {}
	for (const [hash, files] of Object.entries(params.production)) {
		const base = params.bases?.[hash] ?? BASE
		states[base] = { ...states[base], [hash]: files }
	}
	return states
}

/** A ledger of one receipt per state, in order, with the states it records. */
function ledgerOf(params: {
	receipts: string[]
	production?: Record<string, Record<string, string>>
	bases?: Record<string, string>
}): TddLedger {
	return {
		version: 3,
		entries: params.receipts.map(receiptAt),
		...(params.production && {
			production: statesOf({ production: params.production, bases: params.bases }),
		}),
	}
}

/** A receipt step: the state it was taken at, a red unless `kind` says otherwise. */
type Step = string | { state: string; kind: ReceiptKind }

/** A ledger of one receipt per step, in order, its states read with `BASE`. */
function walkLedgerOf(params: {
	steps: Step[]
	production: Record<string, Record<string, string>>
}): TddLedger {
	return {
		version: 3,
		entries: params.steps.map((step) =>
			typeof step === 'string' ? receiptAt(step) : { ...receiptAt(step.state), kind: step.kind },
		),
		production: statesOf({ production: params.production }),
	}
}

/** `src/add.ts` at `add-1` (`one`), then at `add-2` (`two`). */
const PROVEN = { one: { 'src/add.ts': 'add-1' }, two: { 'src/add.ts': 'add-2' } }

/** An experiment: `src/extra.ts` added (`added`), then undone (`undone`, as at the base). */
const EXPERIMENT = { added: { 'src/extra.ts': 'extra-1' }, undone: {} }

const MOVED_BACK_CASES: Record<
	string,
	{ ledger: TddLedger; current: Omit<ProductionState, 'base'>; base?: string; moved: string[] }
> = {
	'a ledger recording no state → nothing moved back': {
		ledger: ledgerOf({ receipts: ['one', 'two'] }),
		current: { hash: 'one', files: {} },
		moved: [],
	},
	'production as at the last receipt → nothing moved back': {
		ledger: ledgerOf({
			receipts: ['one', 'two'],
			production: { one: { 'src/add.ts': 'add-1' }, two: { 'src/add.ts': 'add-2' } },
		}),
		current: { hash: 'two', files: { 'src/add.ts': 'add-2' } },
		moved: [],
	},
	'a file back at its content at the base → named': {
		ledger: ledgerOf({ receipts: ['one'], production: { one: { 'src/add.ts': 'add-1' } } }),
		current: { hash: 'base', files: {} },
		moved: ['src/add.ts'],
	},
	'a file of the base deleted at the last receipt, back now → named': {
		ledger: ledgerOf({ receipts: ['one'], production: { one: { 'src/add.ts': 'deleted' } } }),
		current: { hash: 'base', files: {} },
		moved: ['src/add.ts'],
	},
	"a file back at an earlier receipt's content → named": {
		ledger: ledgerOf({
			receipts: ['one', 'two'],
			production: { one: { 'src/add.ts': 'add-1' }, two: { 'src/add.ts': 'add-2' } },
		}),
		current: { hash: 'three', files: { 'src/add.ts': 'add-1' } },
		moved: ['src/add.ts'],
	},
	'a file at a content never seen → nothing moved back': {
		ledger: ledgerOf({
			receipts: ['one', 'two'],
			production: { one: { 'src/add.ts': 'add-1' }, two: { 'src/add.ts': 'add-2' } },
		}),
		current: { hash: 'three', files: { 'src/add.ts': 'add-3' } },
		moved: [],
	},
	'two files changed, one back at an earlier content → only it': {
		ledger: ledgerOf({
			receipts: ['one', 'two'],
			production: {
				one: { 'src/add.ts': 'add-1', 'src/sub.ts': 'sub-1' },
				two: { 'src/add.ts': 'add-2', 'src/sub.ts': 'sub-2' },
			},
		}),
		current: { hash: 'three', files: { 'src/add.ts': 'add-1', 'src/sub.ts': 'sub-3' } },
		moved: ['src/add.ts'],
	},
	'two files back → both, sorted': {
		ledger: ledgerOf({
			receipts: ['one', 'two'],
			production: {
				one: { 'src/sub.ts': 'sub-1', 'src/add.ts': 'add-1' },
				two: { 'src/sub.ts': 'sub-2', 'src/add.ts': 'add-2' },
			},
		}),
		current: { hash: 'one', files: { 'src/sub.ts': 'sub-1', 'src/add.ts': 'add-1' } },
		moved: ['src/add.ts', 'src/sub.ts'],
	},
	'the last receipt an unchanged one (any kind counts), a file back at the earlier content → named':
		{
			ledger: {
				version: 3,
				entries: [receiptAt('one'), { ...receiptAt('two'), kind: 'unchanged' }],
				production: statesOf({
					production: { one: { 'src/add.ts': 'add-1' }, two: { 'src/add.ts': 'add-2' } },
				}),
			},
			current: { hash: 'three', files: { 'src/add.ts': 'add-1' } },
			moved: ['src/add.ts'],
		},
	'the last receipt without a recorded state → measured from the last receipt that has one': {
		ledger: ledgerOf({
			receipts: ['one', 'two', 'three'],
			production: { one: { 'src/add.ts': 'add-1' }, two: { 'src/add.ts': 'add-2' } },
		}),
		current: { hash: 'four', files: { 'src/add.ts': 'add-1' } },
		moved: ['src/add.ts'],
	},
	'the states recorded at an earlier base, the current at another (the earlier lot committed) → nothing moved back':
		{
			ledger: ledgerOf({
				receipts: ['one', 'two'],
				production: { one: { 'src/add.ts': 'add-1' }, two: { 'src/add.ts': 'add-2' } },
			}),
			base: 'base-2',
			current: { hash: 'three', files: { 'src/sub.ts': 'sub-1' } },
			moved: [],
		},
	"a file at the content of a state of another base, the last receipt's state of the current base → nothing moved back":
		{
			ledger: ledgerOf({
				receipts: ['one', 'two'],
				production: { one: { 'src/sub.ts': 'sub-1' }, two: { 'src/sub.ts': 'sub-2' } },
				bases: { two: 'base-2' },
			}),
			base: 'base-2',
			current: { hash: 'three', files: { 'src/sub.ts': 'sub-1' } },
			moved: [],
		},
}

/**
 * The ledger walked in order: a receipt moves the newest content of each file to its state's when it is a
 * green or its state moved nothing back.
 */
const WALK_CASES: Record<
	string,
	{ ledger: TddLedger; current: Omit<ProductionState, 'base'>; moved: string[] }
> = {
	'production put back to an earlier state after a green, two reds there since → named': {
		ledger: walkLedgerOf({
			steps: ['one', { state: 'two', kind: 'green' }, 'one', 'one'],
			production: PROVEN,
		}),
		current: { hash: 'one', files: { 'src/add.ts': 'add-1' } },
		moved: ['src/add.ts'],
	},
	'put back after a green, then restored and green again, a red there → nothing moved back': {
		ledger: walkLedgerOf({
			steps: ['one', { state: 'two', kind: 'green' }, 'one', { state: 'two', kind: 'green' }],
			production: PROVEN,
		}),
		current: { hash: 'two', files: { 'src/add.ts': 'add-2' } },
		moved: [],
	},
	'put back after a green, a run there that only refused, then a red → named': {
		ledger: walkLedgerOf({
			steps: ['one', { state: 'two', kind: 'green' }, { state: 'one', kind: 'refused' }],
			production: PROVEN,
		}),
		current: { hash: 'one', files: { 'src/add.ts': 'add-1' } },
		moved: ['src/add.ts'],
	},
	'put back, a red there, then restored with no green yet → nothing moved back': {
		ledger: walkLedgerOf({
			steps: ['one', 'two', 'one'],
			production: PROVEN,
		}),
		current: { hash: 'two', files: { 'src/add.ts': 'add-2' } },
		moved: [],
	},
	'an experiment undone (a file added, then back as at the base) → named': {
		ledger: walkLedgerOf({ steps: ['added'], production: EXPERIMENT }),
		current: { hash: 'undone', files: {} },
		moved: ['src/extra.ts'],
	},
	'an experiment undone, a red there, then a green at a state keeping the undo, a later red → nothing moved back':
		{
			ledger: walkLedgerOf({
				steps: ['added', 'undone', { state: 'next', kind: 'green' }],
				production: { ...EXPERIMENT, next: { 'src/sub.ts': 'sub-1' } },
			}),
			current: { hash: 'later', files: { 'src/sub.ts': 'sub-2' } },
			moved: [],
		},
	'a file of the base deleted, then restored, a green at a state keeping it, a later red → nothing moved back':
		{
			ledger: walkLedgerOf({
				steps: ['dropped', 'restored', { state: 'next', kind: 'green' }],
				production: {
					dropped: { 'src/old.ts': 'deleted' },
					restored: {},
					next: { 'src/sub.ts': 'sub-1' },
				},
			}),
			current: { hash: 'later', files: { 'src/sub.ts': 'sub-2' } },
			moved: [],
		},
	'two reverts in a row → the second named too': {
		ledger: walkLedgerOf({
			steps: ['one', 'two', 'three', 'two'],
			production: { ...PROVEN, three: { 'src/add.ts': 'add-3' } },
		}),
		current: { hash: 'one', files: { 'src/add.ts': 'add-1' } },
		moved: ['src/add.ts'],
	},
	'a red at a state putting one file back and moving another forward, then the first restored → nothing moved back (a state that did not advance adds no content)':
		{
			ledger: walkLedgerOf({
				steps: ['one', { state: 'two', kind: 'green' }, 'mixed'],
				production: {
					one: { 'src/add.ts': 'add-1' },
					two: { 'src/add.ts': 'add-2', 'src/sub.ts': 'sub-1' },
					mixed: { 'src/add.ts': 'add-1', 'src/sub.ts': 'sub-2' },
				},
			}),
			current: { hash: 'three', files: { 'src/add.ts': 'add-2', 'src/sub.ts': 'sub-2' } },
			moved: [],
		},
	'a state putting one file back and moving another forward → only the file put back': {
		ledger: walkLedgerOf({
			steps: ['one', { state: 'two', kind: 'green' }, 'mixed'],
			production: {
				one: { 'src/add.ts': 'add-1' },
				two: { 'src/add.ts': 'add-2', 'src/sub.ts': 'sub-1' },
				mixed: { 'src/add.ts': 'add-1', 'src/sub.ts': 'sub-2' },
			},
		}),
		current: { hash: 'mixed', files: { 'src/add.ts': 'add-1', 'src/sub.ts': 'sub-2' } },
		moved: ['src/add.ts'],
	},
	'a green at a state dropping a file the lot added (a refactor), a red there, then the file back at its content before the refactor → named':
		{
			ledger: walkLedgerOf({
				steps: [
					'stub',
					{ state: 'helped', kind: 'green' },
					{ state: 'refactored', kind: 'green' },
					'refactored',
				],
				production: {
					stub: { 'src/add.ts': 'add-0' },
					helped: { 'src/add.ts': 'add-1', 'src/helper.ts': 'helper-1' },
					refactored: { 'src/add.ts': 'add-2' },
				},
			}),
			current: { hash: 'back', files: { 'src/add.ts': 'add-2', 'src/helper.ts': 'helper-1' } },
			moved: ['src/helper.ts'],
		},
	'two files put back after a green, one restored → only the file still back': {
		ledger: walkLedgerOf({
			steps: ['one', { state: 'two', kind: 'green' }, 'one'],
			production: {
				one: { 'src/add.ts': 'add-1', 'src/sub.ts': 'sub-1' },
				two: { 'src/add.ts': 'add-2', 'src/sub.ts': 'sub-2' },
			},
		}),
		current: { hash: 'three', files: { 'src/add.ts': 'add-1', 'src/sub.ts': 'sub-2' } },
		moved: ['src/add.ts'],
	},
}

describe('filesMovedBack', () => {
	for (const [name, row] of Object.entries(MOVED_BACK_CASES))
		it(name, () => {
			expect(
				filesMovedBack({ ledger: row.ledger, current: { ...row.current, base: row.base ?? BASE } }),
			).toEqual(row.moved)
		})
})

describe('filesMovedBack, the ledger walked', () => {
	for (const [name, row] of Object.entries(WALK_CASES))
		it(name, () => {
			expect(
				filesMovedBack({ ledger: row.ledger, current: { ...row.current, base: BASE } }),
			).toEqual(row.moved)
		})
})

/** The case `name` of `src/add.test.ts` in the default project. */
function caseOf(name: string): TestCaseId & { caseHash: string } {
	return { file: 'src/add.test.ts', name, project: '', caseHash: 'case' }
}

/** A receipt of `kind` of the case `name`, at the state `state`. */
function receiptOf(params: {
	name: string
	kind: ReceiptKind
	state?: string
	project?: string
	caseHash?: string
	flags?: ReceiptFlag[]
}): TddReceipt {
	return {
		...receiptAt(params.state ?? 'one'),
		name: params.name,
		kind: params.kind,
		project: params.project ?? '',
		caseHash: params.caseHash ?? 'case',
		...(params.flags && { flags: params.flags }),
	}
}

/** A ledger of these receipts, recording no state (the decision reads the receipts of the cases only). */
function receiptsLedger(receipts: TddReceipt[]): TddLedger {
	return { version: 3, entries: receipts }
}

/**
 * A green run at the current state: flagged `rollback` when a file moved back and a case it proves was
 * never green before; a refactor keeping proven cases green is not.
 */
const ROLLBACK_GREEN_CASES: Record<
	string,
	{
		ledger: TddLedger
		cases: (TestCaseId & { caseHash: string })[]
		movedBack: string[]
		flagged: boolean
	}
> = {
	'nothing moved back, a case green for the first time → not flagged': {
		ledger: receiptsLedger([receiptOf({ name: 'A', kind: 'red' })]),
		cases: [caseOf('A')],
		movedBack: [],
		flagged: false,
	},
	'a file moved back, the case green before (a refactor dropping a file) → not flagged': {
		ledger: receiptsLedger([
			receiptOf({ name: 'A', kind: 'red' }),
			receiptOf({ name: 'A', kind: 'green', state: 'two' }),
		]),
		cases: [caseOf('A')],
		movedBack: ['src/helper.ts'],
		flagged: false,
	},
	'a file moved back, two cases both green before → not flagged': {
		ledger: receiptsLedger([
			receiptOf({ name: 'A', kind: 'red' }),
			receiptOf({ name: 'B', kind: 'red' }),
			receiptOf({ name: 'A', kind: 'green', state: 'two' }),
			receiptOf({ name: 'B', kind: 'green', state: 'two' }),
		]),
		cases: [caseOf('A'), caseOf('B')],
		movedBack: ['src/helper.ts'],
		flagged: false,
	},
	'a file moved back, the case green before at a green itself flagged rollback → not flagged': {
		ledger: receiptsLedger([
			receiptOf({ name: 'A', kind: 'red' }),
			receiptOf({ name: 'A', kind: 'green', state: 'two', flags: ['rollback'] }),
		]),
		cases: [caseOf('A')],
		movedBack: ['src/helper.ts'],
		flagged: false,
	},
	'a file moved back, the case green before only at an older test call (another caseHash) → flagged':
		{
			ledger: receiptsLedger([
				receiptOf({ name: 'A', kind: 'red', caseHash: 'case-before' }),
				receiptOf({ name: 'A', kind: 'green', state: 'two', caseHash: 'case-before' }),
				receiptOf({ name: 'A', kind: 'red', state: 'two' }),
			]),
			cases: [caseOf('A')],
			movedBack: ['src/helper.ts'],
			flagged: true,
		},
	'a file moved back, the case proven green for the first time → flagged': {
		ledger: receiptsLedger([receiptOf({ name: 'B', kind: 'red' })]),
		cases: [caseOf('B')],
		movedBack: ['src/helper.ts'],
		flagged: true,
	},
	'a file moved back, one case green before and one green for the first time → flagged': {
		ledger: receiptsLedger([
			receiptOf({ name: 'A', kind: 'red' }),
			receiptOf({ name: 'A', kind: 'green', state: 'two' }),
			receiptOf({ name: 'B', kind: 'red', state: 'two' }),
		]),
		cases: [caseOf('A'), caseOf('B')],
		movedBack: ['src/helper.ts'],
		flagged: true,
	},
	'a file moved back, only another case green before → flagged': {
		ledger: receiptsLedger([
			receiptOf({ name: 'A', kind: 'red' }),
			receiptOf({ name: 'A', kind: 'green', state: 'two' }),
			receiptOf({ name: 'B', kind: 'red', state: 'two' }),
		]),
		cases: [caseOf('B')],
		movedBack: ['src/helper.ts'],
		flagged: true,
	},
	'a file moved back, the case only refused at an earlier green → flagged': {
		ledger: receiptsLedger([
			receiptOf({ name: 'B', kind: 'red' }),
			receiptOf({ name: 'B', kind: 'refused', state: 'two' }),
		]),
		cases: [caseOf('B')],
		movedBack: ['src/helper.ts'],
		flagged: true,
	},
	'a file moved back, the same case name green before in another project → flagged': {
		ledger: receiptsLedger([
			receiptOf({ name: 'B', kind: 'red', project: 'browser' }),
			receiptOf({ name: 'B', kind: 'green', state: 'two', project: 'browser' }),
			receiptOf({ name: 'B', kind: 'red', state: 'two' }),
		]),
		cases: [caseOf('B')],
		movedBack: ['src/helper.ts'],
		flagged: true,
	},
}

describe('isRollbackGreen', () => {
	for (const [name, row] of Object.entries(ROLLBACK_GREEN_CASES))
		it(name, () => {
			expect(
				isRollbackGreen({ ledger: row.ledger, cases: row.cases, movedBack: row.movedBack }),
			).toBe(row.flagged)
		})
})

describe('readProductionState', () => {
	it('a production file changed, one of the base deleted, one new, one untouched → the changed, deleted and new ones, hashed; the hash is hashProduction, the base the one read with', () => {
		const packageJson = { name: 'demo' }
		const root = createScratchRepository({
			'package.json': `${JSON.stringify(packageJson)}\n`,
			'src/add.ts': 'export const ADD = 1\n',
			'src/gone.ts': 'export const GONE = 1\n',
			'src/kept.ts': 'export const KEPT = 1\n',
			'src/add.test.ts': "it('adds', () => {})\n",
		})
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({
			root,
			files: {
				'src/add.ts': 'export const ADD = 2\n',
				'src/new.ts': 'export const NEW = 1\n',
				'src/add.test.ts': "it('adds two', () => {})\n",
			},
		})
		unlinkSync(join(root, 'src/gone.ts'))

		expect(readProductionState({ root, base, packageJson })).toEqual({
			hash: hashProduction({ root, packageJson }),
			base,
			files: {
				'src/add.ts': hashText('export const ADD = 2\n'),
				'src/gone.ts': 'deleted',
				'src/new.ts': hashText('export const NEW = 1\n'),
			},
		})
	})
})
