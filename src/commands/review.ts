/**
 * `dialecte lot delta <folder> --round <n> [--worktree] [--json]`: the fix diff a round-n reviewer reads,
 * per file, from the snapshot of round n-1 to the worktree now. `runDelta` runs it; `runReview` takes it under
 * the old word the table of the renamed forms gives it.
 */
import { resolve } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
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
	workTreeTopOf,
	worktreeStateRefusal,
} from '../lib/review-rounds/worktree-state.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { ReviewDelta } from '../lib/review-rounds/review-rounds.types.ts'

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
		return { exitCode: 1, output: `${verbPrefix('delta')}: ${(error as Error).message}` }
	}
}

function reviewDelta(params: { cwd: string; argv: string[]; now: Date }): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: ROUND_OPTIONS,
		flags: DELTA_FLAGS,
	})
	if (typeof read === 'string') return { exitCode: 2, output: `${DELTA_USAGE} (${read})` }
	const { words, flags } = read
	const round = parseRound(read.values.get('round'))
	if (words.length !== 1 || round === undefined || round < 2)
		return { exitCode: 2, output: DELTA_USAGE }
	const previous = round - 1
	const root = workTreeTopOf(params.cwd)
	if (!root)
		return {
			exitCode: 1,
			output: `${verbPrefix('delta')}: ${params.cwd} is in no git work tree: run it inside the lot's worktree`,
		}
	const folder = resolve(params.cwd, words[0])
	const folderRefusal = handoverFolderRefusal(folder)
	if (folderRefusal) return { exitCode: 1, output: `${verbPrefix('delta')}: ${folderRefusal}` }
	const state = readWorktreeState(root)
	const refusal =
		previousRoundRefusal({ root, folder, previous }) ?? worktreeStateRefusal({ root, state })
	if (refusal) return { exitCode: 1, output: `${verbPrefix('delta')}: ${refusal}` }
	const withWorktree = flags.has('worktree')
	const branch = withWorktree ? currentBranchOf(root) : undefined
	if (withWorktree && !branch)
		return {
			exitCode: 1,
			output: `${verbPrefix('delta')}: HEAD is detached in ${root}: --worktree starts its branch from the lot's branch`,
		}
	const delta: ReviewDelta = {
		round,
		previous: resolve(folder, `round-${previous}`),
		root,
		files: computeDelta({ root, folder, previous, state }),
	}
	if (branch) {
		const throwaway = addThrowaway({ root, folder, previous, branch, now: params.now })
		if (typeof throwaway === 'string')
			return { exitCode: 1, output: `${verbPrefix('delta')}: ${throwaway}` }
		delta.throwaway = throwaway
	}
	return {
		exitCode: 0,
		output: flags.has('json') ? JSON.stringify(delta, null, 2) : renderDelta(delta),
	}
}
