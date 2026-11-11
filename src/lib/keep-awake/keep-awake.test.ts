/**
 * The keep-awake hold, through its seams: a platform, a search path, a spawner that records, an environment and a
 * pid; never a real `caffeinate`. The hold answers whether it started the child.
 */
import { basename } from 'node:path'

import {
	CAFFEINATE_ARGUMENTS,
	CAFFEINATE_NAME,
	KEEP_AWAKE_VARIABLE,
	OWN_PID,
} from '../../../test/keep-awake-workspace.constants.ts'
import {
	emptyFolder,
	folderHoldingCaffeinate,
	searchPathOf,
} from '../../../test/keep-awake-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../../test/worktree-pool.ts'
import { createAwakeHolder, holdAwake } from './keep-awake.ts'

import { describe, expect, it } from 'vitest'

/** What the recording spawner was asked to start, as (program name, arguments). */
function startedOf(recorded: ReturnType<typeof createRecordingSpawner>): [string, string[]][] {
	return recorded.calls.map((call) => [basename(call.command), call.args])
}

const HOLD = [[CAFFEINATE_NAME, [...CAFFEINATE_ARGUMENTS, String(OWN_PID)]]]

describe('createAwakeHolder (the production holder)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('darwin and a caffeinate on the path, no pid given → the holder starts caffeinate -i -w <this process’s pid>', () => {
		const recorded = createRecordingSpawner()
		const searchPath = searchPathOf([folderHoldingCaffeinate({ executable: true })])

		expect(
			createAwakeHolder({
				platform: 'darwin',
				searchPath,
				spawner: recorded.spawner,
				environment: {},
			})(),
		).toBe(true)
		expect(startedOf(recorded)).toEqual([
			[CAFFEINATE_NAME, [...CAFFEINATE_ARGUMENTS, String(process.pid)]],
		])
	})
})

describe('holdAwake', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('darwin, caffeinate executable on the path → one caffeinate -i -w <own pid>', () => {
		const recorded = createRecordingSpawner()
		const searchPath = searchPathOf([folderHoldingCaffeinate({ executable: true })])

		expect(
			holdAwake({
				platform: 'darwin',
				searchPath,
				spawner: recorded.spawner,
				environment: {},
				pid: OWN_PID,
			}),
		).toBe(true)
		expect(startedOf(recorded)).toEqual(HOLD)
	})

	it('darwin, caffeinate in the second folder of the path → found, one hold', () => {
		const recorded = createRecordingSpawner()
		const searchPath = searchPathOf([emptyFolder(), folderHoldingCaffeinate({ executable: true })])

		expect(
			holdAwake({
				platform: 'darwin',
				searchPath,
				spawner: recorded.spawner,
				environment: {},
				pid: OWN_PID,
			}),
		).toBe(true)
		expect(startedOf(recorded)).toEqual(HOLD)
	})

	it.each(['linux', 'win32'] as const)(
		'%s, caffeinate executable on the path → nothing, and the call says so',
		(platform) => {
			const recorded = createRecordingSpawner()
			const searchPath = searchPathOf([folderHoldingCaffeinate({ executable: true })])

			expect(
				holdAwake({
					platform,
					searchPath,
					spawner: recorded.spawner,
					environment: {},
					pid: OWN_PID,
				}),
			).toBe(false)
			expect(startedOf(recorded)).toEqual([])
		},
	)

	it('darwin, no caffeinate on the path → nothing', () => {
		const recorded = createRecordingSpawner()

		expect(
			holdAwake({
				platform: 'darwin',
				searchPath: searchPathOf([emptyFolder()]),
				spawner: recorded.spawner,
				environment: {},
				pid: OWN_PID,
			}),
		).toBe(false)
		expect(startedOf(recorded)).toEqual([])
	})

	it('darwin, an empty path → nothing', () => {
		const recorded = createRecordingSpawner()

		expect(
			holdAwake({
				platform: 'darwin',
				searchPath: '',
				spawner: recorded.spawner,
				environment: {},
				pid: OWN_PID,
			}),
		).toBe(false)
		expect(startedOf(recorded)).toEqual([])
	})

	it('darwin, a file named caffeinate that is not executable → nothing', () => {
		const recorded = createRecordingSpawner()
		const searchPath = searchPathOf([folderHoldingCaffeinate({ executable: false })])

		expect(
			holdAwake({
				platform: 'darwin',
				searchPath,
				spawner: recorded.spawner,
				environment: {},
				pid: OWN_PID,
			}),
		).toBe(false)
		expect(startedOf(recorded)).toEqual([])
	})

	it('darwin, caffeinate available, DIALECTE_KEEP_AWAKE=0 → nothing', () => {
		const recorded = createRecordingSpawner()
		const searchPath = searchPathOf([folderHoldingCaffeinate({ executable: true })])

		expect(
			holdAwake({
				platform: 'darwin',
				searchPath,
				spawner: recorded.spawner,
				environment: { [KEEP_AWAKE_VARIABLE]: '0' },
				pid: OWN_PID,
			}),
		).toBe(false)
		expect(startedOf(recorded)).toEqual([])
	})

	it('darwin, caffeinate available, DIALECTE_KEEP_AWAKE=1 → one hold', () => {
		const recorded = createRecordingSpawner()
		const searchPath = searchPathOf([folderHoldingCaffeinate({ executable: true })])

		expect(
			holdAwake({
				platform: 'darwin',
				searchPath,
				spawner: recorded.spawner,
				environment: { [KEEP_AWAKE_VARIABLE]: '1' },
				pid: OWN_PID,
			}),
		).toBe(true)
		expect(startedOf(recorded)).toHaveLength(1)
	})
})
