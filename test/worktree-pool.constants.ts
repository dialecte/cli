/** What the tests of the node_modules pool, the trash, the verify worktree and `lot close` share. */

/** The bound of a case on a tiny fake node_modules in a temporary folder (renames, a few files): a guard against a hang. */
export const POOL_UNIT_CASE_MS = 30_000

/** The bound of a case that makes scratch repositories and worktrees and runs a command through them: a guard against a hang. */
export const POOL_COMMAND_CASE_MS = 120_000

/** The bound of a case that runs a whole hand-over rehearsal through a scratch clone: a guard against a hang. */
export const POOL_REHEARSAL_CASE_MS = 300_000

/** The bound of one background removal a case runs at once (a tiny scratch worktree): a guard against a hang. */
export const EXECUTED_REMOVE_MS = 30_000

/** The lock `lot close` is told a lockfile of: a locked package set that a fake node_modules does not match. */
export const MISMATCHED_LOCK_TEXT = `${JSON.stringify({
	name: 'demo',
	lockfileVersion: 3,
	packages: { '': { name: 'demo' }, 'node_modules/demo': { version: '2.0.0' } },
})}\n`

/** How long the `sleep` a case starts to hold a working folder lives at most (it is killed when the case ends). */
export const HOLDING_PROCESS_SECONDS = 120

/** How long a case waits for that process to have its working folder set: a guard against a hang. */
export const HOLDING_PROCESS_START_MS = 10_000

/** The lockfile text a pooled node_modules was checked against, and another one. */
export const LOCK_TEXT = '{"name":"demo","lockfileVersion":3,"packages":{}}\n'
export const OTHER_LOCK_TEXT = '{"name":"demo","lockfileVersion":3,"packages":{"x":{}}}\n'

/** The times the pool's entries are parked at, oldest first. */
export const PARK_TIMES = [
	new Date('2026-11-06T09:00:00Z'),
	new Date('2026-11-06T10:00:00Z'),
	new Date('2026-11-06T11:00:00Z'),
] as const

/** The fake node_modules' files: the one every test keeps, the two a park removes, and the marker a case reads back. */
export const KEPT_FILE = 'demo/index.js'
export const REMOVED_FILES = ['.vite/deps/chunk.js', '.cache/babel/entry.json'] as const
export const MARKER_FILE = 'marker.txt'

/** Where the link leaving the fake node_modules points, from `node_modules/@dialecte/core`. */
export const OUTSIDE_LINK = '../../../core'
