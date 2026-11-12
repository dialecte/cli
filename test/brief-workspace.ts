/** A scratch workspace for the brief checks: one real repository, a brief folder, a plan, the state folder of the test. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { publishLotFolder } from '../src/lib/store/store-folder.ts'
import {
	BRIEF_FILE,
	BRIEF_FOLDER,
	PLAN_FILE,
	PLAN_TEXT,
	REPOSITORY_FILES,
	REPOSITORY_FOLDER,
	VALID_BRIEF,
} from './brief-workspace.constants.ts'
import { headOf, storeOf } from './handover-store-scenario.ts'
import { initializeRepository, isolateGitConfig, temporaryFolder } from './scratch-repository.ts'
import { entryOf, identityOf, transitionOf, writeRecordFile } from './store-records.ts'

import { vi } from 'vitest'

import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { Refusal, Transition } from '../src/lib/store/store.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'

/**
 * A workspace with a repository on `main` (one commit), a brief folder holding `plan.md`, and `XDG_STATE_HOME`
 * pointing into the test's own folder. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function createBriefWorkspace(params: { repositoryFolder?: string } = {}): BriefWorkspace {
	isolateGitConfig()
	const root = temporaryFolder('dialecte-brief-')
	const state = join(root, 'state')
	vi.stubEnv('XDG_STATE_HOME', state)
	const workspace = join(root, 'ws')
	const repository = initializeRepository({
		root: join(workspace, params.repositoryFolder ?? REPOSITORY_FOLDER),
		files: { ...REPOSITORY_FILES },
	})
	const briefFolder = join(workspace, BRIEF_FOLDER)
	mkdirSync(briefFolder, { recursive: true })
	writeFileSync(join(briefFolder, PLAN_FILE), PLAN_TEXT)
	const registry = storeOf(repository)
	return {
		workspace,
		repository,
		briefFolder,
		briefPath: join(briefFolder, BRIEF_FILE),
		store: join(registry, '..', 'dialecte-lots'),
		registry,
		commit: headOf(repository),
		storeList: join(state, 'dialecte', 'lot-stores'),
	}
}

/** The valid brief with `overrides` applied; a key given as `undefined` is left out. */
export function briefWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries({ ...VALID_BRIEF, ...overrides }).filter(([, value]) => value !== undefined),
	)
}

/** Writes the brief (an object as JSON, a string as is) to the workspace's brief file; its path. */
export function writeBriefFile(params: {
	workspace: BriefWorkspace
	brief: Record<string, unknown> | string
}): string {
	const text =
		typeof params.brief === 'string' ? params.brief : `${JSON.stringify(params.brief, null, 2)}\n`
	writeFileSync(params.workspace.briefPath, text)
	return params.workspace.briefPath
}

/**
 * Writes the brief and gives the arguments of `checkBrief` for it, read from a folder that is not the brief's
 * (the call itself stays in the test, inside its `expect`).
 */
export function checkArgumentsOf(params: {
	workspace: BriefWorkspace
	brief: Record<string, unknown> | string
	caseInsensitive?: boolean
}): { briefPath: string; cwd: string; caseInsensitive: boolean | undefined } {
	return {
		briefPath: writeBriefFile({ workspace: params.workspace, brief: params.brief }),
		cwd: temporaryFolder('dialecte-cwd-'),
		caseInsensitive: params.caseInsensitive,
	}
}

/**
 * A lot of the workspace's store, written with the store's own folder builder: its brief holds `scope`, its first
 * transition is `working`, `later` follow as transitions 2, 3, ...; a registry entry when `registry` is given. The
 * lot folder's path.
 */
export function writeStoreLot(params: {
	workspace: BriefWorkspace
	name: string
	scope: string[]
	branch?: string
	simulated?: boolean
	later?: Transition[]
	registry?: StoreEntry['state']
	/** The repository the identity names; the fixed `/work/repo` of the records when left out. */
	repository?: string
	/** The worktree the identity names; `<workspace>/.worktrees/<name>` when left out. */
	worktree?: string
	/** The identity's feature; the fixed one of the records when left out. */
	feature?: string
}): string {
	const { workspace, name } = params
	const simulated = params.simulated ?? false
	mkdirSync(workspace.store, { recursive: true })
	const brief = briefWith({
		scope: params.scope,
		lots: [{ paths: params.scope, message: 'feat: x' }],
	})
	const published = publishLotFolder({
		store: workspace.store,
		name,
		brief: `${JSON.stringify(brief, null, 2)}\n`,
		plan: PLAN_TEXT,
		firstTransition: { ...transitionOf({ seq: 1, kind: 'start' }), simulated },
		identity: {
			...identityOf({ name }),
			...(params.repository !== undefined && { repository: params.repository }),
			...(params.feature !== undefined && { feature: params.feature }),
			branch: params.branch ?? `feat/${name}`,
			simulated,
			worktree: simulated
				? null
				: (params.worktree ?? join(workspace.workspace, '.worktrees', name)),
		},
	})
	if (!published) throw new Error(`the lot ${name} exists already`)
	const lotFolder = join(workspace.store, name)
	for (const transition of params.later ?? [])
		writeRecordFile({
			folder: lotFolder,
			name: `transitions/${String(transition.seq).padStart(6, '0')}.json`,
			text: `${JSON.stringify({ ...transition, simulated })}\n`,
		})
	if (params.registry) {
		// a registry entry is named after its file: `<entry name>.json`, the name field the same (here the lot's name)
		const entry = { ...entryOf({ state: params.registry, folder: lotFolder }), name }
		writeRecordFile({
			folder: workspace.registry,
			name: `${entry.name}.json`,
			text: JSON.stringify(entry),
		})
	}
	return lotFolder
}

/** `<rule>:<first segment of the field>` of each refusal, sorted: what a table row compares. */
export function refusalKeysOf(refused: readonly Refusal[]): string[] {
	return refused
		.map((refusal) => `${refusal.rule}:${refusal.field.split(/[.[]/)[0]}`)
		.sort((first, second) => first.localeCompare(second))
}
