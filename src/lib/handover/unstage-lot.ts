/**
 * Unstages a lot's files after a failed commit. A git just stopped (a stalled hook killed) may still hold
 * `index.lock` for a moment: the reset is tried again while the lock is there, for a bounded time. The
 * answer says the truth: unstaged, or still staged and why.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import {
	INDEX_LOCK_RETRY_MILLISECONDS,
	INDEX_LOCK_WAIT_MILLISECONDS,
} from './handover.constants.ts'

import type { Clock } from '../progress/clock.types.ts'

export function unstageLot(params: {
	root: string
	paths: readonly string[]
	clock: Clock
}): { unstaged: true } | { unstaged: false; reason: string; lock?: string } {
	const { root, clock } = params
	const giveUpAt = clock.now() + INDEX_LOCK_WAIT_MILLISECONDS
	for (;;) {
		const reset = spawnSync('git', ['reset', '-q', '--', ...params.paths], {
			cwd: root,
			encoding: 'utf8',
		})
		if (reset.status === 0) return { unstaged: true }
		const lock = indexLockPath(root)
		const reason = (reset.stderr || reset.stdout || `git reset exited ${reset.status}`)
			.trim()
			.split('\n')[0]
		if (!lock || !existsSync(lock) || clock.now() >= giveUpAt)
			return { unstaged: false, reason, ...(lock && existsSync(lock) && { lock }) }
		clock.sleep(INDEX_LOCK_RETRY_MILLISECONDS)
	}
}

function indexLockPath(root: string): string | undefined {
	const result = spawnSync(
		'git',
		['rev-parse', '--path-format=absolute', '--git-path', 'index.lock'],
		{ cwd: root, encoding: 'utf8' },
	)
	return result.status === 0 ? result.stdout.trim() : undefined
}
