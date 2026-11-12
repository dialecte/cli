import { attributeSteps, stepIntervalOf } from './attribute-steps.ts'
import { STATION_KIND_PREFIX, STEP_FOREIGN_KIND, STEP_KIND_PREFIX } from './events.constants.ts'
import { firstEventOf, runsOfKind } from './pair-runs.ts'
import { FAILED_PART_STATUS } from './record-step.constants.ts'
import {
	FAST_GATE_FAMILY,
	FIXED_FINDING_STATE,
	FULL_GATE_FAMILY,
	GATE_RECORD_FAMILIES,
	INTERRUPTED_OUTCOME,
	MUTATION_FAMILY,
	PARTLY_REUSE,
	RECORD_GRACE_MS,
	SUITE_FAMILIES,
	TDD_FAMILIES,
	UNKNOWN_REASONS,
	WHOLE_REUSE,
} from './unrecorded-steps.constants.ts'

import type { EventRun, LotEvent } from './event.types.ts'
import type {
	CountSuitesParams,
	SuiteFamily,
	SuiteReport,
	SuiteRow,
	ThrowawayRow,
	WorktreeRecordTimes,
} from './unrecorded-steps.types.ts'

/**
 * Counts each step family of a lot with the unknown rules (spec 7): a capability false, a foreign run, a record no run
 * holds (per run and per worktree, `[start, end + 5 s]`), no witness, no event, the records gone. A family whose count
 * is unknown has `runs: null`, the counted runs as `atLeast`, and the reason named.
 */
export function countSuites(params: CountSuitesParams): SuiteReport {
	const stepRuns = runsOfKind({ runs: params.paired.runs, prefix: STEP_KIND_PREFIX })
	const stationRuns = runsOfKind({ runs: params.paired.runs, prefix: STATION_KIND_PREFIX })
	const owners = new Map(
		attributeSteps({ stationRuns, stepRuns, now: params.now }).map((step) => [
			step.run,
			step.owner,
		]),
	)
	const throwawayWorktrees = throwawayWorktreesOf({ params, stepRuns })
	const unrecorded = unrecordedFamilies({ params, stepRuns, throwawayWorktrees })
	const lotReason = lotReasonOf({ params })
	const foreign = foreignFamilies({ events: params.paired.events })
	const lotGone = params.worktree !== null && params.goneWorktrees.includes(params.worktree)
	const lotUnrecorded =
		params.worktree === null
			? new Set<SuiteFamily>()
			: (unrecorded.get(params.worktree) ?? new Set())
	const unreadable = new Map(
		params.records.map((times) => [times.worktree, unreadableFamiliesOf({ times })]),
	)
	const lotUnreadable =
		params.worktree === null
			? new Set<SuiteFamily>()
			: (unreadable.get(params.worktree) ?? new Set())
	const fixed = params.ledger.filter((finding) => finding.state === FIXED_FINDING_STATE).length
	const families = {} as Record<SuiteFamily, SuiteRow>
	const throwaways: Partial<Record<SuiteFamily, ThrowawayRow>> = {}
	for (const family of SUITE_FAMILIES) {
		const runs = stepRuns.filter((run) => familyOf({ run }) === family)
		const lotRuns = runs.filter((run) => !isThrowaway({ run }))
		const reason =
			lotReason ??
			(foreign.has(family) ? UNKNOWN_REASONS.foreign : null) ??
			(lotGone && family !== MUTATION_FAMILY ? UNKNOWN_REASONS.gone : null) ??
			(lotUnreadable.has(family) ? UNKNOWN_REASONS.unreadable : null) ??
			(lotUnrecorded.has(family) ? UNKNOWN_REASONS.unrecorded : null)
		families[family] = familyRow({
			runs: lotRuns,
			reason,
			limit: limitOf({ family, runs: lotRuns, steps: params.steps, rounds: params.rounds }),
			terminal: params.terminal,
			owners,
		})
		const throwawayRow = throwawayRowOf({
			family,
			runs: runs.filter((run) => isThrowaway({ run })),
			lotReason,
			gone: params.goneWorktrees,
			worktrees: throwawayWorktrees,
			unrecorded,
			unreadable,
			fixed,
		})
		if (throwawayRow !== undefined) throwaways[family] = throwawayRow
	}
	return { families, throwaways }
}

/** The reason every family of the lot is unknown, whatever ran: no event, a cli writing no step events, no trace. */
function lotReasonOf(params: { params: CountSuitesParams }): string | null {
	const { paired, records, mutationRuns, worktree } = params.params
	if (paired.events.length === 0) return UNKNOWN_REASONS.noEvent
	if (paired.events.some((event) => event.worktreeCli?.stepEvents === false))
		return UNKNOWN_REASONS.noStepEvents
	const stations = paired.events.some((event) => event.kind.startsWith(STATION_KIND_PREFIX))
	const steps = paired.events.some((event) => event.kind.startsWith(STEP_KIND_PREFIX))
	const recorded =
		records.some(
			(times) =>
				times.tdd === null ||
				times.tdd.length > 0 ||
				(times.unreadableGates?.length ?? 0) > 0 ||
				GATE_RECORD_FAMILIES.some(({ field }) => times[field] !== null),
		) || mutationRuns.some((run) => run.worktree === worktree)
	return stations && !steps && !recorded ? UNKNOWN_REASONS.noTrace : null
}

