/**
 * `dialecte mutants drop`'s removal of a finished run's entry from the store: an abandoned run, or a reported run the
 * ledger has taken in. It never folds runs in nor writes the ledger: a reported run no ledger reader took in yet is
 * refused, so its survivors are never lost.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { PATH_SEPARATOR } from './mutation-agent.constants.ts'
import { MUTATION_APPLIED_RUNS_FILE, MUTATION_RUNS_FOLDER } from './mutation.constants.ts'
import { mutationStoreFolderOf, readRuns } from './run-store.ts'

import type { DropResult } from './mutation-agent.types.ts'
import type { OwnerCheck } from './mutation.types.ts'

/** Removes the entry of an abandoned run, or of a reported run the ledger has taken in. */
export function dropRun(params: { root: string; runId: string } & OwnerCheck): DropResult {
	const { root, runId, isAlive, startTimeOf } = params
	const store = mutationStoreFolderOf(root)
	const path = join(store, MUTATION_RUNS_FOLDER, `${runId}.json`)
	const run = isRunId(runId)
		? readRuns({ root, isAlive, startTimeOf }).find((entry) => entry.runId === runId)
		: undefined
	if (run === undefined || !existsSync(path))
		return { ok: false, reason: `no mutation run ${runId} in ${join(store, MUTATION_RUNS_FOLDER)}` }
	if (run.state === 'running')
		return {
			ok: false,
			reason: `run ${runId} is running (process ${run.pid}): drop it once it reported and the ledger took it in`,
		}
	if (run.state === 'died')
		return {
			ok: false,
			reason: `run ${runId} died before reporting: abandon it first: dialecte mutants abandon ${runId}`,
		}
	if (run.state === 'reported' && !appliedRunsOf(store).includes(runId))
		return {
			ok: false,
			reason: `run ${runId} is not yet taken into the ledger: any ledger reader takes it in, e.g. dialecte mutants status; then drop it`,
		}
	rmSync(path)
	return { ok: true }
}

/** A run id names a file of the runs folder: no path separator, no `.` or `..`. */
function isRunId(runId: string): boolean {
	return runId !== '' && runId !== '.' && runId !== '..' && !PATH_SEPARATOR.test(runId)
}

/** The ids of the reported runs the ledger has taken in, as the store's file holds them. */
function appliedRunsOf(store: string): string[] {
	const path = join(store, MUTATION_APPLIED_RUNS_FILE)
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as string[]) : []
}
