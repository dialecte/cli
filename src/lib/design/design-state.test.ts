/**
 * `designStateOf` (DESIGN-GATE section 2): the standing of a lot's design from its lines, the recorded file's hash now
 * and the current need. Approval is keyed by hash; an approval or a waiver holds for the need it was given against.
 */
import { designStateOf } from './design-state.ts'

import { describe, expect, it } from 'vitest'

import type {
	DesignApprovedLine,
	DesignLine,
	DesignNeed,
	DesignNeedReason,
	DesignRecordedLine,
	DesignSourceHash,
	DesignStanding,
	DesignWaivedLine,
} from './design.types.ts'

const FIRST_HASH = 'a'.repeat(64)
const SECOND_HASH = 'b'.repeat(64)
const DESIGN_FILE = '/plans/topic/DESIGN.md'
const MOVED_FILE = '/plans/other/DESIGN.md'
const STORE_REASON: DesignNeedReason = {
	kind: 'shared',
	glob: 'src/lib/store/**',
	path: 'src/lib/store/publish.ts',
}
const STORE_REASON_OTHER_PATH: DesignNeedReason = {
	kind: 'shared',
	glob: 'src/lib/store/**',
	path: 'src/lib/store/brief.ts',
}
const PR_REASON: DesignNeedReason = {
	kind: 'shared',
	glob: 'src/lib/pr/**',
	path: 'src/lib/pr/public-body.ts',
}
const ENTRY_REASON: DesignNeedReason = { kind: 'entry' }
const LIGHT: DesignNeed = { required: false, reasons: [] }
const STORE_NEED: DesignNeed = { required: true, reasons: [STORE_REASON] }
const ROSE_NEED: DesignNeed = { required: true, reasons: [STORE_REASON, PR_REASON] }

function recorded(params: { hash: string; file?: string }): DesignRecordedLine {
	return {
		schema: 1,
		kind: 'recorded',
		at: '2026-11-17T10:00:00.000Z',
		file: params.file ?? DESIGN_FILE,
		hash: params.hash,
		from: 'file',
	}
}

function approved(params: {
	hash: string
	need: DesignNeedReason[]
	by?: string
}): DesignApprovedLine {
	return {
		schema: 1,
		kind: 'approved',
		at: '2026-11-17T11:00:00.000Z',
		by: params.by ?? 'orchestrator',
		hash: params.hash,
		need: params.need,
	}
}

function waived(params: { need: DesignNeedReason[] }): DesignWaivedLine {
	return {
		schema: 1,
		kind: 'waived',
		at: '2026-11-17T11:00:00.000Z',
		by: 'person-a',
		reason: 'started before the design gate',
		need: params.need,
	}
}

type StateCase = {
	name: string
	need: DesignNeed
	lines: DesignLine[]
	source: DesignSourceHash
	expected: DesignStanding
}

