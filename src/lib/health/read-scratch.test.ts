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

	it('a folder holding a scratch.json in the scratch root -> listed whatever its name', () => {
		const root = temporaryFolder('dialecte-scratch-root-')
		const folder = join(root, 'any-purpose-x')
		mkdirSync(folder)
		writeFileSync(join(folder, 'scratch.json'), '{}')
		utimesSync(folder, FIRST_FILE_TIME, FIRST_FILE_TIME)
		expect(readScratchFolders({ root, tmp: temporaryFolder('dialecte-scratch-reader-') })).toEqual([
			{ path: folder, modifiedAt: FIRST_FILE_TIME.toISOString() },
		])
	})

	it('a folder of the scratch root with a scratch.json naming a process → its start time and pid read from it', () => {
		const root = temporaryFolder('dialecte-scratch-root-')
		const folder = join(root, 'dialecte-rehearse-x')
		mkdirSync(folder)
		writeFileSync(
			join(folder, 'scratch.json'),
			JSON.stringify({
				pid: 4242,
				startedAt: '2026-11-01T00:00:00.000Z',
				command: 'dialecte handover run',
			}),
		)
		expect(readScratchFolders({ root, tmp: temporaryFolder('dialecte-scratch-reader-') })).toEqual([
			{ path: folder, modifiedAt: '2026-11-01T00:00:00.000Z', pid: 4242 },
		])
	})

	it("a rehearsal hook's temporary folder left in the short root → listed", () => {
		const tmp = temporaryFolder('dialecte-scratch-reader-')
		const folder = join(tmp, 'dlt-hook-abc')
		mkdirSync(folder)
		utimesSync(folder, FIRST_FILE_TIME, FIRST_FILE_TIME)
		expect(readScratchFolders({ tmp })).toEqual([
			{ path: folder, modifiedAt: FIRST_FILE_TIME.toISOString() },
		])
	})

	it('a folder of the scratch root without scratch.json nor cli prefix -> left out', () => {
		const root = temporaryFolder('dialecte-scratch-root-')
		mkdirSync(join(root, 'other-folder'))
		expect(readScratchFolders({ root, tmp: temporaryFolder('dialecte-scratch-reader-') })).toEqual(
			[],
		)
	})

	it('a missing tmp -> none', () => {
		const tmp = join(temporaryFolder('dialecte-scratch-reader-'), 'missing')
		expect(readScratchFolders({ tmp })).toEqual([])
	})
})
