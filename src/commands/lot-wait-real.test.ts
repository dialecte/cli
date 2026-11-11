/**
 * `lot wait <id>` on a real lot (33S section 7, G9, cases 12 and 62): it returns at once on `ready`, `committed`,
 * `failed`, `canceled`, `input-required` and a `limit`, with nothing written and no sleep; on a `working` lot it
 * polls every second under an injected sleep and returns when a transition or the registry changes, or exits 5 at
 * `--timeout`; where `abandoned.json` is the only evidence of `canceled` it re-reads once after 100 ms (case 62).
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { markAbandoned } from '../../test/handover-store-scenario.ts'
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot, questionWith } from '../../test/lot-questions.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { AT_ONCE_ROWS } from '../../test/lot-wait-real-cases.constants.ts'
import {
	POLL_MS,
	REAL_WAITING_LINE_PATTERN,
	REREAD_PAUSE_MS,
} from '../../test/simulated-lot.constants.ts'
import { createWaitTime, waitJson } from '../../test/simulated-lot.ts'
import { entryOf, transitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'
import { waitLot } from './lot-wait.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'
import type { Observed } from '../../test/lot-wait-real-cases.types.ts'
import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { EngineState, TransitionCauseKind } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Everything the store holds for the lot: its folder and the registry. */
function bytesOf(lot: QuestionLot): string {
	return JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])
}

/** The transition `seq` the test publishes, by hand, as a record the store would hold. */
function publishTransition(params: {
	lot: QuestionLot
	seq: number
	state: EngineState
	kind: TransitionCauseKind
}): void {
	writeRecordFile({
		folder: params.lot.lotFolder,
		name: `transitions/${String(params.seq).padStart(6, '0')}.json`,
		text: `${JSON.stringify(transitionOf({ seq: params.seq, state: params.state, kind: params.kind }))}\n`,
	})
}

/** The registry entry the test writes for the lot, in `state`. */
function publishEntry(params: { lot: QuestionLot; state: StoreEntry['state'] }): void {
	writeRecordFile({
		folder: params.lot.workspace.registry,
		name: `${QUESTION_LOT}.json`,
		text: JSON.stringify(entryOf({ state: params.state, folder: params.lot.lotFolder })),
	})
}

/**
 * `lot wait` of the lot from its repository; `publish` runs at each sleep (the test's move while the wait polls),
 * the store's bytes taken after it so what the wait itself wrote shows.
 */
async function waitObserved(params: {
	lot: QuestionLot
	publish?: (call: number) => void
	words?: string[]
}): Promise<Observed> {
	let afterTheTest = bytesOf(params.lot)
	const time = createWaitTime({
		onSleep(call) {
			params.publish?.(call)
			afterTheTest = bytesOf(params.lot)
		},
	})
	const waited = await waitJson({
		cwd: params.lot.workspace.repository,
		id: QUESTION_LOT,
		time,
		words: params.words,
	})
	return {
		exitCode: waited.exitCode,
		state: (waited.json as { state?: unknown } | undefined)?.state,
		sleeps: time.sleeps,
		onlyTheTestWrote: bytesOf(params.lot) === afterTheTest,
	}
}

describe(
	'lot wait on a real lot: it returns at once, spends nothing, writes nothing (case 12)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of AT_ONCE_ROWS)
			it(`${row.title} -> exit ${row.exitCode}, no sleep, not a byte written`, async () => {
				const lot = createQuestionLot(row.lot)

				await expect(waitObserved({ lot })).resolves.toEqual({
					exitCode: row.exitCode,
					state: row.state,
					sleeps: [],
					onlyTheTestWrote: true,
				})
			})

		it('a limit with no later transition -> every wait exits 4 again, a real lot has no player to move it past', async () => {
			const lot = createQuestionLot({ later: [transitionOf({ seq: 2, kind: 'limit' })] })
			await waitObserved({ lot }).catch((error: Error) => error.message)

			await expect(waitObserved({ lot })).resolves.toMatchObject({ exitCode: 4, sleeps: [] })
		})
	},
)

