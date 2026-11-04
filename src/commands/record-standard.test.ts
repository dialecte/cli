/** `record standard <folder> consulted <note> | not-consulted <reason>`: the station's word on the standard check. */
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { ISO_TIME_PATTERN } from '../../test/gate-records.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { RECORD_STANDARD_USAGE, STANDARD_FILE } from '../lib/standard/standard.constants.ts'
import { runRecord } from './record.ts'

import { describe, expect, it } from 'vitest'

/** A hand-over folder, outside every repository, made. */
function handoverFolder(): string {
	const folder = join(realpathSync(temporaryFolder('dialecte-record-standard-')), 'hand-over')
	mkdirSync(folder, { recursive: true })
	return folder
}

/** The record the folder holds. */
function standardOf(folder: string): unknown {
	return JSON.parse(readFileSync(join(folder, STANDARD_FILE), 'utf8'))
}

describe('record standard', () => {
	it('consulted <note> → exit 0, standard.json with the state, the note and the time', () => {
		const folder = handoverFolder()

		const result = runRecord({
			cwd: dirname(folder),
			argv: ['standard', folder, 'consulted', 'read the section on units'],
		})

		expect(result.exitCode).toBe(0)
		expect(standardOf(folder)).toEqual({
			state: 'consulted',
			note: 'read the section on units',
			at: expect.stringMatching(ISO_TIME_PATTERN),
		})
	})

	it('not-consulted <reason> → exit 0, standard.json with the state and the reason as its note', () => {
		const folder = handoverFolder()

		const result = runRecord({
			cwd: dirname(folder),
			argv: ['standard', folder, 'not-consulted', 'the change touches no standard'],
		})

		expect(result.exitCode).toBe(0)
		expect(standardOf(folder)).toEqual({
			state: 'not-consulted',
			note: 'the change touches no standard',
			at: expect.stringMatching(ISO_TIME_PATTERN),
		})
	})

	it('a note of several words → joined with single spaces in the note', () => {
		const folder = handoverFolder()

		const result = runRecord({
			cwd: dirname(folder),
			argv: ['standard', folder, 'consulted', 'read', 'the', 'section', 'on', 'units'],
		})

		expect(result.exitCode).toBe(0)
		expect(standardOf(folder)).toMatchObject({ note: 'read the section on units' })
	})

	it('neither consulted nor not-consulted → usage error, exit 2, nothing written', () => {
		const folder = handoverFolder()

		const result = runRecord({
			cwd: dirname(folder),
			argv: ['standard', folder, 'maybe', 'a note'],
		})

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain(RECORD_STANDARD_USAGE)
		expect(existsSync(join(folder, STANDARD_FILE))).toBe(false)
	})

	it('a state without a note → usage error, exit 2, nothing written', () => {
		const folder = handoverFolder()

		const result = runRecord({ cwd: dirname(folder), argv: ['standard', folder, 'consulted'] })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain(RECORD_STANDARD_USAGE)
		expect(existsSync(join(folder, STANDARD_FILE))).toBe(false)
	})
})
