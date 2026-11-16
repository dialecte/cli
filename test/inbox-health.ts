/** The inbox's health cases: a workspace whose repository common dir receives records, events and worktrees. */
import { cpSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runInbox } from '../src/commands/inbox.ts'
import { REHEARSAL_FOLDER_PREFIX } from '../src/lib/handover/handover.constants.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { FIRST_FILE_TIME } from './health-worktrees.constants.ts'
import { writeRegisteredWorktree } from './health-worktrees.ts'
import { FIXTURE_0105, HEALTH_LOT, LONG_RUN_MS } from './health.constants.ts'
import { recordOf, runBeforeRecord, stepRunEvents, writeHealthCommon } from './health.ts'
import {
	COMMITTED_LOT,
	HEALTH_INBOX_REPOSITORY,
	IDLE_WORKTREE_NAME,
	INBOX_HEALTH_NOW,
	READY_LOT,
	SCRATCH_AGE_MS,
	SCRATCH_NEXT,
	STALLED_LOT,
	STALLED_START_AT,
	STALLED_WORKTREE,
} from './inbox-health.constants.ts'
import { lotBranchOf, writeInboxLot } from './inbox-workspace.ts'
import { temporaryFolder } from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { DuplicateTimes, HealthInboxWorkspace, InboxHealthRun } from './inbox-health.types.ts'

/** A workspace named `cli` whose store holds one committed lot (so the store exists and nothing waits). */
export function createHealthInboxWorkspace(): HealthInboxWorkspace {
	const workspace = createBriefWorkspace({ repositoryFolder: HEALTH_INBOX_REPOSITORY })
	writeStoreLot({
		workspace,
		name: COMMITTED_LOT,
		scope: ['src/'],
		branch: lotBranchOf(COMMITTED_LOT),
		repository: workspace.repository,
		registry: 'committed',
	})
	return { workspace, common: dirname(workspace.registry) }
}

/** Adds a lot that is READY (it waits on someone). */
export function addReadyLot(target: HealthInboxWorkspace): void {
	writeInboxLot({ workspace: target.workspace, name: READY_LOT, kind: 'ready' })
}

/** Copies the real 0105 records, events and rehearsal plan into the common dir. */
export function addFixture0105(target: HealthInboxWorkspace): void {
	const source = fileURLToPath(new URL(`./fixtures/${FIXTURE_0105}`, import.meta.url))
	cpSync(source, target.common, { recursive: true })
}

/** Adds a green hook record and its re-run (a run of 10 minutes ended 2 s before the re-run's record). */
export function addDuplicateWork(params: {
	target: HealthInboxWorkspace
	times: DuplicateTimes
}): void {
	const { greenAt, rerunAt } = params.times
	const written = writeHealthCommon({
		records: [recordOf({ mode: 'hook', at: greenAt }), recordOf({ mode: 'hook', at: rerunAt })],
		lots: [
			{
				name: HEALTH_LOT,
				events: runBeforeRecord({
					lot: HEALTH_LOT,
					run: 'run-0',
					step: 'gate-hook',
					durationMs: LONG_RUN_MS,
					recordAt: rerunAt,
				}),
			},
		],
	})
	cpSync(written, params.target.common, { recursive: true })
}

/** Adds a working lot whose `gate-full` run started and never ended (the process id is gone for the run). */
export function addStalledLot(target: HealthInboxWorkspace): void {
	const folder = writeStoreLot({
		workspace: target.workspace,
		name: STALLED_LOT,
		scope: ['src/'],
		branch: lotBranchOf(STALLED_LOT),
		repository: target.workspace.repository,
		worktree: STALLED_WORKTREE,
	})
	const [start] = stepRunEvents({
		lot: STALLED_LOT,
		run: 'run-open',
		step: 'gate-full',
		startAt: STALLED_START_AT,
		endAt: INBOX_HEALTH_NOW.toISOString(),
	})
	writeFileSync(join(folder, 'events.jsonl'), `${JSON.stringify(start)}\n`)
}

/** Registers a worktree no lot holds and nobody touched for days. */
export function addIdleWorktree(target: HealthInboxWorkspace): void {
	writeRegisteredWorktree({
		common: target.common,
		name: IDLE_WORKTREE_NAME,
		path: temporaryFolder('dialecte-worktree-folder-'),
		indexAt: FIRST_FILE_TIME,
	})
}

/** A temporary folder holding one rehearsal scratch folder last touched 7 hours before the clock: the two paths. */
export function leakedScratchFolder(): { tmp: string; leaked: string } {
	const tmp = temporaryFolder('dialecte-inbox-tmp-')
	const leaked = join(tmp, `${REHEARSAL_FOLDER_PREFIX}leak`)
	mkdirSync(leaked)
	const touched = new Date(INBOX_HEALTH_NOW.getTime() - SCRATCH_AGE_MS)
	utimesSync(leaked, touched, touched)
	return { tmp, leaked }
}

/** The inbox line of the leaked scratch folder. */
export function scratchLineOf(leaked: string): string {
	return `! health  scratch  worktrees: 1 leaked scratch folder (oldest ${leaked}, 7 h 0 m old)  next: ${SCRATCH_NEXT}`
}

/** `inbox <words>` from the workspace's repository, the clock and the scratch folder injected, no process alive. */
export function inboxHealthIn(params: InboxHealthRun): CommandResult {
	const {
		workspace,
		words = [],
		now = INBOX_HEALTH_NOW,
		tmp = temporaryFolder('dialecte-inbox-tmp-'),
	} = params
	return runInbox({
		cwd: workspace.workspace.repository,
		argv: words,
		now,
		tmp,
		isAlive: () => false,
	})
}

/** The lines of an output that are health lines (their mark, a space, `health` and two spaces). */
export function healthLinesOf(output: string): string[] {
	return output.split('\n').filter((line) => /^[✗!] health {2}/.test(line))
}

/** The exit code and the health lines of a run. */
export function healthSummaryOf(result: CommandResult): { exitCode: number; lines: string[] } {
	return { exitCode: result.exitCode, lines: healthLinesOf(result.output) }
}
