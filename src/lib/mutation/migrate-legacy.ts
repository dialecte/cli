/** A package's legacy `equivalent-mutants.json` written as its mutation records, once. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { migrateRecords } from './migrate-records.ts'
import { LEGACY_RECORDS_PATH, MUTATION_RECORDS_PATH } from './mutation.constants.ts'
import { writeRecordsFile } from './records-file.ts'

import type { LegacyMigration, LegacyRecords } from './mutation.types.ts'

/**
 * Writes the legacy records of the package at `root` as its mutation records (the legacy file kept): how many were
 * written, or why nothing was (no legacy file, records already there: nothing overwritten).
 */
export function migrateLegacyRecords(params: { root: string }): LegacyMigration {
	const { root } = params
	const legacyPath = join(root, LEGACY_RECORDS_PATH)
	if (!existsSync(legacyPath)) return { refused: `no ${LEGACY_RECORDS_PATH} in ${root}` }
	if (existsSync(join(root, MUTATION_RECORDS_PATH)))
		return { refused: `${MUTATION_RECORDS_PATH} already exists in ${root}: nothing overwritten` }
	const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as LegacyRecords
	const records = migrateRecords({ legacy, readLine: (line) => readLineOf({ root, ...line }) })
	writeRecordsFile({ root, records })
	const written = Object.values(records).reduce(
		(total, mutants) => total + Object.keys(mutants).length,
		0,
	)
	return { written }
}

/** The text of a line of a package file; empty when the file or the line is gone. */
function readLineOf(params: { root: string; file: string; line: number }): string {
	const path = join(params.root, params.file)
	if (!existsSync(path)) return ''
	return readFileSync(path, 'utf8').split('\n')[params.line - 1] ?? ''
}
