/**
 * The suite's data folder (33K case 9): the guard's global setup points XDG_DATA_HOME inside the suite's
 * temporary root, so no test writes into a person's facts ledger, and its teardown removes that folder before it
 * checks that the root is empty.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { temporaryFolder } from '../scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../test-timing.constants.ts'
import { SUITE_DATA_FOLDER } from './temp-folder-guard.constants.ts'
import setupTemporaryFolderGuard from './temp-folder-guard.setup.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The way from the root down to the path: no `..` segment and not empty when the path lies inside the root. */
function wayInside(params: { root: string | undefined; path: string | undefined }): string[] {
	if (!params.root || !params.path) return ['<unset>']
	const way = relative(params.root, params.path)
	return way === '' ? ['<the root itself>'] : way.split('/')
}

describe('the suite data folder', () => {
	it('inside a test → XDG_DATA_HOME is set and lies inside the suite temporary root (TMPDIR)', () => {
		expect(wayInside({ root: process.env.TMPDIR, path: process.env.XDG_DATA_HOME })[0]).toEqual(
			expect.not.stringMatching(/^(\.\.|<)/),
		)
	})

	it('inside a test → XDG_DATA_HOME is <TMPDIR>/data and is not XDG_STATE_HOME', () => {
		expect({
			data: process.env.XDG_DATA_HOME,
			distinctFromState: process.env.XDG_DATA_HOME !== process.env.XDG_STATE_HOME,
		}).toEqual({
			data: join(process.env.TMPDIR ?? '<unset>', SUITE_DATA_FOLDER),
			distinctFromState: true,
		})
	})
})

describe(
	'the guard setup and teardown, for the data folder',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/** Runs the guard's setup with the environment stubbed so the test restores it whatever happens. */
		function setupGuard() {
			vi.stubEnv('TMPDIR', process.env.TMPDIR)
			vi.stubEnv('XDG_DATA_HOME', process.env.XDG_DATA_HOME)
			return setupTemporaryFolderGuard()
		}

		it('setup → XDG_DATA_HOME names a folder inside the new temporary root', () => {
			const teardown = setupGuard()
			const way = wayInside({ root: process.env.TMPDIR, path: process.env.XDG_DATA_HOME })
			teardown()

			expect(way).toEqual([SUITE_DATA_FOLDER])
		})

		it('a data folder holding files at teardown → removed before the leftover check, which passes', () => {
			const teardown = setupGuard()
			let torn = false
			try {
				const data = process.env.XDG_DATA_HOME as string
				expect(wayInside({ root: process.env.TMPDIR, path: data })[0]).toEqual(
					expect.not.stringMatching(/^(\.\.|<)/),
				)
				mkdirSync(join(data, 'dialecte', 'facts'), { recursive: true })
				writeFileSync(join(data, 'dialecte', 'facts', 'F-0001.json'), '{}\n')

				expect(() => teardown()).not.toThrow()
				torn = true
				expect(existsSync(data)).toBe(false)
			} finally {
				if (!torn) teardown()
			}
		})

		it('teardown → XDG_DATA_HOME and TMPDIR back as before, a real before-folder and its file surviving', () => {
			const before = temporaryFolder('data-before-')
			writeFileSync(join(before, 'keep.txt'), 'kept\n')
			const root = process.env.TMPDIR
			vi.stubEnv('TMPDIR', root)
			vi.stubEnv('XDG_DATA_HOME', before)
			const teardown = setupTemporaryFolderGuard()
			const during = process.env.XDG_DATA_HOME
			teardown()

			expect({
				changedDuringSetup: during !== before,
				after: [process.env.XDG_DATA_HOME, process.env.TMPDIR],
				survivors: [existsSync(before), existsSync(join(before, 'keep.txt'))],
			}).toEqual({
				changedDuringSetup: true,
				after: [before, root],
				survivors: [true, true],
			})
		})
	},
)
