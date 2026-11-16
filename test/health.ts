/**
 * Scratch git common folders for the health rules: store files, event files and rehearsal plans written as whole
 * JSON documents, no git process.
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	COMMAND_ONE,
	GREEN_AT,
	HEAD,
	HEALTH_LOT,
	LINKED_ONE,
	LOCK_ONE,
	PLAN_LOT,
	RECORD_STATE,
	RERUN_AT,
	STEP_HASH_ONE,
	REPOSITORY_FOLDER,
	TREE,
	TREE_PREFIX,
} from './health.constants.ts'
import { temporaryFolder } from './scratch-repository.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type {
	CheckKey,
	GateRecord,
	RecordedStep,
} from '../src/lib/gate-records/gate-records.types.ts'
import type { HealthFinding, RehearsalPlan } from '../src/lib/health/health.types.ts'
import type {
	FindingSummary,
	HealthLotInput,
	ReRunSummaryParams,
	StoreCase,
	RecordParams,
	RunBeforeRecordParams,
	StepParams,
	StepRunParams,
	WriteHealthCommonParams,
} from './health.types.ts'

/** A new empty git common dir, `<temporary>/cli/.git`, removed when the test ends. */
export function createCommon(): string {
	const common = join(temporaryFolder('dialecte-health-'), REPOSITORY_FOLDER, '.git')
	mkdirSync(common, { recursive: true })
	return common
}

/** A common dir holding a copy of the folder `test/fixtures/<name>`. */
export function copyHealthFixture(params: { name: string }): string {
	const common = createCommon()
	const source = fileURLToPath(new URL(`./fixtures/${params.name}`, import.meta.url))
	cpSync(source, common, { recursive: true })
	return common
}

/** A common dir holding the records (one store file per tree), the lots and the broken files given. */
export function writeHealthCommon(params: WriteHealthCommonParams): string {
	const common = createCommon()
	writeStoreFiles({ common, params })
	for (const lot of params.lots ?? []) writeLot({ common, lot })
	return common
}

function writeStoreFiles(params: { common: string; params: WriteHealthCommonParams }): void {
	const { common } = params
	const folder = join(common, 'dialecte-checks')
	const records = params.params.records ?? []
	const brokenFiles = params.params.brokenStoreFiles ?? []
	if (records.length === 0 && brokenFiles.length === 0) return
	mkdirSync(folder, { recursive: true })
	const trees = [...new Set(records.map(treeOf))]
	for (const tree of trees) {
		const ofTree = records.filter((record) => treeOf(record) === tree)
		writeFileSync(join(folder, `${tree}.json`), `${JSON.stringify(ofTree, null, 2)}\n`)
	}
	for (const name of brokenFiles) writeFileSync(join(folder, `${name}.json`), '[{"mode": "hook", ')
}

function treeOf(record: GateRecord): string {
	return record.key?.tree ?? TREE
}

function writeLot(params: { common: string; lot: HealthLotInput }): void {
	const { lot } = params
	const folder = join(params.common, 'dialecte-lots', lot.name)
	mkdirSync(folder, { recursive: true })
	if (lot.events !== undefined || lot.rawEventLines !== undefined) {
		const lines = (lot.events ?? []).map((event) => JSON.stringify(event))
		if (lot.rawLineAmong !== undefined)
			lines.splice(lot.rawLineAmong.index, 0, lot.rawLineAmong.line)
		lines.push(...(lot.rawEventLines ?? []))
		writeFileSync(join(folder, 'events.jsonl'), `${lines.join('\n')}\n`)
	}
	if (lot.rehearsal !== undefined) {
		writeFileSync(join(folder, 'rehearsal.json'), `${JSON.stringify(lot.rehearsal, null, 2)}\n`)
	}
	if (lot.rehearsalText !== undefined)
		writeFileSync(join(folder, 'rehearsal.json'), lot.rehearsalText)
}

/** The check key of the scratch tree; a field given replaces its default. */
export function keyOf(params: Partial<CheckKey> = {}): CheckKey {
	return {
		tree: TREE,
		lockHash: LOCK_ONE,
		commandHash: COMMAND_ONE,
		linked: LINKED_ONE,
		...params,
	}
}

/** A recorded step, passed unless said otherwise. */
export function stepOf(params: StepParams): RecordedStep {
	const { name, status = 'passed', stepHash, reused } = params
	return {
		name,
		status,
		counts: {},
		...(stepHash === undefined ? {} : { stepHash }),
		...(reused === undefined ? {} : { reused }),
	}
}

/** The steps of a record of the older shape (no step hash); a contrib record holds the contrib steps. */
export function oldShapeSteps(params: { contrib?: boolean } = {}): RecordedStep[] {
	if (params.contrib === true) return [stepOf({ name: 'rules' }), stepOf({ name: 'release' })]
	return [stepOf({ name: 'check' }), stepOf({ name: 'test:hook' })]
}

