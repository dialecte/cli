/**
 * The gate and rules records in the worktree's git folder: what `dialecte gate` and `dialecte rules` write
 * after a run, what `handover run` writes after a commit's hook, and what the hand-over card reads back.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { readGit } from '../git.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'
import { storeCheckRecord } from './check-store.ts'
import {
	GATE_RECORD_FILE,
	HOOK_RECORD_MODE,
	REHEARSAL_ORIGIN,
	RULES_RECORD_FILE,
	UNRECORDED_STEPS,
} from './gate-records.constants.ts'
import { computeStateHash, hashStateTree } from './state-hash.ts'

import type { GateMode, StepResult } from '../gate/gate.types.ts'
import type { CaseStatus } from '../tdd/tdd.types.ts'
import type {
	CheckKey,
	GateRecord,
	GateRecordMode,
	RecordedStep,
	RulesRecord,
} from './gate-records.types.ts'

/** Where git keeps `name` for the worktree `root` is in (its own git folder in a linked worktree). */
function recordPathOf(params: { root: string; name: string }): string {
	const path = readGit({ root: params.root, args: ['rev-parse', '--git-path', params.name] })
	return resolve(params.root, path.trim())
}

function gateRecordName(mode: GateRecordMode): string {
	return GATE_RECORD_FILE.replace('{mode}', mode)
}

/** The record parsed; undefined when there is none or it cannot be read as JSON. */
function readRecord<Parsed>(params: { root: string; name: string }): Parsed | undefined {
	const path = recordPathOf(params)
	if (!existsSync(path)) return undefined
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as Parsed
	} catch {
		return undefined
	}
}

function writeRecord(params: { root: string; name: string; record: object }): void {
	writeFileSync(recordPathOf(params), `${JSON.stringify(params.record, null, 2)}\n`)
}

/** HEAD as a full sha. */
function readHead(root: string): string {
	return readGit({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/**
 * Records a gate run that reached its steps: the tdd step and the configured ones, in run order, with the
 * key of what it checked. A run refused at the hygiene records nothing. A run whose
 * configured steps ran also goes to the repository's store of records by tree; a run answered from a
 * record (`reused`) and a run stopped at its tdd step do not: they checked nothing of the tree. Answers
 * whether the record went to the store.
 */
export function recordGate(params: {
	root: string
	mode: GateMode
	results: StepResult[]
	/** What the run checked; absent when the state changed while the steps ran (the record is then not stored). */
	key?: CheckKey
	/**
	 * Without a key, the tree the steps started on: the record's state hash, so the card never reads the record
	 * as current for the state the steps left.
	 */
	checkedTree?: string
	/** The record the run was answered from: its time and HEAD. */
	reused?: { at: string; head: string }
}): boolean {
	const refused = params.results.some(
		(result) => UNRECORDED_STEPS.includes(result.step.name) && result.status === 'failed',
	)
	if (refused) return false
	const record: GateRecord = {
		mode: params.mode,
		at: new Date().toISOString(),
		head: readHead(params.root),
		stateHash: stateHashOf(params),
		steps: params.results
			.filter((result) => !UNRECORDED_STEPS.includes(result.step.name))
			.map(recordedStepOf),
		...(params.key && { key: params.key }),
		...(params.reused && { reused: params.reused }),
	}
	writeRecord({ root: params.root, name: gateRecordName(params.mode), record })
	const tddFailed = params.results.some(
		(result) => result.step.name === TDD_STEP.name && result.status === 'failed',
	)
	const stored = Boolean(params.key) && !params.reused && !tddFailed
	if (stored) storeCheckRecord({ root: params.root, record })
	return stored
}

/** The state hash a gate record holds: of the tree its key names, else of the tree its steps started on. */
function stateHashOf(params: { root: string; key?: CheckKey; checkedTree?: string }): string {
	const tree = params.key?.tree ?? params.checkedTree
	return tree ? hashStateTree(tree) : computeStateHash(params.root)
}

function recordedStepOf(result: StepResult): RecordedStep {
	return {
		name: result.step.name,
		status: result.status,
		counts: result.counts,
		...(result.note && { note: result.note }),
		...(result.reason && { reason: result.reason }),
		...(result.cases && { cases: result.cases }),
	}
}

/**
 * Records a commit's hook as a gate run of the tree it ran on: `key` taken before the commit (the hook runs
 * on the working files), `head` the commit it let through or HEAD when it failed, the steps its summary
 * names with their counts. The record goes to the worktree's git folder and to the store of `storeRoot`
 * (default `root`): a rehearsal stores it in the repository it cloned, marked as a rehearsal's.
 */
export function recordHook(params: {
	root: string
	key: CheckKey
	steps: RecordedStep[]
	/** The repository whose store holds the record, when the commit ran in a scratch clone of it. */
	storeRoot?: string
}): void {
	const record: GateRecord = {
		mode: HOOK_RECORD_MODE,
		at: new Date().toISOString(),
		head: readHead(params.root),
		stateHash: hashStateTree(params.key.tree),
		steps: params.steps,
		key: params.key,
		...(params.storeRoot && { origin: REHEARSAL_ORIGIN }),
	}
	writeRecord({ root: params.root, name: gateRecordName(HOOK_RECORD_MODE), record })
	storeCheckRecord({ root: params.storeRoot ?? params.root, record })
}

/** Records a rules run on the changed files. */
export function recordRules(params: {
	root: string
	files: string[]
	errors: number
	warnings: number
}): void {
	const record: RulesRecord = {
		at: new Date().toISOString(),
		head: readHead(params.root),
		stateHash: computeStateHash(params.root),
		files: params.files,
		errors: params.errors,
		warnings: params.warnings,
	}
	writeRecord({ root: params.root, name: RULES_RECORD_FILE, record })
}

/** The gate records of the worktree `root` is in, each mode that has one (a commit hook's among them). */
export function readGateRecords(root: string): GateRecord[] {
	const modes: GateRecordMode[] = ['fast', 'full', HOOK_RECORD_MODE]
	return modes.flatMap((mode) => readRecord<GateRecord>({ root, name: gateRecordName(mode) }) ?? [])
}

/**
 * The cases the gate's tdd step judged on the tree `stateHash` names, each label with its status there: from the latest gate
 * record of that tree whose tdd step listed them; undefined when no record of that tree did.
 */
export function readJudgedCases(params: {
	root: string
	stateHash: string
}): ReadonlyMap<string, CaseStatus> | undefined {
	const newestFirst = readGateRecords(params.root)
		.filter((record) => record.stateHash === params.stateHash)
		.sort((first, second) => second.at.localeCompare(first.at))
	for (const record of newestFirst) {
		const cases = record.steps.find((step) => step.name === TDD_STEP.name)?.cases
		if (cases) return new Map(cases.map((judged) => [judged.label, judged.status]))
	}
	return undefined
}

/** The rules record of the worktree `root` is in; undefined when none. */
export function readRulesRecord(root: string): RulesRecord | undefined {
	return readRecord<RulesRecord>({ root, name: RULES_RECORD_FILE })
}
