/**
 * `dialecte lot station <id> start|end <station> ...` through `runLot` on a scratch store (33L0 sections 3, 4 "Station
 * events", 6, 12; cases 3-7): what one call writes into the lot's `events.jsonl`, what it answers, how an end pairs
 * with its start, how a retry is told. Refusals are in `lot-station-refusals.test.ts`.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { STATION, STATION_LOT, VERDICTS } from '../../test/lot-station-workspace.constants.ts'
import {
	commitStationLot,
	createStationLot,
	recordedAfter,
	station,
} from '../../test/lot-station-workspace.ts'
import { initializeRepository, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { pairRuns } from '../lib/events/pair-runs.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { AGENT_SKILL_FOLDERS } from '../lib/skills/sync-skills.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationRecording } from '../../test/lot-station-workspace.types.ts'
import type { LotEvent } from '../lib/events/event.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The named fields of each event, in order. */
function fieldsOf(params: { recording: StationRecording; keys: string[] }) {
	return params.recording.events.map((event) =>
		Object.fromEntries(params.keys.map((key) => [key, event[key]])),
	)
}

/** The event's fields except what differs from call to call (id, time, run, pid). */
function withoutVolatile(event: LotEvent | undefined) {
	if (event === undefined) return undefined
	const { id, at, pid, run, ...rest } = event
	void [id, at, pid, run]
	return rest
}

/** The version this cli's package.json declares. */
const CLI_VERSION = (
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8')) as {
		version: string
	}
).version

function sha256Of(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

describe('lot station start', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('text → exit 0, one station.start by the host, the run and the end command printed', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[0].exitCode,
				printsRun: recording.answers[0].output.includes(recording.events[0]?.id ?? '<none>'),
				printsEnd: recording.answers[0].output.includes(
					`dialecte lot station ${STATION_LOT} end ${STATION} --run ${recording.events[0]?.id}`,
				),
				events: fieldsOf({
					recording,
					keys: ['kind', 'by', 'station', 'lot', 'agent', 'simulated', 'hostEvent'],
				}),
			}))(recordedAfter(lot, [() => station(lot, ['start', STATION, '--agent', 'agent-a'])])),
		).toEqual({
			exitCode: 0,
			printsRun: true,
			printsEnd: true,
			events: [
				{
					kind: 'station.start',
					by: 'host',
					station: STATION,
					lot: STATION_LOT,
					agent: 'agent-a',
					simulated: false,
					hostEvent: null,
				},
			],
		})
	})

	it('--json → recorded new, the run is the start event id, next is the end command with the full name', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[0].exitCode,
				recorded: recording.answers[0].json?.recorded,
				runIsEventId: recording.answers[0].json?.run === recording.events[0]?.id,
				nextStartsEndCommand: String(recording.answers[0].json?.next).startsWith(
					`dialecte lot station ${STATION_LOT} end ${STATION} --run ${recording.events[0]?.id}`,
				),
				eventCount: recording.events.length,
			}))(recordedAfter(lot, [() => station(lot, ['start', STATION, '--json'])])),
		).toEqual({
			exitCode: 0,
			recorded: 'new',
			runIsEventId: true,
			nextStartsEndCommand: true,
			eventCount: 1,
		})
	})

	it('every identity flag → each lands in the event, the --event id in hostEvent', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() =>
						station(lot, [
							'start',
							STATION,
							'--step',
							'2',
							'--round',
							'1',
							'--attempt',
							'3',
							'--agent',
							'agent-a',
							'--executor',
							'command',
							'--vendor',
							'vendor-a',
							'--model',
							'model-a',
							'--tier',
							'standard',
							'--effort',
							'high',
							'--session',
							'session-9',
							'--event',
							'h-1',
						]),
				]),
				keys: [
					'step',
					'round',
					'attempt',
					'agent',
					'executor',
					'vendor',
					'model',
					'tier',
					'effort',
					'session',
					'hostEvent',
				],
			}),
		).toEqual([
			{
				step: 2,
				round: 1,
				attempt: 3,
				agent: 'agent-a',
				executor: 'command',
				vendor: 'vendor-a',
				model: 'model-a',
				tier: 'standard',
				effort: 'high',
				session: 'session-9',
				hostEvent: 'h-1',
			},
		])
	})

	it('no --executor → the executor is host', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [() => station(lot, ['start', STATION])]),
				keys: ['executor'],
			}),
		).toEqual([{ executor: 'host' }])
	})
})

