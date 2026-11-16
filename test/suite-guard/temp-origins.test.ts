/**
 * The guard names its culprit: `temporaryFolder` records the test that made each folder, the teardown reads those
 * records and names, for a leftover, its maker, the first paths it holds and the processes holding it.
 */
import { spawn } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { temporaryFolder } from '../scratch-repository.ts'
import { ORIGINS_VARIABLE } from './temp-folder-guard.constants.ts'
import { holdersOf } from './temp-holders.ts'
import { leftoverOf, readOrigins, recordOrigin } from './temp-leftovers.ts'

import { describe, expect, it } from 'vitest'

/** The lines of every origins file of the suite naming `name`. */
function originLinesOf(name: string): string[] {
	const folder = process.env[ORIGINS_VARIABLE]
	if (folder === undefined || !existsSync(folder)) return []
	return readdirSync(folder)
		.flatMap((file) => readFileSync(join(folder, file), 'utf8').split('\n'))
		.filter((line) => line.startsWith(`${name}\t`))
}

describe('temporaryFolder under the suite guard', () => {
	it('a folder made inside a test → one origins line naming this test file and its full name', () => {
		const folder = temporaryFolder('dialecte-origin-')

		expect(originLinesOf(basename(folder))).toEqual([
			`${basename(folder)}\ttest/suite-guard/temp-origins.test.ts > temporaryFolder under the suite guard > a folder made inside a test → one origins line naming this test file and its full name`,
		])
	})

	it('the origins folder → beside the folders tests make, in the suite temporary root', () => {
		const folder = temporaryFolder('dialecte-origin-')

		expect(dirname(process.env[ORIGINS_VARIABLE] ?? '<unset>')).toBe(dirname(folder))
	})
})

describe('readOrigins', () => {
	it("two workers' files, one name recorded twice → each name with its maker, the later line winning", () => {
		const folder = temporaryFolder('dlt-origins-')
		recordOrigin({ file: join(folder, '1-0'), name: 'dialecte-a', origin: 'a.test.ts > one' })
		recordOrigin({ file: join(folder, '1-0'), name: 'dialecte-b', origin: 'a.test.ts > two' })
		recordOrigin({ file: join(folder, '2-0'), name: 'dialecte-a', origin: 'b.test.ts > three' })

		expect(Object.fromEntries(readOrigins({ folder }))).toEqual({
			'dialecte-a': 'b.test.ts > three',
			'dialecte-b': 'a.test.ts > two',
		})
	})

	it('no origins folder → no maker known', () => {
		expect(readOrigins({ folder: join(temporaryFolder('dlt-origins-'), 'missing') }).size).toBe(0)
	})
})

describe('leftoverOf', () => {
	function noHolder(): string[] {
		return []
	}

	it('a folder holding nested files, a link and an empty folder → its first three innermost paths, sorted', () => {
		const root = temporaryFolder('dlt-leftover-')
		mkdirSync(join(root, 'left', 'repo', '.git', 'objects'), { recursive: true })
		writeFileSync(join(root, 'left', 'repo', '.git', 'objects', 'maintenance.lock'), '')
		mkdirSync(join(root, 'left', 'b-empty'))
		symlinkSync(root, join(root, 'left', 'a-link'))
		writeFileSync(join(root, 'left', 'z.txt'), 'z\n')

		expect(
			leftoverOf({ folder: root, name: 'left', origins: new Map(), readHolders: noHolder }),
		).toEqual({
			name: 'left',
			holds: ['a-link', 'b-empty/', 'repo/.git/objects/maintenance.lock'],
			holders: [],
		})
	})

	it('a file with a recorded maker → its maker, nothing held', () => {
		const root = temporaryFolder('dlt-leftover-')
		writeFileSync(join(root, 'left.txt'), 'left\n')

		expect(
			leftoverOf({
				folder: root,
				name: 'left.txt',
				origins: new Map([['left.txt', 'a.test.ts > one']]),
				readHolders: noHolder,
			}),
		).toEqual({ name: 'left.txt', origin: 'a.test.ts > one', holds: [], holders: [] })
	})
})

describe('holdersOf', () => {
	it('a process whose working folder lies in the folder → named with its pid and command; a folder nobody holds → none', async () => {
		const held = realpathSync(temporaryFolder('dlt-held-'))
		const free = realpathSync(temporaryFolder('dlt-free-'))
		const child = spawn('sleep', ['30'], { cwd: held, stdio: 'ignore' })
		const exited = new Promise((resolve) => child.on('exit', resolve))
		try {
			expect({ held: holdersOf({ path: held }), free: holdersOf({ path: free }) }).toEqual({
				held: [expect.stringMatching(new RegExp(`^${child.pid} .*sleep`))],
				free: [],
			})
		} finally {
			child.kill()
			await exited
		}
	})
})
