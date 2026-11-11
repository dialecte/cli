/**
 * `lot wait` on a real lot notices what its stat signature could miss (R2-4, R2-5): a transition file added to a
 * folder whose mtime is restored, and a run marker whose process died while no file changed. (A registry entry
 * naming the lot ends the wait at its first read, so an in-place rewrite of one is never waited through.) Each move is made inside the injected sleep, so the order
 * is forced; the wait's timeout is the only thing that would end a missed change.
 */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { markAbandoned } from '../../test/handover-store-scenario.ts'
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import { RUN_STARTED_AT } from '../../test/lot-stop-workspace.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { createWaitTime, waitJson } from '../../test/simulated-lot.ts'
import { transitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'
import type { Ended, WaitTime } from '../../test/simulated-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot wait --timeout 5 --json` of the lot under `time`: how it ended. */
async function endedUnder(params: { lot: QuestionLot; time: WaitTime }): Promise<Ended> {
	const waited = await waitJson({
		cwd: params.lot.workspace.repository,
		id: QUESTION_LOT,
		time: params.time,
		words: ['--timeout', '5'],
	})
	return {
		exitCode: waited.exitCode,
		state: (waited.json as { state?: unknown } | undefined)?.state,
	}
}

/**
 * Runs `change`, then sets `path`'s access and modification times back to what they were, to the nanosecond: a
 * reference file takes them through `touch -r` (`utimesSync` keeps milliseconds only, which would show the change).
 */
function changeKeepingTimes(params: { path: string; change: () => void }): void {
	const reference = join(temporaryFolder('dialecte-times-'), 'reference')
	writeFileSync(reference, '')
	copyTimes({ from: params.path, to: reference })
	params.change()
	copyTimes({ from: reference, to: params.path })
}

/** `touch -r <from> <to>`: `to` takes the access and modification times of `from`. */
function copyTimes(params: { from: string; to: string }): void {
	const touched = spawnSync('touch', ['-r', params.from, params.to])
	if (touched.status !== 0) throw new Error(`touch -r failed: ${String(touched.stderr)}`)
}

describe(
	'lot wait on a real lot: changes a stat signature could miss',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a transition file added during the first sleep, the transitions folder mtime restored -> read again: exit 0 at ready', async () => {
			const lot = createQuestionLot()
			const folder = join(lot.lotFolder, 'transitions')
			// a file that is no transition yet, named as long as the transition's: renamed, the folder's size stays
			const waiting = writeRecordFile({
				folder: lot.lotFolder,
				name: 'transitions/decoy2.json',
				text: `${JSON.stringify(transitionOf({ seq: 2, state: 'ready', kind: 'ready' }))}\n`,
			})
			const time = createWaitTime({
				onSleep(call) {
					if (call !== 1) return
					changeKeepingTimes({
						path: folder,
						change() {
							renameSync(waiting, join(folder, '000002.json'))
						},
					})
				},
			})

			await expect(endedUnder({ lot, time })).resolves.toEqual({ exitCode: 0, state: 'ready' })
		})
	},
)

describe('lot wait on a real lot: the run marker', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the live run marker beside abandoned.json, its process dying during the first sleep with no file changed -> the wait ends as a fresh read does', async () => {
		const lot = createQuestionLot()
		markAbandoned({ folder: lot.lotFolder, file: HANDOVER_FILES.abandoned })
		const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
			stdio: 'ignore',
		})
		onTestFinished(function stopChild() {
			child.kill('SIGKILL')
		})
		writeFileSync(
			join(lot.lotFolder, HANDOVER_RUN_MARKER_FILE),
			`${JSON.stringify({ pid: child.pid, startedAt: RUN_STARTED_AT })}\n`,
		)
		const polling = createWaitTime()
		async function sleepAndLetTheRunDie(milliseconds: number): Promise<void> {
			if (polling.sleeps.length === 0) {
				child.kill('SIGKILL')
				await once(child, 'exit')
			}
			await polling.sleep(milliseconds)
		}

		const ended = await endedUnder({ lot, time: { ...polling, sleep: sleepAndLetTheRunDie } })
		const fresh = await endedUnder({ lot, time: createWaitTime() })

		expect(ended).toEqual(fresh)
		expect(ended).toEqual({ exitCode: 1, state: 'canceled' })
	})
})
