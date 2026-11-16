import type { LotEvent } from '../src/lib/events/event.types.ts'
import type {
	CheckKey,
	GateRecord,
	GateRecordMode,
	RecordedStep,
	RecordOrigin,
} from '../src/lib/gate-records/gate-records.types.ts'
import type { StepStatus } from '../src/lib/gate/gate.types.ts'

export type RunSpec = {
	step: string
	durationMs: number
	/** How long before the record's time the run ended (default 2 s). */
	endedBeforeMs?: number
	key?: CheckKey
	stateHash?: string | null
	reuse?: 'none' | 'whole'
	exit?: number
}

export type RunBeforeRecordParams = RunSpec & { lot: string; run: string; recordAt: string }

export type StepRunParams = {
	lot: string
	run: string
	step: string
	startAt: string
	endAt: string
	key?: CheckKey
	stateHash?: string | null
	reuse?: 'none' | 'whole'
	exit?: number
}

export type RecordParams = {
	mode: GateRecordMode
	at: string
	key?: CheckKey
	steps?: RecordedStep[]
	reused?: RecordOrigin
	origin?: 'rehearsal'
}

export type StepParams = {
	name: string
	status?: StepStatus
	stepHash?: string
	reused?: RecordOrigin
}

export type HealthLotInput = {
	name: string
	events?: LotEvent[]
	/** Lines written after the events, as they are (a broken line). */
	rawEventLines?: string[]
	/** A line written between the events: after the first `index` of them. */
	rawLineAmong?: { index: number; line: string }
	/** A rehearsal.json document, written as JSON. */
	rehearsal?: unknown
	/** A rehearsal.json written as this text. */
	rehearsalText?: string
}

export type WriteHealthCommonParams = {
	records?: GateRecord[]
	/** Store files named `<name>.json` holding broken text. */
	brokenStoreFiles?: string[]
	lots?: HealthLotInput[]
}

/** What a case compares of a finding: the severity, the one line, the last detail line and the lot. */
export type FindingSummary = {
	severity: string
	text: string
	last: string | undefined
	lot: string | undefined
}

/** A re-run finding as the store-pair rule words it; the defaults are a hook re-run of 10 minutes. */
export type ReRunSummaryParams = {
	severity?: 'red' | 'amber'
	rerunMode?: string
	greenMode?: string
	took?: string
	last: string
	greenAt?: string
	lot?: string | undefined
}

/** One case of the store-pair rule: the records, the runs the events hold, the re-run's time, the findings. */
export type StoreCase = {
	name: string
	records: GateRecord[]
	runs?: RunSpec[]
	rerunAt?: string
	expected: FindingSummary[]
}
