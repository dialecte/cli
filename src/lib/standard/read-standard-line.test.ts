/** `readStandardLine`: the three states of the card's standard line, from the environment and the hand-over folder. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	STANDARD_NOT_CONFIGURED,
	STANDARD_NOT_CONSULTED_END,
	STANDARD_NOT_CONSULTED_START,
	STANDARD_RECORDED_AT,
} from '../../../test/handover-profile.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readStandardLine } from './read-standard-line.ts'
import { STANDARD_ENVIRONMENT_VARIABLE, STANDARD_FILE } from './standard.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StandardRecord } from './standard.types.ts'

/** A hand-over folder holding the record, or nothing. */
function folderHolding(record?: Pick<StandardRecord, 'state' | 'note'>): string {
	const folder = temporaryFolder('dialecte-standard-folder-')
	mkdirSync(folder, { recursive: true })
	if (record)
		writeFileSync(
			join(folder, STANDARD_FILE),
			JSON.stringify({ ...record, at: STANDARD_RECORDED_AT }),
		)
	return folder
}

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('readStandardLine', () => {
	it('none configured, nothing recorded → a warning saying none is configured', () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)

		expect(readStandardLine({ folder: folderHolding() })).toEqual({
			name: 'standard',
			status: 'warning',
			detail: STANDARD_NOT_CONFIGURED,
		})
	})

	it('a configured path that does not exist → the same warning as none configured', () => {
		vi.stubEnv(
			STANDARD_ENVIRONMENT_VARIABLE,
			join(temporaryFolder('dialecte-standard-'), 'missing'),
		)

		expect(readStandardLine({ folder: folderHolding() })).toEqual({
			name: 'standard',
			status: 'warning',
			detail: STANDARD_NOT_CONFIGURED,
		})
	})

	it('none configured, not-consulted recorded → a warning that carries the reason', () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)

		expect(
			readStandardLine({
				folder: folderHolding({ state: 'not-consulted', note: 'no standard applies' }),
			}),
		).toEqual({
			name: 'standard',
			status: 'warning',
			detail: expect.stringContaining('no standard applies'),
		})
	})

	it('a configured folder, nothing recorded → failed, citing dialecte lot standard to record the consultation', () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, temporaryFolder('dialecte-standard-'))

		expect(readStandardLine({ folder: folderHolding() })).toEqual({
			name: 'standard',
			status: 'failed',
			detail: expect.stringMatching(
				new RegExp(`^${STANDARD_NOT_CONSULTED_START}.*${STANDARD_NOT_CONSULTED_END}$`),
			),
		})
	})

	it('a configured file, consulted recorded → passed with the note', () => {
		const file = join(temporaryFolder('dialecte-standard-'), 'standard.md')
		writeFileSync(file, '# the standard\n')
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, file)

		expect(
			readStandardLine({ folder: folderHolding({ state: 'consulted', note: 'read the units' }) }),
		).toEqual({ name: 'standard', status: 'passed', detail: 'consulted · read the units' })
	})
})
