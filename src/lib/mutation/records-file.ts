/** The committed records of a package: why each recorded survivor cannot change any output. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { MUTATION_RECORDS_PATH } from './mutation.constants.ts'

import type { MutationRecords } from './mutation.types.ts'

/** The committed records of the package at `root` (`.dialecte/mutation-records.json`); none when the file is absent. */
export function readRecordsFile(params: { root: string }): MutationRecords {
	const path = join(params.root, MUTATION_RECORDS_PATH)
	if (!existsSync(path)) return {}
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as MutationRecords
	} catch (error) {
		throw new Error(`${MUTATION_RECORDS_PATH} is not JSON (${(error as Error).message})`)
	}
}

/** Writes the records, tab-indented with a final newline. */
export function writeRecordsFile(params: { root: string; records: MutationRecords }): void {
	const path = join(params.root, MUTATION_RECORDS_PATH)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(params.records, null, '\t')}\n`)
}
