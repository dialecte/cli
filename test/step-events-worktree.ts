/** Workspaces for the step events of `worktree add` made by `lot start`: with no `node_modules`, a copied one, a pooled one. */
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createStartWorkspace } from './lot-start-workspace.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import {
	COPIED_PACKAGE_FILE,
	COPIED_PACKAGE_TEXT,
	POOL_ENTRY_NAME,
	POOL_LOCK_TEXT,
	POOL_PARKED_AT,
} from './step-events-worktree.constants.ts'
import { sha256Of, writePoolEntry } from './worktree-pool.ts'

import { vi } from 'vitest'

import type { StartWorkspace } from './lot-start-workspace.types.ts'
import type { NodeModulesVariant } from './step-events-worktree.types.ts'

/**
 * Puts a `cp` first on PATH that refuses the copy-on-write attempts (`-cR`, `--reflink=auto`) and does any other copy
 * as the real one: a file system without clones, where the plain copy is the fallback. The caller restores the
 * environment (`vi.unstubAllEnvs`).
 */
export function stubCloneRefusingCp(): void {
	const folder = temporaryFolder('dialecte-cp-stub-')
	const script = join(folder, 'cp')
	writeFileSync(
		script,
		'#!/bin/sh\ncase " $* " in *" -cR "*|*" --reflink=auto "*) exit 1 ;; esac\nexec /bin/cp "$@"\n',
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}:${process.env.PATH ?? ''}`)
}

/**
 * A start workspace (the default brief written) whose main checkout holds what `variant` needs: nothing (no
 * `node_modules` to copy, no pool), a `node_modules` to copy, or a committed lock and a pool entry that matches it.
 */
export function createWorktreeScene(params: { variant: NodeModulesVariant }): StartWorkspace {
	const start = createStartWorkspace()
	if (params.variant === 'cloned')
		writeFiles({ root: start.repository, files: { [COPIED_PACKAGE_FILE]: COPIED_PACKAGE_TEXT } })
	if (params.variant === 'pooled') {
		writeFiles({
			root: start.repository,
			files: {
				'package.json': `${JSON.stringify({ name: 'repo' })}\n`,
				'package-lock.json': POOL_LOCK_TEXT,
			},
		})
		git({ root: start.repository, args: ['add', '-A'] })
		git({ root: start.repository, args: ['commit', '-q', '-m', 'chore: package'] })
		writePoolEntry({
			worktreesFolder: start.worktreesFolder,
			name: POOL_ENTRY_NAME,
			entry: { repository: 'repo', lockHash: sha256Of(POOL_LOCK_TEXT), parkedAt: POOL_PARKED_AT },
			marker: 'pooled\n',
			outsideTarget: join(start.worktreesFolder, '..'),
		})
	}
	return start
}
