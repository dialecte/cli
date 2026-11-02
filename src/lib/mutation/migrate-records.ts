import { hashLine } from './judge.ts'

import type { LegacyRecords, MutationRecord, MutationRecords } from './mutation.types.ts'

/**
 * scl's `equivalent-mutants.json` read as the new records: the same files and keys, `reason` from `equivalent`,
 * family `unclassified`, the hash of the line (`readLine`), no tests hash (a migrated record keeps its reason until
 * one is taken). An empty legacy reason stays empty, so the record stays unlisted. Reach for it once, when a
 * package moves its records to `.dialecte/mutation-records.json`.
 */
export function migrateRecords(params: {
	legacy: LegacyRecords
	readLine: (params: { file: string; line: number }) => string
}): MutationRecords {
	const { legacy, readLine } = params
	return Object.fromEntries(
		Object.entries(legacy).map(([file, mutants]) => [
			file,
			Object.fromEntries(
				Object.entries(mutants).map(
					([key, { line, mutation, equivalent }]): [string, MutationRecord] => [
						key,
						{
							line,
							mutation,
							family: 'unclassified',
							reason: equivalent,
							lineHash: hashLine({ text: readLine({ file, line }) }),
						},
					],
				),
			),
		]),
	)
}
