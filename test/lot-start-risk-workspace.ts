/** A start workspace whose repository holds a manifest, and the brief of a scope. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith } from './brief-workspace.ts'
import { createdBy, createStartWorkspace } from './lot-start-workspace.ts'
import { LOT_NAME } from './lot-start.constants.ts'
import { git, writeFiles } from './scratch-repository.ts'

import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** A start workspace whose repository commits `packageJson` and whose brief is scoped to `scope` (with `effort` when given). */
export function createRiskWorkspace(params: {
	packageJson: string
	scope: string
	/** The literal path of the brief's one lot (a lot's paths are literal); the scope when left out. */
	lotPath?: string
	effort?: string
}): StartWorkspace {
	const start = createStartWorkspace({
		brief: briefWith({
			scope: [params.scope],
			lots: [{ paths: [params.lotPath ?? params.scope], message: 'feat: x' }],
			effort: params.effort,
		}),
	})
	writeFiles({ root: start.repository, files: { 'package.json': params.packageJson } })
	git({ root: start.repository, args: ['add', '-A'] })
	git({ root: start.repository, args: ['commit', '-q', '-m', 'chore: manifest'] })
	return start
}

/** The effort of the lot folder's `identity.json`; undefined while the lot folder holds none (a refused start). */
export function identityEffortOf(lotFolder: string): unknown {
	const file = join(lotFolder, 'identity.json')
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).effort : undefined
}

/** What a real start leaves in a workspace: one claim, the lot folder, its worktree, the store in the list. */
export function startedCreation(start: StartWorkspace): ReturnType<typeof createdBy> {
	return {
		claims: ['0001'],
		lots: [LOT_NAME],
		worktrees: [LOT_NAME],
		storeList: `${start.store}\n`,
	}
}

/** What a start that wrote nothing leaves. */
export function noCreation(): ReturnType<typeof createdBy> {
	return { claims: [], lots: [], worktrees: [], storeList: undefined }
}