const recordingCases: StateCase[] = [
	{
		name: 'a required lot with nothing recorded -> missing',
		need: STORE_NEED,
		lines: [],
		source: undefined,
		expected: { need: STORE_NEED, state: 'missing', uncovered: [] },
	},
	{
		name: 'a light lot with nothing recorded -> not required',
		need: LIGHT,
		lines: [],
		source: undefined,
		expected: { need: LIGHT, state: 'not-required', uncovered: [] },
	},
	{
		name: 'recorded, no approval -> unapproved',
		need: STORE_NEED,
		lines: [recorded({ hash: FIRST_HASH })],
		source: FIRST_HASH,
		expected: {
			need: STORE_NEED,
			state: 'unapproved',
			uncovered: [],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'a design recorded on a light lot -> gated: unapproved',
		need: LIGHT,
		lines: [recorded({ hash: FIRST_HASH })],
		source: FIRST_HASH,
		expected: {
			need: LIGHT,
			state: 'unapproved',
			uncovered: [],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'recorded and approved for the need, source unchanged -> approved by its approver',
		need: STORE_NEED,
		lines: [recorded({ hash: FIRST_HASH }), approved({ hash: FIRST_HASH, need: [STORE_REASON] })],
		source: FIRST_HASH,
		expected: {
			need: STORE_NEED,
			state: 'approved',
			by: 'orchestrator',
			uncovered: [],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'approved, then the source edited -> stale',
		need: STORE_NEED,
		lines: [recorded({ hash: FIRST_HASH }), approved({ hash: FIRST_HASH, need: [STORE_REASON] })],
		source: SECOND_HASH,
		expected: {
			need: STORE_NEED,
			state: 'stale',
			by: 'orchestrator',
			uncovered: [],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'approved, then the source gone -> approved: the stored copy rules',
		need: STORE_NEED,
		lines: [recorded({ hash: FIRST_HASH }), approved({ hash: FIRST_HASH, need: [STORE_REASON] })],
		source: undefined,
		expected: {
			need: STORE_NEED,
			state: 'approved',
			by: 'orchestrator',
			uncovered: [],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'approved, moved and recorded again with the same bytes -> approved at once',
		need: STORE_NEED,
		lines: [
			recorded({ hash: FIRST_HASH }),
			approved({ hash: FIRST_HASH, need: [STORE_REASON] }),
			recorded({ hash: FIRST_HASH, file: MOVED_FILE }),
		],
		source: FIRST_HASH,
		expected: {
			need: STORE_NEED,
			state: 'approved',
			by: 'orchestrator',
			uncovered: [],
			file: MOVED_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'recorded twice, only the first content approved -> unapproved',
		need: STORE_NEED,
		lines: [
			recorded({ hash: FIRST_HASH }),
			approved({ hash: FIRST_HASH, need: [STORE_REASON] }),
			recorded({ hash: SECOND_HASH }),
		],
		source: SECOND_HASH,
		expected: {
			need: STORE_NEED,
			state: 'unapproved',
			uncovered: [],
			file: DESIGN_FILE,
			hash: SECOND_HASH,
		},
	},
]

const needCases: StateCase[] = [
	{
		name: 'approved, then the need rose -> unapproved, the new reason uncovered',
		need: ROSE_NEED,
		lines: [recorded({ hash: FIRST_HASH }), approved({ hash: FIRST_HASH, need: [STORE_REASON] })],
		source: FIRST_HASH,
		expected: {
			need: ROSE_NEED,
			state: 'unapproved',
			uncovered: [PR_REASON],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'approved again with the risen need -> approved',
		need: ROSE_NEED,
		lines: [
			recorded({ hash: FIRST_HASH }),
			approved({ hash: FIRST_HASH, need: [STORE_REASON] }),
			approved({ hash: FIRST_HASH, need: [STORE_REASON, PR_REASON], by: 'person-a' }),
		],
		source: FIRST_HASH,
		expected: {
			need: ROSE_NEED,
			state: 'approved',
			by: 'person-a',
			uncovered: [],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'the same glob reached through another path -> still covered',
		need: { required: true, reasons: [STORE_REASON_OTHER_PATH] },
		lines: [recorded({ hash: FIRST_HASH }), approved({ hash: FIRST_HASH, need: [STORE_REASON] })],
		source: FIRST_HASH,
		expected: {
			need: { required: true, reasons: [STORE_REASON_OTHER_PATH] },
			state: 'approved',
			by: 'orchestrator',
			uncovered: [],
			file: DESIGN_FILE,
			hash: FIRST_HASH,
		},
	},
	{
		name: 'a waiver covering the need, nothing recorded -> waived by its waiver',
		need: STORE_NEED,
		lines: [waived({ need: [STORE_REASON] })],
		source: undefined,
		expected: { need: STORE_NEED, state: 'waived', by: 'person-a', uncovered: [] },
	},
	{
		name: 'a waiver, then the need rose -> missing, the new reason uncovered',
		need: { required: true, reasons: [STORE_REASON, ENTRY_REASON] },
		lines: [waived({ need: [STORE_REASON] })],
		source: undefined,
		expected: {
			need: { required: true, reasons: [STORE_REASON, ENTRY_REASON] },
			state: 'missing',
			uncovered: [ENTRY_REASON],
		},
	},
]

describe('designStateOf - recording and approval', () => {
	it.each(recordingCases)('$name', ({ need, lines, source, expected }) => {
		expect(designStateOf({ need, lines, source })).toEqual(expected)
	})
})

describe('designStateOf - the need an approval or a waiver holds for', () => {
	it.each(needCases)('$name', ({ need, lines, source, expected }) => {
		expect(designStateOf({ need, lines, source })).toEqual(expected)
	})
})
