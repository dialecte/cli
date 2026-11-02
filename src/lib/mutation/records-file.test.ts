import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RECORDS_FILE, SMALL_CASE_TIMEOUT } from '../../../test/mutation-package.constants.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { readRecordsFile, writeRecordsFile } from './records-file.ts'

import { describe, expect, it } from 'vitest'

import type { MutationRecords } from './mutation.types.ts'

const RECORDS: MutationRecords = {
	'src/engine/a.ts': {
		k1: {
			line: 2,
			mutation: 'ConditionalExpression: x === 1 -> true',
			family: 'wording',
			reason: 'no output depends on the text',
			lineHash: 'h1',
		},
	},
}

describe('the committed records file', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('no file → no records', () => {
		expect(readRecordsFile({ root: temporaryFolder('dialecte-records-') })).toEqual({})
	})

	it('a file → its records', () => {
		const root = temporaryFolder('dialecte-records-')
		writeFiles({ root, files: { [RECORDS_FILE]: `${JSON.stringify(RECORDS)}\n` } })

		expect(readRecordsFile({ root })).toEqual(RECORDS)
	})

	it('a file that is not JSON → an error naming the file', () => {
		const root = temporaryFolder('dialecte-records-')
		writeFiles({ root, files: { [RECORDS_FILE]: '{ not json' } })

		expect(() => readRecordsFile({ root })).toThrow(/mutation-records\.json/)
	})

	it('write → .dialecte/mutation-records.json, tab-indented with a final newline, creating the folder', () => {
		const root = temporaryFolder('dialecte-records-')

		expect(writeRecordsFile({ root, records: RECORDS })).toBeUndefined()

		expect(readFileSync(join(root, RECORDS_FILE), 'utf8')).toBe(
			`${JSON.stringify(RECORDS, null, '\t')}\n`,
		)
	})
})