describe('lot station end: pairing', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--run of a start → the end carries that run, the reader pairs them, no started field', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				answers: recording.answers.map((answer) => answer.exitCode),
				endRunIsStartId: recording.events[1]?.run === recording.events[0]?.id,
				kinds: recording.events.map((event) => event.kind),
				endHasStarted: 'started' in (recording.events[1] ?? {}),
				pairedRuns: pairRuns({ events: recording.events }).runs.map((run) => [
					run.start?.id,
					run.end?.id,
				]),
				ids: recording.events.map((event) => event.id),
			}))(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--json']),
					(previous) => station(lot, ['end', STATION, '--run', previous[0].json.run, '--json']),
				]),
			),
		).toMatchObject({
			answers: [0, 0],
			endRunIsStartId: true,
			kinds: ['station.start', 'station.end'],
			endHasStarted: false,
			pairedRuns: [[expect.any(String), expect.any(String)]],
		})
	})

	it('end without --run → the run is the start of its own step, not the other one', () => {
		const lot = createStationLot()

		expect(
			((recording) => recording.events[2]?.run === recording.events[1]?.id)(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--step', '1']),
					() => station(lot, ['start', STATION, '--step', '2']),
					() => station(lot, ['end', STATION, '--step', '2']),
				]),
			),
		).toBe(true)
	})

	it('end without --run → a start of another station is not its start', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				endRunIsOwnStart: recording.events[2]?.run === recording.events[0]?.id,
				endRunIsOtherStation: recording.events[2]?.run === recording.events[1]?.id,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION]),
					() => station(lot, ['start', 'reviewer']),
					() => station(lot, ['end', STATION]),
				]),
			),
		).toEqual({ endRunIsOwnStart: true, endRunIsOtherStation: false })
	})

	for (const option of ['--step', '--round', '--attempt'])
		it(`end ${option} 1 → pairs with the start of ${option} 1 written first, not the later one`, () => {
			const lot = createStationLot()

			expect(
				((recording) => recording.events[2]?.run === recording.events[0]?.id)(
					recordedAfter(lot, [
						() => station(lot, ['start', STATION, option, '1']),
						() => station(lot, ['start', STATION, option, '2']),
						() => station(lot, ['end', STATION, option, '1']),
					]),
				),
			).toBe(true)
		})

	it('start A, end, start B, end → the second end pairs with B (a closed start is not open)', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				firstEnd: recording.events[1]?.run === recording.events[0]?.id,
				secondEnd: recording.events[3]?.run === recording.events[2]?.id,
				answers: recording.answers.map((answer) => answer.exitCode),
			}))(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION]),
					() => station(lot, ['end', STATION]),
					() => station(lot, ['start', STATION]),
					() => station(lot, ['end', STATION]),
				]),
			),
		).toEqual({ firstEnd: true, secondEnd: true, answers: [0, 0, 0, 0] })
	})

	it('end without --run and two open starts of one station → exit 2 listing both runs, nothing written', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[2].exitCode,
				errorNamesBothRuns:
					String(recording.answers[2].json?.error).includes(recording.events[0]?.id ?? '<none>') &&
					String(recording.answers[2].json?.error).includes(recording.events[1]?.id ?? '<none>'),
				next: recording.answers[2].json?.next,
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION]),
					() => station(lot, ['start', STATION]),
					() => station(lot, ['end', STATION, '--json']),
				]),
			),
		).toEqual({ exitCode: 2, errorNamesBothRuns: true, next: null, eventCount: 2 })
	})

	it('end without any start → recorded alone: its run is its own id, started null', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[0].exitCode,
				recorded: recording.answers[0].json?.recorded,
				runIsOwnId: recording.events[0]?.run === recording.events[0]?.id,
				answeredRun: recording.answers[0].json?.run === recording.events[0]?.id,
				next: recording.answers[0].json?.next,
				started: recording.events[0]?.started,
				hasStarted: 'started' in (recording.events[0] ?? {}),
				kind: recording.events[0]?.kind,
			}))(recordedAfter(lot, [() => station(lot, ['end', STATION, '--json'])])),
		).toEqual({
			exitCode: 0,
			recorded: 'new',
			runIsOwnId: true,
			answeredRun: true,
			next: null,
			started: null,
			hasStarted: true,
			kind: 'station.end',
		})
	})

	it('--run naming no start of the lot → exit 2, nothing written', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[0].exitCode,
				hasError: typeof recording.answers[0].json?.error === 'string',
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['end', STATION, '--run', 'ev-20260101T000000000Z-1-1', '--json']),
				]),
			),
		).toEqual({ exitCode: 2, hasError: true, eventCount: 0 })
	})
})

