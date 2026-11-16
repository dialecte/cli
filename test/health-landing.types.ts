import type { CheckKey, GateRecord } from '../src/lib/gate-records/gate-records.types.ts'
import type { HealthFinding, HealthRule } from '../src/lib/health/health.types.ts'

/**
 * One commit hook run inside a handover run. With no `startAt` it starts when the hooks before it that have none
 * ended (the first after the guards); the events are written in the order of the list.
 */
export type HookSpec = {
	durationMs: number
	startAt?: string
	reuse?: 'none' | 'whole'
	key?: CheckKey
	outcome?: 'interrupted'
	/** The run has a start and no end. */
	noEnd?: boolean
}

/** A run of the lot: when it started and how long it took. */
export type TimedRunSpec = { startAt: string; durationMs: number }

/** The events of one lot's landing. */
export type LandingLotSpec = {
	/** The lot folder; the scratch lot by default. */
	name?: string
	hrStartAt?: string
	handoverMs: number
	guardsMs?: number
	hooks: HookSpec[]
	/** The handover run has a start and no end. */
	noHandoverEnd?: boolean
	/** Earlier handover runs of the lot, each short enough to be on budget. */
	previousHandovers?: TimedRunSpec[]
	rehearsals?: TimedRunSpec[]
}

/** One case of the landing rule; the lots of `otherLots` are written before `lot`. */
export type LandingCase = {
	name: string
	lot: LandingLotSpec
	otherLots?: LandingLotSpec[]
	records?: GateRecord[]
	duplicates?: HealthFinding[]
	expected: HealthFinding[]
}

export type LandingFindingParams = {
	severity: 'red' | 'amber'
	handover: string
	detail: string[]
	at?: string
	lot?: string
}

export type DuplicateFindingParams = { at: string; lot?: string; rule?: HealthRule }
