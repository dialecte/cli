/**
 * The machine-wide live markers of heavy steps (33L0 section 4 "Heavy steps", case 15): one file per running heavy
 * step under `<state>/dialecte/heavy/`, live only while its pid runs with the start time it holds.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'

import { describe, expect, it, vi } from 'vitest'

import type { HeavyMarker } from './heavy-markers.types.ts'

/**
 * The bound of the one case that reads this process's own start time through the real `ps` (one spawn): a guard
 * against a hang, never a measure of speed. A spawn takes well under a second on a quiet machine and several on a
 * loaded one; two minutes is far above both.
 */
const REAL_PS_CASE_TIMEOUT = 120_000

const OWN_START = 'Mon Nov  9 10:00:00 2026'
const NOW = new Date(Date.UTC(2026, 10, 9, 10, 30, 0, 123))

/** The module with its own state (the once-per-process start time is cached inside it): a new copy per case. */
async function freshMarkers() {
	vi.resetModules()
	return import('./heavy-markers.ts')
}

/** A state folder of the case, the environment naming it, and the folder the markers go to. */
function stateOfCase() {
	const state = temporaryFolder('heavy-state-')
	return {
		environment: { XDG_STATE_HOME: state },
		folder: join(state, 'dialecte', 'heavy'),
	}
}

/**
 * The start times the injected check knows, by pid; this process's is OWN_START (unreadable when
 * `ownStartUnreadable`). `startTimeOf` records every pid it was asked about.
 */
function checkOf(params: {
	alive: number[]
	startTimes: Record<number, string | undefined>
	ownStartUnreadable?: boolean
}) {
	const startTimeOf = vi.fn((pid: number) =>
		pid === process.pid
			? params.ownStartUnreadable
				? undefined
				: OWN_START
			: params.startTimes[pid],
	)
	return {
		startTimeOf,
		check: {
			isAlive: (pid: number) => pid === process.pid || params.alive.includes(pid),
			startTimeOf,
		},
	}
}

function markerOf(params: {
	pid: number
	startTime: string
	step?: string
	started?: string
}): HeavyMarker {
	return {
		step: params.step ?? 'gate-full',
		lot: null,
		repository: '/work/repo',
		worktree: '/work/repo',
		pid: params.pid,
		startTime: params.startTime,
		started: params.started ?? '2026-11-09T09:00:00.000Z',
	}
}

/** Plants a file the way a writer would have left it (any text). */
function plantText(params: { folder: string; name: string; text: string }): void {
	mkdirSync(params.folder, { recursive: true })
	writeFileSync(join(params.folder, params.name), params.text)
}

function plant(params: { folder: string; name: string; marker: HeavyMarker }): void {
	plantText({
		folder: params.folder,
		name: params.name,
		text: `${JSON.stringify(params.marker)}\n`,
	})
}

