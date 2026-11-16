import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import {
	HANDOVER_RUN_STEP,
	HOOK_STEP,
	LANDING_BUDGET_MS,
	LANDING_TEXTS,
	REHEARSAL_STEP,
} from './health.constants.ts'
import { landingHookPart } from './landing-hook-part.ts'
import { isInWindow, runDurationMs, timeOf } from './record-run.ts'
import { recordsByTreeOf } from './records-by-tree.ts'

import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type {
	ClosedLotRun,
	HealthFinding,
	HealthLot,
	HealthRepository,
	HealthWindow,
	LandingHookPart,
	StartedLotRun,
} from './health.types.ts'

/**
 * The handover runs that took at least `LANDING_BUDGET_MS`: how long its guards took, what each commit hook did
 * (reused, ran, and why it ran again) and the rehearsals before it. Sorted by time, oldest first.
 */
export function findSlowLandings(params: {
	repository: HealthRepository
	window: HealthWindow
	duplicates: readonly HealthFinding[]
}): HealthFinding[] {
	const { repository, window, duplicates } = params
	const recordsByTree = recordsByTreeOf({ records: repository.records })
	const findings = repository.lots.flatMap(function landingsOfLot(lot) {
		return findLotLandings({ lot, repository, window, duplicates, recordsByTree })
	})
	return findings.sort((first, second) => timeOf(first.at) - timeOf(second.at))
}

/** The slow landings of one lot: its handover runs that ended in the window, over budget. */
function findLotLandings(params: {
	lot: HealthLot
	repository: HealthRepository
	window: HealthWindow
	duplicates: readonly HealthFinding[]
	recordsByTree: ReadonlyMap<string, GateRecord[]>
}): HealthFinding[] {
	const { lot, repository, window, recordsByTree } = params
	const started = startedRunsOf({ lot })
	const handovers = started.filter((run) => run.start.step === HANDOVER_RUN_STEP)
	const hooks = started.filter((run) => run.start.step === HOOK_STEP)
	const rehearsals = started.filter(isClosed).filter((run) => run.start.step === REHEARSAL_STEP)
	const duplicates = params.duplicates.filter(
		(finding) => finding.rule === 'duplicate-work' && finding.lot === lot.name,
	)
	const findings: HealthFinding[] = []
	for (const handover of handovers) {
		if (!isClosed(handover) || !isInWindow({ at: handover.end.at, ...window })) continue
		if (runDurationMs({ run: handover }) < LANDING_BUDGET_MS) continue
		const inside = hooksOf({ handover, hooks })
		const parts = inside.map(function partOf(hook, position) {
			return landingHookPart({ hook, index: position + 1, duplicates, recordsByTree })
		})
		findings.push({
			rule: 'landing-time',
			severity: parts.some((part) => part.duplicate) ? 'red' : 'amber',
			repository: repository.name,
			lot: lot.name,
			at: handover.start.at,
			text: fillMessage({
				template: LANDING_TEXTS.text,
				values: {
					duration: formatDuration(runDurationMs({ run: handover })),
					budget: formatDuration(LANDING_BUDGET_MS),
					at: handover.start.at,
				},
			}),
			detail: landingDetail({
				handover,
				parts,
				firstHookAt: inside[0]?.start.at,
				rehearsals: rehearsalsBefore({ handover, handovers, rehearsals }),
			}),
		})
	}
	return findings
}

/** The lot's runs that have a start, in start order. */
function startedRunsOf(params: { lot: HealthLot }): StartedLotRun[] {
	const { lot } = params
	const started: StartedLotRun[] = []
	for (const run of lot.runs) {
		if (run.start !== undefined) started.push({ lot: lot.name, start: run.start, end: run.end })
	}
	return started.sort((first, second) => timeOf(first.start.at) - timeOf(second.start.at))
}

/** The hooks that started inside the handover run, both ends included, in start order. */
function hooksOf(params: {
	handover: ClosedLotRun
	hooks: readonly StartedLotRun[]
}): StartedLotRun[] {
	const from = timeOf(params.handover.start.at)
	const to = timeOf(params.handover.end.at)
	return params.hooks.filter(function startedInside(hook) {
		const at = timeOf(hook.start.at)
		return at >= from && at <= to
	})
}

/**
 * The rehearsals that ended at or before the handover run's start and started after the end of the lot's latest
 * earlier handover run (its start when it has no end), in start order.
 */
function rehearsalsBefore(params: {
	handover: ClosedLotRun
	handovers: readonly StartedLotRun[]
	rehearsals: readonly ClosedLotRun[]
}): ClosedLotRun[] {
	const { handover } = params
	const start = timeOf(handover.start.at)
	let after = Number.NEGATIVE_INFINITY
	for (const earlier of params.handovers) {
		if (earlier === handover || timeOf(earlier.start.at) >= start) continue
		after = Math.max(after, timeOf((earlier.end ?? earlier.start).at))
	}
	return params.rehearsals.filter(function isBetween(rehearsal) {
		return timeOf(rehearsal.end.at) <= start && timeOf(rehearsal.start.at) > after
	})
}

/** The guards and each hook's part, then the rehearsals before it when there are some. */
function landingDetail(params: {
	handover: ClosedLotRun
	parts: readonly LandingHookPart[]
	firstHookAt: string | undefined
	rehearsals: readonly ClosedLotRun[]
}): string[] {
	const { handover, parts, firstHookAt, rehearsals } = params
	const guards = fillMessage({
		template: LANDING_TEXTS.guards,
		values: { duration: formatDuration(guardsMs({ handover, firstHookAt })) },
	})
	const detail = [[guards, ...parts.map((part) => part.text)].join(LANDING_TEXTS.partsSeparator)]
	if (rehearsals.length === 0) return detail
	const listed = rehearsals.map(function rehearsalText(rehearsal) {
		return fillMessage({
			template: LANDING_TEXTS.rehearsal,
			values: {
				duration: formatDuration(runDurationMs({ run: rehearsal })),
				at: rehearsal.start.at,
			},
		})
	})
	return [
		...detail,
		fillMessage({
			template: LANDING_TEXTS.rehearsals,
			values: { rehearsals: listed.join(LANDING_TEXTS.rehearsalsSeparator) },
		}),
	]
}

/** From the handover run's start to its first hook's start; the whole run when no hook ran. */
function guardsMs(params: { handover: ClosedLotRun; firstHookAt: string | undefined }): number {
	const { handover, firstHookAt } = params
	if (firstHookAt === undefined) return runDurationMs({ run: handover })
	return timeOf(firstHookAt) - timeOf(handover.start.at)
}

function isClosed(run: StartedLotRun): run is ClosedLotRun & StartedLotRun {
	return run.end !== undefined
}
