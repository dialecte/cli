/**
 * No child process (33S section 14): the import graph from `lot-status.ts`, `lot-wait.ts` and `inbox.ts` reaches no
 * `node:child_process`. The registry is read through `handover-store-read.ts`, the store list through `store-list.ts`,
 * and the state of each lot through the status module, none of which spawns anything.
 */
import { join } from 'node:path'

import { reachFrom } from '../../test/import-reach.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

const COMMANDS_FOLDER = import.meta.dirname
const STORE_FOLDER = join(COMMANDS_FOLDER, '..', 'lib', 'store')

describe('the read verbs start no process', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('from lot-status.ts, lot-wait.ts and inbox.ts no module imports node:child_process, and the inbox reads the store list and the lots through the status module', () => {
		expect(
			['lot-status.ts', 'lot-wait.ts', 'inbox.ts'].map(
				(root) => reachFrom(join(COMMANDS_FOLDER, root)).childProcessImporters,
			),
		).toEqual([[], [], []])
		expect(reachFrom(join(COMMANDS_FOLDER, 'inbox.ts')).files).toEqual(
			expect.arrayContaining([
				join(COMMANDS_FOLDER, 'lot-status.ts'),
				join(STORE_FOLDER, 'store-list.ts'),
				join(STORE_FOLDER, 'store-folder.ts'),
			]),
		)
	})
})