/** A record: old-shape steps unless `steps` is given, the scratch key unless `key` is. */
export function recordOf(params: RecordParams): GateRecord {
	const { mode, at, key, steps, reused, origin } = params
	return {
		mode,
		at,
		head: HEAD,
		stateHash: RECORD_STATE,
		steps: steps ?? oldShapeSteps({ contrib: mode === 'contrib' }),
		key: key ?? keyOf(),
		...(reused === undefined ? {} : { reused }),
		...(origin === undefined ? {} : { origin }),
	}
}

/** A rehearsal plan with one lot (number 1) deciding on `tree`. */
export function rehearsalPlanOf(params: {
	at: string
	decision: 'reused' | 'rehearsed'
	reason: string
	tree?: string
}): RehearsalPlan {
	return {
		at: params.at,
		lots: [
			{
				lot: PLAN_LOT,
				tree: params.tree ?? TREE,
				decision: params.decision,
				reason: params.reason,
			},
		],
	}
}

/** The start and end events of one step run, with the envelope the cli writes. */
export function stepRunEvents(params: StepRunParams): LotEvent[] {
	const { lot, run, step, startAt, endAt, key, stateHash = null, reuse = 'none', exit = 0 } = params
	const shared = {
		schema: 1,
		lot,
		by: 'cli',
		pid: 4242,
		cli: '0.7.0',
		simulated: false,
		hostEvent: null,
		run,
		step,
		heavy: false,
		worktree: `/workspace/.worktrees/${lot}`,
		throwaway: false,
	} as const
	const start: LotEvent = { ...shared, id: `${run}-start`, at: startAt, kind: 'step.start' }
	const end: LotEvent = {
		...shared,
		id: `${run}-end`,
		at: endAt,
		kind: 'step.end',
		exit,
		durationMs: Date.parse(endAt) - Date.parse(startAt),
		stateHash,
		reuse,
		...(key === undefined ? {} : { key }),
	}
	return [start, end]
}

/** The events of a run of `durationMs` that ended `endedBeforeMs` (default 2 s) before the record's time. */
export function runBeforeRecord(params: RunBeforeRecordParams): LotEvent[] {
	const { recordAt, durationMs, endedBeforeMs = 2_000, ...rest } = params
	const endAt = new Date(Date.parse(recordAt) - endedBeforeMs).toISOString()
	const startAt = new Date(Date.parse(endAt) - durationMs).toISOString()
	return stepRunEvents({ ...rest, startAt, endAt })
}

/** The findings reduced to what a case compares. */
export function summarizeFindings(findings: HealthFinding[]): FindingSummary[] {
	return findings.map((finding) => ({
		severity: finding.severity,
		text: finding.text,
		last: finding.detail.at(-1),
		lot: finding.lot,
	}))
}

/** The summary of a store-pair finding: a hook re-run of 10 minutes after a green hook record, unless said otherwise. */
export function reRunSummary(params: ReRunSummaryParams): FindingSummary {
	const {
		severity = 'red',
		rerunMode = 'hook',
		greenMode = 'hook',
		took = '10 m 0 s',
		last,
		greenAt = GREEN_AT,
	} = params
	return {
		severity,
		text: `tree ${TREE_PREFIX}: ${rerunMode} ran ${took} although a green ${greenMode} record existed (${greenAt})`,
		last,
		lot: 'lot' in params ? params.lot : HEALTH_LOT,
	}
}

/** The steps of a record of the newer shape: one `tests` step carrying its hash. */
export function newShapeSteps(stepHash: string): RecordedStep[] {
	return [stepOf({ name: 'tests', stepHash })]
}

/** A green hook record of the older shape, at the green time. */
export function greenHook(): GateRecord {
	return recordOf({ mode: 'hook', at: GREEN_AT })
}

/** A green full record of the newer shape: a `tests` step holding the first step hash, at the green time. */
export function greenFullNew(): GateRecord {
	return recordOf({ mode: 'full', at: GREEN_AT, steps: newShapeSteps(STEP_HASH_ONE) })
}

/** A hook record of the older shape at the re-run time; `key` replaces fields of the scratch key. */
export function rerunHook(key: Partial<CheckKey> = {}): GateRecord {
	return recordOf({ mode: 'hook', at: RERUN_AT, key: keyOf(key) })
}

/** A hook-gate record at the re-run time holding `steps`; `key` replaces fields of the scratch key. */
export function rerunHookGate(params: {
	steps: RecordedStep[]
	key?: Partial<CheckKey>
}): GateRecord {
	return recordOf({ mode: 'hook-gate', at: RERUN_AT, steps: params.steps, key: keyOf(params.key) })
}

/** A common dir holding a store case's records and, in one lot, the runs it names (placed before the re-run's time). */
export function commonOfStoreCase(row: StoreCase): string {
	const events = (row.runs ?? []).flatMap((spec, index) =>
		runBeforeRecord({
			...spec,
			lot: HEALTH_LOT,
			run: `run-${index}`,
			recordAt: row.rerunAt ?? RERUN_AT,
		}),
	)
	return writeHealthCommon({
		records: row.records,
		lots: events.length === 0 ? [] : [{ name: HEALTH_LOT, events }],
	})
}
