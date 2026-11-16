/** The constants of the `worktree prune --reclaim` scene (test/reclaim-workspace.ts). */

/** One day in milliseconds. */
export const DAY_MS = 24 * 60 * 60 * 1000

/** How long ago every git file of a case was last written: idle for weeks. */
export const IDLE_DAYS = 20

/** The lock of the main checkout: installs `demo` 1.0.0, which the fake node_modules holds (its check passes). */
export const MAIN_LOCK = `${JSON.stringify({
	name: 'demo',
	lockfileVersion: 3,
	packages: { '': { name: 'demo' }, 'node_modules/demo': { version: '1.0.0' } },
})}\n`

/**
 * Another lock: the same `demo` plus an optional package npm may leave out (absent, so the fake node_modules still
 * passes its check against it), so another lock key than the main checkout's.
 */
export const OTHER_LOCK = `${JSON.stringify({
	name: 'demo',
	lockfileVersion: 3,
	packages: {
		'': { name: 'demo' },
		'node_modules/demo': { version: '1.0.0' },
		'node_modules/optional-tool': { version: '2.0.0', optional: true },
	},
})}\n`

/** What the main checkouts ignore: node_modules and an agent's `.tmp/`. */
export const IGNORED = 'node_modules\n.tmp/\n'

/** The files a person or an agent keeps in a worktree beside its code: none may move or change. */
export const PRESERVED_FILES = {
	'notes.md': 'untracked notes\n',
	'.tmp/notes.md': 'ignored agent notes\n',
	'.claude/settings.local.json': '{ "permissions": {} }\n',
} as const
