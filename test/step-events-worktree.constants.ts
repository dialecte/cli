import { join } from 'node:path'

/** The time the worktree cases run at. */
export const WORKTREE_NOW = new Date('2026-11-10T11:00:00.000Z')

/** The lock a pooled `node_modules` is matched to: the repository commits it, the pool entry carries its hash. */
export const POOL_LOCK_TEXT = `${JSON.stringify(
	{
		name: 'repo',
		lockfileVersion: 3,
		packages: { '': { name: 'repo' }, 'node_modules/demo': { version: '1.0.0' } },
	},
	null,
	2,
)}\n`

/** The name of the pool entry the pooled case parks, and the time it was parked. */
export const POOL_ENTRY_NAME = '_pool-repo-1'
export const POOL_PARKED_AT = '2026-11-10T09:00:00.000Z'

/** A package of a main checkout's `node_modules`, which a start copies. */
export const COPIED_PACKAGE_FILE = join('node_modules', 'demo', 'package.json')
export const COPIED_PACKAGE_TEXT = '{ "name": "demo", "version": "1.0.0" }\n'

/** A second lot's brief: its own feature, branch and scope (the first lot's scope is `src/dataflow/`). */
export const SECOND_BRIEF = {
	feature: 'other-thing',
	branch: 'feat/other-thing',
	scope: ['src/index.ts'],
	lots: [{ paths: ['src/index.ts'], message: 'feat(index): another thing' }],
}

/** The lot the second brief makes (index 0002). */
export const SECOND_LOT_NAME = '0002-repo-other-thing'
