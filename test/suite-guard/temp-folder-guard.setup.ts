/**
 * Suite guard (vitest `globalSetup`): the run gets one temporary folder of its own, made before any worker
 * starts and set as TMPDIR, so the workers (vitest gives them this process's environment) and every command
 * they spawn make their temporary folders in it. At the end, any entry left in it - a test or a command that
 * did not remove what it made - fails the run, named (a cache like Node's compile cache is not one); then the
 * folder goes.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SUITE_FOLDER_CACHES, SUITE_FOLDER_PREFIX } from './temp-folder-guard.constants.ts'
import { describeLeftovers, listLeftovers } from './temp-leftovers.ts'

/** Makes the suite's temporary folder and points TMPDIR at it; returns the teardown that checks it. */
export default function setupTemporaryFolderGuard(): () => void {
	const systemFolder = process.env.TMPDIR
	const folder = mkdtempSync(join(tmpdir(), SUITE_FOLDER_PREFIX))
	process.env.TMPDIR = folder

	return function checkTemporaryFolder() {
		try {
			try {
				const names = listLeftovers({ folder }).filter(
					(name) => !SUITE_FOLDER_CACHES.includes(name),
				)
				const message = describeLeftovers({ names })
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
		}
	}
}
