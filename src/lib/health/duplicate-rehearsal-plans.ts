import { isGreenRecord } from '../gate-records/check-records.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import {
	DUPLICATE_RED_MS,
	DUPLICATE_TEXTS,
	REHEARSAL_ORIGIN,
	REHEARSAL_REUSABLE_MODES,
	REHEARSAL_STEP,
	REHEARSED_DECISION,
} from './health.constants.ts'
import { isClosedRun, isInWindow, runDurationMs, timeOf } from './record-run.ts'
import { shortHash } from './short-hash.ts'

import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { RehearsalDecision } from '../handover/handover.types.ts'
import type {
	ClosedLotRun,
	DuplicateWorkInput,
	HealthFinding,
	LotRun,
	RehearsalPlan,
} from './health.types.ts'

/**
 * Each lot a rehearsal plan re-ran although a green hook, hook-gate or full record of its tree existed before the
 * rehearsal started: one finding per rehearsed lot whose rehearsal run started in the window.
 */
export function findRehearsalPlans(params: DuplicateWorkInput): HealthFinding[] {
	const { repository, window, runs, recordsByTree } = params
	const findings: HealthFinding[] = []
	for (const lot of repository.lots) {
		const plan = lot.rehearsal
		if (plan === undefined) continue
		const run = findRehearsalRun({ runs: runs.filter((entry) => entry.lot === lot.name), plan })
		if (run === undefined || !isInWindow({ at: run.start.at, ...window })) continue
		for (const decision of plan.lots) {
			if (decision.decision !== REHEARSED_DECISION) continue
			const green = newestReusableBefore({
				records: recordsByTree.get(decision.tree) ?? [],
				before: timeOf(run.start.at),
			})
			if (green === undefined) continue
			findings.push(
				rehearsalFinding({ repository: repository.name, lot: lot.name, decision, green, run }),
			)
		}
	}
	return findings
}

/** The rehearsal run of the lot whose start and end hold the plan's time. */
function findRehearsalRun(params: {
	runs: readonly LotRun[]
	plan: RehearsalPlan
}): ClosedLotRun | undefined {
	const planAt = timeOf(params.plan.at)
	return params.runs
		.filter(isClosedRun)
		.find(
			(run) =>
				run.end.step === REHEARSAL_STEP &&
				timeOf(run.start.at) <= planAt &&
				planAt <= timeOf(run.end.at),
		)
}

/** The newest green record of a mode a rehearsal could reuse, written before the time. */
function newestReusableBefore(params: {
	records: readonly GateRecord[]
	before: number
}): GateRecord | undefined {
	let newest: GateRecord | undefined
	for (const record of params.records) {
		if (!REHEARSAL_REUSABLE_MODES.has(record.mode) || timeOf(record.at) >= params.before) continue
		if (!isGreenRecord(record)) continue
		if (newest === undefined || timeOf(record.at) > timeOf(newest.at)) newest = record
	}
	return newest
}

function rehearsalFinding(params: {
	repository: string
	lot: string
	decision: RehearsalDecision
	green: GateRecord
	run: ClosedLotRun
}): HealthFinding {
	const { repository, lot, decision, green, run } = params
	const durationMs = runDurationMs({ run })
	return {
		rule: 'duplicate-work',
		severity: durationMs >= DUPLICATE_RED_MS ? 'red' : 'amber',
		repository,
		lot,
		at: run.start.at,
		text: fillMessage({
			template: DUPLICATE_TEXTS.rehearsal,
			values: {
				tree: shortHash(decision.tree),
				lot: String(decision.lot),
				duration: formatDuration(durationMs),
				greenMode: green.mode,
				greenAt: green.at,
				rehearsal: green.origin === REHEARSAL_ORIGIN ? DUPLICATE_TEXTS.rehearsalSuffix : '',
			},
		}),
		detail: [
			fillMessage({
				template: DUPLICATE_TEXTS.planLine,
				values: { lot: String(decision.lot), decision: decision.decision, reason: decision.reason },
			}),
			DUPLICATE_TEXTS.planKey,
		],
	}
}
