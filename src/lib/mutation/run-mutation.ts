/** A planned mutation run carried out: filed in the store, its tiers run, reported, its survivors into the ledger. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { startStep } from '../events/record-step.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { mutantKeysOf } from './judge.ts'
import { itemsOf, readLedger, updateLedger } from './ledger.ts'
import {
	EMPTY_STRYKER_CONFIG_FILE,
	MUTANTS_WORK_FOLDER,
	TIMEOUT_STATUS,
} from './mutation.constants.ts'
import { readRecordsFile } from './records-file.ts'
import { finishRun, startRun } from './run-store.ts'
import { runTiers } from './run-tiers.ts'

import type {
	FailedRun,
	MutationReport,
	ReportedRun,
	RunCounts,
	RunEntry,
	RunFindings,
	RunPlan,
	StartTimeReader,
	StrykerRunner,
} from './mutation.types.ts'

/**
 * Runs the plan in the package at `root` as the `mutation` step of its lot's events: the run's entry written before
 * Stryker starts, replaced when it reports; a failed tier leaves the entry running until this process ends.
 */
export async function runMutation(params: {
	root: string
	plan: RunPlan
	runStryker: StrykerRunner
	startTimeOf: StartTimeReader
}): Promise<ReportedRun | FailedRun> {
	// the step's events: its lot from the worktree, never the branch the run is filed under; the end after the run file
	const recorder = startStep({ cwd: params.root, step: 'mutation', heavy: true })
	let stepExit = 1
	try {
		const reported = await reportRun(params)
		if ('failure' in reported) return reported
		stepExit = 0
		return { run: reported, ...findingsOf({ root: params.root, run: reported }) }
	} finally {
		recorder.end({ exit: stepExit, stateHash: null })
	}
}

/** The run filed, its tiers run in its work folder, its report in the store and the ledger, the work folder removed: the reported entry. */
async function reportRun(params: {
	root: string
	plan: RunPlan
	runStryker: StrykerRunner
	startTimeOf: StartTimeReader
}): Promise<RunEntry | FailedRun> {
	const { root, plan, runStryker, startTimeOf } = params
	const { declaration, targets } = plan
	const tree = computeStateTree(root)
	const entry = startRun({
		root,
		pid: process.pid,
		lot: plan.lot,
		tree,
		mode: plan.mode,
		...(plan.base !== undefined ? { base: plan.base } : {}),
		targets,
		startTimeOf,
	})
	const workDir = `${MUTANTS_WORK_FOLDER}/${entry.runId}`
	mkdirSync(join(root, workDir), { recursive: true })
	writeFileSync(join(root, workDir, EMPTY_STRYKER_CONFIG_FILE), '{}\n')
	const records = readRecordsFile({ root })
	const tiers = await runTiers({ root, declaration, targets, records, workDir, tree, runStryker })
	if ('failure' in tiers) return { failure: tiers.failure, runId: entry.runId }
	const finished = finishRun({
		root,
		runId: entry.runId,
		counts: countsOf(tiers.report),
		survivors: tiers.survivors,
		...mutantKeysOf({ report: tiers.report }),
	})
	updateLedger({ root, run: finished, records, targets })
	// the reports and sandboxes of a reported run: its entry and the ledger hold what it found
	rmSync(join(root, workDir), { recursive: true, force: true })
	return finished
}

/** Each survivor of the run the ledger now holds as new, and each item the run moved to killed or recorded. */
function findingsOf(params: { root: string; run: RunEntry }): RunFindings {
	const { root, run } = params
	const items = itemsOf({ ledger: readLedger({ root }), packageName: run.package })
	const pendingKeys = new Set(items.filter((item) => item.state === 'new').map((item) => item.key))
	return {
		fresh: (run.survivors ?? []).filter((survivor) => pendingKeys.has(survivor.key)),
		moved: items.filter((item) => item.movedBy === run.runId),
	}
}

function countsOf(report: MutationReport): RunCounts {
	const statuses = Object.values(report.files).flatMap(({ mutants }) =>
		mutants.map((mutant) => mutant.status),
	)
	function count(status: string): number {
		return statuses.filter((each) => each === status).length
	}
	return {
		killed: count('Killed'),
		survived: count('Survived'),
		timedOut: count(TIMEOUT_STATUS),
		noCoverage: count('NoCoverage'),
	}
}