describe('lot station end: the state hash (D29)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('D29: the worktree is a git repository → the end carries the hash of its state, the start none', () => {
		const lot = createStationLot()
		initializeRepository({ root: lot.worktree, files: { 'src/a.ts': 'export const a = 1\n' } })
		writeFiles({ root: lot.worktree, files: { 'src/b.ts': 'export const b = 2\n' } })

		const recording = recordedAfter(lot, [
			() => station(lot, ['start', STATION]),
			() => station(lot, ['end', STATION]),
		])

		expect({
			exits: recording.answers.map((answer) => answer.exitCode),
			startHash: 'stateHash' in (recording.events[0] ?? {}),
			endHash: recording.events[1]?.stateHash,
		}).toEqual({
			exits: [0, 0],
			startHash: false,
			endHash: computeStateHash(lot.worktree),
		})
	})

	it('D29: the worktree cannot be read (no folder) → the end is recorded without a stateHash, exit 0', () => {
		const lot = createStationLot()

		const recording = recordedAfter(lot, [
			() => station(lot, ['start', STATION]),
			() => station(lot, ['end', STATION]),
		])

		expect({
			exits: recording.answers.map((answer) => answer.exitCode),
			kinds: recording.events.map((event) => event.kind),
			endHasHash: 'stateHash' in (recording.events[1] ?? {}),
		}).toEqual({
			exits: [0, 0],
			kinds: ['station.start', 'station.end'],
			endHasHash: false,
		})
	})
})

describe('lot station end: retries', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the same unpaired end again, with a cost field and equal host fields → already, nothing written', () => {
		const lot = createStationLot()
		const words = ['end', STATION, '--agent', 'agent-a', '--tokens-in', '10', '--json']

		expect(
			((recording) => ({
				recorded: recording.answers.map((answer) => answer.json?.recorded),
				sameRun: recording.answers[1].json?.run === recording.answers[0].json?.run,
				exits: recording.answers.map((answer) => answer.exitCode),
				eventCount: recording.events.length,
			}))(recordedAfter(lot, [() => station(lot, words), () => station(lot, words)])),
		).toEqual({
			recorded: ['new', 'already'],
			sameRun: true,
			exits: [0, 0],
			eventCount: 1,
		})
	})

	it('the same unpaired end again with other host fields → recorded alone, both kept', () => {
		const lot = createStationLot()

		expect(
			recordedAfter(lot, [
				() => station(lot, ['end', STATION, '--tokens-in', '10']),
				() => station(lot, ['end', STATION, '--tokens-in', '11']),
			]).events.length,
		).toBe(2)
	})

	it('two unpaired ends with no cost field → both written', () => {
		const lot = createStationLot()
		const words = ['end', STATION, '--json']

		expect(
			((recording) => ({
				recorded: recording.answers.map((answer) => answer.json?.recorded),
				eventCount: recording.events.length,
			}))(recordedAfter(lot, [() => station(lot, words), () => station(lot, words)])),
		).toEqual({ recorded: ['new', 'new'], eventCount: 2 })
	})

	it('the same unpaired end again, in text → prints already', () => {
		const lot = createStationLot()
		const words = ['end', STATION, '--tokens-in', '10']

		expect(
			((recording) => [
				recording.answers[1].exitCode,
				/already/i.test(recording.answers[1].output),
				recording.events.length,
			])(recordedAfter(lot, [() => station(lot, words), () => station(lot, words)])),
		).toEqual([0, true, 1])
	})

	it('the same tokens with another --agent → a different end, both kept', () => {
		const lot = createStationLot()

		expect(
			recordedAfter(lot, [
				() => station(lot, ['end', STATION, '--agent', 'agent-a', '--tokens-in', '10']),
				() => station(lot, ['end', STATION, '--agent', 'agent-b', '--tokens-in', '10']),
			]).events.length,
		).toBe(2)
	})

	for (const option of ['--round', '--attempt'])
		it(`the same end differing only in ${option} → a different end, both kept`, () => {
			const lot = createStationLot()

			expect(
				recordedAfter(lot, [
					() => station(lot, ['end', STATION, option, '1', '--tokens-in', '10']),
					() => station(lot, ['end', STATION, option, '2', '--tokens-in', '10']),
				]).events.length,
			).toBe(2)
		})

	it('end A, end B, end A again → recorded: only the last end is the retry reference', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				recorded: recording.answers.map((answer) => answer.json?.recorded),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['end', STATION, '--tokens-in', '10', '--json']),
					() => station(lot, ['end', STATION, '--tokens-in', '11', '--json']),
					() => station(lot, ['end', STATION, '--tokens-in', '10', '--json']),
				]),
			),
		).toEqual({ recorded: ['new', 'new', 'new'], eventCount: 3 })
	})

	it('the same end of another step → a different end, not a retry', () => {
		const lot = createStationLot()

		expect(
			recordedAfter(lot, [
				() => station(lot, ['end', STATION, '--step', '1', '--tokens-in', '10']),
				() => station(lot, ['end', STATION, '--step', '2', '--tokens-in', '10']),
			]).events.length,
		).toBe(2)
	})
})

