/**
 * `dialecte mutants drop`'s removal of a finished run's entry from the store: an abandoned run, or a reported run
 * that is not the latest of its package and branch (the latest is that branch's evidence). It reads the runs, decides
 * and removes under the ledger lock, so a run reporting meanwhile is never missed: the lock takes every reported run
 * into the ledger first, so a dropped run's survivors are never lost.
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { compareRunsInFoldOrder, withLedgerLock } from './ledger.ts'
import {
	DROP_LATEST_REPORTED_REFUSAL,
	DROP_REPORTED_MEANWHILE_REFUSAL,
	PATH_SEPARATOR,
} from './mutation-agent.constants.ts'
import { MUTATION_RUNS_FOLDER } from './mutation.constants.ts'
import { mutationStoreFolderOf, readRuns } from './run-store.ts'

import type { DropResult } from './mutation-agent.types.ts'
import type { OwnerCheck, RunEntry } from './mutation.types.ts'

/**
 * Removes the entry of an abandoned run, or of a reported run that a newer reported run of its package and branch
 * follows; refuses a running or died run and the latest reported run of its branch.
 */
export function dropRun(
	params: {
		root: string
		runId: string
		/** A test seam: called under the ledger lock once the run passed every check, before its file is removed. */
		afterDecision?: () => void
	} & OwnerCheck,
): DropResult {
	const { root, runId, isAlive, startTimeOf, afterDecision } = params
	const store = mutationStoreFolderOf(root)
	const path = join(store, MUTATION_RUNS_FOLDER, `${runId}.json`)
	return withLedgerLock({
		root,
		work: function dropUnderLock(state): DropResult {
			const runs = readRuns({ root, isAlive, startTimeOf })
			const run = isRunId(runId) ? runs.find((entry) => entry.runId === runId) : undefined
			if (run === undefined || !existsSync(path))
				return {
					ok: false,
					reason: `no mutation run ${runId} in ${join(store, MUTATION_RUNS_FOLDER)}`,
				}
			if (run.state === 'running')
				return {
					ok: false,
					reason: `run ${runId} is running (process ${run.pid}): drop it once it reported and a newer run of the branch reported`,
				}
			if (run.state === 'died')
				return {
					ok: false,
					reason: `run ${runId} died before reporting: abandon it first: dialecte mutants abandon ${runId}`,
				}
			// reported after the lock folded the runs in: its survivors are not in the ledger yet
			if (run.state === 'reported' && !state.applied.has(runId))
				return { ok: false, reason: DROP_REPORTED_MEANWHILE_REFUSAL.replace('{runId}', runId) }
			if (run.state === 'reported' && isLatestReportedOfBranch({ run, runs }))
				return {
					ok: false,
					reason: DROP_LATEST_REPORTED_REFUSAL.replace('{runId}', runId).replace(
						'{branch}',
						run.branch,
					),
				}
			afterDecision?.()
			rmSync(path)
			return { ok: true }
		},
	})
}

/** A run id names a file of the runs folder: no path separator, no `.` or `..`. */
function isRunId(runId: string): boolean {
	return runId !== '' && runId !== '.' && runId !== '..' && !PATH_SEPARATOR.test(runId)
}

/** No other reported run of the run's package and branch comes after it in the ledger's fold order. */
function isLatestReportedOfBranch(params: { run: RunEntry; runs: readonly RunEntry[] }): boolean {
	const { run, runs } = params
	return !runs.some(
		(other) =>
			other.runId !== run.runId &&
			other.state === 'reported' &&
			other.package === run.package &&
			other.branch === run.branch &&
			compareRunsInFoldOrder(other, run) > 0,
	)
}