function namesIn(folder: string): string[] {
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

const WRITE = {
	step: 'gate-full',
	lot: '0171-repo-subscribe',
	repository: '/work/repo',
	worktree: '/work/repo/.worktrees/0171-repo-subscribe',
	now: NOW,
}

describe('writeHeavyMarker', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('one marker → one file <pid>-<n>.json holding step, lot, repository, worktree, pid, startTime, started', async () => {
		const { environment, folder } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => ({
				names: namesIn(folder).map((name) => name.replace(String(process.pid), '<pid>')),
				paths: namesIn(folder).map((name) => join(folder, name)),
				answered: path,
				content: JSON.parse(readFileSync(path ?? '', 'utf8')),
			}))(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual({
			names: [expect.stringMatching(/^<pid>-\d+\.json$/)],
			paths: [expect.any(String)],
			answered: expect.any(String),
			content: {
				step: 'gate-full',
				lot: '0171-repo-subscribe',
				repository: '/work/repo',
				worktree: '/work/repo/.worktrees/0171-repo-subscribe',
				pid: process.pid,
				startTime: OWN_START,
				started: NOW.toISOString(),
			},
		})
	})

	it('the path answered → the file written', async () => {
		const { environment, folder } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => ({ answered: path, files: namesIn(folder).map((name) => join(folder, name)) }))(
				markers.writeHeavyMarker({ ...WRITE, environment, check }),
			),
		).toEqual({ answered: expect.any(String), files: [expect.any(String)] })
	})

	it('a step outside any lot → lot null in the marker', async () => {
		const { environment } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			JSON.parse(
				readFileSync(
					markers.writeHeavyMarker({ ...WRITE, lot: null, environment, check }) ?? '',
					'utf8',
				),
			).lot,
		).toBeNull()
	})

	it('three markers of one process → three files, and the own start time read once', async () => {
		const { environment, folder } = stateOfCase()
		const { check, startTimeOf } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((paths) => ({
				distinct: new Set(paths).size,
				files: namesIn(folder).length,
				ownStartReads: startTimeOf.mock.calls.filter(([pid]) => pid === process.pid).length,
			}))([
				markers.writeHeavyMarker({ ...WRITE, step: 'one', environment, check }),
				markers.writeHeavyMarker({ ...WRITE, step: 'two', environment, check }),
				markers.writeHeavyMarker({ ...WRITE, step: 'three', environment, check }),
			]),
		).toEqual({ distinct: 3, files: 3, ownStartReads: 1 })
	})

	it('two other live markers present, three writes by this process → the start time of each other pid read once in all, not once per write', async () => {
		const { environment, folder } = stateOfCase()
		const first = { pid: 4_100_001, startTime: 'Mon Nov  9 09:00:00 2026' }
		const second = { pid: 4_100_002, startTime: 'Mon Nov  9 09:30:00 2026' }
		plant({ folder, name: `${first.pid}-1.json`, marker: markerOf(first) })
		plant({ folder, name: `${second.pid}-1.json`, marker: markerOf(second) })
		const { check, startTimeOf } = checkOf({
			alive: [first.pid, second.pid],
			startTimes: { [first.pid]: first.startTime, [second.pid]: second.startTime },
		})
		const markers = await freshMarkers()

		expect(
			((paths) => ({
				written: paths.filter((path) => path !== undefined).length,
				othersKept: namesIn(folder).filter((name) => !name.startsWith(`${process.pid}-`)),
				reads: [first.pid, second.pid].map(
					(pid) => startTimeOf.mock.calls.filter(([asked]) => asked === pid).length,
				),
			}))([
				markers.writeHeavyMarker({ ...WRITE, step: 'one', environment, check }),
				markers.writeHeavyMarker({ ...WRITE, step: 'two', environment, check }),
				markers.writeHeavyMarker({ ...WRITE, step: 'three', environment, check }),
			]),
		).toEqual({
			written: 3,
			othersKept: [`${first.pid}-1.json`, `${second.pid}-1.json`],
			reads: [1, 1],
		})
	})

	it('the name <pid>-1.json already held by a live marker → published once: a second file, the first untouched', async () => {
		const { environment, folder } = stateOfCase()
		const planted = markerOf({ pid: process.pid, startTime: OWN_START, step: 'planted' })
		plant({ folder, name: `${process.pid}-1.json`, marker: planted })
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => ({
				files: namesIn(folder).length,
				newIsOther: path === join(folder, `${process.pid}-1.json`),
				plantedKept: JSON.parse(readFileSync(join(folder, `${process.pid}-1.json`), 'utf8')),
			}))(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual({ files: 2, newIsOther: false, plantedKept: planted })
	})

	it('no state folder yet → the folders are made and the marker is in them', async () => {
		const { environment, folder } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => ({ answered: path, files: namesIn(folder) }))(
				markers.writeHeavyMarker({ ...WRITE, environment, check }),
			),
		).toEqual({ answered: expect.stringContaining(folder), files: [expect.any(String)] })
	})

	it('the state folder from the home when XDG_STATE_HOME is unset → <home>/.local/state/dialecte/heavy', async () => {
		const home = temporaryFolder('heavy-home-')
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(markers.writeHeavyMarker({ ...WRITE, environment: {}, home, check })).toEqual(
			expect.stringContaining(join(home, '.local', 'state', 'dialecte', 'heavy')),
		)
	})

	it('the own start time cannot be read → nothing written, undefined answered', async () => {
		const { environment, folder } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {}, ownStartUnreadable: true })
		const markers = await freshMarkers()

		expect(
			((path) => ({ answered: path, files: namesIn(folder) }))(
				markers.writeHeavyMarker({ ...WRITE, environment, check }),
			),
		).toEqual({ answered: undefined, files: [] })
	})

	it('a marker whose pid runs but whose start time cannot be read → the sweep keeps its file, the reader still lists it as not live', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4101-1.json', marker: markerOf({ pid: 4101, startTime: 'S-4101' }) })
		const { check } = checkOf({ alive: [4101], startTimes: { 4101: undefined } })
		const markers = await freshMarkers()

		expect(
			((path) => ({
				written: path !== undefined,
				kept: namesIn(folder).includes('4101-1.json'),
				live: markers
					.readLiveHeavyMarkers({ environment, check })
					.some((marker) => marker.pid === 4101),
			}))(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual({ written: true, kept: true, live: false })
	})

	it(
		'no injected check → this process own marker is written and read for real (one ps call), live',
		{ timeout: REAL_PS_CASE_TIMEOUT },
		async () => {
			const { environment } = stateOfCase()
			const markers = await freshMarkers()

			expect(
				((path) => {
					const live = markers.readLiveHeavyMarkers({ environment })
					if (path !== undefined) markers.removeHeavyMarker({ path })
					return live.map((marker) => ({
						step: marker.step,
						pid: marker.pid,
						startTime: typeof marker.startTime,
					}))
				})(markers.writeHeavyMarker({ ...WRITE, environment })),
			).toEqual([{ step: 'gate-full', pid: process.pid, startTime: 'string' }])
		},
	)
})