/** The families a worktree's records leave unknown: the tdd ones for a ledger, a gate's for its record, not read. */
function unreadableFamiliesOf(params: { times: WorktreeRecordTimes }): Set<SuiteFamily> {
	const { times } = params
	return new Set([...(times.tdd === null ? TDD_FAMILIES : []), ...(times.unreadableGates ?? [])])
}

/** The families a `step.foreign` event names. */
function foreignFamilies(params: { events: readonly LotEvent[] }): Set<string> {
	return new Set(
		params.events
			.filter((event) => event.kind === STEP_FOREIGN_KIND && typeof event.step === 'string')
			.map((event) => String(event.step)),
	)
}

/** The lot's throwaways (real paths): the worktrees of throwaway runs, and those the records or the gone list name. */
function throwawayWorktreesOf(params: {
	params: CountSuitesParams
	stepRuns: readonly EventRun[]
}): Set<string> {
	const { worktree, records, goneWorktrees } = params.params
	const named = [
		...params.stepRuns
			.filter((run) => isThrowaway({ run }))
			.map((run) => worktreeOf({ run }))
			.filter((path): path is string => path !== null),
		...records.map((times) => times.worktree),
		...goneWorktrees,
	]
	return new Set(named.filter((path) => path !== worktree))
}

/**
 * Per worktree, the families with a record no run of that worktree holds: the gate records, the tdd ledger entries
 * (an entry without its step: either tdd family), and the mutation run files of the lot's worktrees.
 */
function unrecordedFamilies(params: {
	params: CountSuitesParams
	stepRuns: readonly EventRun[]
	throwawayWorktrees: ReadonlySet<string>
}): Map<string, Set<SuiteFamily>> {
	const { stepRuns } = params
	const now = Date.parse(params.params.now)
	const found = new Map<string, Set<SuiteFamily>>()
	for (const times of params.params.records) {
		const { worktree } = times
		for (const { field, family, heldBy } of GATE_RECORD_FAMILIES) {
			const at = times[field]
			if (at === null) continue
			if (!isHeld({ stepRuns, worktree, at: Date.parse(at), families: [heldBy], now }))
				markFamilies({ found, worktree, families: [family] })
		}
		for (const entry of times.tdd ?? []) {
			const families = entry.step === null ? TDD_FAMILIES : [entry.step]
			if (!isHeld({ stepRuns, worktree, at: Date.parse(entry.at), families, now }))
				markFamilies({ found, worktree, families })
		}
	}
	for (const run of params.params.mutationRuns) {
		const { worktree } = run
		if (worktree !== params.params.worktree && !params.throwawayWorktrees.has(worktree)) continue
		const families = [MUTATION_FAMILY]
		if (!isHeld({ stepRuns, worktree, at: Date.parse(run.startedAt), families, now }))
			markFamilies({ found, worktree, families })
	}
	return found
}

/** Adds the families to the worktree's unheld ones. */
function markFamilies(params: {
	found: Map<string, Set<SuiteFamily>>
	worktree: string
	families: readonly SuiteFamily[]
}): void {
	const set = params.found.get(params.worktree) ?? new Set<SuiteFamily>()
	for (const family of params.families) set.add(family)
	params.found.set(params.worktree, set)
}

/** True when a run of one of the families, in that worktree, holds the time in `[start, end + 5 s]` (open: to now). */
function isHeld(params: {
	stepRuns: readonly EventRun[]
	worktree: string
	at: number
	families: readonly SuiteFamily[]
	now: number
}): boolean {
	return params.stepRuns.some((run) => {
		const family = familyOf({ run })
		if (family === null || !params.families.includes(family)) return false
		if (worktreeOf({ run }) !== params.worktree) return false
		const interval = stepIntervalOf({ run, openUntil: params.now })
		return (
			interval !== null &&
			interval.start <= params.at &&
			params.at <= interval.end + RECORD_GRACE_MS
		)
	})
}

/**
 * The most runs the process allows in the lot's worktree: S + max(R, 1) - 1 fast gates (a lot of no round still has
 * one per step); 1 full gate plus one per failed one.
 */
function limitOf(params: {
	family: SuiteFamily
	runs: readonly EventRun[]
	steps: number | null
	rounds: number | null
}): number | null {
	if (params.family === FAST_GATE_FAMILY)
		return params.steps === null || params.rounds === null
			? null
			: params.steps + Math.max(params.rounds, 1) - 1
	if (params.family === FULL_GATE_FAMILY)
		return (
			1 +
			params.runs.filter((run) => typeof run.end?.exit === 'number' && run.end.exit !== 0).length
		)
	return null
}

