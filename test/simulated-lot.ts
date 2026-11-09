/** Simulated lots and waits: a lot started with `--simulate`, a clock and sleep that move together, waits read as JSON. */
import { join } from 'node:path'

import { startLot } from '../src/commands/lot-start.ts'
import { waitLot } from '../src/commands/lot-wait.ts'
import { runLot } from '../src/commands/lot.ts'
import { playSimulatedLot } from '../src/lib/store/simulate.ts'
import { readIfPresent } from './handover-store-scenario.ts'
import { transitionFilesOf } from './lot-questions.ts'
import { createStartWorkspace, snapshotOf, withJson } from './lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from './lot-start.constants.ts'
import { git } from './scratch-repository.ts'
import { WAIT_LOOP_LIMIT } from './simulated-lot.constants.ts'

import type { StartSeams } from '../src/commands/lot-start.types.ts'
import type { WaitParams } from '../src/commands/lot-wait.types.ts'
import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { Transition } from '../src/lib/store/store.types.ts'
import type { StartWorkspace } from './lot-start-workspace.types.ts'
import type {
	FlowStep,
	JsonResult,
	LoopShape,
	SimulatedLot,
	WaitTime,
} from './simulated-lot.types.ts'

/**
 * Starts the default brief with `--simulate <scenario>` in a fresh scratch workspace (`XDG_STATE_HOME` into the
 * test's folder). Never throws: the start's result is kept, so a case fails on its assertions.
 */
export function startSimulated(params: {
	scenario: string
	brief?: Record<string, unknown>
	seams?: StartSeams
}): SimulatedLot {
	const start = createStartWorkspace({ brief: params.brief })
	const started = startLot({
		cwd: start.cwd,
		argv: [start.workspace.briefPath, '--simulate', params.scenario, '--json'],
		now: START_NOW,
		seams: params.seams,
	})
	return { start, lotFolder: join(start.store, LOT_NAME), started }
}

/** A clock at `at` (the lot's start unless said) and a sleep that moves it; `onSleep` runs after each sleep with its count. */
export function createWaitTime(
	params: { at?: Date; onSleep?: (call: number) => void } = {},
): WaitTime {
	let now = (params.at ?? START_NOW).getTime()
	const sleeps: number[] = []
	function readClock(): number {
		return now
	}
	async function moveClock(milliseconds: number): Promise<void> {
		sleeps.push(milliseconds)
		now += milliseconds
		params.onSleep?.(sleeps.length)
	}
	return { clock: { now: readClock }, sleep: moveClock, sleeps }
}

/** `lot wait <id> <words> --json` from `cwd` under the given time; the exit code and the JSON. */
export async function waitJson(params: {
	cwd: string
	id: string
	time: WaitTime
	words?: string[]
	seams?: Pick<WaitParams, 'isTerminal' | 'write'>
}): Promise<JsonResult> {
	const result = await waitLot({
		cwd: params.cwd,
		argv: [params.id, ...(params.words ?? []), '--json'],
		clock: params.time.clock,
		sleep: params.time.sleep,
		...params.seams,
	})
	return withJson(result)
}

/** `lot wait` of a simulated lot from its repository. */
export async function waitSimulated(params: {
	lot: SimulatedLot
	time: WaitTime
	words?: string[]
}): Promise<JsonResult> {
	return waitJson({
		cwd: params.lot.start.repository,
		id: LOT_NAME,
		time: params.time,
		words: params.words,
	})
}

/** `lot wait` on `argv` as given (no id or option added) from `cwd`: the command's result. */
export async function waitRaw(params: {
	cwd: string
	argv: string[]
	time: WaitTime
}): Promise<CommandResult> {
	return waitLot({
		cwd: params.cwd,
		argv: params.argv,
		clock: params.time.clock,
		sleep: params.time.sleep,
	})
}

/** `lot wait` of a simulated lot, then the lot's transitions as the files hold them. */
export async function waitThenTransitions(params: {
	lot: SimulatedLot
	time: WaitTime
	words?: string[]
}): Promise<{ exitCode: number; transitions: Transition[] }> {
	const waited = await waitSimulated(params)
	return { exitCode: waited.exitCode, transitions: transitionFilesOf(params.lot.lotFolder) }
}

/** `lot wait` of a simulated lot, then the summary of its transitions. */
export async function waitThenSummary(params: {
	lot: SimulatedLot
	time: WaitTime
	words?: string[]
}): Promise<{ exitCode: number; summary: string[] }> {
	const waited = await waitSimulated(params)
	return { exitCode: waited.exitCode, summary: summaryOf(params.lot.lotFolder) }
}

/**
 * `lot wait` of a simulated lot with the refreshing line on or off, text or JSON: the exit code and everything
 * the line writer received, joined.
 */
export async function waitWriting(params: {
	lot: SimulatedLot
	time: WaitTime
	words?: string[]
	isTerminal: boolean
	json: boolean
}): Promise<{ exitCode: number; written: string }> {
	const chunks: string[] = []
	function collect(text: string): void {
		chunks.push(text)
	}
	const result = await waitLot({
		cwd: params.lot.start.repository,
		argv: [LOT_NAME, ...(params.words ?? []), ...(params.json ? ['--json'] : [])],
		clock: params.time.clock,
		sleep: params.time.sleep,
		isTerminal: params.isTerminal,
		write: collect,
	})
	return { exitCode: result.exitCode, written: chunks.join('') }
}

