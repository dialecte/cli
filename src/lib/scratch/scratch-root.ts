import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { findWorkspace } from '../workspace.ts'
import {
	SCRATCH_VARIABLE,
	SYSTEM_SCRATCH_FOLDER,
	WORKSPACE_SCRATCH_FOLDER,
} from './scratch.constants.ts'

import type { ScratchContext } from './scratch.types.ts'

/**
 * The one folder every temporary folder of the cli is made in: `DIALECTE_SCRATCH` when set; else the workspace's
 * `.worktrees/_scratch` (the volume of the worktrees, the pool and the trash); else `dialecte-scratch` in the
 * system's temporary folder.
 */
export function scratchRoot(params: ScratchContext = {}): string {
	const chosen = (params.env ?? process.env)[SCRATCH_VARIABLE]
	if (chosen) return chosen
	const workspace = findWorkspace(params.cwd ?? process.cwd())
	return workspace === undefined
		? join(systemTemporaryFolder(), SYSTEM_SCRATCH_FOLDER)
		: join(workspace, WORKTREES_FOLDER, WORKSPACE_SCRATCH_FOLDER)
}

/** The system's temporary folder: read only here and by the readers of the scratch earlier versions left there. */
export function systemTemporaryFolder(): string {
	return tmpdir()
}