describe('lot station: --event', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('three identical calls with --event h-7 → one event, the next two answer already with its run', () => {
		const lot = createStationLot()
		const words = ['start', STATION, '--event', 'h-7', '--json']

		expect(
			((recording) => ({
				recorded: recording.answers.map((answer) => answer.json?.recorded),
				runs: new Set(recording.answers.map((answer) => answer.json?.run)).size,
				answeredRunIsEventId: recording.answers[2].json?.run === recording.events[0]?.id,
				exits: recording.answers.map((answer) => answer.exitCode),
				hostEvent: recording.events.map((event) => event.hostEvent),
			}))(
				recordedAfter(lot, [
					() => station(lot, words),
					() => station(lot, words),
					() => station(lot, words),
				]),
			),
		).toEqual({
			recorded: ['new', 'already', 'already'],
			runs: 1,
			answeredRunIsEventId: true,
			exits: [0, 0, 0],
			hostEvent: ['h-7'],
		})
	})

	it('the same --event id with other tokens → exit 2 naming the first event, nothing more written', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[1].exitCode,
				namesFirst: String(recording.answers[1].json?.error).includes(
					recording.events[0]?.id ?? '<none>',
				),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['end', STATION, '--event', 'h-7', '--tokens-in', '10']),
					() => station(lot, ['end', STATION, '--event', 'h-7', '--tokens-in', '99', '--json']),
				]),
			),
		).toEqual({ exitCode: 2, namesFirst: true, eventCount: 1 })
	})

	it('start --event h-1, the lot committed, the same call again → already, exit 0, nothing more written', () => {
		const lot = createStationLot()
		const words = ['start', STATION, '--event', 'h-1', '--json']

		expect(
			((recording) => ({
				exits: recording.answers.map((answer) => answer.exitCode),
				recorded: recording.answers.map((answer) => answer.json?.recorded),
				answeredRunIsEventId: recording.answers[1].json?.run === recording.events[0]?.id,
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, words),
					() => {
						commitStationLot(lot)
						return station(lot, words)
					},
				]),
			),
		).toEqual({
			exits: [0, 0],
			recorded: ['new', 'already'],
			answeredRunIsEventId: true,
			eventCount: 1,
		})
	})

	it('end --run A --event h, then end --run B --event h → exit 2 naming the first event, nothing more written', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[3].exitCode,
				namesFirst: String(recording.answers[3].json?.error).includes(
					recording.events.find((event) => event.kind === 'station.end')?.id ?? '<none>',
				),
				endCount: recording.events.filter((event) => event.kind === 'station.end').length,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--step', '1', '--json']),
					() => station(lot, ['start', STATION, '--step', '2', '--json']),
					(previous) =>
						station(lot, [
							'end',
							STATION,
							'--run',
							String(previous[0].json?.run),
							'--event',
							'h-9',
						]),
					(previous) =>
						station(lot, [
							'end',
							STATION,
							'--run',
							String(previous[1].json?.run),
							'--event',
							'h-9',
							'--json',
						]),
				]),
			),
		).toEqual({ exitCode: 2, namesFirst: true, endCount: 1 })
	})
})

