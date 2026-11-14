/**
 * The trees the `ask` command's tests run in: a project holding the test dialecte (optionally declaring a
 * standard), a root of documents, the state, data and cache folders of the test, and, for the lot cases, a store
 * lot with its worktree. Every `XDG_*` variable and `DIALECTE_STANDARD` is given explicitly; the process
 * environment points at decoys, so a command that reads it reaches nothing of a person's.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runAsk } from '../src/commands/ask.ts'
import {
	ASK_FILE,
	CLI_SOURCE,
	EVENTS_FILE,
	HANDOVER_FOLDER,
} from './ask-command-workspace.constants.ts'
import { installTestDialecte } from './installed-test-dialecte.ts'
import { LOT_NAME } from './lot-stores.constants.ts'
import {
	addWorktreeFolder,
	createWorkspaceWithLots,
	linkLot,
	writeStoreListFile,
} from './lot-stores.ts'
import { DECLARED_NAME } from './standard-selection.constants.ts'
import { createStandardWorkspace } from './standard-workspace.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from './test-timing.constants.ts'

import { expect, vi } from 'vitest'

import type { CommandExitCode, CommandOutput } from '../src/lib/command-output.types.ts'
import type {
	AskCommandWorkspace,
	AskJson,
	LotPlace,
	ReadEvent,
} from './ask-command-workspace.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { StandardsDescription } from './standard-workspace.types.ts'

/**
 * A workspace whose project holds the test dialecte (one package per name of `packages`, the default one when
 * left out). `standardName` is the standard the dialecte declares; `standards` the folders of the root; `state`
 * a state folder made elsewhere (a store lot's); `installIn` a folder to install the dialecte in instead of the
 * project's own.
 */
export function createAskCommandWorkspace(
	params: {
		standards?: StandardsDescription
		standardName?: string
		packages?: string[]
		state?: string
		installIn?: string
	} = {},
): AskCommandWorkspace {
	const workspace = createStandardWorkspace({ standards: params.standards })
	const state = params.state ?? join(workspace.base, 'state')
	const data = join(workspace.base, 'data')
	if (params.state === undefined) vi.stubEnv('XDG_STATE_HOME', join(workspace.base, 'decoy-state'))
	vi.stubEnv('XDG_DATA_HOME', join(workspace.base, 'decoy-data'))
	const cwd = params.installIn ?? workspace.cwd
	// a folder of a repository holds no package of its own yet
	if (!existsSync(join(cwd, 'package.json')))
		writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'app' }))
	for (const packageName of params.packages ?? [undefined])
		installTestDialecte({
			cwd,
			packageName,
			manifestFields:
				params.standardName === undefined
					? undefined
					: { dialecte: { standard: params.standardName } },
		})
	return {
		...workspace,
		cwd,
		state,
		data,
		environment: { ...workspace.environment, XDG_STATE_HOME: state, XDG_DATA_HOME: data },
	}
}

/** The same workspace with the declared standard `Example 0000` and one folder of documents. */
export function createDocumentsWorkspace(params: {
	standards: StandardsDescription
}): AskCommandWorkspace {
	return createAskCommandWorkspace({ standards: params.standards, standardName: DECLARED_NAME })
}

/** The same workspace with no `DIALECTE_STANDARD` in its environment: no documents are configured. */
export function withoutStandard(params: { workspace: AskCommandWorkspace }): AskCommandWorkspace {
	const { DIALECTE_STANDARD: _standard, ...environment } = params.workspace.environment
	return { ...params.workspace, environment }
}

/** A folder beside the project, outside every repository: a hand-over folder; its path. */
export function createHandoverFolder(params: { workspace: AskCommandWorkspace }): string {
	const folder = join(params.workspace.base, HANDOVER_FOLDER)
	mkdirSync(folder, { recursive: true })
	return folder
}

/**
 * A store lot (`LOT_NAME`, effort medium) in a repository, its store on the person's store list, and an ask
 * workspace whose state folder is the one the store lives under; `place` says where the dialecte is installed
 * and the command runs. In the worktree the lot is linked as `.dialecte/lot`.
 */
export function createLotAskWorkspace(params: {
	place: LotPlace
	standards?: StandardsDescription
	standardName?: string
}): {
	workspace: AskCommandWorkspace
	lots: BriefWorkspace
	lotFolder: string
} {
	const { workspace: lots, folders } = createWorkspaceWithLots({ names: [LOT_NAME] })
	writeStoreListFile({ stores: [lots.store] })
	const lotFolder = folders[LOT_NAME]
	const state = process.env.XDG_STATE_HOME
	if (state === undefined) throw new Error('the lot workspace sets XDG_STATE_HOME')
	const installIn = installFolderOf({ place: params.place, lots, lotFolder })
	const workspace = createAskCommandWorkspace({
		standards: params.standards,
		standardName: params.standardName,
		state,
		installIn,
	})
	return { workspace, lots, lotFolder }
}

function installFolderOf(params: {
	place: LotPlace
	lots: BriefWorkspace
	lotFolder: string
}): string | undefined {
	if (params.place === 'project') return undefined
	if (params.place === 'repository') return params.lots.repository
	const worktree = addWorktreeFolder({ workspace: params.lots, folderName: LOT_NAME })
	linkLot({ worktree, lotFolder: params.lotFolder })
	return worktree
}

/**
 * Runs `ask` in the workspace and pins the exit code inside an `expect`, so a run that throws fails the case on this
 * assertion; hands back what it printed.
 */
export async function askedWith(params: {
	workspace: AskCommandWorkspace
	argv: string[]
	exitCode: CommandExitCode
}): Promise<CommandOutput> {
	const run = runAsk({
		argv: params.argv,
		cwd: params.workspace.cwd,
		environment: params.workspace.environment,
	})
	await expect(run).resolves.toMatchObject({ exitCode: params.exitCode })
	return run
}

/**
 * `dialecte ask <argv>` run as a process of the cli's own source in the workspace's project, its environment the
 * process's with the workspace's given variables over it: what it printed on each stream, and its exit code.
 */
export function askThroughCli(params: { workspace: AskCommandWorkspace; argv: string[] }): {
	status: number | null
	stdout: string
	stderr: string
} {
	const result = spawnSync(process.execPath, [CLI_SOURCE, 'ask', ...params.argv], {
		cwd: params.workspace.cwd,
		env: { ...process.env, ...params.workspace.environment },
		encoding: 'utf8',
		timeout: CLI_SURFACE_CASE_TIMEOUT,
	})
	return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** `ask <argv> --json` and its parsed object. */
export async function askedJson(params: {
	workspace: AskCommandWorkspace
	argv: string[]
	exitCode: CommandExitCode
}): Promise<AskJson> {
	const answer = await askedWith({ ...params, argv: [...params.argv, '--json'] })
	return JSON.parse(answer.output) as AskJson
}

/** The parsed JSON of a file. */
export function readJsonFile(path: string): unknown {
	return JSON.parse(readFileSync(path, 'utf8'))
}

/** The events of a JSON-lines file, in order; none when the file does not exist. */
export function readEventsFile(path: string): ReadEvent[] {
	if (!existsSync(path)) return []
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line) as ReadEvent)
}

/** The names of the entries of a folder, sorted; none when the folder does not exist. */
export function namesIn(folder: string): string[] {
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/** The path of an ask's own record. */
export function askRecordPath(params: { asksFolder: string; ask: string }): string {
	return join(params.asksFolder, params.ask, ASK_FILE)
}

/** The events file next to an `asks` folder's lot, or the state's own. */
export function eventsPathIn(folder: string): string {
	return join(folder, EVENTS_FILE)
}