/** `lot answer` on a simulated lot from its repository; `words` are everything after the verb. */
export function answerSimulated(params: { lot: SimulatedLot; words: string[] }): CommandResult {
	return runLot({
		cwd: params.lot.start.repository,
		argv: ['answer', ...params.words],
		now: START_NOW,
	})
}

/**
 * Runs the steps in order on the simulated lot: each wait observed as `wait <exit code> <state> <open question ids>`,
 * each answer as `answer <exit code>`; then the summary of the transitions.
 */
export async function runFlow(params: {
	lot: SimulatedLot
	time: WaitTime
	steps: FlowStep[]
}): Promise<{ observed: string[]; summary: string[] }> {
	const observed: string[] = []
	for (const step of params.steps) {
		if ('answer' in step) {
			observed.push(`answer ${answerSimulated({ lot: params.lot, words: step.answer }).exitCode}`)
			continue
		}
		const waited = await waitSimulated({ lot: params.lot, time: params.time, words: step.wait })
		const status = waited.json as {
			state?: string
			questions?: { id: string }[]
		}
		const open = (status.questions ?? []).map((question) => question.id).join(',')
		observed.push(`wait ${waited.exitCode} ${status.state}${open === '' ? '' : ` ${open}`}`)
	}
	return { observed, summary: summaryOf(params.lot.lotFolder) }
}

/**
 * What the repeated `wait --timeout 1` of a slow lot did, the lot's final summary, and whether every step was
 * played at least its own duration after the one before it.
 */
export async function waitRepeatedly(params: {
	lot: SimulatedLot
	time: WaitTime
	minimumGap: number
}): Promise<{
	shape: LoopShape
	summary: string[]
	everyStepDue: boolean
}> {
	const codes: number[] = []
	while (codes.length < WAIT_LOOP_LIMIT) {
		const waited = await waitSimulated({
			lot: params.lot,
			time: params.time,
			words: ['--timeout', '1'],
		})
		codes.push(waited.exitCode)
		if (waited.exitCode !== 5) break
	}
	return {
		shape: loopShapeOf(codes),
		summary: summaryOf(params.lot.lotFolder),
		everyStepDue: gapsOf(params.lot.lotFolder).every((gap) => gap >= params.minimumGap),
	}
}

/** What a list of exit codes of repeated waits shows: how it began, how it ended, whether only 5 came between. */
export function loopShapeOf(codes: number[]): LoopShape {
	return {
		first: codes[0],
		last: codes.at(-1),
		onlyFivesBeforeTheLast: codes.slice(0, -1).every((code) => code === 5),
		moreThanOneWait: codes.length > 1,
	}
}

/**
 * What the facts a simulated start must leave as they were (case 26): the refs, the worktree list, the registry's
 * bytes and `.git/info/exclude`.
 */
export function repositoryFactsOf(start: StartWorkspace): {
	refs: string
	worktrees: string
	registry: Record<string, string>
	exclude: string | undefined
} {
	return {
		refs: git({ root: start.repository, args: ['for-each-ref'] }),
		worktrees: git({ root: start.repository, args: ['worktree', 'list'] }),
		registry: snapshotOf(start.workspace.registry),
		exclude: readIfPresent(join(start.repository, '.git', 'info', 'exclude')),
	}
}

/** Every transition of the lot folder as `<seq>:<state>:<cause kind>:<station>` (the station `null` before any ran). */
export function summaryOf(lotFolder: string): string[] {
	return transitionFilesOf(lotFolder).map(
		(transition) =>
			`${transition.seq}:${transition.state}:${transition.cause.kind}:${transition.position.station}`,
	)
}

/** The milliseconds between each transition's `at` and the one before it. */
export function gapsOf(lotFolder: string): number[] {
	const times = transitionFilesOf(lotFolder).map((transition) => Date.parse(transition.at))
	return times.slice(1).map((time, index) => time - times[index])
}

/**
 * Two players of one simulated lot in a forced order: the first reads the last transition, and before it publishes
 * the second plays the lot (the loser re-reads and decides again). What they published together: whether every
 * number is held once and the numbers run on without a gap, whether each published transition is the file on disk,
 * the summary, and the ids of the questions asked.
 */
export function playTwiceForced(params: { lotFolder: string }): {
	uniqueNumbers: boolean
	contiguous: boolean
	matchesDisk: boolean
	summary: string[]
	questionIds: string[]
} {
	const { lotFolder } = params
	const secondPublished: Transition[] = []
	function secondPlayer(): void {
		secondPublished.push(...playSimulatedLot({ lotFolder, now: START_NOW }).published)
	}
	const first = playSimulatedLot({ lotFolder, now: START_NOW, afterRead: secondPlayer })
	const published = [...first.published, ...secondPublished]
	const onDisk = transitionFilesOf(lotFolder)
	const numbers = published
		.map((transition) => transition.seq)
		.sort((first, second) => first - second)
	return {
		uniqueNumbers: new Set(numbers).size === numbers.length,
		// the lot's first transition is the start's: what the players published runs on from 2
		contiguous: numbers.every((number, index) => number === index + 2),
		matchesDisk: published.every(
			(transition) => JSON.stringify(onDisk[transition.seq - 1]) === JSON.stringify(transition),
		),
		summary: summaryOf(lotFolder),
		questionIds: onDisk.flatMap((transition) =>
			transition.question ? [transition.question.id] : [],
		),
	}
}