describe('removeHeavyMarker', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a marker written then removed → its file is gone', async () => {
		const { environment, folder } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => {
				markers.removeHeavyMarker({ path: path ?? '' })
				return namesIn(folder)
			})(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual([])
	})

	it('a marker removed twice → no error the second time', async () => {
		const { environment } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => {
				markers.removeHeavyMarker({ path: path ?? '' })
				return () => markers.removeHeavyMarker({ path: path ?? '' })
			})(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).not.toThrow()
	})
})

describe('readLiveHeavyMarkers', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a marker of a running pid with the same start time → listed as written', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4001-1.json', marker: markerOf({ pid: 4001, startTime: 'S-4001' }) })
		const { check } = checkOf({ alive: [4001], startTimes: { 4001: 'S-4001' } })
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment, check })).toEqual([
			markerOf({ pid: 4001, startTime: 'S-4001' }),
		])
	})

	it('a marker whose pid was reused by another process (another start time) → ignored (case 15)', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4002-1.json', marker: markerOf({ pid: 4002, startTime: 'OLD' }) })
		const { check } = checkOf({ alive: [4002], startTimes: { 4002: 'NEW' } })
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment, check })).toEqual([])
	})

	it('a marker whose pid runs but whose start time cannot be read → dead, ignored', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4003-1.json', marker: markerOf({ pid: 4003, startTime: 'S-4003' }) })
		const { check } = checkOf({ alive: [4003], startTimes: { 4003: undefined } })
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment, check })).toEqual([])
	})

	it('a marker holding no start time, the pid running with an unreadable one → dead, ignored', async () => {
		const { environment, folder } = stateOfCase()
		const { startTime, ...withoutStartTime } = markerOf({ pid: 4006, startTime: 'S-4006' })
		void startTime
		plantText({ folder, name: '4006-1.json', text: `${JSON.stringify(withoutStartTime)}\n` })
		const { check } = checkOf({ alive: [4006], startTimes: { 4006: undefined } })
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment, check })).toEqual([])
	})

	it('a marker holding a null start time, the pid running with an unreadable one → dead, ignored', async () => {
		const { environment, folder } = stateOfCase()
		plantText({
			folder,
			name: '4007-1.json',
			text: `${JSON.stringify({ ...markerOf({ pid: 4007, startTime: 'x' }), startTime: null })}\n`,
		})
		const { check } = checkOf({ alive: [4007], startTimes: { 4007: undefined } })
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment, check })).toEqual([])
	})

	it('a marker whose pid runs no more → ignored', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4004-1.json', marker: markerOf({ pid: 4004, startTime: 'S-4004' }) })
		const { check } = checkOf({ alive: [], startTimes: { 4004: 'S-4004' } })
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment, check })).toEqual([])
	})

	it('a pid that does not run → no start time asked for it (no ps call)', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4004-1.json', marker: markerOf({ pid: 4004, startTime: 'S-4004' }) })
		const { check, startTimeOf } = checkOf({ alive: [], startTimes: { 4004: 'S-4004' } })
		const markers = await freshMarkers()

		expect(
			((live) => ({ live, asked: startTimeOf.mock.calls.map(([pid]) => pid) }))(
				markers.readLiveHeavyMarkers({ environment, check }),
			),
		).toEqual({ live: [], asked: [] })
	})

	it('live and dead markers together → the live ones only, and nothing removed by reading', async () => {
		const { environment, folder } = stateOfCase()
		plant({
			folder,
			name: '4001-1.json',
			marker: markerOf({ pid: 4001, startTime: 'S-4001', step: 'live' }),
		})
		plant({
			folder,
			name: '4002-1.json',
			marker: markerOf({ pid: 4002, startTime: 'OLD', step: 'reused' }),
		})
		plant({
			folder,
			name: '4004-1.json',
			marker: markerOf({ pid: 4004, startTime: 'S-4004', step: 'gone' }),
		})
		const { check } = checkOf({
			alive: [4001, 4002],
			startTimes: { 4001: 'S-4001', 4002: 'NEW' },
		})
		const markers = await freshMarkers()

		expect(
			((live) => ({ steps: live.map((marker) => marker.step), files: namesIn(folder) }))(
				markers.readLiveHeavyMarkers({ environment, check }),
			),
		).toEqual({ steps: ['live'], files: ['4001-1.json', '4002-1.json', '4004-1.json'] })
	})

	it('several live markers → listed by started, then by file name', async () => {
		const { environment, folder } = stateOfCase()
		const late = '2026-11-09T09:30:00.000Z'
		const early = '2026-11-09T09:00:00.000Z'
		plant({
			folder,
			name: '4001-1.json',
			marker: markerOf({ pid: 4001, startTime: 'S-4001', step: 'late-a', started: late }),
		})
		plant({
			folder,
			name: '4003-1.json',
			marker: markerOf({ pid: 4003, startTime: 'S-4003', step: 'early-b', started: early }),
		})
		plant({
			folder,
			name: '4002-1.json',
			marker: markerOf({ pid: 4002, startTime: 'S-4002', step: 'early-a', started: early }),
		})
		const { check } = checkOf({
			alive: [4001, 4002, 4003],
			startTimes: { 4001: 'S-4001', 4002: 'S-4002', 4003: 'S-4003' },
		})
		const markers = await freshMarkers()

		expect(
			markers.readLiveHeavyMarkers({ environment, check }).map((marker) => marker.step),
		).toEqual(['early-a', 'early-b', 'late-a'])
	})

	it('a garbage file named like a marker → ignored without throwing, whether its pid runs or not', async () => {
		const { environment, folder } = stateOfCase()
		plantText({ folder, name: '4001-1.json', text: 'not json at all' })
		plantText({ folder, name: '4002-1.json', text: '{"step":' })
		const { check } = checkOf({ alive: [4001], startTimes: { 4001: 'S-4001' } })
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment, check })).toEqual([])
	})

	it('no heavy folder → no marker', async () => {
		const { environment } = stateOfCase()
		const markers = await freshMarkers()

		expect(markers.readLiveHeavyMarkers({ environment })).toEqual([])
	})

	it('a marker this process wrote → listed while it runs', async () => {
		const { environment } = stateOfCase()
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => ({
				wrote: path,
				live: markers
					.readLiveHeavyMarkers({ environment, check })
					.map((marker) => [marker.step, marker.pid]),
			}))(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual({ wrote: expect.any(String), live: [['gate-full', process.pid]] })
	})
})

