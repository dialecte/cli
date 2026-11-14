/**
 * What the station-records tests write by hand into a lot folder and its worktree: events at named seconds of the
 * test day, snapshots with their `.state`, gate records with their steps, the brief and the identity's effort.
 * Plain files: no code under test.
 */
import { chmodSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith } from './brief-workspace.ts'
import { appendLotEvents, writeWorktreeRecords } from './lot-report-workspace.ts'
import { stationRun, stepRun, timeOf } from './report-events.ts'
import {
	FIRST_CLOCK_HOUR,
	NO_STEP_EVENTS_CLI,
	SNAPSHOT_BASE_SHA,
	SNAPSHOT_STATE_HASH,
	STEP_EVENTS_CLI,
} from './station-records-workspace.constants.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { StationLot } from './lot-station-workspace.types.ts'
import type {
	CheckMoveParams,
	GateRecordParams,
	Move,
	StationMoveParams,
} from './station-records-workspace.types.ts'

/** The clock `second` seconds after 10:00:00 on the test day (`10:01:05` for 65). */
export function clockOf(second: number): string {
	const minutes = Math.floor(second / 60)
	const rest = String(second % 60).padStart(2, '0')
	return `${String(FIRST_CLOCK_HOUR).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${rest}`
}

/** The ISO time `second` seconds after 10:00:00 on the test day. */
export function timeAtSecond(second: number): string {
	return timeOf(clockOf(second))
}

/** The start and the end of a station run, as lines of the lot's events (not yet written). */
export function stationMove(params: StationMoveParams): LotEvent[] {
	const { station, start, end } = params
	const run = params.run ?? `run-${station}-${start}`
	const worktreeCli = { worktreeCli: params.noStepEvents ? NO_STEP_EVENTS_CLI : STEP_EVENTS_CLI }
	const position = {
		...(params.step === undefined ? {} : { step: params.step }),
		...(params.round === undefined ? {} : { round: params.round }),
	}
	return stationRun({
		run,
		station,
		start: clockOf(start),
		end: end === null ? null : clockOf(end),
		startFields: { ...position, ...worktreeCli },
		endFields: {
			...(params.endWithoutPosition ? {} : position),
			...worktreeCli,
			...(params.verdict === undefined ? {} : { verdict: params.verdict }),
			...(params.exit === undefined ? {} : { exit: params.exit }),
			...(params.stateHash === undefined ? {} : { stateHash: params.stateHash }),
		},
	})
}

/** The start and the end of a cli step run in the lot's worktree (`exit` 0 unless said). */
export function checkMove(params: CheckMoveParams): LotEvent[] {
	return stepRun({
		run: `run-${params.check}-${params.start}`,
		step: params.check,
		start: clockOf(params.start),
		end: clockOf(params.end),
		worktree: params.worktree ?? params.lot.worktree,
		throwaway: params.throwaway ?? false,
		worktreeCli: { worktreeCli: params.noStepEvents ? NO_STEP_EVENTS_CLI : STEP_EVENTS_CLI },
		// an interrupted step ends with no exit: the line holds none
		endFields: params.interrupted
			? { exit: undefined, outcome: 'interrupted' }
			: {
					exit: params.exit ?? 0,
					...(params.stateHash === undefined ? {} : { stateHash: params.stateHash }),
				},
	})
}

/**
 * The snapshot of a round: its folder with one file, `round-<n>.deleted` and `round-<n>.base`; its `.state` at the
 * second `state` when given (33L1 D7), the `.base` file's mtime set to the second `baseSecond` when given.
 */
export function writeSnapshot(params: {
	lot: StationLot
	round: number
	state?: number
	baseSecond?: number
}): void {
	const { lotFolder } = params.lot
	const folder = join(lotFolder, `round-${params.round}`)
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, 'changed.ts'), 'export {}\n')
	writeFileSync(join(lotFolder, `round-${params.round}.deleted`), '')
	const base = join(lotFolder, `round-${params.round}.base`)
	writeFileSync(base, `${SNAPSHOT_BASE_SHA}\n`)
	if (params.baseSecond !== undefined) {
		const time = new Date(timeAtSecond(params.baseSecond))
		utimesSync(base, time, time)
	}
	if (params.state !== undefined)
		writeFileSync(
			join(lotFolder, `round-${params.round}.state`),
			`${JSON.stringify({ schema: 1, at: timeAtSecond(params.state), stateHash: SNAPSHOT_STATE_HASH })}\n`,
		)
}

