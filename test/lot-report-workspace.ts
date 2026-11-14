/** Lots whose events, record times and `cards.log` lines the report tests write by hand (plain files: no code under test). */
import { createHash } from 'node:crypto'
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import {
	LEDGER_HEAD,
	CARDS_LOG_NAME,
	FIRST_STATION,
	RECORDING_WORKTREE_CLI,
	SECOND_STATION,
	SHA,
} from './lot-report-workspace.constants.ts'
import { createStationLot } from './lot-station-workspace.ts'
import { stationRun, stepRun, timeOf } from './report-events.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { StationLot } from './lot-station-workspace.types.ts'

/** Appends the events to the lot's `events.jsonl`, one line each, the lot's name set on them. */
export function appendLotEvents(params: { lot: StationLot; events: LotEvent[] }): void {
	mkdirSync(join(params.lot.eventsFile, '..'), { recursive: true })
	for (const event of params.events)
		appendFileSync(params.lot.eventsFile, `${JSON.stringify({ ...event, lot: params.lot.name })}\n`)
}

/** `lot station <lot> <words>` at the test day's `clock` (`10:05`): the cli's own clock is the one the run measures. */
export function stationAt(params: {
	lot: StationLot
	clock: string
	words: string[]
}): CommandResult {
	return runLot({
		cwd: params.lot.cwd,
		argv: ['station', params.lot.name, ...params.words],
		now: new Date(timeOf(params.clock)),
	})
}

/**
 * Makes `<worktree>/.git` a folder holding the records: the gate record of `fast` at `gateFast`, the one of `full`
 * at `gateFull`, and the tdd ledger (entries `{ kind, at }`, or the text as it is to write an unreadable one).
 */
export function writeWorktreeRecords(params: {
	worktree: string
	gateFast?: string
	gateFull?: string
	/** The record of `contrib` at this time. */
	contrib?: string
	/** The steps a record of a mode lists (`{ name, status }`); a record written without them holds none. */
	steps?: Partial<Record<'fast' | 'full' | 'contrib', { name: string; status: string }[]>>
	ledger?: { kind: string; at: string }[] | string
	/** The gate record of `fast` exists but does not parse (written as this text); wins over `gateFast`. */
	damagedGateFast?: string
}): void {
	const gitFolder = join(params.worktree, '.git')
	mkdirSync(gitFolder, { recursive: true })
	if (params.damagedGateFast !== undefined)
		writeFileSync(join(gitFolder, 'dialecte-gate-fast.json'), params.damagedGateFast)
	for (const [mode, at] of [
		['fast', params.gateFast],
		['full', params.gateFull],
		['contrib', params.contrib],
	] as const)
		if (at !== undefined && !(mode === 'fast' && params.damagedGateFast !== undefined)) {
			const steps = params.steps?.[mode]
			writeFileSync(
				join(gitFolder, `dialecte-gate-${mode}.json`),
				JSON.stringify({ mode, at, ...(steps === undefined ? {} : { steps }) }),
			)
		}
	if (params.ledger === undefined) return
	writeFileSync(
		join(gitFolder, 'dialecte-tdd.json'),
		typeof params.ledger === 'string'
			? params.ledger
			: JSON.stringify({ version: 3, entries: params.ledger }),
	)
}

/** The record times a `card` or `removing` line freezes: every record `null` unless given. */
export function frozenRecordsOf(
	params: {
		gateFast?: string
		gateFull?: string
		tdd?: { at: string; step: string | null }[]
	} = {},
): Record<string, unknown> {
	return {
		'gate-fast': params.gateFast ?? null,
		'gate-full': params.gateFull ?? null,
		'gate-release': null,
		contrib: null,
		'gate-hook': null,
		tdd: params.tdd ?? [],
	}
}

