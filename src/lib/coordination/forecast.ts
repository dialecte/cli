/**
 * The conflict forecast of a lot's work against main and every open lot of its store (33CO section 4): each lot's
 * work is one snapshot commit, each comparison one `git merge-tree --write-tree`, in memory, without a checkout. A
 * comparison that cannot run in full reads unknown, never clean.
 */
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { findBaseBranchRef } from '../gate/gate-base.ts'
import { belowGitFloor, gitVersionOf } from '../git.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { mergedOfflineOf } from '../landing/met-lots.ts'
import { readPackageJson } from '../package-json.ts'
import {
	commonFolderOfLotFolder,
	isOpenRealLot,
	readCheckedLotState,
	registryOfLotFolder,
	settledLotStateInput,
} from '../store/lot-records.ts'
import { lotState } from '../store/lot-state.ts'
import { noLotRefusal } from '../store/resolve-lot.ts'
import { listLotFolderNames } from '../store/store-folder.ts'
import { runBoundedGit } from './bounded-git.ts'
import { isExclusivePath } from './exclusive-paths.ts'
import { overTimeReason } from './forecast-reasons.ts'
import { fitForecastLine } from './forecast-record.ts'
import {
	AGAINST_MAIN,
	FORECAST_REASONS,
	FORECAST_REFUSALS,
	FORECAST_SIMULATED_WORD,
	FORECAST_SCHEMA,
	FORECAST_STEP_LIMIT_MS,
	FORECAST_VERDICT_ORDER,
} from './forecast.constants.ts'
import { compareCommits, mergeConflictsOf, verdictOf } from './merge-forecast.ts'
import { openLotOf } from './open-lot.ts'
import { snapshotLotWork } from './snapshot.ts'

import type { StoreEntry } from '../handover/handover.types.ts'
import type { LotIdentity } from '../store/store.types.ts'
import type {
	Comparison,
	ComparisonOutcome,
	CopyIndex,
	ForecastLine,
	ForecastLotParams,
	ForecastOutcome,
	ForecastSettled,
	ForecastSide,
	ForecastVerdict,
	OpenLot,
	RunContext,
	TakenWork,
} from './forecast.types.ts'

/**
 * Runs the forecast of the lot: the comparison against main first, then one per other open real lot of its store
 * (only `against` when given, none with `mainOnly`), in store order. The lines are cut to the record's limits and not
 * yet written; the verdict is the worst of the lines (unknown > conflict > exclusive > clean). A lot that is gone,
 * damaged, simulated or no longer open has no forecast: its refusal, never a throw. Writes no worktree, index or ref.
 */
export function forecastLot(params: ForecastLotParams): ForecastOutcome {
	const startedAt = performance.now()
	const at = (params.now ?? currentTime)().toISOString()
	const run = `${at}-${randomBytes(2).toString('hex')}`
	const limitMs = params.stepLimitMs ?? FORECAST_STEP_LIMIT_MS
	const { lotFolder } = params
	const registry = registryOfLotFolder(lotFolder)
	const entries = readStoreEntries(registry)
	const selfLot = forecastableLotOf({ lotFolder, registry, entries })
	if ('refusal' in selfLot) return selfLot
	const openOthers = listLotFolderNames({ store: dirname(lotFolder) })
		.filter(
			(name) =>
				!params.mainOnly &&
				name !== selfLot.name &&
				(params.against === undefined || name === params.against),
		)
		.flatMap(function otherOf(name): OpenLot[] {
			const other = openLotOf({ lotFolder: join(dirname(lotFolder), name), registry, entries })
			return other === undefined ? [] : [other]
		})
	// a lot that merged on the host but was never closed holds nothing: left out, named (read only, no host)
	const merged = openOthers.flatMap(function mergedOf(other): ForecastSettled[] {
		if ('damage' in other) return []
		const read = mergedOfflineOf({ lotFolder: join(dirname(lotFolder), other.name) })
		return read === undefined ? [] : [read]
	})
	const others = openOthers.filter((other) => !merged.some((lot) => lot.name === other.name))
	const outcomes = comparisonsOf({
		self: selfLot,
		others,
		limitMs,
		copyIndex: params.copyIndex,
		// the main checkout: where main is read when the lot's own worktree is gone
		repository: dirname(commonFolderOfLotFolder(lotFolder)),
	})
	const of = outcomes.length
	const lines = outcomes.map((outcome) =>
		fitForecastLine(
			lineOf({ ...outcome, run, at, of, trigger: params.trigger, main: outcome.main }),
		),
	)
	return {
		run,
		lines,
		verdict: worstVerdictOf(lines.map((line) => line.verdict)),
		durationMs: Math.round(performance.now() - startedAt),
		settled: merged,
	}
}

