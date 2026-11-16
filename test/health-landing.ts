/** The landing rule's cases: lots with a handover run, its hooks and rehearsals written as whole events. */

import { readHealthRepository } from '../src/lib/health/read-health-context.ts'
import { findSlowLandings } from '../src/lib/health/rule-landing-time.ts'
import { DEFAULT_GUARDS_MS, HR_START_AT, NOT_REUSED_DETAIL } from './health-landing.constants.ts'
import { HEALTH_LOT, REPOSITORY_FOLDER, WINDOW } from './health.constants.ts'
import { stepRunEvents, writeHealthCommon } from './health.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { HealthFinding } from '../src/lib/health/health.types.ts'
import type {
	DuplicateFindingParams,
	HookSpec,
	LandingCase,
	LandingFindingParams,
	LandingLotSpec,
	TimedRunSpec,
} from './health-landing.types.ts'
import type { HealthLotInput } from './health.types.ts'

function plusMs(params: { at: string; milliseconds: number }): string {
	return new Date(Date.parse(params.at) + params.milliseconds).toISOString()
}

function hookEvents(params: {
	hook: HookSpec
	index: number
	startAt: string
	lot: string
}): LotEvent[] {
	const { hook, index, startAt, lot } = params
	const [start, end] = stepRunEvents({
		lot,
		run: `hook-${index}`,
		step: 'gate-hook',
		startAt,
		endAt: plusMs({ at: startAt, milliseconds: hook.durationMs }),
		key: hook.key,
		reuse: hook.reuse,
	})
	if (hook.noEnd === true) return [start]
	return [start, hook.outcome === undefined ? end : { ...end, outcome: hook.outcome }]
}

/** The events of the lot: the handover run, its hooks, the rehearsals and the earlier handover runs. */
export function landingLotOf(params: LandingLotSpec): HealthLotInput {
	const { handoverMs, hooks, guardsMs = DEFAULT_GUARDS_MS, hrStartAt = HR_START_AT } = params
	const lot = params.name ?? HEALTH_LOT
	const events: LotEvent[] = []
	let cursor = plusMs({ at: hrStartAt, milliseconds: guardsMs })
	hooks.forEach((hook, index) => {
		const startAt = hook.startAt ?? cursor
		events.push(...hookEvents({ hook, index, startAt, lot }))
		if (hook.startAt === undefined) cursor = plusMs({ at: cursor, milliseconds: hook.durationMs })
	})
	const handover = timedRunEvents({
		lot,
		run: 'handover-1',
		step: 'handover-run',
		spec: { startAt: hrStartAt, durationMs: handoverMs },
	})
	events.push(...(params.noHandoverEnd === true ? handover.slice(0, 1) : handover))
	;(params.previousHandovers ?? []).forEach((spec, index) => {
		events.push(
			...timedRunEvents({ lot, run: `handover-previous-${index}`, step: 'handover-run', spec }),
		)
	})
	;(params.rehearsals ?? []).forEach((spec, index) => {
		events.push(...timedRunEvents({ lot, run: `rehearsal-${index}`, step: 'rehearsal', spec }))
	})
	return { name: lot, events }
}

function timedRunEvents(params: {
	lot: string
	run: string
	step: string
	spec: TimedRunSpec
}): LotEvent[] {
	const { lot, run, step, spec } = params
	return stepRunEvents({
		lot,
		run,
		step,
		startAt: spec.startAt,
		endAt: plusMs({ at: spec.startAt, milliseconds: spec.durationMs }),
	})
}

/** The findings of the rule on a case's records and lots, in the window of the tests. */
export function findLandingsOfCase(row: LandingCase): HealthFinding[] {
	const lots = [...(row.otherLots ?? []), row.lot].map(landingLotOf)
	const common = writeHealthCommon({ records: row.records, lots })
	return findSlowLandings({
		repository: readHealthRepository({ common }),
		window: WINDOW,
		duplicates: row.duplicates ?? [],
	})
}

/** The finding of a 6 m 40 s handover run whose one hook ran 5 m 0 s and was not reused; `at` and `lot` default. */
export function amberNotReused(params: { at?: string; lot?: string } = {}): HealthFinding {
	return landingFinding({
		severity: 'amber',
		handover: '6 m 40 s',
		detail: [NOT_REUSED_DETAIL],
		...params,
	})
}

/** A landing finding of the lot, at the handover run's start unless `at` is given. */
export function landingFinding(params: LandingFindingParams): HealthFinding {
	const at = params.at ?? HR_START_AT
	return {
		rule: 'landing-time',
		severity: params.severity,
		repository: REPOSITORY_FOLDER,
		lot: params.lot ?? HEALTH_LOT,
		at,
		text: `handover run ${params.handover} (budget 5 m 0 s) at ${at}`,
		detail: params.detail,
	}
}

/** A duplicate-work finding, as rule 1 gives it, of the lot given (the case's lot by default). */
export function duplicateFinding(params: DuplicateFindingParams): HealthFinding {
	return {
		rule: params.rule ?? 'duplicate-work',
		severity: 'red',
		repository: REPOSITORY_FOLDER,
		lot: params.lot ?? HEALTH_LOT,
		at: params.at,
		text: 'tree 7a1b2c3d4e5f: hook ran 5 m 0 s although a green hook record existed',
		detail: [],
	}
}