describe('the sweep of the next writer', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('dead markers of the folder → removed; live ones, other files and foreign names kept (case 15)', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4001-1.json', marker: markerOf({ pid: 4001, startTime: 'S-4001' }) })
		plant({ folder, name: '4002-1.json', marker: markerOf({ pid: 4002, startTime: 'OLD' }) })
		plant({ folder, name: '4003-1.json', marker: markerOf({ pid: 4003, startTime: 'S-4003' }) })
		plant({ folder, name: '4004-1.json', marker: markerOf({ pid: 4004, startTime: 'S-4004' }) })
		const { startTime, ...withoutStartTime } = markerOf({ pid: 4006, startTime: 'x' })
		void startTime
		plantText({ folder, name: '4006-1.json', text: `${JSON.stringify(withoutStartTime)}\n` })
		plantText({ folder, name: 'notes.txt', text: 'kept\n' })
		plantText({ folder, name: 'abc-1.json', text: '{}\n' })
		plantText({ folder, name: '4005-x.json', text: '{}\n' })
		const { check } = checkOf({
			alive: [4001, 4002, 4003, 4006],
			startTimes: { 4001: 'S-4001', 4002: 'NEW', 4003: undefined, 4006: undefined },
		})
		const markers = await freshMarkers()

		expect(
			((path) => ({
				answered: path,
				kept: namesIn(folder).filter((name) => join(folder, name) !== path),
			}))(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual({
			answered: expect.any(String),
			kept: ['4001-1.json', '4003-1.json', '4005-x.json', 'abc-1.json', 'notes.txt'],
		})
	})

	it('a reused pid → its marker is swept by the next writer and no longer listed', async () => {
		const { environment, folder } = stateOfCase()
		plant({ folder, name: '4002-1.json', marker: markerOf({ pid: 4002, startTime: 'OLD' }) })
		const { check } = checkOf({ alive: [4002], startTimes: { 4002: 'NEW' } })
		const markers = await freshMarkers()

		expect(
			((path) => ({
				files: namesIn(folder).filter((name) => join(folder, name) !== path),
				live: markers.readLiveHeavyMarkers({ environment, check }).map((marker) => marker.pid),
			}))(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual({ files: [], live: [process.pid] })
	})

	it('a garbage file named like a marker → removed when the pid in its name does not run, kept when it runs', async () => {
		const { environment, folder } = stateOfCase()
		plantText({ folder, name: '4001-1.json', text: 'not json at all' })
		plantText({ folder, name: '4002-1.json', text: 'not json either' })
		const { check } = checkOf({ alive: [4002], startTimes: { 4002: 'S-4002' } })
		const markers = await freshMarkers()

		expect(
			((path) => ({
				answered: path,
				kept: namesIn(folder).filter((name) => join(folder, name) !== path),
			}))(markers.writeHeavyMarker({ ...WRITE, environment, check })),
		).toEqual({ answered: expect.any(String), kept: ['4002-1.json'] })
	})

	it('a marker folder of another state folder → untouched', async () => {
		const mine = stateOfCase()
		const other = stateOfCase()
		plant({
			folder: other.folder,
			name: '4004-1.json',
			marker: markerOf({ pid: 4004, startTime: 'S-4004' }),
		})
		const { check } = checkOf({ alive: [], startTimes: {} })
		const markers = await freshMarkers()

		expect(
			((path) => ({ answered: path, other: namesIn(other.folder) }))(
				markers.writeHeavyMarker({ ...WRITE, environment: mine.environment, check }),
			),
		).toEqual({ answered: expect.any(String), other: ['4004-1.json'] })
	})
})