/** The worst of the verdicts (clean for none). */
export function worstVerdictOf(verdicts: readonly ForecastVerdict[]): ForecastVerdict {
	return verdicts.reduce<ForecastVerdict>(
		(worst, verdict) =>
			FORECAST_VERDICT_ORDER.indexOf(verdict) > FORECAST_VERDICT_ORDER.indexOf(worst)
				? verdict
				: worst,
		'clean',
	)
}

/** Every comparison of the run: against main, then against each other lot. */
function comparisonsOf(params: {
	self: { name: string; identity: LotIdentity }
	others: readonly OpenLot[]
	limitMs: number
	copyIndex?: CopyIndex
	repository: string
}): Comparison[] {
	const { self, others, limitMs } = params
	const worktree = worktreeOf(self.identity)
	const missingSelf = fillMessage({
		template: FORECAST_REASONS.worktreeMissing,
		values: { lot: self.name },
	})
	function unknownAll(params: { reason: string; main: Comparison['main'] }): Comparison[] {
		const { reason, main } = params
		const nullSide: ForecastSide = { commit: null, snapshot: null, dirty: null }
		return [
			{ against: AGAINST_MAIN, self: nullSide, main, outcome: { verdict: 'unknown', reason } },
			...others.map((other) => ({
				against: other.name,
				self: nullSide,
				other: nullSide,
				main,
				outcome: { verdict: 'unknown' as const, reason },
			})),
		]
	}
	const main = mainOf({ root: worktree ?? params.repository, limitMs })
	const mainSide = { ref: main.ref, commit: 'commit' in main ? main.commit : null }
	if (worktree === undefined) return unknownAll({ reason: missingSelf, main: mainSide })
	const versionReason = gitVersionReason({ root: worktree, lot: self.name, limitMs })
	if (versionReason !== undefined) return unknownAll({ reason: versionReason, main: mainSide })
	const selfWork = snapshotLotWork({
		worktree,
		lot: self.name,
		stepLimitMs: limitMs,
		copyIndex: params.copyIndex,
	})
	const againstMain = compareWithMain({
		root: worktree,
		limitMs,
		lot: self.name,
		main,
		work: selfWork,
	})
	const context: RunContext = {
		root: worktree,
		limitMs,
		selfName: self.name,
		main,
		self: selfWork,
		selfMainPaths: conflictPathsOf(againstMain),
	}
	return [
		{ against: AGAINST_MAIN, self: sideOf(selfWork), main: mainSide, outcome: againstMain },
		...others.map((other) => ({
			against: other.name,
			self: sideOf(selfWork),
			...pairOf({ context, other }),
			main: mainSide,
		})),
	]
}

/** The comparison of the lot's work with main; unknown when either does not resolve. */
function compareWithMain(params: {
	root: string
	limitMs: number
	lot: string
	main: RunContext['main']
	work: TakenWork
}): ComparisonOutcome {
	const { main, work } = params
	if ('reason' in main) return { verdict: 'unknown', reason: main.reason }
	if ('reason' in work) return { verdict: 'unknown', reason: work.reason }
	return compareCommits({
		root: params.root,
		ours: main.commit,
		theirs: work.snapshot,
		lot: params.lot,
		limitMs: params.limitMs,
	})
}

/**
 * The comparison with another open lot: unknown when it is damaged, its worktree is missing or its work cannot be
 * taken; else the merge of both works, a path that conflicts against main for either lot left to that main line.
 */
