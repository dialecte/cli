/** A lot's work as one commit: HEAD plus the uncommitted work, never writing the worktree's index, refs or files. */
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { firstLineOf, runBoundedGit } from './bounded-git.ts'
import { overTimeReason } from './forecast-reasons.ts'
import {
	FORECAST_REASONS,
	FORECAST_STEP_LIMIT_MS,
	SNAPSHOT_ENVIRONMENT,
	SNAPSHOT_FOLDER_PREFIX,
	SNAPSHOT_MESSAGE,
} from './forecast.constants.ts'

import type { BoundedGitResult, CopyIndex, LotSnapshot } from './forecast.types.ts'

/**
 * The snapshot of the worktree's work: HEAD itself when `status` lists nothing; else a commit of HEAD plus every
 * change git does not ignore, built on a copy of the worktree's index (`add -A`, `write-tree`, `commit-tree` with a
 * fixed identity and date, so the same work gives the same sha). Only unreferenced objects reach the object store.
 * The reason when a step fails or runs over its limit.
 */
export function snapshotLotWork(params: {
	worktree: string
	lot: string
	stepLimitMs?: number
	copyIndex?: CopyIndex
}): LotSnapshot | { reason: string } {
	const { worktree, lot } = params
	const limitMs = params.stepLimitMs ?? FORECAST_STEP_LIMIT_MS
	function step(step: {
		args: readonly string[]
		environment?: Readonly<Record<string, string>>
	}): BoundedGitResult {
		return runBoundedGit({ root: worktree, limitMs, ...step })
	}
	const head = step({ args: ['rev-parse', '--verify', 'HEAD^{commit}'] })
	if (head.status !== 0) return { reason: failureOf({ lot, limitMs, result: head }) }
	const commit = head.stdout.trim()
	const status = step({ args: ['status', '--porcelain=v2', '-z'] })
	if (status.status !== 0) return { reason: failureOf({ lot, limitMs, result: status }) }
	if (status.stdout === '') return { commit, snapshot: commit, dirty: false }
	const indexPath = step({ args: ['rev-parse', '--git-path', 'index'] })
	if (indexPath.status !== 0) return { reason: failureOf({ lot, limitMs, result: indexPath }) }
	const folder = mkdtempSync(join(tmpdir(), SNAPSHOT_FOLDER_PREFIX))
	try {
		const copy = join(folder, 'index')
		try {
			;(params.copyIndex ?? copyIndexFile)({
				from: resolve(worktree, indexPath.stdout.trim()),
				to: copy,
			})
		} catch (error) {
			return {
				reason: fillMessage({
					template: FORECAST_REASONS.snapshotFailed,
					values: { lot, message: (error as Error).message.split('\n')[0] ?? '' },
				}),
			}
		}
		const index = { GIT_INDEX_FILE: copy }
		const added = step({ args: ['add', '-A'], environment: index })
		if (added.status !== 0) return { reason: failureOf({ lot, limitMs, result: added }) }
		const tree = step({ args: ['write-tree'], environment: index })
		if (tree.status !== 0) return { reason: failureOf({ lot, limitMs, result: tree }) }
		const made = step({
			args: ['commit-tree', tree.stdout.trim(), '-p', commit, '-m', SNAPSHOT_MESSAGE],
			environment: SNAPSHOT_ENVIRONMENT,
		})
		if (made.status !== 0) return { reason: failureOf({ lot, limitMs, result: made }) }
		return { commit, snapshot: made.stdout.trim(), dirty: true }
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** Copies the index file byte for byte. */
function copyIndexFile(params: { from: string; to: string }): void {
	copyFileSync(params.from, params.to)
}

/** Why a snapshot step failed: over its limit, else the first line of git's message. */
function failureOf(params: { lot: string; limitMs: number; result: BoundedGitResult }): string {
	const { lot, limitMs, result } = params
	if (result.timedOut) return overTimeReason({ lot, limitMs })
	return fillMessage({
		template: FORECAST_REASONS.snapshotFailed,
		values: { lot, message: firstLineOf(result) },
	})
}
