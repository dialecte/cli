import { createHash } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'

import { stateFolder } from '../store/state-folder.ts'
import {
	ORCHESTRATOR_FOLDER_SEGMENTS,
	ORCHESTRATOR_PATH_NAMES,
	ORCHESTRATOR_WORKSPACE_HASH_LENGTH,
} from './orchestrator.constants.ts'

import type { OrchestratorPaths, OrchestratorPathsParams } from './orchestrator.types.ts'

export function orchestratorPaths(params: OrchestratorPathsParams): OrchestratorPaths {
	const root = workspaceRoot(params.workspace)
	const stateHome = stateFolder(params)
	if (!isAbsolute(stateHome)) throw new Error(`XDG_STATE_HOME must be absolute: ${stateHome}`)
	const realStateHome = realPathWithMissing(stateHome)
	if (isWithin({ parent: root, path: realStateHome }))
		throw new Error(`XDG_STATE_HOME must be outside the workspace: ${stateHome}`)
	const workspaceKey = `${basename(root)}-${createHash('sha256')
		.update(root)
		.digest('hex')
		.slice(0, ORCHESTRATOR_WORKSPACE_HASH_LENGTH)}`
	const folder = join(stateHome, ...ORCHESTRATOR_FOLDER_SEGMENTS, workspaceKey)
	if (isWithin({ parent: root, path: realPathWithMissing(folder) }))
		throw new Error(`XDG_STATE_HOME must be outside the workspace: ${stateHome}`)

	return {
		workspace: { root, key: workspaceKey },
		folder,
		state: join(folder, ORCHESTRATOR_PATH_NAMES.state),
		render: join(folder, ORCHESTRATOR_PATH_NAMES.render),
		log: join(folder, ORCHESTRATOR_PATH_NAMES.log),
		runs: join(folder, ORCHESTRATOR_PATH_NAMES.runs),
		reviews: join(folder, ORCHESTRATOR_PATH_NAMES.reviews),
		answers: join(folder, ORCHESTRATOR_PATH_NAMES.answers),
	}
}

function workspaceRoot(workspace: string): string {
	let root: string
	try {
		root = realpathSync.native(workspace)
		if (statSync(root).isDirectory()) return root
	} catch {
		// The stable refusal below names the selected value, not a platform-specific file-system error.
	}
	throw new Error(`workspace must be a directory: ${workspace}`)
}

function realPathWithMissing(path: string): string {
	try {
		return realpathSync.native(path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		const parent = dirname(path)
		if (parent === path) throw error
		return join(realPathWithMissing(parent), basename(path))
	}
}

function isWithin(params: { parent: string; path: string }): boolean {
	const pathFromParent = relative(params.parent, params.path)
	return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent))
}