describe('lot wait on a real lot: it polls every second', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('working, a ready transition lands during the first sleep -> exit 0 at ready after one 1 s sleep', async () => {
		const lot = createQuestionLot()

		await expect(
			waitObserved({
				lot,
				publish: () => publishTransition({ lot, seq: 2, state: 'ready', kind: 'ready' }),
			}),
		).resolves.toEqual({ exitCode: 0, state: 'ready', sleeps: [POLL_MS], onlyTheTestWrote: true })
	})

	it('working, the registry entry lands during the second sleep -> exit 0 at ready after two 1 s sleeps', async () => {
		const lot = createQuestionLot()

		await expect(
			waitObserved({
				lot,
				publish: (call) => {
					if (call === 2) publishEntry({ lot, state: 'pending' })
				},
			}),
		).resolves.toEqual({
			exitCode: 0,
			state: 'ready',
			sleeps: [POLL_MS, POLL_MS],
			onlyTheTestWrote: true,
		})
	})

	it('working, the registry entry committed lands -> exit 0 at committed', async () => {
		const lot = createQuestionLot()

		await expect(
			waitObserved({ lot, publish: () => publishEntry({ lot, state: 'committed' }) }),
		).resolves.toMatchObject({ exitCode: 0, state: 'committed', sleeps: [POLL_MS] })
	})

	it('working, a failed transition lands -> exit 1 at failed', async () => {
		const lot = createQuestionLot()

		await expect(
			waitObserved({
				lot,
				publish: () => publishTransition({ lot, seq: 2, state: 'failed', kind: 'fail' }),
			}),
		).resolves.toMatchObject({ exitCode: 1, state: 'failed', sleeps: [POLL_MS] })
	})

	it('working, a question lands -> exit 3 at input-required', async () => {
		const lot = createQuestionLot()

		await expect(
			waitObserved({
				lot,
				publish: () =>
					writeRecordFile({
						folder: lot.lotFolder,
						name: 'transitions/000002.json',
						text: `${JSON.stringify(
							transitionOf({
								seq: 2,
								kind: 'question',
								question: questionWith(),
							}),
						)}\n`,
					}),
			}),
		).resolves.toMatchObject({ exitCode: 3, state: 'input-required', sleeps: [POLL_MS] })
	})

	it('working, a limit lands -> exit 4', async () => {
		const lot = createQuestionLot()

		await expect(
			waitObserved({
				lot,
				publish: () => publishTransition({ lot, seq: 2, state: 'working', kind: 'limit' }),
			}),
		).resolves.toMatchObject({ exitCode: 4, state: 'working', sleeps: [POLL_MS] })
	})

	it('working, --timeout 3 and nothing changes -> exit 5 after three 1 s sleeps, not a byte written', async () => {
		const lot = createQuestionLot()

		await expect(waitObserved({ lot, words: ['--timeout', '3'] })).resolves.toEqual({
			exitCode: 5,
			state: 'working',
			sleeps: [POLL_MS, POLL_MS, POLL_MS],
			onlyTheTestWrote: true,
		})
	})

	it('working, --timeout 5 and a ready transition lands at the second sleep -> exit 0 before the timeout', async () => {
		const lot = createQuestionLot()

		await expect(
			waitObserved({
				lot,
				words: ['--timeout', '5'],
				publish: (call) => {
					if (call === 2) publishTransition({ lot, seq: 2, state: 'ready', kind: 'ready' })
				},
			}),
		).resolves.toMatchObject({ exitCode: 0, state: 'ready', sleeps: [POLL_MS, POLL_MS] })
	})

	it('a terminal, text form, a real lot that polls -> the \\r line waiting <name> (working, <elapsed>) is written', async () => {
		const lot = createQuestionLot()
		const chunks: string[] = []
		function collect(text: string): void {
			chunks.push(text)
		}
		const time = createWaitTime()

		await expect(
			waitLot({
				cwd: lot.workspace.repository,
				argv: [QUESTION_LOT, '--timeout', '2'],
				clock: time.clock,
				sleep: time.sleep,
				isTerminal: true,
				write: collect,
			}).then((result) => ({
				exitCode: result.exitCode,
				line: REAL_WAITING_LINE_PATTERN.test(chunks.join('')),
			})),
		).resolves.toEqual({ exitCode: 5, line: true })
	})

	it('a terminal with --json on a real lot that polls -> nothing is written', async () => {
		const lot = createQuestionLot()
		const chunks: string[] = []
		function collect(text: string): void {
			chunks.push(text)
		}
		const time = createWaitTime()

		await expect(
			waitLot({
				cwd: lot.workspace.repository,
				argv: [QUESTION_LOT, '--timeout', '2', '--json'],
				clock: time.clock,
				sleep: time.sleep,
				isTerminal: true,
				write: collect,
			}).then((result) => ({ exitCode: result.exitCode, written: chunks.join('') })),
		).resolves.toEqual({ exitCode: 5, written: '' })
	})
})