describe('lot station: end --run against its start', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** The call that starts `implement` with a full key; the run is in its answer. */
	const STARTED = ['start', STATION, '--step', '1', '--round', '1', '--attempt', '1', '--json']

	it('end of another station with the run of the implementer start → exit 2 naming the start, nothing written', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[1].exitCode,
				namesStart: String(recording.answers[1].json?.error).includes(
					recording.events[0]?.id ?? '<none>',
				),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, STARTED),
					(previous) =>
						station(lot, [
							'end',
							'other',
							'--run',
							String(previous[0].json?.run),
							'--step',
							'1',
							'--round',
							'1',
							'--attempt',
							'1',
							'--json',
						]),
				]),
			),
		).toEqual({ exitCode: 2, namesStart: true, eventCount: 1 })
	})

	for (const field of ['step', 'round', 'attempt'])
		it(`end with the run of a start but another ${field} → exit 2 naming the start, nothing written`, () => {
			const lot = createStationLot()
			const ended = ['--step', '1', '--round', '1', '--attempt', '1']
			ended[ended.indexOf(`--${field}`) + 1] = '2'

			expect(
				((recording) => ({
					exitCode: recording.answers[1].exitCode,
					namesStart: String(recording.answers[1].json?.error).includes(
						recording.events[0]?.id ?? '<none>',
					),
					eventCount: recording.events.length,
				}))(
					recordedAfter(lot, [
						() => station(lot, STARTED),
						(previous) =>
							station(lot, [
								'end',
								STATION,
								'--run',
								String(previous[0].json?.run),
								...ended,
								'--json',
							]),
					]),
				),
			).toEqual({ exitCode: 2, namesStart: true, eventCount: 1 })
		})

	it('a second end --run of a run that has an end, every host-given field equal → recorded already, nothing written', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				recorded: recording.answers.slice(1).map((answer) => answer.json?.recorded),
				exits: recording.answers.map((answer) => answer.exitCode),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--json']),
					(previous) =>
						station(lot, [
							'end',
							STATION,
							'--run',
							String(previous[0].json?.run),
							'--tokens-in',
							'10',
							'--json',
						]),
					(previous) =>
						station(lot, [
							'end',
							STATION,
							'--run',
							String(previous[0].json?.run),
							'--tokens-in',
							'10',
							'--json',
						]),
				]),
			),
		).toEqual({ recorded: ['new', 'already'], exits: [0, 0, 0], eventCount: 2 })
	})

	it('a second end --run of a run that has an end, with other tokens → exit 2 naming the first end, nothing written', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exitCode: recording.answers[2].exitCode,
				namesFirstEnd: String(recording.answers[2].json?.error).includes(
					recording.events.find((event) => event.kind === 'station.end')?.id ?? '<none>',
				),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--json']),
					(previous) =>
						station(lot, [
							'end',
							STATION,
							'--run',
							String(previous[0].json?.run),
							'--tokens-in',
							'10',
						]),
					(previous) =>
						station(lot, [
							'end',
							STATION,
							'--run',
							String(previous[0].json?.run),
							'--tokens-in',
							'99',
							'--json',
						]),
				]),
			),
		).toEqual({ exitCode: 2, namesFirstEnd: true, eventCount: 2 })
	})
})

describe('lot station: the lot state', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const state of ['committed', 'canceled', 'failed'] as const)
		it(`start on a ${state} lot → exit 2, nothing written`, () => {
			const lot = createStationLot({ state })

			expect(
				((recording) => ({
					exitCode: recording.answers[0].exitCode,
					eventCount: recording.events.length,
				}))(recordedAfter(lot, [() => station(lot, ['start', STATION, '--json'])])),
			).toEqual({ exitCode: 2, eventCount: 0 })
		})

	for (const state of ['committed', 'canceled', 'failed'] as const)
		it(`end on a ${state} lot → recorded`, () => {
			const lot = createStationLot({ state })

			expect(
				((recording) => ({
					exitCode: recording.answers[0].exitCode,
					kinds: recording.events.map((event) => event.kind),
				}))(recordedAfter(lot, [() => station(lot, ['end', STATION, '--json'])])),
			).toEqual({ exitCode: 0, kinds: ['station.end'] })
		})

	it('a simulated lot → its events carry simulated true', () => {
		const lot = createStationLot({ simulated: true })

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() => station(lot, ['start', STATION]),
					() => station(lot, ['end', STATION]),
				]),
				keys: ['simulated'],
			}),
		).toEqual([{ simulated: true }, { simulated: true }])
	})
})

