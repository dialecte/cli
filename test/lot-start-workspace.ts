/** A scratch workspace for `lot start` and `lot status`: the real paths a start makes, what it created, the records it wrote. */
import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { STORE_FOLDER } from '../src/lib/store/store.constants.ts'
import { WORKTREE_INDEX_FOLDER } from '../src/lib/worktree/worktree.constants.ts'
import { REPOSITORY_FILES } from './brief-workspace.constants.ts'
import { briefWith, createBriefWorkspace, writeBriefFile } from './brief-workspace.ts'
import { OTHER_BRANCH, OTHER_BRIEF_FILE, OTHER_REPOSITORY } from './lot-start.constants.ts'
import { initializeRepository } from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** A workspace (its repository on `main`) with the default brief written; `XDG_STATE_HOME` points into the test's folder. */
export function createStartWorkspace(
	params: { brief?: Record<string, unknown> } = {},
): StartWorkspace {
	const workspace = createBriefWorkspace()
	writeBriefFile({ workspace, brief: params.brief ?? briefWith() })
	return {
		workspace,
		repository: realpathSync(workspace.repository),
		store: join(realpathSync(join(workspace.repository, '.git')), STORE_FOLDER),
		worktreesFolder: join(realpathSync(workspace.workspace), '.worktrees'),
		cwd: workspace.workspace,
	}
}

/** A second repository `other` in the workspace, with its own brief file; the brief's path. */
export function addOtherRepository(start: StartWorkspace): string {
	initializeRepository({
		root: join(start.workspace.workspace, OTHER_REPOSITORY),
		files: { ...REPOSITORY_FILES },
	})
	const path = join(start.workspace.briefFolder, OTHER_BRIEF_FILE)
	const brief = briefWith({
		repository: `../../${OTHER_REPOSITORY}`,
		branch: OTHER_BRANCH,
		feature: OTHER_REPOSITORY,
	})
	writeFileSync(path, `${JSON.stringify(brief, null, 2)}\n`)
	return path
}

/** What a start leaves in the workspace: the claims, the lot folders, the worktrees, the store list's text. */
export function createdBy(start: StartWorkspace): {
	claims: string[]
	lots: string[]
	worktrees: string[]
	storeList: string | undefined
} {
	return {
		claims: entriesOf(join(start.worktreesFolder, WORKTREE_INDEX_FOLDER)),
		lots: entriesOf(start.store),
		worktrees: entriesOf(start.worktreesFolder).filter((name) => name !== WORKTREE_INDEX_FOLDER),
		storeList: existsSync(start.workspace.storeList)
			? readFileSync(start.workspace.storeList, 'utf8')
			: undefined,
	}
}

/** The names in a folder, sorted; none when it does not exist. */
export function entriesOf(folder: string): string[] {
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/** A JSON record of a lot folder (`identity.json`, `transitions/000001.json`). */
export function recordOf(params: { folder: string; name: string }): unknown {
	return JSON.parse(readFileSync(join(params.folder, params.name), 'utf8'))
}

/** A command's result with its output read as JSON (undefined when it is not): what a test of `--json` compares. */
export function withJson(result: CommandResult): { exitCode: number; json: unknown } {
	try {
		return { exitCode: result.exitCode, json: JSON.parse(result.output) }
	} catch {
		return { exitCode: result.exitCode, json: undefined }
	}
}

/** A command's result with its output read as JSON and the raw output beside it. */
export function withJsonAndText(result: CommandResult): {
	exitCode: number
	json: unknown
	text: string
} {
	return { ...withJson(result), text: result.output }
}

/** A command's result with its output's lines, sorted: what a test of a text form that lists in no fixed order compares. */
export function withSortedLines(result: CommandResult): { exitCode: number; lines: string[] } {
	return { exitCode: result.exitCode, lines: result.output.split('\n').sort() }
}

/** A command's result with its output's lines in order. */
export function withLines(result: CommandResult): { exitCode: number; lines: string[] } {
	return { exitCode: result.exitCode, lines: result.output.split('\n') }
}

/** The manual line (D18): `next` of a real `working` lot. */
export function manualLineOf(name: string): string {
	return `run the stations, then dialecte handover write <lots.json> --out ${name}`
}

/**
 * Every file under `folder`, recursively: its path relative to `folder` and its bytes (a link: its target). Equal
 * snapshots mean no byte of the folder changed.
 */
export function snapshotOf(folder: string): Record<string, string> {
	const snapshot: Record<string, string> = {}
	for (const name of entriesOf(folder)) {
		const path = join(folder, name)
		const kind = lstatSync(path)
		if (kind.isSymbolicLink()) snapshot[name] = `-> ${readlinkSync(path)}`
		else if (kind.isDirectory()) {
			snapshot[`${name}/`] = 'folder'
			for (const [inner, text] of Object.entries(snapshotOf(path)))
				snapshot[join(name, inner)] = text
		} else snapshot[name] = readFileSync(path, 'utf8')
	}
	return snapshot
}