/** The lot whose only evidence of `canceled` is `abandoned.json`, and that file's path. */
function markerOnlyLot(): { lot: QuestionLot; marker: string } {
	const lot = createQuestionLot()
	markAbandoned({ folder: lot.lotFolder, file: 'abandoned.json' })
	return { lot, marker: join(lot.lotFolder, 'abandoned.json') }
}

describe(
	'lot wait on a real lot: the one re-read after 100 ms (case 62)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('abandoned.json alone and still there after the pause -> one 100 ms sleep, then exit 1 at canceled', async () => {
			const { lot } = markerOnlyLot()

			await expect(waitObserved({ lot })).resolves.toEqual({
				exitCode: 1,
				state: 'canceled',
				sleeps: [REREAD_PAUSE_MS],
				onlyTheTestWrote: true,
			})
		})

		it('abandoned.json alone and taken back during the pause -> the wait goes on and polls: 100 ms, then 1 s until ready', async () => {
			const { lot, marker } = markerOnlyLot()

			await expect(
				waitObserved({
					lot,
					publish: (call) => {
						if (call === 1) rmSync(marker, { force: true })
						if (call === 2) publishTransition({ lot, seq: 2, state: 'ready', kind: 'ready' })
					},
				}),
			).resolves.toMatchObject({
				exitCode: 0,
				state: 'ready',
				sleeps: [REREAD_PAUSE_MS, POLL_MS],
			})
		})

		it('abandoned.json beside the marker of a live run -> the lot is not canceled: it polls 1 s, no re-read', async () => {
			const { lot } = markerOnlyLot()
			writeFileSync(
				join(lot.lotFolder, HANDOVER_RUN_MARKER_FILE),
				`${JSON.stringify({ pid: process.pid, startedAt: '2026-11-08T10:00:00.000Z' })}\n`,
			)

			await expect(
				waitObserved({
					lot,
					publish: () => publishTransition({ lot, seq: 2, state: 'ready', kind: 'ready' }),
				}),
			).resolves.toMatchObject({ exitCode: 0, state: 'ready', sleeps: [POLL_MS] })
		})

		it('abandoned.json beside an abandoned registry entry -> canceled by the registry: exit 1 at once, no re-read', async () => {
			const lot = createQuestionLot({ registry: 'abandoned' })
			markAbandoned({ folder: lot.lotFolder, file: 'abandoned.json' })

			await expect(waitObserved({ lot })).resolves.toMatchObject({
				exitCode: 1,
				state: 'canceled',
				sleeps: [],
			})
		})

		it('abandoned.json beside a canceled transition -> canceled by the transition: exit 1 at once, no re-read', async () => {
			const lot = createQuestionLot({
				later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })],
			})
			markAbandoned({ folder: lot.lotFolder, file: 'abandoned.json' })

			await expect(waitObserved({ lot })).resolves.toMatchObject({
				exitCode: 1,
				state: 'canceled',
				sleeps: [],
			})
		})
	},
)