describe('lot station: the cost fields', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('two token flags → tokens holds them, the other parts null', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() => station(lot, ['end', STATION, '--tokens-in', '100', '--tokens-out', '50']),
				]),
				keys: ['tokens'],
			}),
		).toEqual([
			{ tokens: { input: 100, output: 50, cacheRead: null, cacheWrite: null, total: null } },
		])
	})

	it('all five token flags → the five parts as numbers', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() =>
						station(lot, [
							'end',
							STATION,
							'--tokens-in',
							'1',
							'--tokens-out',
							'2',
							'--tokens-cache-read',
							'3',
							'--tokens-cache-write',
							'4',
							'--tokens-total',
							'10',
						]),
				]),
				keys: ['tokens'],
			}),
		).toEqual([{ tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } }])
	})

	it('a reported zero → kept as 0, not null', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() => station(lot, ['end', STATION, '--tokens-total', '0']),
				]),
				keys: ['tokens'],
			}),
		).toEqual([
			{ tokens: { input: null, output: null, cacheRead: null, cacheWrite: null, total: 0 } },
		])
	})

	it('money, duration, exit, verdict and two suites → each in the event', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() =>
						station(lot, [
							'end',
							STATION,
							'--money',
							'1.25',
							'eur',
							'--duration',
							'12.5',
							'--exit',
							'3',
							'--verdict',
							'fixed',
							'--suite',
							'unit=3',
							'--suite',
							'browser=0',
						]),
				]),
				keys: ['money', 'duration', 'exit', 'verdict', 'suites'],
			}),
		).toEqual([
			{
				money: { amount: 1.25, currency: 'eur' },
				duration: 12.5,
				exit: 3,
				verdict: 'fixed',
				suites: { unit: 3, browser: 0 },
			},
		])
	})

	it('no cost field → the event holds no tokens, money, duration, exit, verdict or suites key', () => {
		const lot = createStationLot()

		expect(
			((recording) =>
				Object.keys(recording.events[0] ?? {}).filter((key) =>
					['tokens', 'money', 'duration', 'exit', 'verdict', 'suites'].includes(key),
				))(recordedAfter(lot, [() => station(lot, ['end', STATION])])),
		).toEqual([])
	})

	for (const verdict of VERDICTS)
		it(`verdict ${verdict} → accepted`, () => {
			const lot = createStationLot()

			expect(
				fieldsOf({
					recording: recordedAfter(lot, [
						() => station(lot, ['end', STATION, '--verdict', verdict]),
					]),
					keys: ['verdict'],
				}),
			).toEqual([{ verdict }])
		})
})

