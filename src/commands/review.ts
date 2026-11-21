/**
 * `dialecte lot delta <folder> --round <n> [--worktree] [--json]`: the fix diff a round-n reviewer reads,
 * per file, from the snapshot of round n-1 to the worktree now. `runDelta` runs it; `runReview` takes it under
 * the old word the table of the renamed forms gives it.
 */
import { resolve } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { startStep } from '../lib/events/record-step.ts'
import { realPathThroughAncestors } from '../lib/file-system.ts'
import { jsonOf } from '../lib/print/print.ts'
import {
	addThrowaway,
	computeDelta,
	currentBranchOf,
	previousRoundRefusal,
	renderDelta,
} from '../lib/review-rounds/review-delta.ts'
import { lotVerbOfWord, verbPrefix } from '../lib/review-rounds/review-round-verbs.ts'
import {
	DELTA_FLAGS,
	DELTA_USAGE,
	ROUND_OPTIONS,
} from '../lib/review-rounds/review-rounds.constants.ts'
import { parseRound, readArguments } from '../lib/review-rounds/round-arguments.ts'
import {
	handoverFolderRefusal,
	readWorktreeState,
	worktreeStateRefusal,
} from '../lib/review-rounds/worktree-state.ts'
import { lotFolderOf } from '../lib/store/lot-folder.ts'
import { keptByDecision } from '../lib/store/lot-keep.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotTreeOf } from '../lib/store/lot-tree.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StepHandle } from '../lib/events/record-step.types.ts'
import type { ReviewDelta, ReviewDeltaCore } from '../lib/review-rounds/review-rounds.types.ts'

/** `lot delta` under its old word (`runReview({ argv: [<old word>, ...] })`). */
export function runReview(params: { cwd: string; argv: string[]; now: Date }): CommandResult {
	const [word, ...argv] = params.argv
	if (lotVerbOfWord({ command: 'review', word }) !== 'delta')
		return { exitCode: 2, output: renderLotUsage() }
	return runDelta({ cwd: params.cwd, argv, now: params.now })
}

/** `lot delta <folder> --round <n> [--worktree] [--json]`. */
export function runDelta(params: { cwd: string; argv: string[]; now: Date }): CommandResult {
	try {
		return reviewDelta(params)
	} catch (error) {
		return resultOf({ exitCode: 1, lines: [`${verbPrefix('delta')}: ${(error as Error).message}`] })
	}
}

function reviewDelta(params: { cwd: string; argv: string[]; now: Date }): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: ROUND_OPTIONS,
		flags: DELTA_FLAGS,
	})
	if (typeof read === 'string')
		return resultOf({ exitCode: 2, lines: [`${DELTA_USAGE} (${read})`] })
	const { words, flags } = read
	const round = parseRound(read.values.get('round'))
	if (words.length !== 1 || round === undefined || round < 2)
		return resultOf({ exitCode: 2, lines: [DELTA_USAGE] })
	const previous = round - 1
	const folder = resolve(params.cwd, words[0])
	// a store lot's own worktree from anywhere, else the cwd's: the tree its snapshot read
	const tree = lotTreeOf({ folder, cwd: params.cwd })
	if (tree === undefined)
		return resultOf({
			exitCode: 1,
			lines: [
				`${verbPrefix('delta')}: ${params.cwd} is in no git work tree: run it inside the lot's worktree`,
			],
		})
	if ('refusal' in tree)
		return resultOf({ exitCode: 1, lines: [`${verbPrefix('delta')}: ${tree.refusal}`] })
	const { root } = tree
	const folderRefusal = handoverFolderRefusal(folder)
	if (folderRefusal)
		return resultOf({ exitCode: 1, lines: [`${verbPrefix('delta')}: ${folderRefusal}`] })
	const state = readWorktreeState(root)
	const refusal =
		previousRoundRefusal({ root, folder, previous }) ?? worktreeStateRefusal({ root, state })
	if (refusal) return resultOf({ exitCode: 1, lines: [`${verbPrefix('delta')}: ${refusal}`] })
	const withWorktree = flags.has('worktree')
	const branch = withWorktree ? currentBranchOf(root) : undefined
	if (withWorktree && !branch)
		return resultOf({
			exitCode: 1,
			lines: [
				`${verbPrefix('delta')}: HEAD is detached in ${root}: --worktree starts its branch from the lot's branch`,
			],
		})
	const core: ReviewDeltaCore = {
		round,
		previous: resolve(folder, `round-${previous}`),
		root,
		files: computeDelta({ root, folder, previous, state }),
	}
	if (!branch) return deltaResult({ delta: core, json: flags.has('json') })
	// the step's events: in the lot `<id>` names (none for a folder that is no lot), once the path is decided
	const lotFolder = lotFolderOf({ folder })
	let recorder: StepHandle | undefined
	const throwaway = addThrowaway({
		root,
		folder,
		previous,
		branch,
		now: params.now,
		onPlanned: function startThrowawayStep(worktree) {
			recorder = startStep({
				cwd: root,
				step: 'throwaway-add',
				heavy: false,
				place:
					lotFolder === undefined
						? null
						: {
								lot: lotFolder,
								worktree: realPathThroughAncestors(worktree),
								throwaway: true,
							},
			})
		},
	})
	// after the throwaway exists (D12)
	recorder?.end({ exit: typeof throwaway === 'string' ? 1 : 0, stateHash: null })
	if (typeof throwaway === 'string')
		return resultOf({ exitCode: 1, lines: [`${verbPrefix('delta')}: ${throwaway}`] })
	// a kept lot's throwaway stays with it: no removal command, its keep named instead (KEEP 3.8)
	const kept = lotFolder === undefined ? undefined : keptOfLotFolder({ lotFolder })
	const delta: ReviewDelta =
		kept === undefined
			? { ...core, throwaway }
			: { ...core, throwaway: { path: throwaway.path, branch: throwaway.branch }, kept }
	return deltaResult({ delta, json: flags.has('json') })
}

/** `lot delta`'s answer: the delta as JSON, or its text. */
function deltaResult(params: { delta: ReviewDelta; json: boolean }): CommandResult {
	const { delta } = params
	return { exitCode: 0, output: params.json ? jsonOf(delta, 2) : renderDelta(delta) }
}

/** The keep text of the lot a delta resolved, read through the one lot reader; undefined when it is not kept. */
function keptOfLotFolder(params: { lotFolder: string }): string | undefined {
	const { lotFolder } = params
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	return keptByDecision({ keep: checked?.keep })
}
