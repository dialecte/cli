/**
 * `readStandardLine` and `readRecordedStandardLine` over the `outside` record (section 18, "Outside the documents"):
 * a warning at every effort, failed at effort high unless every outside answer was confirmed by a person, and the
 * record's note shown in every branch.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STANDARD_RECORDED_AT } from '../../../test/handover-profile.constants.ts'
import { effortLineOf, writeRiskLines } from '../../../test/risk-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readRecordedStandardLine, readStandardLine } from './read-standard-line.ts'
import { STANDARD_ENVIRONMENT_VARIABLE, STANDARD_FILE } from './standard.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Effort } from '../risk/risk.types.ts'
import type { StandardRecord } from './standard.types.ts'

const UNCHECKED_NOTE = 'asks A-0001 needs-readers (all unchecked)'
const CONFIRMED_NOTE = 'asks A-0001 answered F-0003 (all confirmed)'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A hand-over folder holding the record and, when an effort is given, one risk line of that effort. */
function folderHolding(params: {
	record: { state: StandardRecord['state'] | 'outside'; note: string; confirmed?: boolean }
	effort?: Effort
}): string {
	const folder = temporaryFolder('dialecte-standard-outside-')
	mkdirSync(folder, { recursive: true })
	writeFileSync(
		join(folder, STANDARD_FILE),
		JSON.stringify({ ...params.record, at: STANDARD_RECORDED_AT }),
	)
	if (params.effort !== undefined)
		writeRiskLines({ folder, lines: [effortLineOf({ effort: params.effort })] })
	return folder
}

/** `DIALECTE_STANDARD` naming a folder that exists, or no value at all. */
function configured(params: { standard: 'configured' | 'unset' }): void {
	vi.stubEnv(
		STANDARD_ENVIRONMENT_VARIABLE,
		params.standard === 'configured' ? temporaryFolder('dialecte-standard-') : undefined,
	)
}

type OutsideRow = {
	standard: 'configured' | 'unset'
	effort: Effort | undefined
	note: string
	/** Whether the record says a person confirmed every outside answer (not confirmed unless said). */
	confirmed?: boolean
	status: 'warning' | 'failed'
}

const OUTSIDE_ROWS: Record<string, OutsideRow> = {
	'outside, effort low, none configured -> a warning that shows the note': {
		standard: 'unset',
		effort: 'low',
		note: UNCHECKED_NOTE,
		status: 'warning',
	},
	'outside, effort medium, a standard configured -> a warning that shows the note': {
		standard: 'configured',
		effort: 'medium',
		note: UNCHECKED_NOTE,
		status: 'warning',
	},
	'outside, no effort recorded -> a warning that shows the note': {
		standard: 'unset',
		effort: undefined,
		note: UNCHECKED_NOTE,
		status: 'warning',
	},
	'outside, effort high, none configured, outside answers unchecked -> failed, the note shown': {
		standard: 'unset',
		effort: 'high',
		note: UNCHECKED_NOTE,
		status: 'failed',
	},
	'outside, effort high, a standard configured, outside answers unchecked -> failed, the note shown':
		{
			standard: 'configured',
			effort: 'high',
			note: UNCHECKED_NOTE,
			status: 'failed',
		},
	'outside, effort high, every outside answer confirmed by a person -> a warning, the note shown': {
		standard: 'unset',
		effort: 'high',
		note: CONFIRMED_NOTE,
		confirmed: true,
		status: 'warning',
	},
	'outside, effort high, the note says every answer was confirmed but the record says not -> failed, the flag decides, never the note':
		{
			standard: 'unset',
			effort: 'high',
			note: CONFIRMED_NOTE,
			confirmed: false,
			status: 'failed',
		},
	'outside, effort high, the record says every answer was confirmed whatever the note says -> a warning, the flag decides, never the note':
		{
			standard: 'unset',
			effort: 'high',
			note: UNCHECKED_NOTE,
			confirmed: true,
			status: 'warning',
		},
}

describe('readStandardLine: an outside record (the card of a lot whose asks went outside the documents)', () => {
	it.each(Object.entries(OUTSIDE_ROWS))('%s', (_title, row) => {
		configured({ standard: row.standard })
		const folder = folderHolding({
			record: { state: 'outside', note: row.note, confirmed: row.confirmed ?? false },
			effort: row.effort,
		})

		expect(readStandardLine({ folder })).toEqual({
			name: 'standard',
			status: row.status,
			detail: expect.stringContaining(row.note),
		})
	})
})

describe('readStandardLine: the record note is shown in every branch', () => {
	it('a standard configured, not-consulted recorded -> failed, naming the reason the station gave', () => {
		configured({ standard: 'configured' })
		const folder = folderHolding({
			record: { state: 'not-consulted', note: 'no standard applies' },
		})

		expect(readStandardLine({ folder })).toEqual({
			name: 'standard',
			status: 'failed',
			detail: expect.stringContaining('no standard applies'),
		})
	})

	it('none configured, consulted recorded -> a warning that shows the note', () => {
		configured({ standard: 'unset' })
		const folder = folderHolding({ record: { state: 'consulted', note: 'read the units' } })

		expect(readStandardLine({ folder })).toEqual({
			name: 'standard',
			status: 'warning',
			detail: expect.stringContaining('read the units'),
		})
	})
})

describe('readRecordedStandardLine: an outside record on a committed card', () => {
	it('outside, effort high -> a warning that shows the note and does not say not consulted', () => {
		const folder = folderHolding({
			record: { state: 'outside', note: UNCHECKED_NOTE },
			effort: 'high',
		})

		expect(readRecordedStandardLine({ folder })).toEqual({
			name: 'standard',
			status: 'warning',
			detail: expect.stringMatching(/^(?!.*not consulted).*asks A-0001 needs-readers/u),
		})
	})
})
