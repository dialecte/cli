/**
 * The tdd part of a lot's `tests.json` (33CI CI2a): `tdd green` in the lot's worktree writes the cases of the change
 * with their status, as `tdd status` reads them after the run; `tdd red` writes none. The package is a scratch one that
 * tests with the cli's own vitest (the receipts need a real run).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ADD_CODE, ADD_FILE, ADD_TEST_FILE, TDD_NOW } from '../../test/step-events-tdd.constants.ts'
import { createTddLot } from '../../test/step-events-tdd.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `dialecte tdd <argv>` in `cwd` at the cases' time. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => TDD_NOW })
}

/** The lot folder's `tests.json` read as JSON; undefined without the file. */
function testsRecordOf(lotFolder: string): unknown {
	const file = join(lotFolder, STORE_FILES.tests)
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
}

describe('tdd - tests.json', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('tdd red, the code, tdd green -> the tdd part: the case green, its count, the time of the run', async () => {
		const lot = createTddLot()
		await tdd({ cwd: lot.worktree, argv: ['red'] })
		writeFileSync(join(lot.worktree, ADD_FILE), ADD_CODE)

		await tdd({ cwd: lot.worktree, argv: ['green'] })

		expect(testsRecordOf(lot.lotFolder)).toEqual({
			schema: 1,
			tdd: {
				at: TDD_NOW.toISOString(),
				cases: [{ file: ADD_TEST_FILE, name: 'add > one plus two → three', status: 'green' }],
				counts: { green: 1 },
			},
		})
	})

	it('tdd red alone -> no tests.json', async () => {
		const lot = createTddLot()

		await tdd({ cwd: lot.worktree, argv: ['red'] })

		expect(testsRecordOf(lot.lotFolder)).toBeUndefined()
	})

	it('a tests.json that cannot be written -> the green stands: exit 0, then the ! line', async () => {
		const lot = createTddLot()
		await tdd({ cwd: lot.worktree, argv: ['red'] })
		writeFileSync(join(lot.worktree, ADD_FILE), ADD_CODE)
		mkdirSync(join(lot.lotFolder, STORE_FILES.tests, 'blocked'), { recursive: true })

		const result = await tdd({ cwd: lot.worktree, argv: ['green'] })

		expect({
			exitCode: result.exitCode,
			last: result.output.trimEnd().split('\n').at(-1),
		}).toEqual({
			exitCode: 0,
			last: expect.stringMatching(/^! tests\.json not written: /),
		})
	})

	it('a tests.json that cannot be written, tdd green --json -> exit 0, the ! line as its warning field', async () => {
		const lot = createTddLot()
		await tdd({ cwd: lot.worktree, argv: ['red'] })
		writeFileSync(join(lot.worktree, ADD_FILE), ADD_CODE)
		mkdirSync(join(lot.lotFolder, STORE_FILES.tests, 'blocked'), { recursive: true })

		const result = await tdd({ cwd: lot.worktree, argv: ['green', '--json'] })

		expect({
			exitCode: result.exitCode,
			warning: (JSON.parse(result.output) as { warning?: unknown }).warning,
		}).toEqual({
			exitCode: 0,
			warning: expect.stringMatching(/^! tests\.json not written: /),
		})
	})
})
