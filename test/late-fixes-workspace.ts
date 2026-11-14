/**
 * Late-fix stories on a scratch store lot: real snapshots of its repository (the `.state` they write is the real
 * state hash), edits of the worktree, and `verify.jsonl` lines written by hand, so the code under test is only what
 * a case asserts on.
 */
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runRecordVerb } from '../src/commands/record.ts'
import { computeStateHash } from '../src/lib/gate-records/state-hash.ts'
import { roundNames } from '../src/lib/review-rounds/round-names.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { CAP_THREE_EFFORT, OTHER_STATE, SNAPSHOT_TIME } from './late-fixes-workspace.constants.ts'
import { createStationLot } from './lot-station-workspace.ts'
import { writeFiles } from './scratch-repository.ts'
import { setIdentityEffort, writeLotBrief } from './station-records-workspace.ts'

import type { LateFixesStep, StoryTarget } from './late-fixes-workspace.types.ts'
import type { StationLot } from './lot-station-workspace.types.ts'

/** A store lot of cap three whose story is `steps`; the repository is its worktree. */
export function lotWithStory(steps: readonly LateFixesStep[]): StationLot {
	const lot = createStationLot({ repositoryIsWorktree: true })
	setIdentityEffort({ lot, level: CAP_THREE_EFFORT })
	writeLotBrief({ lot, stepCount: 1 })
	playStory({ lot, steps })
	return lot
}

/** Plays the steps into the lot, in order. */
export function playStory(params: { lot: StoryTarget; steps: readonly LateFixesStep[] }): void {
	const { lot } = params
	for (const step of params.steps) {
		if ('snapshot' in step)
			takeRound({ lot, round: step.snapshot, withoutState: step.withoutState })
		else if ('edit' in step) writeFiles({ root: lot.cwd, files: step.edit })
		else if ('remove' in step) for (const file of step.remove) rmSync(join(lot.cwd, file))
		else if ('verifyHere' in step)
			appendVerifyLine({ lot, ...step.verifyHere, state: computeStateHash(lot.cwd) })
		else if ('verifyOther' in step)
			appendVerifyLine({ lot, ...step.verifyOther, state: OTHER_STATE })
		else appendFileSync(verifyFileOf(lot), step.raw)
	}
}

/** The lot's `verify.jsonl`. */
export function verifyFileOf(lot: Pick<StoryTarget, 'lotFolder'>): string {
	return join(lot.lotFolder, STORE_FILES.verify)
}

/** The text of the lot's `verify.jsonl`; undefined when there is none. */
export function verifyTextOf(lot: Pick<StoryTarget, 'lotFolder'>): string | undefined {
	return existsSync(verifyFileOf(lot)) ? readFileSync(verifyFileOf(lot), 'utf8') : undefined
}

/** The snapshot of `round` taken by `lot snapshot`; its `.state` removed when asked (a snapshot of an older cli). */
function takeRound(params: { lot: StoryTarget; round: number; withoutState?: true }): void {
	const { lot, round } = params
	const taken = runRecordVerb({
		verb: 'snapshot',
		cwd: lot.cwd,
		argv: [lot.lotFolder, '--round', String(round)],
		now: SNAPSHOT_TIME,
	})
	if (taken.exitCode !== 0)
		throw new Error(`the snapshot of round ${round} failed: ${taken.output}`)
	if (params.withoutState) rmSync(join(lot.lotFolder, roundNames(round).state))
}

/** The line `verify.jsonl` holds for a verification of `state` by `by`, with its line break: what `lot verify` writes. */
export function verifyLineOf(params: { by: string; note: string; state: string }): string {
	return `${JSON.stringify({
		schema: 1,
		at: SNAPSHOT_TIME.toISOString(),
		by: params.by,
		note: params.note,
		state: params.state,
	})}\n`
}

/** Appends one verify line to the lot's `verify.jsonl`. */
function appendVerifyLine(params: {
	lot: StoryTarget
	by: string
	note: string
	state: string
}): void {
	appendFileSync(verifyFileOf(params.lot), verifyLineOf(params))
}
