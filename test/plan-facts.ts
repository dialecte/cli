/**
 * Hand-made facts for the plan tests: a plan workspace, repository common folders written as plain files (no git
 * process), store lots, registry entries and worktree records inside them.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from './brief-workspace.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { writeRecordFile } from './store-records.ts'

import { vi } from 'vitest'

import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { PlanEntry } from '../src/lib/plan/plan-block.types.ts'
import type { Transition } from '../src/lib/store/store.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { PlanWorkspace } from './plan-facts.types.ts'

/** A folder for the plan (`<root>/plans`) with `XDG_STATE_HOME` stubbed to `<root>/state`; the caller unstubs. */
export function createPlanWorkspace(): PlanWorkspace {
	const root = realpathSync(temporaryFolder('dialecte-plan-'))
	const state = join(root, 'state')
	vi.stubEnv('XDG_STATE_HOME', state)
	const planFolder = join(root, 'plans')
	mkdirSync(planFolder, { recursive: true })
	return { root, state, planFolder, planPath: join(planFolder, 'plan.md') }
}

/** The repository `<root>/<name>` as a git main checkout made of files: `.git/HEAD`, `objects/`, `refs/`. Its path. */
export function writeMainCheckout(params: { root: string; name: string }): string {
	const path = join(params.root, params.name)
	const git = join(path, '.git')
	mkdirSync(join(git, 'objects'), { recursive: true })
	mkdirSync(join(git, 'refs'), { recursive: true })
	writeFileSync(join(git, 'HEAD'), 'ref: refs/heads/main\n')
	return path
}

/** `<path>/.git` holding only what is asked for (each defaults to present): a checkout with a part missing. */
export function writeGitFolder(params: {
	path: string
	head?: boolean
	objects?: boolean
	refs?: boolean
}): void {
	const git = join(params.path, '.git')
	mkdirSync(git, { recursive: true })
	if (params.head ?? true) writeFileSync(join(git, 'HEAD'), 'ref: refs/heads/main\n')
	if (params.objects ?? true) mkdirSync(join(git, 'objects'), { recursive: true })
	if (params.refs ?? true) mkdirSync(join(git, 'refs'), { recursive: true })
}

/** The marks file of a plan below a state folder: `<state>/dialecte/plans/<sha256 of the real path, 16 hex>.jsonl`. */
export function marksFileOf(params: { state: string; planPath: string }): string {
	const digest = createHash('sha256').update(realpathSync(params.planPath)).digest('hex')
	return join(params.state, 'dialecte', 'plans', `${digest.slice(0, 16)}.jsonl`)
}

/** The git common folder of a repository made by `writeMainCheckout`. */
export function commonOf(repository: string): string {
	return join(repository, '.git')
}

/** `<link>` -> `<target>`: a second spelling of one folder. */
export function linkFolder(params: { target: string; link: string }): string {
	symlinkSync(params.target, params.link)
	return params.link
}

/** A store lot in the common folder, written with the store's own folder builder (no git). The lot folder. */
export function writePlanStoreLot(params: {
	root: string
	common: string
	name: string
	scope: string[]
	branch?: string
	simulated?: boolean
	later?: Transition[]
	registry?: StoreEntry['state']
	worktree?: string
}): string {
	return writeStoreLot({
		workspace: briefWorkspaceOf(params),
		name: params.name,
		scope: params.scope,
		branch: params.branch,
		simulated: params.simulated,
		later: params.later,
		registry: params.registry,
		worktree: params.worktree,
	})
}

/** A registry entry `<common>/dialecte-handover/<name>.json`, as `handover write` records it. */
export function writeRegistryEntry(params: {
	common: string
	name: string
	folder: string
	branch: string
	state: StoreEntry['state']
	written?: string
	worktree?: string
}): void {
	writeRecordFile({
		folder: join(params.common, 'dialecte-handover'),
		name: `${params.name}.json`,
		text: JSON.stringify({
			folder: params.folder,
			branch: params.branch,
			worktree: params.worktree ?? '',
			written: params.written ?? '2026-11-04T09:00:00.000Z',
			state: params.state,
		}),
	})
}

/** A linked worktree record `<common>/worktrees/<name>/{HEAD,gitdir}`; `head` is the HEAD file's text. */
export function writeWorktreeRecord(params: {
	common: string
	name: string
	head: string
	worktreeFolder: string
}): void {
	const folder = join(params.common, 'worktrees', params.name)
	writeRecordFile({ folder, name: 'HEAD', text: `${params.head}\n` })
	writeRecordFile({ folder, name: 'gitdir', text: `${join(params.worktreeFolder, '.git')}\n` })
}

/** A plan entry of kind `lot` with the fields the tests leave alone filled in. */
export function planEntryOf(overrides: Partial<PlanEntry> & { id: string }): PlanEntry {
	return {
		title: `title of ${overrides.id}`,
		kind: 'lot',
		dependsOn: [],
		scope: {},
		heavy: [],
		...overrides,
	}
}

/** The brief workspace the store writers want, for a common folder made by hand. */
function briefWorkspaceOf(params: { root: string; common: string }): BriefWorkspace {
	return {
		workspace: params.root,
		repository: '',
		briefFolder: '',
		briefPath: '',
		store: join(params.common, 'dialecte-lots'),
		registry: join(params.common, 'dialecte-handover'),
		commit: '',
		storeList: '',
	}
}