/** The count fields of a row: known or not, its limit and whether the count passes it. */
function countOf(params: {
	counted: number
	reason: string | null
	limit: number | null
}): ThrowawayRow {
	const known = params.reason === null
	return {
		runs: known ? params.counted : null,
		atLeast: params.counted,
		known,
		unknownReason: params.reason,
		limit: params.limit,
		over: known && params.limit !== null && params.counted > params.limit,
	}
}

/** One family's row in the lot's worktree: its count, interrupted runs, reuse, reruns, parts and owners. */
function familyRow(params: {
	runs: readonly EventRun[]
	reason: string | null
	limit: number | null
	terminal: boolean
	owners: ReadonlyMap<string, string>
}): SuiteRow {
	const row: SuiteRow = {
		...countOf({ counted: params.runs.length, reason: params.reason, limit: params.limit }),
		interrupted: 0,
		reused: 0,
		partlyReused: 0,
		reruns: 0,
		parts: {},
		failingPartsNotShown: 0,
		byStation: {},
	}
	for (const run of params.runs) {
		const { end } = run
		if (end?.outcome === INTERRUPTED_OUTCOME || (end === undefined && params.terminal))
			row.interrupted += 1
		if (end?.reuse === WHOLE_REUSE) row.reused += 1
		if (end?.reuse === PARTLY_REUSE) row.partlyReused += 1
		const parts = partsOf({ event: end })
		if (parts.some((part) => part.rerun === true)) row.reruns += 1
		for (const part of parts) {
			const counts = row.parts[part.name] ?? { ran: 0, reused: 0 }
			if (part.reused === true) counts.reused += 1
			else counts.ran += 1
			row.parts[part.name] = counts
		}
		if (typeof end?.partsFailedTotal === 'number') {
			const shown = parts.filter((part) => part.status === FAILED_PART_STATUS).length
			row.failingPartsNotShown += Math.max(0, end.partsFailedTotal - shown)
		}
		const owner = params.owners.get(run.run)
		if (owner !== undefined) row.byStation[owner] = (row.byStation[owner] ?? 0) + 1
	}
	return row
}

/**
 * The throwaway row of a family, when it ran in a throwaway or left a record there no run holds: its limit is the
 * number of fixed findings; unknown when a throwaway's records are gone or a record there is unheld.
 */
function throwawayRowOf(params: {
	family: SuiteFamily
	runs: readonly EventRun[]
	lotReason: string | null
	gone: readonly string[]
	worktrees: ReadonlySet<string>
	unrecorded: ReadonlyMap<string, ReadonlySet<SuiteFamily>>
	/** The families whose record cannot be read, by worktree. */
	unreadable: ReadonlyMap<string, ReadonlySet<SuiteFamily>>
	fixed: number
}): ThrowawayRow | undefined {
	const unheld = [...params.worktrees].some(
		(worktree) => params.unrecorded.get(worktree)?.has(params.family) === true,
	)
	if (params.runs.length === 0 && !unheld) return undefined
	const ranIn = params.runs.map((run) => worktreeOf({ run }) ?? '')
	const gone = ranIn.some((worktree) => params.gone.includes(worktree))
	const unreadable = ranIn.some(
		(worktree) => params.unreadable.get(worktree)?.has(params.family) === true,
	)
	const reason =
		params.lotReason ??
		(gone && params.family !== MUTATION_FAMILY ? UNKNOWN_REASONS.gone : null) ??
		(unreadable ? UNKNOWN_REASONS.unreadable : null) ??
		(unheld ? UNKNOWN_REASONS.unrecorded : null)
	return countOf({ counted: params.runs.length, reason, limit: params.fixed })
}

/** A step run's family, or `null` when its events name no step. */
function familyOf(params: { run: EventRun }): SuiteFamily | null {
	const { step } = firstEventOf({ run: params.run })
	return typeof step === 'string' ? (step as SuiteFamily) : null
}

/** The worktree a step run ran in (a real path), or `null` when its events name none. */
function worktreeOf(params: { run: EventRun }): string | null {
	const { worktree } = firstEventOf({ run: params.run })
	return typeof worktree === 'string' ? worktree : null
}

/** True for a run in a review throwaway. */
function isThrowaway(params: { run: EventRun }): boolean {
	return firstEventOf({ run: params.run }).throwaway === true
}

/** The parts a step end lists, as far as they hold a name. */
function partsOf(params: { event: LotEvent | undefined }): {
	name: string
	status?: unknown
	reused?: unknown
	rerun?: unknown
}[] {
	const parts = params.event?.parts
	if (!Array.isArray(parts)) return []
	return parts.filter(
		(part): part is { name: string } =>
			part !== null &&
			typeof part === 'object' &&
			typeof (part as { name?: unknown }).name === 'string',
	)
}
