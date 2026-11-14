import { ROUND_FOLDER_PATTERN } from '../gate-records/gate-records.constants.ts'
import {
	ARCHIVED_LOT_FILE,
	COMMIT_SCRIPT_FILE,
	HANDOVER_FILES,
	HANDOVER_RUN_MARKER_FILE,
	HANDOVER_STORE_FOLDER,
	REHEARSAL_DECISIONS_FILE,
} from '../handover/handover.constants.ts'
import { FOLDER_LOT_FILE } from '../recap/recap.constants.ts'
import { DECISIONS_FILE, LEDGER_FILE } from '../review-rounds/review-rounds.constants.ts'
import { STANDARD_FILE } from '../standard/standard.constants.ts'
import { STORE_FILES, STORE_FOLDER } from './store.constants.ts'

import { describe, expect, it } from 'vitest'

/** Every file a hand-over folder holds, from the constants of the modules that write them. */
const HANDOVER_FILE_NAMES: readonly string[] = [
	...Object.values(HANDOVER_FILES),
	COMMIT_SCRIPT_FILE,
	HANDOVER_RUN_MARKER_FILE,
	REHEARSAL_DECISIONS_FILE,
	ARCHIVED_LOT_FILE,
	FOLDER_LOT_FILE,
	LEDGER_FILE,
	DECISIONS_FILE,
	STANDARD_FILE,
]

/** `round-<n>`, alone or with a suffix (`round-2.deleted`, `round-2.base`). */
const ROUND_PREFIXED = /^round-\d+(\.|$)/

describe('the names of the store (case 30)', () => {
	it('every store file name → a real name, none equal to a hand-over file name, none a round-<n> name', () => {
		const names = Object.values(STORE_FILES)

		expect({
			empty: names.filter((name) => name === ''),
			clashing: names.filter(
				(name) =>
					HANDOVER_FILE_NAMES.includes(name) ||
					ROUND_FOLDER_PATTERN.test(name) ||
					ROUND_PREFIXED.test(name),
			),
			repeated: names.filter((name, position) => names.indexOf(name) !== position),
		}).toEqual({ empty: [], clashing: [], repeated: [] })
	})

	it('the risk file -> risk.jsonl: a store file, no hand-over file nor round name', () => {
		const names: Record<string, string> = STORE_FILES

		expect(names.risk).toBe('risk.jsonl')
	})

	it('the late fixes file -> verify.jsonl: a store file, no hand-over file nor round name', () => {
		expect(STORE_FILES.verify).toBe('verify.jsonl')
	})

	it('the store folder → a real name, not the registry folder', () => {
		const folder: string = STORE_FOLDER
		const registry: string = HANDOVER_STORE_FOLDER

		expect([folder === '', folder === registry]).toEqual([false, false])
	})
})
