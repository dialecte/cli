import { createHash } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { stateHomeOf } from '../store/state-home.ts'
import { DEFAULT_STATE_SEGMENTS, STATE_HOME_VARIABLE } from '../store/store.constants.ts'
import {
	ORCHESTRATOR_FOLDER_SEGMENTS,
	ORCHESTRATOR_PATH_NAMES,
	ORCHESTRATOR_WORKSPACE_HASH_LENGTH,
} from './orchestrator.constants.ts'

import type { StateHome } from '../store/store.types.ts'
import type { OrchestratorPaths, OrchestratorPathsParams } from './orchestrator.types.ts'

/**
 * The orchestrator's folder for one workspace and its three files: the workspace is identified by its real path
 * (`<basename>-<sha256 prefix>`), below the state home `stateFolder` reads (`$XDG_STATE_HOME` when absolute, else
 * `<home>/.local/state`). Refuses a workspace that is not a directory, and a state home inside the workspace, naming
 * the state home and where it came from.
 */
export function orchestratorPaths(params: OrchestratorPathsParams): OrchestratorPaths {
	const root = workspaceRoot(params.workspace)
	const stateHome = stateHomeOf(params)
	const workspaceKey = `${basename(root)}-${createHash('sha256')
		.update(root)
		.digest('hex')
		.slice(0, ORCHESTRATOR_WORKSPACE_HASH_LENGTH)}`
	const folder = join(stateHome.path, ...ORCHESTRATOR_FOLDER_SEGMENTS, workspaceKey)
	const realStateHome = readableRealPath({ path: stateHome.path, stateHome })
	const realFolder = readableRealPath({ path: folder, stateHome })
	if (
		isWithin({ parent: root, path: realStateHome }) ||
		isWithin({ parent: root, path: realFolder })
	)
		throw new Error(
			`state home ${stateHome.path} (from ${originOf(stateHome)}) must be outside the workspace ${root}`,
		)

	return {
		workspace: { root, key: workspaceKey },
		folder,
		state: join(folder, ORCHESTRATOR_PATH_NAMES.state),
		render: join(folder, ORCHESTRATOR_PATH_NAMES.render),
		log: join(folder, ORCHESTRATOR_PATH_NAMES.log),
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

/** Where the state home came from, as a refusal names it: `XDG_STATE_HOME` or `<home>/.local/state`. */
function originOf(stateHome: StateHome): string {
	return stateHome.origin === 'variable'
		? STATE_HOME_VARIABLE
		: ['<home>', ...DEFAULT_STATE_SEGMENTS].join('/')
}

/**
 * The real path of `path` below the state home; a refusal naming the state home, its origin and the error code when
 * a part of it cannot be read (a parent that is a file, a folder without permission).
 */
function readableRealPath(params: { path: string; stateHome: StateHome }): string {
	try {
		return realPathWithMissing(params.path)
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code ?? String(error)
		throw new Error(
			`state home ${params.stateHome.path} (from ${originOf(params.stateHome)}) cannot be read: ${code}`,
		)
	}
}

/** The real path of `path`, its missing tail kept as written below the real path of its nearest existing parent. */
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

/** Whether `path` is `parent` or below it, decided on path segments: `..state` is a name, `..` alone goes up. */
function isWithin(params: { parent: string; path: string }): boolean {
	const pathFromParent = relative(params.parent, params.path)
	if (isAbsolute(pathFromParent)) return false
	return pathFromParent.split(sep)[0] !== '..'
}