function pairOf(params: { context: RunContext; other: OpenLot }): {
	other: ForecastSide
	outcome: ComparisonOutcome
} {
	const { context, other } = params
	const nullSide: ForecastSide = { commit: null, snapshot: null, dirty: null }
	if ('damage' in other)
		return {
			other: nullSide,
			outcome: {
				verdict: 'unknown',
				reason: fillMessage({
					template: FORECAST_REASONS.damaged,
					values: { lot: other.name, damage: other.damage },
				}),
			},
		}
	const worktree = worktreeOf(other.identity)
	if (
		worktree === undefined ||
		!isWorktreeOf({ worktree, root: context.root, limitMs: context.limitMs })
	)
		return {
			other: nullSide,
			outcome: {
				verdict: 'unknown',
				reason: fillMessage({
					template: FORECAST_REASONS.worktreeMissing,
					values: { lot: other.name },
				}),
			},
		}
	const otherWork = snapshotLotWork({ worktree, lot: other.name, stepLimitMs: context.limitMs })
	const side = sideOf(otherWork)
	if ('reason' in otherWork)
		return { other: side, outcome: { verdict: 'unknown', reason: otherWork.reason } }
	if ('reason' in context.self)
		return { other: side, outcome: { verdict: 'unknown', reason: context.self.reason } }
	const outcome = compareCommits({
		root: context.root,
		ours: context.self.snapshot,
		theirs: otherWork.snapshot,
		lot: context.selfName,
		limitMs: context.limitMs,
	})
	if (outcome.verdict === 'unknown' || outcome.conflicts.length === 0)
		return { other: side, outcome: withSharedLockFile(outcome) }
	const otherMainPaths =
		'commit' in context.main
			? pathsOfMerge(
					mergeConflictsOf({
						root: context.root,
						ours: context.main.commit,
						theirs: otherWork.snapshot,
						lot: other.name,
						limitMs: context.limitMs,
					}),
				)
			: new Set<string>()
	const conflicts = outcome.conflicts.filter(
		(conflict) => !context.selfMainPaths.has(conflict.path) && !otherMainPaths.has(conflict.path),
	)
	return {
		other: side,
		outcome: withSharedLockFile({ ...outcome, verdict: verdictOf(conflicts), conflicts }),
	}
}

/** A clean pair whose lots both change a lock file reads exclusive (decision Q2), even when git merges it clean. */
function withSharedLockFile(outcome: ComparisonOutcome): ComparisonOutcome {
	if (outcome.verdict !== 'clean' || !outcome.shared.some(isExclusivePath)) return outcome
	return { ...outcome, verdict: 'exclusive' }
}

/** The paths a comparison conflicts on (none for a clean or unknown one). */
function conflictPathsOf(outcome: ComparisonOutcome): ReadonlySet<string> {
	return new Set(
		outcome.verdict === 'unknown' ? [] : outcome.conflicts.map((conflict) => conflict.path),
	)
}

/** The paths a merge conflicts on (none when it could not run). */
function pathsOfMerge(merged: ReturnType<typeof mergeConflictsOf>): ReadonlySet<string> {
	return new Set('reason' in merged ? [] : merged.conflicts.map((conflict) => conflict.path))
}

/** The side of a line for a lot's work taken: its commits, or nulls when it could not be taken. */
function sideOf(work: TakenWork): ForecastSide {
	return 'reason' in work
		? { commit: null, snapshot: null, dirty: null }
		: { commit: work.commit, snapshot: work.snapshot, dirty: work.dirty }
}

/** The line of a comparison. */
function lineOf(
	params: Comparison & { run: string; at: string; of: number; trigger: ForecastLine['trigger'] },
): ForecastLine {
	const { outcome } = params
	return {
		schema: FORECAST_SCHEMA,
		run: params.run,
		at: params.at,
		trigger: params.trigger,
		of: params.of,
		self: params.self,
		main: params.main,
		against: params.against,
		...(params.other ? { other: params.other } : {}),
		verdict: outcome.verdict,
		...(outcome.verdict === 'unknown'
			? { reason: outcome.reason }
			: { shared: outcome.shared, conflicts: outcome.conflicts }),
	}
}

