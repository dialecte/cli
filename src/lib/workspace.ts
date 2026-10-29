/** The workspace: the folder holding the repositories side by side, their `.worktrees/` and `_commit-plan/`. */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { WORKSPACE_MARKERS } from './workspace.constants.ts'

/** The nearest folder from `cwd` up that holds `_commit-plan/` or `.worktrees/`; undefined when none does. */
export function findWorkspace(cwd: string): string | undefined {
	let folder = cwd
	for (;;) {
		if (WORKSPACE_MARKERS.some((marker) => existsSync(join(folder, marker)))) return folder
		const parent = dirname(folder)
		if (parent === folder) return undefined
		folder = parent
	}
}
