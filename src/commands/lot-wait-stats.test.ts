/**
 * `lot wait` on a real lot: what a poll touches grows with the lot, not with the registry's history. Over polls where
 * nothing changes, no registry entry of another lot is stat or read (the lot's own entry, its folders and the
 * registry's folder are), and every poll still looks at the lot's folder or the registry's, so a change is seen; a
 * counting `node:fs` stands behind `statSync`, `lstatSync` and `readFileSync`.
 */
import { realpathSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { counted } from '../../test/counting-fs.ts'
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import {
	ARMING_SLEEP,
	COUNTED_POLLS,
	OTHER_ENTRY_NAMES,
	WAIT_SECONDS,
} from '../../test/lot-wait-stats.constants.ts'
import { createWaitTime } from '../../test/simulated-lot.ts'
import { entryOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { waitLot } from './lot-wait.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
	const { countingFs } = await import('../../test/counting-fs.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return countingFs(actual)
})

afterEach(function restoreEnvironment() {
	counted.armed = false
	counted.paths.length = 0
	counted.reads.length = 0
	vi.unstubAllEnvs()
})

describe('lot wait on a real lot: what a poll touches', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('three polls with nothing changing among registry entries of other lots -> none of those entries is stat or read, each poll still stats the lot or registry folder', async () => {
		const lot = createQuestionLot()
		for (const other of OTHER_ENTRY_NAMES)
			writeRecordFile({
				folder: lot.workspace.registry,
				name: `${other}.json`,
				text: JSON.stringify(entryOf({ state: 'committed', folder: `/elsewhere/${other}` })),
			})
		const registry = realpathSync(lot.workspace.registry)
		const time = createWaitTime({
			onSleep: (call) => {
				if (call === ARMING_SLEEP) counted.armed = true
			},
		})

		const waited = await waitLot({
			cwd: lot.workspace.repository,
			argv: [QUESTION_LOT, '--timeout', String(WAIT_SECONDS), '--json'],
			clock: time.clock,
			sleep: time.sleep,
		})
		counted.armed = false
		function isOtherEntry(path: string): boolean {
			return (
				path.endsWith('.json') &&
				basename(dirname(path)) === basename(registry) &&
				basename(path) !== `${QUESTION_LOT}.json`
			)
		}
		const foldersStat = counted.paths.filter((path) => path === lot.lotFolder || path === registry)

		expect({
			exitCode: waited.exitCode,
			sleeps: time.sleeps.length,
			otherEntriesStat: counted.paths.filter(isOtherEntry),
			otherEntriesRead: counted.reads.filter(isOtherEntry),
			foldersStatEachPoll: foldersStat.length >= COUNTED_POLLS,
		}).toEqual({
			exitCode: 5,
			sleeps: WAIT_SECONDS,
			otherEntriesStat: [],
			otherEntriesRead: [],
			foldersStatEachPoll: true,
		})
	})
})
