/**
 * A lot with a review round taken and its throwaway made, by the cli's own code: `takeSnapshot` writes `round-1/` from
 * the lot worktree's changes, `addThrowaway` makes the throwaway on `<lot branch>-round-1` and copies the snapshot over
 * it, as `lot snapshot` and `lot delta --worktree` do.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { readCardsLog, writeRemoved, writeRemoving } from '../src/lib/events/cards-log.ts'
import { startStep } from '../src/lib/events/record-step.ts'
import { realPathThroughAncestors } from '../src/lib/file-system.ts'
import { addThrowaway } from '../src/lib/review-rounds/review-delta.ts'
import { takeSnapshot } from '../src/lib/review-rounds/snapshot-round.ts'
import { readWorktreeState } from '../src/lib/review-rounds/worktree-state.ts'
import { LANDING_NOW } from './landing-lot.constants.ts'
import { cardsLogOf } from './landing-lot.ts'
import { commitIn, landingHostOf } from './landing-repository.ts'
import {
	ALLOWED_NEW_LOT_FILES,
	KILLED_REMOVAL_ID,
	NO_JSON,
	ROUND_COMMIT_MESSAGE,
	THROWAWAY_LOT_BRANCH,
	THROWAWAY_WORKSPACE_NOW,
	WAITING_REMOVAL_ID,
} from './lot-prune-workspace.constants.ts'
import { git, initializeRepository, temporaryFolder, writeFiles } from './scratch-repository.ts'
import { createRecordingSpawner, readTree } from './worktree-pool.ts'

import type { LotPruneOutput, LotPruneParams } from '../src/commands/lot-prune.types.ts'
import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { Removal } from '../src/lib/events/cards-log.types.ts'
import type { StepHandle } from '../src/lib/events/record-step.types.ts'
import type { LandingLot } from './landing-lot.types.ts'
import type {
	PrunedItems,
	PruneRun,
	RecordedRound,
	ThrowawayWorkspace,
} from './lot-prune-workspace.types.ts'

/**
 * The workspace: a repository holding `committed` on `main`, a lot worktree on `feat/fix` with one commit of its own
 * and `changed` written in it (uncommitted: the round's state), round 1 snapshot into the lot folder, and the
 * throwaway made from it.
 */
export function createThrowawayWorkspace(params: {
	committed: Record<string, string>
	changed: Record<string, string>
	/** Run in the lot worktree after `changed` is written, before the snapshot (a `git mv`, a deletion). */
	beforeSnapshot?: (lotWorktree: string) => void
}): ThrowawayWorkspace {
	const top = realpathSync(temporaryFolder('dialecte-lot-prune-'))
	const repository = initializeRepository({ root: join(top, 'repo'), files: params.committed })
	const lotWorktree = join(top, '.worktrees', '0001-repo-fix')
	git({
		root: repository,
		args: ['worktree', 'add', '-q', '-b', THROWAWAY_LOT_BRANCH, lotWorktree],
	})
	writeFiles({ root: lotWorktree, files: { 'src/lot.ts': 'export const lot = 1\n' } })
	git({ root: lotWorktree, args: ['add', 'src/lot.ts'] })
	git({ root: lotWorktree, args: ['commit', '-q', '-m', 'feat: the lot'] })
	writeFiles({ root: lotWorktree, files: params.changed })
	params.beforeSnapshot?.(lotWorktree)
	const lotFolder = join(top, 'lots', '0001-repo-fix')
	mkdirSync(lotFolder, { recursive: true })
	takeSnapshot({
		root: lotWorktree,
		folder: lotFolder,
		round: 1,
		state: readWorktreeState(lotWorktree),
		at: THROWAWAY_WORKSPACE_NOW,
	})
	const made = addThrowaway({
		root: lotWorktree,
		folder: lotFolder,
		previous: 1,
		branch: THROWAWAY_LOT_BRANCH,
		now: THROWAWAY_WORKSPACE_NOW,
	})
	if (typeof made === 'string') throw new Error(made)
	return {
		repository,
		lotWorktree,
		lotBranch: THROWAWAY_LOT_BRANCH,
		lotFolder,
		throwaway: made.path,
		branch: made.branch,
		round: 1,
	}
}

/** Commits `files` on the lot's branch in its worktree (a fix landing there after the round): the new tip. */
export function commitOnLotBranch(params: {
	workspace: ThrowawayWorkspace
	files: Record<string, string>
}): string {
	const { lotWorktree } = params.workspace
	writeFiles({ root: lotWorktree, files: params.files })
	git({ root: lotWorktree, args: ['add', '--', ...Object.keys(params.files)] })
	git({ root: lotWorktree, args: ['commit', '-q', '-m', 'fix: after the round'] })
	return git({ root: lotWorktree, args: ['rev-parse', 'HEAD'] }).trim()
}