describe('lot station: skills', { timeout: STORE_CASE_TIMEOUT }, () => {
	const SKILL_TEXT = '# a skill\n'

	for (const [index, folder] of Object.values(AGENT_SKILL_FOLDERS).entries())
		it(`a skill by name under the synced folder number ${index} → its file's hash, seen`, () => {
			const lot = createStationLot()
			writeFiles({
				root: lot.workspace.repository,
				files: { [`${folder}/subscribe/SKILL.md`]: SKILL_TEXT },
			})

			expect(
				fieldsOf({
					recording: recordedAfter(lot, [
						() => station(lot, ['start', STATION, '--skill', 'subscribe']),
					]),
					keys: ['skills'],
				}),
			).toEqual([{ skills: [{ name: 'subscribe', hash: sha256Of(SKILL_TEXT), how: 'seen' }] }])
		})

	it('a retry of an end after the skill file changed (same name and how) → already, nothing written', () => {
		const lot = createStationLot()
		const file = `${AGENT_SKILL_FOLDERS.claude}/subscribe/SKILL.md`
		writeFiles({ root: lot.workspace.repository, files: { [file]: SKILL_TEXT } })
		const words = ['end', STATION, '--tokens-in', '10', '--skill', 'subscribe', '--json']

		expect(
			((recording) => ({
				recorded: recording.answers.map((answer) => answer.json?.recorded),
				exits: recording.answers.map((answer) => answer.exitCode),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, words),
					() => {
						writeFiles({ root: lot.workspace.repository, files: { [file]: '# edited\n' } })
						return station(lot, words)
					},
				]),
			),
		).toEqual({ recorded: ['new', 'already'], exits: [0, 0], eventCount: 1 })
	})

	it('an --event repeat after the skill file changed (same name and how) → already, nothing written', () => {
		const lot = createStationLot()
		const file = `${AGENT_SKILL_FOLDERS.claude}/subscribe/SKILL.md`
		writeFiles({ root: lot.workspace.repository, files: { [file]: SKILL_TEXT } })
		const words = ['start', STATION, '--skill', 'subscribe', '--event', 'h-3', '--json']

		expect(
			((recording) => ({
				recorded: recording.answers.map((answer) => answer.json?.recorded),
				exits: recording.answers.map((answer) => answer.exitCode),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, words),
					() => {
						writeFiles({ root: lot.workspace.repository, files: { [file]: '# edited\n' } })
						return station(lot, words)
					},
				]),
			),
		).toEqual({ recorded: ['new', 'already'], exits: [0, 0], eventCount: 1 })
	})

	it('a skill given as a path → the hash of that file', () => {
		const lot = createStationLot()
		const folder = join(lot.workspace.workspace, 'external', 'custom')
		mkdirSync(folder, { recursive: true })
		const path = join(folder, 'SKILL.md')
		writeFileSync(path, SKILL_TEXT)

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [() => station(lot, ['start', STATION, '--skill', path])]),
				keys: ['skills'],
			}),
		).toEqual([{ skills: [expect.objectContaining({ hash: sha256Of(SKILL_TEXT), how: 'seen' })] }])
	})

	it('a skill no folder holds → hash null', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--skill', 'no-such-skill']),
				]),
				keys: ['skills'],
			}),
		).toEqual([{ skills: [{ name: 'no-such-skill', hash: null, how: 'seen' }] }])
	})

	it('--skill-asked → how asked', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--skill-asked', 'no-such-skill']),
				]),
				keys: ['skills'],
			}),
		).toEqual([{ skills: [{ name: 'no-such-skill', hash: null, how: 'asked' }] }])
	})

	it('the same skill in two synced folders with other contents → the hash of the first folder in order', () => {
		const lot = createStationLot()
		const [first, second] = Object.values(AGENT_SKILL_FOLDERS)
		writeFiles({
			root: lot.workspace.repository,
			files: {
				[`${first}/subscribe/SKILL.md`]: '# first\n',
				[`${second}/subscribe/SKILL.md`]: '# second\n',
			},
		})

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--skill', 'subscribe']),
				]),
				keys: ['skills'],
			}),
		).toEqual([{ skills: [{ name: 'subscribe', hash: sha256Of('# first\n'), how: 'seen' }] }])
	})

	it('--skill, --skill-asked, --skill → the seen ones first in the order given, then the asked one', () => {
		const lot = createStationLot()

		expect(
			((recording) =>
				(recording.events[0]?.skills as { name: string; how: string }[] | undefined)?.map(
					(skill) => [skill.name, skill.how],
				))(
				recordedAfter(lot, [
					() =>
						station(lot, [
							'start',
							STATION,
							'--skill',
							'first',
							'--skill-asked',
							'second',
							'--skill',
							'third',
						]),
				]),
			),
		).toEqual([
			['first', 'seen'],
			['third', 'seen'],
			['second', 'asked'],
		])
	})

	it('--suite twice → both in the suites map', () => {
		const lot = createStationLot()

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [
					() => station(lot, ['end', STATION, '--suite', 'unit=3', '--suite', 'lint=1']),
				]),
				keys: ['suites'],
			}),
		).toEqual([{ suites: { unit: 3, lint: 1 } }])
	})
})

