/** A hand-over lot recording stations, and the arguments of the calls the usage and `cards.log` cases make. */
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from './fake-clock.ts'
import { storeOf } from './handover-store-scenario.ts'
import {
	FIRST_AGENT,
	FIRST_RUN_TIMES,
	FIRST_RUN_TOTAL,
	FOURTH_RUN_TIMES,
	FOURTH_RUN_TOTAL,
	LOT_USAGE_TEXT,
	SECOND_AGENT,
	SECOND_RUN_INPUT,
	SECOND_RUN_TIMES,
	THIRD_RUN_TIMES,
	THIRD_RUN_TOTAL,
} from './handover-usage.constants.ts'
import { stationRun, stepRun } from './report-events.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { HANDOVER_WRITER_CLI } from './step-events-handover.constants.ts'
import { createRecordingSpawner } from './worktree-pool.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { HandoverLot } from './step-events-handover.types.ts'

/** The `cards.log` of the repository the lot is in (it may not exist). */
export function cardsLogOf(lot: Pick<HandoverLot, 'root'>): string {
	return join(storeOf(lot.root), 'cards.log')
}

/** The `cards.log` text; empty when there is no log. */
export function cardsLogText(lot: Pick<HandoverLot, 'root'>): string {
	const file = cardsLogOf(lot)
	return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** The `cards.log` text, one parsed object per line. */
export function cardsLogLines(lot: Pick<HandoverLot, 'root'>): Record<string, any>[] {
	const file = cardsLogOf(lot)
	if (!existsSync(file)) return []
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line))
}

/** The name the lot's hand-over is registered under (the one entry of the repository's store). */
export function registeredNameIn(lot: Pick<HandoverLot, 'root'>): string | undefined {
	const names = storeEntryNames(lot)
	return names.length === 1 ? names[0] : undefined
}

function storeEntryNames(lot: Pick<HandoverLot, 'root'>): string[] {
	return readdirNames(storeOf(lot.root))
		.filter((name) => name.endsWith('.json'))
		.map((name) => name.slice(0, -'.json'.length))
}

function readdirNames(folder: string): string[] {
	try {
		return readdirSync(folder)
	} catch {
		return []
	}
}

function writeEventsOf(params: {
	lot: Pick<HandoverLot, 'eventsFile' | 'lotName'>
	events: LotEvent[]
}): void {
	for (const event of params.events)
		appendFileSync(
			params.lot.eventsFile,
			`${JSON.stringify({ ...event, lot: params.lot.lotName })}\n`,
		)
}

/**
 * Records four station runs in the lot's events (three station names, two agents): the second reports only its input
 * (a lower bound), the others their totals; 72 minutes of agent time in all.
 */
export function recordStations(lot: Pick<HandoverLot, 'eventsFile' | 'lotName'>): void {
	writeEventsOf({
		lot,
		events: [
			...stationRun({
				run: 'run-usage-first',
				station: 'test-writer',
				...FIRST_RUN_TIMES,
				startFields: { step: 1, agent: FIRST_AGENT, tier: 'standard' },
				endFields: { tokens: { total: FIRST_RUN_TOTAL } },
			}),
			...stationRun({
				run: 'run-usage-second',
				station: 'implementer',
				...SECOND_RUN_TIMES,
				startFields: { step: 1, agent: SECOND_AGENT, tier: 'standard' },
				endFields: { tokens: { input: SECOND_RUN_INPUT } },
			}),
			...stationRun({
				run: 'run-usage-third',
				station: 'reviewer',
				...THIRD_RUN_TIMES,
				startFields: { round: 1, agent: FIRST_AGENT, tier: 'strong' },
				endFields: { tokens: { total: THIRD_RUN_TOTAL } },
			}),
			...stationRun({
				run: 'run-usage-fourth',
				station: 'test-writer',
				...FOURTH_RUN_TIMES,
				startFields: { step: 2, agent: FIRST_AGENT, tier: 'standard' },
				endFields: { tokens: { total: FOURTH_RUN_TOTAL } },
			}),
		],
	})
}

/** Records a step run in the lot's events and no station: what the cli writes while no host records anything. */
export function recordStepsOnly(lot: Pick<HandoverLot, 'eventsFile' | 'lotName' | 'root'>): void {
	writeEventsOf({
		lot,
		events: stepRun({
			run: 'step-usage-only',
			step: 'gate-fast',
			start: '10:00',
			end: '10:01',
			worktree: lot.root,
		}),
	})
}

/** A file of the lot's `asks/` holding `text`: what no card, line or row may carry. */
export function writeAsk(params: { lot: Pick<HandoverLot, 'lotFolder'>; text: string }): void {
	const folder = join(params.lot.lotFolder, 'asks')
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, 'A-1.json'), JSON.stringify({ text: params.text }))
}

/** The `usage` line of the lot recorded by `recordStations`, as the card prints it. */
export function usageLineOf(params: { lotName: string }): string {
	return `${LOT_USAGE_TEXT} ${params.lotName}`
}

/** The arguments of `handover run <lot's hand-over folder>` made from the worktree of the bystander lot. */
export function runArguments(params: { lot: HandoverLot; argv?: string[]; lines: string[] }) {
	return {
		probe: noRepositoryCli,
		argv: [params.lot.folder, ...(params.argv ?? [])],
		write: (line: string) => params.lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		spawner: createRecordingSpawner().spawner,
		cwd: params.lot.bystander.worktree,
	}
}

/** The arguments of `handover show <folder>` from the lot's repository. */
export function showArguments(params: { lot: HandoverLot; json?: boolean }) {
	return {
		argv: [params.lot.folder, ...(params.json ? ['--json'] : [])],
		cwd: params.lot.root,
		probe: noRepositoryCli,
		cliPath: HANDOVER_WRITER_CLI,
	}
}