/** A `removing` line for the lot's worktree (or `path`), and the `removed` line that closes it. */
export function removalLinesOf(params: {
	lot: StationLot
	id: string
	at: string
	records: Record<string, unknown>
	path?: string
}): object[] {
	return [
		{
			schema: 1,
			kind: 'removing',
			id: params.id,
			at: params.at,
			lot: params.lot.name,
			item: 'worktree',
			path: params.path ?? params.lot.worktree,
			branch: 'feat/subscribe',
			tip: SHA,
			records: params.records,
			by: 'lot-close',
		},
		{ schema: 1, kind: 'removed', id: params.id, at: params.at, outcome: 'trashed' },
	]
}

/** A `card` line: the final record of the lot `lot` (its full name), `records` frozen on it. */
export function cardLineOf(params: {
	lot: string
	feature: string | null
	at: string
	records: Record<string, unknown> | null
	state?: 'committed' | 'canceled'
	repository: string
	/** The usage the card froze (a `HandoverUsage` as data); none unless given. */
	usage?: Record<string, unknown> | null
}): object {
	return {
		schema: 1,
		kind: 'card',
		at: params.at,
		lot: params.lot,
		name: `2026-11-08-feat-${params.lot}`,
		state: params.state ?? 'committed',
		feature: params.feature,
		repository: params.repository,
		branch: 'feat/subscribe',
		head: SHA,
		base: SHA,
		card: null,
		usage: params.usage ?? null,
		records: params.records,
		by: 'handover-run',
	}
}

/** Appends the lines to the `cards.log` of the registry beside the lot's store. */
export function appendCardsLog(params: { registry: string; lines: object[] }): void {
	mkdirSync(params.registry, { recursive: true })
	for (const line of params.lines)
		appendFileSync(join(params.registry, CARDS_LOG_NAME), `${JSON.stringify(line)}\n`)
}

/** Appends the lines as they are (a damaged one, an unknown kind, a repeat) to the lot's `events.jsonl`. */
export function appendRawEventLines(params: { lot: StationLot; lines: string[] }): void {
	for (const line of params.lines) appendFileSync(params.lot.eventsFile, `${line}\n`)
}

/** Writes the lot's findings ledger: one row per finding `[round, severity, state]`, ids `R<round>-<n>`. */
export function writeLedger(params: {
	lot: StationLot
	findings: [number, string, string][]
}): void {
	const rows = params.findings.map(
		([round, severity, state], index) =>
			`| R${round}-${index + 1} | ${round} | ${severity} | a.ts:1 | a finding | ${state} |\n`,
	)
	writeFileSync(join(params.lot.lotFolder, 'findings-ledger.md'), `${LEDGER_HEAD}${rows.join('')}`)
}

/** Makes the empty snapshot folders `round-<n>` of the lot. */
export function makeRoundFolders(params: { lot: StationLot; rounds: number[] }): void {
	for (const round of params.rounds)
		mkdirSync(join(params.lot.lotFolder, `round-${round}`), { recursive: true })
}

/** Writes a mutation run file into the repository's common folder (beside the registry), for the lot's worktree. */
export function writeMutationRun(params: { lot: StationLot; startedAt: string }): void {
	const folder = join(params.lot.workspace.registry, '..', 'dialecte-mutation', 'runs')
	mkdirSync(folder, { recursive: true })
	writeFileSync(
		join(folder, 'run-1.json'),
		JSON.stringify({
			runId: 'run-1',
			pid: 1,
			startedAt: params.startedAt,
			state: 'reported',
			worktree: params.lot.worktree,
		}),
	)
}

/** The sha256 of every file under `folder`, by its path relative to `folder`: what a read-only verb must leave alone. */
export function hashTree(folder: string): Record<string, string> {
	const hashes: Record<string, string> = {}
	if (!existsSync(folder)) return hashes
	const pending = [folder]
	for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
		for (const name of readdirSync(current)) {
			const path = join(current, name)
			if (statSync(path).isDirectory()) pending.push(path)
			else
				hashes[relative(folder, path)] = createHash('sha256')
					.update(readFileSync(path))
					.digest('hex')
		}
	}
	return hashes
}