/**
 * A review round of a store lot taken and its throwaway made as `lot snapshot` and `lot delta --worktree` make them:
 * `changed` written in the lot's worktree, round `round` snapshot into the lot folder, the throwaway made on
 * `<lot branch>-round-<round>` and its `throwaway-add` step recorded in the lot's events (exit 0, or `exit`), then the
 * round's changes committed in the lot's worktree (its own worktree clean again). The throwaway's real path, branch and
 * tip.
 */
export function recordedRoundOf(params: {
	lot: LandingLot
	round: number
	changed: Record<string, string>
	/** The exit its `throwaway-add` step ends with; 0 when left out (1: the step a half-made throwaway leaves). */
	exit?: number
}): RecordedRound {
	const { lot, round } = params
	writeFiles({ root: lot.worktree, files: params.changed })
	takeSnapshot({
		root: lot.worktree,
		folder: lot.lotFolder,
		round,
		state: readWorktreeState(lot.worktree),
		at: LANDING_NOW,
	})
	let recorder: StepHandle | undefined
	const made = addThrowaway({
		root: lot.worktree,
		folder: lot.lotFolder,
		previous: round,
		branch: lot.branch,
		now: LANDING_NOW,
		onPlanned: function startThrowawayStep(worktree) {
			recorder = startStep({
				cwd: lot.worktree,
				step: 'throwaway-add',
				heavy: false,
				place: {
					lot: lot.lotFolder,
					worktree: realPathThroughAncestors(worktree),
					throwaway: true,
				},
			})
		},
	})
	recorder?.end({ exit: typeof made === 'string' ? 1 : (params.exit ?? 0), stateHash: null })
	if (typeof made === 'string') throw new Error(made)
	commitIn({ root: lot.worktree, files: params.changed, message: ROUND_COMMIT_MESSAGE })
	const path = realpathSync(made.path)
	return {
		path,
		branch: made.branch,
		tip: git({ root: path, args: ['rev-parse', 'HEAD'] }).trim(),
	}
}

/**
 * The arguments of `runLotPrune` from the lot's main checkout (or `cwd`): `argv` then `--json`, at the landing cases'
 * time, no process listed, no scratch root, a host that knows no pull request unless given, the background removals
 * recorded unless a spawner is given.
 */
export function lotPruneArgumentsOf(params: {
	lot: LandingLot
	argv: string[]
	cwd?: string
	host?: LotPruneParams['host']
	spawner?: LotPruneParams['spawner']
	now?: Date
	onPlanned?: LotPruneParams['onPlanned']
	afterThrowawayMove?: LotPruneParams['afterThrowawayMove']
}): LotPruneParams {
	return {
		cwd: params.cwd ?? params.lot.workspace.repository,
		argv: [...params.argv, '--json'],
		now: params.now ?? LANDING_NOW,
		host: params.host ?? landingHostOf({}).host,
		listProcesses: function none() {
			return []
		},
		spawner: params.spawner ?? createRecordingSpawner().spawner,
		scratchRoots: [],
		...(params.onPlanned !== undefined && { onPlanned: params.onPlanned }),
		...(params.afterThrowawayMove !== undefined && {
			afterThrowawayMove: params.afterThrowawayMove,
		}),
	}
}

/** The background removals a recording spawner held, run now: git's background removals finished. */
export function runRecordedRemovals(
	calls: readonly Parameters<NonNullable<LotPruneParams['spawner']>>[0][],
): void {
	for (const call of calls) spawnSync(call.command, call.args, { cwd: call.cwd })
}

/** The exit code and the `--json` output of a `lot prune` run; its text when it printed no JSON. */
export function pruneRunOf(result: CommandResult): PruneRun {
	try {
		return { exitCode: result.exitCode, output: JSON.parse(result.output) as LotPruneOutput }
	} catch {
		return {
			exitCode: result.exitCode,
			output: { lots: [], refused: [] },
			text: result.output || NO_JSON,
		}
	}
}

/** The items of the lot `lot` in a `lot prune --json` run, keyed `<item> <name>`: decision, and outcome after `--yes`. */
export function prunedItemsOf(params: { result: CommandResult; lot: string }): PrunedItems {
	const lot = pruneRunOf(params.result).output.lots.find((one) => one.lot === params.lot)
	return Object.fromEntries(
		(lot?.items ?? []).map((item) => [
			`${item.item} ${item.name}`,
			{
				decision: item.decision,
				...(item.outcome !== undefined && { outcome: item.outcome }),
			},
		]),
	)
}

