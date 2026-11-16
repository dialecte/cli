import { isGreenRecord } from '../gate-records/check-records.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import {
	DIFFERED_PARTS,
	DUPLICATE_RED_MS,
	DUPLICATE_TEXTS,
	REHEARSAL_ORIGIN,
	STEP_FAMILY_OF_MODE,
	TEST_STEP_PREFIX,
} from './health.constants.ts'
import { findRecordRun, isInWindow, runDurationMs, timeOf } from './record-run.ts'
import { keyValues, shortHash } from './short-hash.ts'

import type { LotEvent } from '../events/event.types.ts'
import type { CheckKey, GateRecord, RecordedStep } from '../gate-records/gate-records.types.ts'
import type {
	ClosedLotRun,
	DuplicateWorkInput,
	HealthFinding,
	StorePairResult,
} from './health.types.ts'

/**
 * Each record in the window that ran something although an earlier green record of its tree could have answered
 * it: one finding per re-run, naming the newest such green record and the parts of the two keys that differ. A
 * record whose run was given `--no-reuse` is a deliberate re-run and is left out.
 */
export function findStorePairs(params: DuplicateWorkInput): StorePairResult {
	const { repository, window, runs, recordsByTree } = params
	const findings: HealthFinding[] = []
	const namedEnds = new Set<LotEvent>()
	for (const [, records] of recordsByTree) {
		for (const rerun of records) {
			if (!isInWindow({ at: rerun.at, ...window }) || !ranSomething(rerun)) continue
			const run = findRecordRun({ record: rerun, runs })
			// a run given --no-reuse re-checked on purpose: never duplicate work
			if (run?.end.noReuse === true) continue
			const green = newestGreenBefore({
				records,
				rerun,
				before: timeOf(run?.start.at ?? rerun.at),
			})
			if (green === undefined) continue
			if (run !== undefined) namedEnds.add(run.end)
			findings.push(storePairFinding({ repository: repository.name, green, rerun, run }))
		}
	}
	return { findings, namedEnds }
}

/** The record ran at least one step: it is not answered whole, and not every step was answered from a record. */
function ranSomething(record: GateRecord): boolean {
	return record.reused === undefined && record.steps.some(isRanStep)
}

function isRanStep(step: RecordedStep): boolean {
	return step.reused === undefined
}

/** The newest green record of the tree written before the time that could have answered the re-run. */
function newestGreenBefore(params: {
	records: readonly GateRecord[]
	rerun: GateRecord
	before: number
}): GateRecord | undefined {
	const { rerun, before } = params
	let newest: GateRecord | undefined
	for (const green of params.records) {
		if (green === rerun || timeOf(green.at) >= before || !isGreenRecord(green)) continue
		if (!isComparable({ green, rerun })) continue
		if (newest === undefined || timeOf(green.at) > timeOf(newest.at)) newest = green
	}
	return newest
}

/**
 * The green record could have answered the re-run. A re-run whose steps hold their hash: a step that ran has a
 * passed twin in the green record (same name, same hash). An older record: an older green record of the same mode,
 * a commit hook's two modes counted as one (a green record whose steps hold their hash is not the same check: the
 * commit hook writes one of each shape for one run).
 */
function isComparable(params: { green: GateRecord; rerun: GateRecord }): boolean {
	const { green, rerun } = params
	if (isNewShape(rerun)) {
		return rerun.steps.filter(isRanStep).some(function hasGreenTwin(step) {
			return green.steps.some(
				(twin) =>
					step.stepHash !== undefined &&
					twin.name === step.name &&
					twin.stepHash === step.stepHash &&
					twin.status === 'passed',
			)
		})
	}
	// one step family per mode, but the commit hook's two modes share theirs
	return !isNewShape(green) && STEP_FAMILY_OF_MODE[green.mode] === STEP_FAMILY_OF_MODE[rerun.mode]
}

/** The record's steps hold the hash of what they ran (a newer cli wrote it). */
function isNewShape(record: GateRecord): boolean {
	return record.steps.some((step) => step.stepHash !== undefined)
}

function storePairFinding(params: {
	repository: string
	green: GateRecord
	rerun: GateRecord
	run: ClosedLotRun | undefined
}): HealthFinding {
	const { repository, green, rerun, run } = params
	const durationMs = run === undefined ? undefined : runDurationMs({ run })
	const fromRehearsal = green.origin === REHEARSAL_ORIGIN
	const text = fillMessage({
		template: DUPLICATE_TEXTS.storePair,
		values: {
			tree: shortHash(rerun.key?.tree ?? ''),
			mode: rerun.mode,
			duration: durationMs === undefined ? DUPLICATE_TEXTS.unknownTime : formatDuration(durationMs),
			greenMode: green.mode,
			greenAt: green.at,
			rehearsal: fromRehearsal ? DUPLICATE_TEXTS.rehearsalSuffix : '',
		},
	})
	const detail = [
		fillMessage({
			template: DUPLICATE_TEXTS.greenLine,
			values: {
				mode: green.mode,
				at: green.at,
				rehearsal: fromRehearsal ? DUPLICATE_TEXTS.rehearsalMark : '',
				...keyValues(green.key),
			},
		}),
		fillMessage({
			template: DUPLICATE_TEXTS.rerunLine,
			values: { mode: rerun.mode, at: rerun.at, ...keyValues(rerun.key) },
		}),
		differedLine({ green, rerun }),
	]
	return {
		rule: 'duplicate-work',
		severity: storePairSeverity({ rerun, durationMs }),
		repository,
		...(run === undefined ? {} : { lot: run.lot }),
		at: rerun.at,
		text,
		detail,
	}
}

/** Red when the re-run took `DUPLICATE_RED_MS` or more, or took an unknown time and ran a test step; amber otherwise. */
function storePairSeverity(params: {
	rerun: GateRecord
	durationMs: number | undefined
}): HealthFinding['severity'] {
	const { rerun, durationMs } = params
	if (durationMs !== undefined) return durationMs >= DUPLICATE_RED_MS ? 'red' : 'amber'
	const ranTests = rerun.steps.some(
		(step) => isRanStep(step) && step.name.startsWith(TEST_STEP_PREFIX),
	)
	return ranTests ? 'red' : 'amber'
}

/** The parts of the two keys that differ, in the order install, linked, command (command on older records only). */
function differedLine(params: { green: GateRecord; rerun: GateRecord }): string {
	const { green, rerun } = params
	const parts = differedParts({
		green: green.key,
		rerun: rerun.key,
		withCommand: !isNewShape(rerun),
	})
	if (parts.length === 0) return DUPLICATE_TEXTS.sameKey
	return fillMessage({
		template: DUPLICATE_TEXTS.differed,
		values: { parts: parts.join(DUPLICATE_TEXTS.partsSeparator) },
	})
}

function differedParts(params: {
	green: CheckKey | undefined
	rerun: CheckKey | undefined
	withCommand: boolean
}): string[] {
	const { green, rerun, withCommand } = params
	const parts: string[] = []
	if (green?.lockHash !== rerun?.lockHash) parts.push(DIFFERED_PARTS.install)
	if (green?.linked !== rerun?.linked) parts.push(DIFFERED_PARTS.linked)
	if (withCommand && green?.commandHash !== rerun?.commandHash) parts.push(DIFFERED_PARTS.command)
	return parts
}