/**
 * The events of the recorded lot: two stations (`test-writer` 10:00-10:06 with 182k tokens, `implementer`
 * 10:07-10:25 with a lower bound of 410k) and, in the lot's worktree, a tdd red inside the first, a tdd green and a
 * gate fast inside the second, a gate full between them and after them (the orchestration's).
 */
export function recordedEvents(params: { worktree: string }): LotEvent[] {
	return [
		...stationRun({
			run: 'run-first',
			station: FIRST_STATION,
			start: '10:00',
			end: '10:06',
			startFields: {
				step: 1,
				agent: 'dialecte-test-writer',
				tier: 'standard',
				model: 'model-a',
				vendor: 'vendor-a',
			},
			endFields: {
				tokens: { total: 182_000 },
				skills: [{ name: 'dialecte-lot', hash: null, how: 'seen' }],
			},
		}),
		...stationRun({
			run: 'run-second',
			station: SECOND_STATION,
			start: '10:07',
			end: '10:25',
			startFields: {
				step: 1,
				agent: 'dialecte-implementer',
				tier: 'standard',
				model: 'model-a',
				vendor: 'vendor-a',
			},
			endFields: {
				tokens: { input: 300_000, output: 110_000 },
				skills: [
					{ name: 'dialecte-lot', hash: null, how: 'seen' },
					{ name: 'tdd', hash: null, how: 'seen' },
				],
				suites: { unit: 2 },
			},
		}),
		...recordedStepEvents({ worktree: params.worktree }),
	]
}

/** The step events of the recorded lot alone: what the cli writes while the host's stations run. */
export function recordedStepEvents(params: { worktree: string }): LotEvent[] {
	const step = { worktree: params.worktree, worktreeCli: { worktreeCli: RECORDING_WORKTREE_CLI } }
	return [
		...stepRun({ run: 'step-red', step: 'tdd-red', start: '10:02', end: '10:03', ...step }),
		...stepRun({ run: 'step-green', step: 'tdd-green', start: '10:10', end: '10:11', ...step }),
		...stepRun({ run: 'step-fast', step: 'gate-fast', start: '10:20', end: '10:21', ...step }),
		...stepRun({ run: 'step-full', step: 'gate-full', start: '10:40', end: '10:42', ...step }),
	]
}

/**
 * A working lot whose worktree holds the records of `recordedStepEvents` and whose events file holds those events:
 * the host then records the stations itself, through `lot station`.
 */
export function createLotAwaitingStations(): StationLot {
	const lot = createStationLot()
	writeRecordedRecords({ worktree: lot.worktree })
	appendLotEvents({ lot, events: recordedStepEvents({ worktree: lot.worktree }) })
	return lot
}

/**
 * A lot whose worktree exists with the records every step of `recordedEvents` left, and whose events file holds
 * them: the lot of the report cases. `state` is the lot's (`working` unless said).
 */
export function createRecordedLot(
	params: { state?: 'working' | 'committed'; name?: string; feature?: string } = {},
): StationLot {
	const lot = createStationLot({
		name: params.name,
		state: params.state,
		feature: params.feature,
	})
	writeRecordedRecords({ worktree: lot.worktree })
	appendLotEvents({ lot, events: recordedEvents({ worktree: lot.worktree }) })
	return lot
}

/** The records the steps of `recordedStepEvents` left in the worktree, each inside its run. */
function writeRecordedRecords(params: { worktree: string }): void {
	writeWorktreeRecords({
		worktree: params.worktree,
		gateFast: timeOf('10:20:30'),
		gateFull: timeOf('10:41:00'),
		ledger: [
			{ kind: 'red', at: timeOf('10:02:30') },
			{ kind: 'green', at: timeOf('10:10:30') },
		],
	})
}
