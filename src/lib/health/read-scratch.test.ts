import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIRST_FILE_TIME } from '../../../test/health-worktrees.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import {
	COMMIT_INDEX_FOLDER_PREFIX,
	STATE_INDEX_FOLDER_PREFIX,
} from '../gate-records/gate-records.constants.ts'
import { REPORT_FOLDER_PREFIX } from '../gate/scoped-tests.constants.ts'
import { GATE_SCOPE_FOLDER_PREFIX } from '../gate/selection.constants.ts'
import {
	HANDOVER_PROBE_FOLDER_PREFIX,
	HOOK_LOG_FOLDER_PREFIX,
	REHEARSAL_FOLDER_PREFIX,
	REVIEW_INDEX_FOLDER_PREFIX,
	TRIAL_INDEX_FOLDER_PREFIX,
} from '../handover/handover.constants.ts'
import { readScratchFolders } from './read-scratch.ts'

import { describe, expect, it } from 'vitest'

/** The prefixes of the scratch folders, each from the module that makes the folders. */
const SCRATCH_PREFIXES_OF_SOURCES: readonly string[] = [
	REHEARSAL_FOLDER_PREFIX,
	HOOK_LOG_FOLDER_PREFIX,
	HANDOVER_PROBE_FOLDER_PREFIX,
	TRIAL_INDEX_FOLDER_PREFIX,
	REVIEW_INDEX_FOLDER_PREFIX,
	GATE_SCOPE_FOLDER_PREFIX,
	REPORT_FOLDER_PREFIX,
	COMMIT_INDEX_FOLDER_PREFIX,
	STATE_INDEX_FOLDER_PREFIX,
]

describe('readScratchFolders', () => {
	it.each(SCRATCH_PREFIXES_OF_SOURCES)(
		'a folder named %sx -> listed with its modification time',
		(prefix) => {
			const tmp = temporaryFolder('dialecte-scratch-reader-')
			const folder = join(tmp, `${prefix}x`)
			mkdirSync(folder)
			utimesSync(folder, FIRST_FILE_TIME, FIRST_FILE_TIME)
			expect(readScratchFolders({ tmp })).toEqual([
				{ path: folder, modifiedAt: FIRST_FILE_TIME.toISOString() },
			])
		},
	)

	it('a folder with no cli prefix -> left out', () => {
		const tmp = temporaryFolder('dialecte-scratch-reader-')
		mkdirSync(join(tmp, 'other-folder'))
		expect(readScratchFolders({ tmp })).toEqual([])
	})

	it('a file with a cli prefix -> left out', () => {
		const tmp = temporaryFolder('dialecte-scratch-reader-')
		writeFileSync(join(tmp, 'dialecte-probe-file'), '')
		expect(readScratchFolders({ tmp })).toEqual([])
	})

	it('a missing tmp -> none', () => {
		const tmp = join(temporaryFolder('dialecte-scratch-reader-'), 'missing')
		expect(readScratchFolders({ tmp })).toEqual([])
	})
})
