/**
 * Suite guard (vitest `globalSetup`): the run gets one temporary folder of its own, made before any worker
 * starts and set as TMPDIR, so the workers (vitest gives them this process's environment) and every command
 * they spawn make their temporary folders in it. At the end, any entry left in it - a test or a command that
 * did not remove what it made - fails the run, named with the test that made it and the first paths it holds (a
 * cache like Node's compile cache is not one); then the folder goes.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SCRATCH_VARIABLE } from '../../src/lib/scratch/scratch.constants.ts'
import { DATA_HOME_VARIABLE, STATE_HOME_VARIABLE } from '../../src/lib/store/store.constants.ts'
import {
	ORIGINS_VARIABLE,
	SUITE_DATA_FOLDER,
	SUITE_FOLDER_CACHES,
	SUITE_FOLDER_PREFIX,
	SUITE_ORIGINS_FOLDER,
	SUITE_STATE_FOLDER,
} from './temp-folder-guard.constants.ts'
import { describeLeftovers, leftoverOf, listLeftovers, readOrigins } from './temp-leftovers.ts'

/**
 * Makes the suite's temporary folder and points TMPDIR and DIALECTE_SCRATCH at it (the cli's scratch folders stay in
 * the guarded folder, never in the workspace's scratch root), and XDG_STATE_HOME and XDG_DATA_HOME at folders
 * inside it (no test writes into a person's state or data folder), and the origins variable at its origins folder;
 * returns the teardown that removes the state, data and origins folders, then checks the rest.
 */
export default function setupTemporaryFolderGuard(): () => void {
	const systemFolder = process.env.TMPDIR
	const systemState = process.env[STATE_HOME_VARIABLE]
	const systemData = process.env[DATA_HOME_VARIABLE]
	const systemOrigins = process.env[ORIGINS_VARIABLE]
	const systemScratch = process.env[SCRATCH_VARIABLE]
	const folder = mkdtempSync(join(tmpdir(), SUITE_FOLDER_PREFIX))
	const state = join(folder, SUITE_STATE_FOLDER)
	mkdirSync(state)
	const data = join(folder, SUITE_DATA_FOLDER)
	mkdirSync(data)
	const origins = join(folder, SUITE_ORIGINS_FOLDER)
	mkdirSync(origins)
	process.env.TMPDIR = folder
	process.env[SCRATCH_VARIABLE] = folder
	process.env[STATE_HOME_VARIABLE] = state
	process.env[DATA_HOME_VARIABLE] = data
	process.env[ORIGINS_VARIABLE] = origins

	return function checkTemporaryFolder() {
		try {
			try {
				// the state, data and origins folders are the suite's own, not leftovers: removed before the check
				rmSync(state, { recursive: true, force: true })
				rmSync(data, { recursive: true, force: true })
				const made = readOrigins({ folder: origins })
				rmSync(origins, { recursive: true, force: true })
				const leftovers = listLeftovers({ folder })
					.filter((name) => !SUITE_FOLDER_CACHES.includes(name))
					.map((name) => leftoverOf({ folder, name, origins: made }))
				const message = describeLeftovers({ leftovers })
				if (message !== undefined)
					throw new Error(`${message} (in the suite's temporary folder ${folder})`)
			} finally {
				rmSync(folder, { recursive: true, force: true })
			}
		} catch (error) {
			// vitest 4 prints a teardown's error but still exits 0: the exit code says it too
			process.exitCode = 1
			throw error
		} finally {
			if (systemFolder === undefined) delete process.env.TMPDIR
			else process.env.TMPDIR = systemFolder
			if (systemState === undefined) delete process.env[STATE_HOME_VARIABLE]
			else process.env[STATE_HOME_VARIABLE] = systemState
			if (systemData === undefined) delete process.env[DATA_HOME_VARIABLE]
			else process.env[DATA_HOME_VARIABLE] = systemData
			if (systemOrigins === undefined) delete process.env[ORIGINS_VARIABLE]
			else process.env[ORIGINS_VARIABLE] = systemOrigins
			if (systemScratch === undefined) delete process.env[SCRATCH_VARIABLE]
			else process.env[SCRATCH_VARIABLE] = systemScratch
		}
	}
}
