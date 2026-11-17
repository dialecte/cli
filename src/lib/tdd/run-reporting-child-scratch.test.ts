/** The tdd runs make their folders under the scratch root, and a later run trashes the base-run leftovers there. */
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { trashBaseRunLeftovers } from './base-red.ts'
import { runReportingChild } from './run-reporting-child.ts'

import { describe, expect, it, vi } from 'vitest'

/** A child that writes, as its report, the path of the report it was handed. */
const ECHO_REPORT_PATH =
	'const path = process.env.DIALECTE_TDD_REPORT; require("node:fs").writeFileSync(path, JSON.stringify([{ path }]))'

/** The folder the reporting child's report sat in. */
async function reportFolderOf(root: string): Promise<string> {
	const reported = await runReportingChild({
		runner: 'vitest',
		command: process.execPath,
		args: ['-e', ECHO_REPORT_PATH],
		environment: {},
		run: { root, files: [], filter: 'all' },
	})
	return 'failure' in reported
		? reported.failure
		: dirname((reported[0] as unknown as { path: string }).path)
}

/** Two base-run leftovers under `scratch`, older than this process: one whose owner is gone, one this process owns. */
function leftoversIn(scratch: string): { gone: string; live: string } {
	const old = new Date('2026-01-01T00:00:00Z')
	const [gone, live] = [
		{ name: 'dialecte-base-red-gone', pid: deadPid() },
		{ name: 'dialecte-base-red-live', pid: process.pid },
	].map(function leftover({ name, pid }) {
		const folder = join(scratch, name)
		mkdirSync(folder, { recursive: true })
		writeFileSync(
			join(folder, 'scratch.json'),
			JSON.stringify({ pid, startedAt: old.toISOString(), command: 'x' }),
		)
		utimesSync(folder, old, old)
		return folder
	})
	return { gone, live }
}

describe('the tdd scratch folders', () => {
	it('a reporting child run → its report folder made under DIALECTE_SCRATCH', async () => {
		const scratch = temporaryFolder('dialecte-tdd-scratch-')
		vi.stubEnv('DIALECTE_SCRATCH', scratch)
		try {
			const folder = await reportFolderOf(temporaryFolder('dialecte-tdd-root-'))
			expect(dirname(folder)).toBe(scratch)
		} finally {
			vi.unstubAllEnvs()
		}
	})

	it('base-run leftovers under DIALECTE_SCRATCH → the one whose owner is gone trashed, the live one kept', () => {
		const scratch = temporaryFolder('dialecte-tdd-scratch-')
		const { gone, live } = leftoversIn(scratch)
		vi.stubEnv('DIALECTE_SCRATCH', scratch)
		try {
			trashBaseRunLeftovers()
			expect({ gone: existsSync(gone), live: existsSync(live) }).toEqual({
				gone: false,
				live: true,
			})
		} finally {
			vi.unstubAllEnvs()
		}
	})
})