/** The lot `lot` of a `lot prune --json` run, without its items; undefined when the run does not list it. */
export function prunedLotOf(params: {
	result: CommandResult
	lot: string
}): Omit<LotPruneOutput['lots'][number], 'items'> | undefined {
	const lot = pruneRunOf(params.result).output.lots.find((one) => one.lot === params.lot)
	if (lot === undefined) return undefined
	return {
		lot: lot.lot,
		state: lot.state,
		landing: lot.landing,
		simulated: lot.simulated,
		...(lot.stale !== undefined && { stale: lot.stale }),
	}
}

/** Every removal the lot's repository's `cards.log` holds: each `removing` line joined to its outcome. */
export function removalsOf(lot: LandingLot): Removal[] {
	return readCardsLog({ file: cardsLogOf(lot) }).removals
}

/**
 * A throwaway of the lot an earlier `lot prune` moved and deleted: its worktree removed by git, its `removing` line
 * (by `lot-prune`, its branch and that branch's tip) and its `removed` line (trashed) written; its branch left, waiting.
 */
export function writeWaitingThrowaway(params: { lot: LandingLot; round: RecordedRound }): void {
	const { lot, round } = params
	git({ root: lot.workspace.repository, args: ['worktree', 'remove', '--force', round.path] })
	const file = cardsLogOf(lot)
	mkdirSync(dirname(file), { recursive: true })
	writeRemoving({
		file,
		line: {
			id: WAITING_REMOVAL_ID,
			at: LANDING_NOW.toISOString(),
			lot: lot.name,
			item: 'throwaway',
			path: round.path,
			branch: round.branch,
			tip: round.tip,
			records: null,
			by: 'lot-prune',
		},
	})
	writeRemoved({
		file,
		line: {
			id: WAITING_REMOVAL_ID,
			at: LANDING_NOW.toISOString(),
			outcome: 'trashed',
			trashed: join(
				lot.workspace.workspace,
				'.worktrees',
				'_trash',
				`${basename(round.path)}-trashed`,
			),
		},
	})
}

/**
 * The repository's objects no ref nor reflog reaches pruned (`git reflog expire --expire=now --all`, `git gc
 * --prune=now`), as git's garbage collection leaves them; throws when `commit` is still there (the case's fixture).
 */
export function pruneUnreachable(params: { root: string; commit: string }): void {
	git({
		root: params.root,
		args: ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all'],
	})
	git({ root: params.root, args: ['gc', '-q', '--prune=now'] })
	const left = spawnSync('git', ['cat-file', '-e', `${params.commit}^{commit}`], {
		cwd: params.root,
	})
	if (left.status === 0) throw new Error(`${params.commit} is still in the repository after gc`)
}

/** Every file under `folder`, by path relative to it: its text. */
export function filesOf(folder: string): Record<string, string> {
	return existsSync(folder) ? readTree(folder) : {}
}

/**
 * A `removing` line of an earlier `lot prune` for the round's throwaway (by `lot-prune`, its branch and tip) with no
 * outcome line: that run was killed before the move.
 */
export function writeKilledRemoving(params: { lot: LandingLot; round: RecordedRound }): void {
	const { lot, round } = params
	const file = cardsLogOf(lot)
	mkdirSync(dirname(file), { recursive: true })
	writeRemoving({
		file,
		line: {
			id: KILLED_REMOVAL_ID,
			at: LANDING_NOW.toISOString(),
			lot: lot.name,
			item: 'throwaway',
			path: round.path,
			branch: round.branch,
			tip: round.tip,
			records: null,
			by: 'lot-prune',
		},
	})
}

/**
 * What changed between two reads of a folder beyond appended lines and the files a run may add (`landed.json`, an
 * archived declaration): each such path, sorted.
 */
export function changedBeyondAppends(params: {
	before: Record<string, string>
	after: Record<string, string>
}): string[] {
	const changed = Object.entries(params.before)
		.filter(
			([path, text]) => !(params.after[path] ?? '').startsWith(text) || !(path in params.after),
		)
		.map(([path]) => path)
	const added = Object.keys(params.after).filter(
		(path) => !(path in params.before) && !ALLOWED_NEW_LOT_FILES.includes(basename(path)),
	)
	return [...changed, ...added].sort()
}

/** The trash path a worktree moved into at `at` takes: `<workspace>/.worktrees/_trash/<name>-<yyyymmddThhmmss>`. */
export function trashPathAt(params: { lot: LandingLot; name: string; at: Date }): string {
	const stamp = params.at.toISOString().replace(/[-:]/g, '').slice(0, 'yyyymmddThhmmss'.length)
	return join(params.lot.workspace.workspace, '.worktrees', '_trash', `${params.name}-${stamp}`)
}
