/** Lots to stop and to read the result of: ready, stopped, with a run marker; the commands as a host calls them. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { lotResult } from '../src/commands/lot-result.ts'
import { lotStop } from '../src/commands/lot-stop.ts'
import { handoverLockPath } from '../src/lib/handover/handover-lock.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../src/lib/handover/handover.constants.ts'
import { lotsKeepingWorktrees } from '../src/lib/store/lot-keep.ts'
import { outcomeOf } from './call-outcome.ts'
import { STORE_WRITER_CLI } from './handover-store-scenario.constants.ts'
import { commitLotByHand, removeEntry } from './handover-store-scenario.ts'
import { LOT_CHANGES } from './lot-handover-workspace.constants.ts'
import {
	bytesOf,
	entryPathOf,
	startRealLot,
	writeLotHandover,
	writeTransition,
} from './lot-handover-workspace.ts'
import { QUESTION_LOT } from './lot-questions.constants.ts'
import { transitionFilesOf, writeAnswerFile } from './lot-questions.ts'
import { ANSWERED, RUN_STARTED_AT, STOP_NOW, STOP_REASON } from './lot-stop-workspace.constants.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { git } from './scratch-repository.ts'
import { answerOf, questionTransitionOf } from './store-records.ts'

import type { StopSeams } from '../src/commands/lot-stop.types.ts'
import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { CallOutcome } from './call-outcome.types.ts'
import type { LotHandoverWorkspace } from './lot-handover-workspace.types.ts'
import type { QuestionLot } from './lot-questions.types.ts'
import type { ReadyLot, SnapshotDifference } from './lot-stop-workspace.types.ts'

/** A real lot with its hand-over written into its folder (the registry entry `pending`, the lock held). */
export function readyLot(): ReadyLot {
	const lot = startRealLot()
	return { lot, name: writeLotHandover(lot) }
}

/** A real lot that asked q1, got the answer `fix`, and then had its hand-over written: ready, one answered question. */
export function readyLotWithAnsweredQuestion(): ReadyLot {
	const lot = startRealLot()
	writeTransition({
		lotFolder: lot.lotFolder,
		transition: questionTransitionOf({ seq: 2, number: 1 }),
	})
	writeAnswerFile({
		lotFolder: lot.lotFolder,
		record: { ...answerOf(1), answer: ANSWERED.answer, by: ANSWERED.by },
	})
	return { lot, name: writeLotHandover(lot) }
}

/** `lot stop <id> --reason <reason>` from `cwd` at `STOP_NOW`, with `--by` and `--json` when given. */
export function stopOf(params: {
	cwd: string
	id: string
	reason?: string
	by?: string
	json?: boolean
	seams?: StopSeams
}): CommandResult {
	return lotStop({
		cwd: params.cwd,
		argv: [
			params.id,
			'--reason',
			params.reason ?? STOP_REASON,
			...(params.by === undefined ? [] : ['--by', params.by]),
			...(params.json ? ['--json'] : []),
		],
		now: STOP_NOW,
		seams: params.seams,
	})
}

/** `lot stop` of a lot of `lot`'s workspace, by its full name, from the main checkout. */
export function stopLot(params: {
	lot: LotHandoverWorkspace
	by?: string
	json?: boolean
	seams?: StopSeams
}): CommandResult {
	return stopOf({
		cwd: params.lot.start.repository,
		id: params.lot.lotName,
		by: params.by,
		json: params.json,
		seams: params.seams,
	})
}

/** `lot stop` of a hand-written lot of the question tests, by its full name, from its repository. */
export function stopQuestionLot(params: { lot: QuestionLot; json?: boolean }): CommandResult {
	return stopOf({
		cwd: params.lot.workspace.repository,
		id: QUESTION_LOT,
		json: params.json,
	})
}

/** `lot result <id>` from `cwd` (`--json` unless `json` is false), the card computed with no repository cli. */
export function resultOf(params: { cwd: string; id: string; json?: boolean }): CommandResult {
	return lotResult({
		cwd: params.cwd,
		argv: [params.id, ...(params.json === false ? [] : ['--json'])],
		probe: noRepositoryCli,
		cliPath: STORE_WRITER_CLI,
	})
}

/** `lot result` of a lot of `lot`'s workspace, by its full name, from the main checkout. */
export function resultOfLot(params: { lot: LotHandoverWorkspace; json?: boolean }): CommandResult {
	return resultOf({ cwd: params.lot.start.repository, id: params.lot.lotName, json: params.json })
}