/** Why this git cannot forecast (no merge-tree --write-tree, no version at all, or over the limit); undefined when it can. */
function gitVersionReason(params: {
	root: string
	lot: string
	limitMs: number
}): string | undefined {
	const result = runBoundedGit({ root: params.root, args: ['--version'], limitMs: params.limitMs })
	if (result.timedOut) return overTimeReason({ lot: params.lot, limitMs: params.limitMs })
	const parsed = gitVersionOf({ text: result.stdout })
	if (parsed !== undefined && !belowGitFloor({ version: parsed })) return undefined
	const version = parsed?.version ?? (result.stdout.trim() || 'unknown')
	return fillMessage({ template: FORECAST_REASONS.gitVersion, values: { version } })
}

/** Main: origin's copy of the base branch (`origin/<base>`), never fetched here, with its commit or why none. */
function mainOf(params: { root: string; limitMs: number }): RunContext['main'] {
	const { root, limitMs } = params
	const base = findBaseBranchRef({ root, packageJson: readPackageJson(root) })
	const ref = 'refusal' in base ? `origin/${AGAINST_MAIN}` : `origin/${base.branch}`
	const resolved = runBoundedGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `refs/remotes/${ref}^{commit}`],
		limitMs,
	})
	if (resolved.timedOut) return { ref, reason: overTimeReason({ lot: ref, limitMs }) }
	if (resolved.status !== 0 || 'refusal' in base)
		return { ref, reason: fillMessage({ template: FORECAST_REASONS.noRef, values: { ref } }) }
	return { ref, commit: resolved.stdout.trim() }
}

/** The lot's worktree folder when it is still there; undefined when the identity names none or it is gone. */
function worktreeOf(identity: LotIdentity): string | undefined {
	const { worktree } = identity
	return worktree !== null && existsSync(join(worktree, '.git')) ? worktree : undefined
}

/** Whether `worktree` is a worktree of the repository of `root` (the same git common folder). */
function isWorktreeOf(params: { worktree: string; root: string; limitMs: number }): boolean {
	const { limitMs } = params
	const theirs = commonFolderOf({ folder: params.worktree, limitMs })
	return theirs !== undefined && theirs === commonFolderOf({ folder: params.root, limitMs })
}

/** The git common folder of a folder's repository; undefined when git cannot tell. */
function commonFolderOf(params: { folder: string; limitMs: number }): string | undefined {
	const result = runBoundedGit({
		root: params.folder,
		args: ['rev-parse', '--git-common-dir'],
		limitMs: params.limitMs,
	})
	return result.status === 0 ? resolve(params.folder, result.stdout.trim()) : undefined
}

/** The lot whose forecast runs: an open real lot with its identity, or why it has none. */
function forecastableLotOf(params: {
	lotFolder: string
	registry: string
	entries: readonly StoreEntry[]
}): { name: string; identity: LotIdentity } | { refusal: string } {
	const { lotFolder, registry } = params
	const lot = basename(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry, entries: params.entries })
	if (checked === undefined) return { refusal: noLotRefusal(lot) }
	if ('damage' in checked)
		return {
			refusal: fillMessage({
				template: FORECAST_REFUSALS.damaged,
				values: { lot, damage: checked.damage },
			}),
		}
	// a simulated lot is never open; named so, never by the state its scenario plays
	if (checked.input.identity.simulated)
		return {
			refusal: fillMessage({
				template: FORECAST_REFUSALS.notOpen,
				values: { lot, state: FORECAST_SIMULATED_WORD },
			}),
		}
	const input = settledLotStateInput({ input: checked.input, lotFolder, registry })
	if (input && isOpenRealLot(input)) return { name: lot, identity: input.identity }
	return {
		refusal: fillMessage({
			template: FORECAST_REFUSALS.notOpen,
			values: { lot, state: lotState(input ?? checked.input).state },
		}),
	}
}

/** The clock of a run when the caller gives none. */
function currentTime(): Date {
	return new Date()
}