describe('lot station: --from', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a start file → the same event as the flags', () => {
		const flagged = createStationLot()
		const filed = createStationLot()
		const file = join(filed.workspace.workspace, 'start.json')
		writeFileSync(
			file,
			JSON.stringify({
				phase: 'start',
				station: STATION,
				step: 2,
				round: 1,
				attempt: 3,
				agent: 'agent-a',
				executor: 'command',
				vendor: 'vendor-a',
				model: 'model-a',
				tier: 'standard',
				effort: 'high',
				session: 'session-9',
			}),
		)

		expect(
			((byFlags, byFile) => ({
				same: isDeepStrictEqual(
					withoutVolatile(byFile.events[0]),
					withoutVolatile(byFlags.events[0]),
				),
				kind: byFile.events[0]?.kind,
				eventCount: [byFlags.events.length, byFile.events.length],
			}))(
				recordedAfter(flagged, [
					() =>
						station(flagged, [
							'start',
							STATION,
							'--step',
							'2',
							'--round',
							'1',
							'--attempt',
							'3',
							'--agent',
							'agent-a',
							'--executor',
							'command',
							'--vendor',
							'vendor-a',
							'--model',
							'model-a',
							'--tier',
							'standard',
							'--effort',
							'high',
							'--session',
							'session-9',
						]),
				]),
				recordedAfter(filed, [() => station(filed, ['--from', file])]),
			),
		).toEqual({ same: true, kind: 'station.start', eventCount: [1, 1] })
	})

	it('an end file with every cost field → the fields as the flags write them', () => {
		const lot = createStationLot()
		const file = join(lot.workspace.workspace, 'end.json')
		writeFileSync(
			file,
			JSON.stringify({
				phase: 'end',
				station: STATION,
				tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
				money: { amount: 1.25, currency: 'eur' },
				duration: 12.5,
				exit: 0,
				verdict: 'approve',
				suites: { unit: 3 },
			}),
		)

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [() => station(lot, ['--from', file])]),
				keys: ['kind', 'station', 'tokens', 'money', 'duration', 'exit', 'verdict', 'suites'],
			}),
		).toEqual([
			{
				kind: 'station.end',
				station: STATION,
				tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
				money: { amount: 1.25, currency: 'eur' },
				duration: 12.5,
				exit: 0,
				verdict: 'approve',
				suites: { unit: 3 },
			},
		])
	})

	it('an end file with a run → pairs with that start, as --run does', () => {
		const lot = createStationLot()
		const file = join(lot.workspace.workspace, 'end-run.json')

		expect(
			((recording) => recording.events[1]?.run === recording.events[0]?.id)(
				recordedAfter(lot, [
					() => station(lot, ['start', STATION, '--json']),
					(previous) => {
						writeFileSync(
							file,
							JSON.stringify({ phase: 'end', station: STATION, run: previous[0].json.run }),
						)
						return station(lot, ['--from', file])
					},
				]),
			),
		).toBe(true)
	})
})

describe('lot station: the worktree', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a worktree holding a cli with the capability → worktreeCli in the event', () => {
		const lot = createStationLot()
		writeFiles({
			root: lot.worktree,
			files: {
				'node_modules/@dialecte/cli/package.json': JSON.stringify({
					name: '@dialecte/cli',
					version: '0.5.0',
					dialecte: { stepEvents: 1 },
				}),
			},
		})

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [() => station(lot, ['start', STATION])]),
				keys: ['worktreeCli'],
			}),
		).toEqual([{ worktreeCli: { version: '0.5.0', stepEvents: true } }])
	})

	it('a worktree holding no cli → worktreeCli null', () => {
		const lot = createStationLot()
		mkdirSync(lot.worktree, { recursive: true })

		expect(
			fieldsOf({
				recording: recordedAfter(lot, [() => station(lot, ['start', STATION])]),
				keys: ['worktreeCli'],
			}),
		).toEqual([{ worktreeCli: null }])
	})

	it('a worktree folder that is gone → worktreeCli omitted', () => {
		const lot = createStationLot()

		expect(
			((recording) => [
				recording.answers[0].exitCode,
				'worktreeCli' in (recording.events[0] ?? {}),
			])(recordedAfter(lot, [() => station(lot, ['start', STATION])])),
		).toEqual([0, false])
	})

	it('the event holds the cli version of the running cli', () => {
		const lot = createStationLot()

		expect(
			((recording) => recording.events[0]?.cli)(
				recordedAfter(lot, [() => station(lot, ['start', STATION])]),
			),
		).toBe(CLI_VERSION)
	})
})