/** Marks the folder as run by a live process (this one), as a real `handover run` does. */
export function writeLiveRunMarker(folder: string): void {
	writeFileSync(
		join(folder, HANDOVER_RUN_MARKER_FILE),
		JSON.stringify({ pid: process.pid, startedAt: RUN_STARTED_AT }),
	)
}

/** Commits the lot's changed files by hand with the lot's message: the lots are found committed in git, the registry untouched. */
export function commitReadyLotByHand(lot: LotHandoverWorkspace): void {
	commitLotByHand({
		root: lot.worktree,
		paths: Object.keys(LOT_CHANGES),
		message: 'feat(read): change lot',
	})
}

/** The registry entry of a ready lot taken out of the registry: its bytes, and the function that puts it back. */
export function detachEntry(ready: ReadyLot): { restore: () => void } {
	const path = entryPathOf(ready)
	const bytes = readFileSync(path, 'utf8')
	removeEntry({ root: ready.lot.start.repository, name: ready.name })
	return {
		restore() {
			writeFileSync(path, bytes)
		},
	}
}

/** Whether the repository's lock still names a hand-over: the lot's worktree holds it after `writeLotHandover`. */
export function lockHeld(lot: LotHandoverWorkspace): boolean {
	return existsSync(handoverLockPath(lot.worktree))
}

/** The abandoned marker of the lot folder, parsed; undefined when there is none. */
export function abandonedMarkerOf(lot: LotHandoverWorkspace): unknown {
	const path = join(lot.lotFolder, HANDOVER_FILES.abandoned)
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

/** Whether the lot's worktree folder and its branch ref are still there (a stop moves and deletes nothing). */
export function worktreeAndBranchOf(lot: LotHandoverWorkspace): {
	worktree: boolean
	branch: boolean
} {
	const identity = JSON.parse(readFileSync(join(lot.lotFolder, 'identity.json'), 'utf8')) as {
		branch: string
	}
	return {
		worktree: existsSync(lot.worktree),
		branch:
			git({ root: lot.start.repository, args: ['branch', '--list', identity.branch] }).trim() !==
			'',
	}
}

/** The worktrees the repository's lots keep against `lot close` and `worktree prune`, by real path. */
export function worktreesKept(lot: LotHandoverWorkspace): string[] {
	return [...lotsKeepingWorktrees({ repository: lot.start.repository }).keys()]
}

/** Every transition of the lot folder as `<seq>:<state>:<cause kind>`. */
export function transitionSummaryOf(lotFolder: string): string[] {
	return transitionFilesOf(lotFolder).map(
		(transition) => `${transition.seq}:${transition.state}:${transition.cause.kind}`,
	)
}

/**
 * Stops the lot twice from its main checkout: both exit codes (or the error a call threw), and whether the second
 * stop left every byte of the lot folder, the registry and the locks as the first left them.
 */
export function stopTwiceOf(lot: LotHandoverWorkspace): {
	first: number | string
	second: number | string
	secondWroteNothing: boolean
} {
	const first = outcomeOf(() => stopLot({ lot }))
	const before = bytesOf(lot)
	const second = outcomeOf(() => stopLot({ lot }))
	return {
		first: exitOrError(first),
		second: exitOrError(second),
		secondWroteNothing: JSON.stringify(bytesOf(lot)) === JSON.stringify(before),
	}
}

/**
 * A hand-over registered after a stop's re-read (case 59): the registry entry of the ready lot is taken out, the lot
 * stopped (nothing pending to find), the entry put back as a crossing `handover write` lands it late, the lot
 * stopped again. Both exit codes, or the error a call threw.
 */
export function stopLateWriteOf(ready: ReadyLot): {
	first: number | string
	second: number | string
} {
	const detached = detachEntry(ready)
	const first = outcomeOf(() => stopLot({ lot: ready.lot }))
	detached.restore()
	const second = outcomeOf(() => stopLot({ lot: ready.lot }))
	return { first: exitOrError(first), second: exitOrError(second) }
}

/** The exit code of a command's outcome, or the message of the error it threw. */
function exitOrError(outcome: CallOutcome<CommandResult>): number | string {
	return 'value' in outcome ? outcome.value.exitCode : outcome.error
}

/** The names added, removed and changed between two snapshots of one folder. */
export function differenceOf(params: {
	before: Record<string, string>
	after: Record<string, string>
}): SnapshotDifference {
	const { before, after } = params
	return {
		added: Object.keys(after).filter((name) => !(name in before)),
		removed: Object.keys(before).filter((name) => !(name in after)),
		changed: Object.keys(before).filter((name) => name in after && before[name] !== after[name]),
	}
}