/** The tdd ledger entries `{ kind, at }` (`red`, `freeze`, `green`) of the lot's worktree, at seconds. */
export function writeTddLedger(params: {
	lot: StationLot
	entries: { kind: 'red' | 'freeze' | 'green'; second: number }[]
}): void {
	writeWorktreeRecords({
		worktree: params.lot.worktree,
		ledger: params.entries.map((entry) => ({ kind: entry.kind, at: timeAtSecond(entry.second) })),
	})
}

/**
 * A gate record of the lot's worktree at a second: its steps all passed, or (`passed: false`) one failed, or the
 * statuses given (`['passed', 'skipped', 'not-run']`).
 */
export function writeGateRecord(params: GateRecordParams): void {
	const statuses =
		params.statuses ?? (params.passed === false ? ['passed', 'failed'] : ['passed', 'passed'])
	const at = timeAtSecond(params.second)
	writeWorktreeRecords({
		worktree: params.lot.worktree,
		...{ fast: { gateFast: at }, full: { gateFull: at }, contrib: { contrib: at } }[params.mode],
		steps: {
			[params.mode]: statuses.map((status, index) => ({ name: `step-${index + 1}`, status })),
		},
	})
}

/** The worktree as an empty folder with a git folder (no ledger, no gate record): its records read, and hold nothing. */
export function makeWorktree(lot: StationLot): void {
	mkdirSync(join(lot.worktree, '.git'), { recursive: true })
}

/** The worktree's package.json. */
export function writeWorktreePackage(params: { lot: StationLot; manifest: object }): void {
	mkdirSync(params.lot.worktree, { recursive: true })
	writeFileSync(join(params.lot.worktree, 'package.json'), JSON.stringify(params.manifest))
}

/** Replaces a record of the published lot folder (its files are read-only once published). */
export function rewriteRecord(params: { path: string; text: string }): void {
	chmodSync(params.path, 0o644)
	writeFileSync(params.path, params.text)
}

/** The lot's `brief.json` with `stepCount` steps and the effort given (left out: none). */
export function writeLotBrief(params: {
	lot: StationLot
	stepCount: number
	effort?: 'low' | 'medium' | 'high'
}): void {
	const steps = Array.from({ length: params.stepCount }, (_, index) => ({
		title: `step ${index + 1}`,
		spec: '## 3. Subscribe',
		behaviours: ['one behaviour'],
	}))
	const brief = briefWith({
		scope: ['src/'],
		lots: [{ paths: ['src/'], message: 'feat: x' }],
		steps,
		effort: params.effort,
	})
	rewriteRecord({
		path: join(params.lot.lotFolder, 'brief.json'),
		text: `${JSON.stringify(brief, null, 2)}\n`,
	})
}

/** The identity's effort level changed, or removed (`undefined`: the identity holds none). */
export function setIdentityEffort(params: {
	lot: StationLot
	level: 'low' | 'medium' | 'high' | undefined
}): void {
	const path = join(params.lot.lotFolder, 'identity.json')
	const identity = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
	if (params.level === undefined) delete identity.effort
	else identity.effort = { level: params.level, source: 'brief' }
	rewriteRecord({ path, text: `${JSON.stringify(identity, null, 2)}\n` })
}

/**
 * Plays a story into the lot: events in `events.jsonl`, snapshots, then the worktree's ledger entries and gate records
 * (a record of the same kind twice keeps the last). With `noStepEvents` every event says the worktree's cli writes no
 * step events. The next free second.
 */
export function playMoves(params: {
	lot: StationLot
	moves: Move[]
	noStepEvents?: boolean
}): number {
	const { lot, noStepEvents } = params
	const events: LotEvent[] = []
	const ledger: { kind: 'red' | 'freeze' | 'green'; second: number }[] = []
	let second = 1
	for (const move of params.moves) {
		if ('station' in move)
			events.push(...stationMove({ lot, ...move, start: second, end: second + 1, noStepEvents }))
		else if ('open' in move)
			events.push(
				...stationMove({
					lot,
					station: move.open,
					step: move.step,
					round: move.round,
					start: second,
					end: null,
					noStepEvents,
				}),
			)
		else if ('check' in move)
			events.push(...checkMove({ lot, ...move, start: second, end: second + 1, noStepEvents }))
		else if ('snapshot' in move) writeSnapshot({ lot, round: move.snapshot, state: second + 1 })
		else if ('ledger' in move) ledger.push({ kind: move.ledger, second: second + 1 })
		else
			writeGateRecord({
				lot,
				mode: move.gate,
				second: second + 1,
				passed: move.passed,
				statuses: move.statuses,
			})
		second += 2
	}
	if (events.length > 0) appendLotEvents({ lot, events })
	if (ledger.length > 0) writeTddLedger({ lot, entries: ledger })
	return second
}
