import { caseStatusOf } from './case-status.ts'

import { describe, expect, it } from 'vitest'

import type { CaseStatus, ReceiptKind, TddEntry } from './tdd.types.ts'

const FILE = 'src/add.test.ts'

/** A receipt of case `name` in FILE at test file `hash` and case text `text`. */
function receipt(params: {
	kind: ReceiptKind
	name: string
	hash: string
	text: string
}): TddEntry {
	return {
		kind: params.kind,
		file: FILE,
		name: params.name,
		project: '',
		testFileHash: params.hash,
		caseHash: params.text,
		productionHash: 'p',
		at: '2026-10-29T00:00:00.000Z',
	}
}

/** A red run that froze FILE at `hash`. */
function freeze(hash: string): TddEntry {
	return { kind: 'freeze', files: { [FILE]: hash }, at: '2026-10-29T00:00:00.000Z' }
}

type Case = { entries: TddEntry[]; name: string; hash: string; text: string; status: CaseStatus }

const RED_A = receipt({ kind: 'red', name: 'A', hash: 'h1', text: 'a1' })
const GREEN_A = receipt({ kind: 'green', name: 'A', hash: 'h1', text: 'a1' })

const CASES: Record<string, Case> = {
	'no receipt → missing receipt': {
		entries: [],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'missing receipt',
	},
	'a receipt of another case only → missing receipt': {
		entries: [receipt({ kind: 'red', name: 'B', hash: 'h1', text: 'b1' }), freeze('h1')],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'missing receipt',
	},
	'red, its file frozen as it is → red': {
		entries: [RED_A, freeze('h1')],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'red',
	},
	'red, its file edited since the freeze → test edited after red': {
		entries: [RED_A, freeze('h1')],
		name: 'A',
		hash: 'h2',
		text: 'a1',
		status: 'test edited after red',
	},
	'red, the file re-frozen by a later red run but the case text changed since its receipt → test edited after red':
		{
			entries: [
				RED_A,
				freeze('h1'),
				receipt({ kind: 'red', name: 'B', hash: 'h2', text: 'b1' }),
				freeze('h2'),
			],
			name: 'A',
			hash: 'h2',
			text: 'a2',
			status: 'test edited after red',
		},
	'red, a refused receipt only → missing receipt': {
		entries: [receipt({ kind: 'refused', name: 'A', hash: 'h1', text: 'a1' })],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'missing receipt',
	},
	'red then green → green': {
		entries: [RED_A, freeze('h1'), GREEN_A],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'green',
	},
	'green, then a later red run froze test code again → red until green again': {
		entries: [
			RED_A,
			freeze('h1'),
			GREEN_A,
			receipt({ kind: 'red', name: 'B', hash: 'h2', text: 'b1' }),
			freeze('h2'),
		],
		name: 'A',
		hash: 'h2',
		text: 'a1',
		status: 'red',
	},
	'green again after the later freeze → green': {
		entries: [
			RED_A,
			freeze('h1'),
			GREEN_A,
			receipt({ kind: 'red', name: 'B', hash: 'h2', text: 'b1' }),
			freeze('h2'),
			receipt({ kind: 'green', name: 'A', hash: 'h2', text: 'a1' }),
		],
		name: 'A',
		hash: 'h2',
		text: 'a1',
		status: 'green',
	},
	'passed at a red run, the same case as at the base → unchanged': {
		entries: [receipt({ kind: 'unchanged', name: 'A', hash: 'h1', text: 'a1' }), freeze('h1')],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'unchanged',
	},
	'a refusal after a green → still green': {
		entries: [
			RED_A,
			freeze('h1'),
			GREEN_A,
			receipt({ kind: 'refused', name: 'A', hash: 'h1', text: 'a1' }),
		],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'green',
	},
	'red but its file never frozen (its red run was refused) → test edited after red': {
		entries: [RED_A],
		name: 'A',
		hash: 'h1',
		text: 'a1',
		status: 'test edited after red',
	},
}

describe('caseStatusOf', () => {
	for (const [name, testCase] of Object.entries(CASES))
		it(name, () => {
			expect(
				caseStatusOf({
					ledger: { version: 3, entries: testCase.entries },
					testCase: { file: FILE, name: testCase.name, project: '' },
					testFileHash: testCase.hash,
					caseHash: testCase.text,
				}),
			).toBe(testCase.status)
		})
})
