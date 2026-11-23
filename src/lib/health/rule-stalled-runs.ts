import { INTERRUPTED_OUTCOME } from '../events/unrecorded-steps.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { isClosedState } from '../store/lot-state.ts'
import {
	HEAVY_STEP_STALL_MS,
	RESUME_COMMANDS,
	STALL_RUN_KINDS,
	STALL_TEXTS,
	STATION_STALL_MS,
	STEP_STALL_MS,
	WORKTREE_PLACEHOLDER,
} from './health.constants.ts'
import { runDurationMs, timeOf } from './record-run.ts'

import type { EventRun, LotEvent } from '../events/event.types.ts'
import type { HealthFinding, HealthLot, HealthRepository } from './health.types.ts'

/**
 * The runs of an open lot that stopped without ending: a step whose process is gone, a step alive far longer than
 * its budget, an interrupted step, a station open for hours. Only the lot's last run event counts (a lot that moved
 * on past an open run is not stalled); a lot with no state, committed or canceled is skipped, a damaged one is not.
 * Sorted by time, oldest first.
 */
export function findStalledRuns(params: {
	repository: HealthRepository
	now: Date
	isAlive: (pid: number) => boolean
}): HealthFinding[] {
	const { repository } = params
	return repository.lots
		.flatMap(function findingsOf(lot): HealthFinding[] {
			if (!isOpenLot({ lot })) return []
			const finding = stalledFindingOf({ ...params, lot })
			return finding === undefined ? [] : [finding]
		})
		.sort((first, second) => timeOf(first.at) - timeOf(second.at))
}

/** The lot has a state and keeps something: neither committed nor canceled (a damaged lot is open). */
function isOpenLot(params: { lot: HealthLot }): boolean {
	const { state } = params.lot
	return state !== undefined && !isClosedState(state)
}

/** The finding the lot's last run event gives, if it stalled. */
function stalledFindingOf(params: {
	repository: HealthRepository
	lot: HealthLot
	now: Date
	isAlive: (pid: number) => boolean
}): HealthFinding | undefined {
	const { lot } = params
	const last = lastRunEventOf({ events: lot.events })
	if (last === undefined) return undefined
	const run = lot.runs.find((candidate) => candidate.run === last.run)
	if (last.kind === 'step.start' && run?.end === undefined)
		return openStepFinding({ ...params, start: last })
	if (last.kind === 'step.end' && last.outcome === INTERRUPTED_OUTCOME)
		return interruptedFinding({ ...params, end: last, run })
	if (last.kind === 'station.start' && run?.end === undefined)
		return openStationFinding({ ...params, start: last })
	return undefined
}

/** The last event that starts or ends a run, in the order the events were read; other kinds are ignored. */
function lastRunEventOf(params: { events: readonly LotEvent[] }): LotEvent | undefined {
	for (let index = params.events.length - 1; index >= 0; index -= 1) {
		if (STALL_RUN_KINDS.has(params.events[index].kind)) return params.events[index]
	}
	return undefined
}

/** A step start with no end: red when its process is gone, amber when alive past its budget. */
function openStepFinding(params: {
	repository: HealthRepository
	lot: HealthLot
	now: Date
	isAlive: (pid: number) => boolean
	start: LotEvent
}): HealthFinding | undefined {
	const { start, now } = params
	const step = String(start.step)
	const pid = String(start.pid)
	if (!params.isAlive(start.pid)) {
		const text = fillMessage({ template: STALL_TEXTS.gone, values: { step, at: start.at, pid } })
		return stepFindingOf({ ...params, severity: 'red', event: start, text })
	}
	const ageMs = now.getTime() - timeOf(start.at)
	const limit = start.heavy === true ? HEAVY_STEP_STALL_MS : STEP_STALL_MS
	if (ageMs <= limit) return undefined
	const values = { step, duration: formatDuration(ageMs), pid, at: start.at }
	const text = fillMessage({ template: STALL_TEXTS.alive, values })
	return stepFindingOf({ ...params, severity: 'amber', event: start, text })
}

/** A step that ended interrupted, with how long it ran. */
function interruptedFinding(params: {
	repository: HealthRepository
	lot: HealthLot
	end: LotEvent
	run: EventRun | undefined
}): HealthFinding {
	const { end, lot } = params
	const durationMs = runDurationMs({ run: { lot: lot.name, start: params.run?.start, end } })
	const values = { step: String(end.step), at: end.at, duration: formatDuration(durationMs) }
	const text = fillMessage({ template: STALL_TEXTS.interrupted, values })
	return stepFindingOf({ ...params, severity: 'amber', event: end, text })
}

/** A station start with no end, open longer than the station budget. */
function openStationFinding(params: {
	repository: HealthRepository
	lot: HealthLot
	now: Date
	start: LotEvent
}): HealthFinding | undefined {
	const { start } = params
	const ageMs = params.now.getTime() - timeOf(start.at)
	if (ageMs <= STATION_STALL_MS) return undefined
	const values = { station: String(start.station), duration: formatDuration(ageMs), at: start.at }
	return {
		rule: 'stalled-run',
		severity: 'amber',
		repository: params.repository.name,
		lot: params.lot.name,
		at: start.at,
		text: fillMessage({ template: STALL_TEXTS.station, values }),
		detail: [],
	}
}

/** A finding of a step event: its worktree as the detail, the command resuming its step as the next action. */
function stepFindingOf(params: {
	repository: HealthRepository
	lot: HealthLot
	severity: HealthFinding['severity']
	event: LotEvent
	text: string
}): HealthFinding {
	const { event, lot } = params
	const worktree = typeof event.worktree === 'string' ? event.worktree : undefined
	const next = resumeCommandOf({ step: String(event.step), worktree, lot })
	return {
		rule: 'stalled-run',
		severity: params.severity,
		repository: params.repository.name,
		lot: lot.name,
		at: event.at,
		text: params.text,
		detail:
			worktree === undefined
				? []
				: [fillMessage({ template: STALL_TEXTS.worktree, values: { worktree } })],
		...(next === undefined ? {} : { next }),
	}
}

/** The command resuming the step; none for a step with no command, or one needing a worktree the event lacks. */
function resumeCommandOf(params: {
	step: string
	worktree: string | undefined
	lot: HealthLot
}): string | undefined {
	const { worktree, lot } = params
	const template = Object.hasOwn(RESUME_COMMANDS, params.step)
		? RESUME_COMMANDS[params.step]
		: undefined
	if (template === undefined) return undefined
	if (worktree === undefined && template.includes(WORKTREE_PLACEHOLDER)) return undefined
	return fillMessage({
		template,
		values: { folder: lot.folder, lot: lot.name, ...(worktree === undefined ? {} : { worktree }) },
	})
}
