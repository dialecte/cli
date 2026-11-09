/**
 * Lots whose identity names a real git worktree of a scratch workspace, for the cases of the keep rule of `worktree
 * prune` and `lot close`: the records are written by hand (no lot is started), the worktrees are real.
 */
import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { runWorktreePrune } from '../src/commands/worktree.ts'
import { handoverLockPath } from '../src/lib/handover/handover-lock.ts'
import { registerHandover } from '../src/lib/handover/handover-store.ts'
import { writeHygieneBaseline } from '../src/lib/worktree/hygiene.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { KEEP_NOW, KEEP_SCOPE, REMOVABLE } from './lot-keep-workspace.constants.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import { questionTransitionOf, transitionOf, writeRecordFile } from './store-records.ts'

import type { Transition } from '../src/lib/store/store.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { LotKeepState, LotWorktree } from './lot-keep-workspace.types.ts'

/** The transitions after the first that put a lot in `state` (a committed lot is committed by its registry entry). */
function laterTransitionsOf(state: LotKeepState): Transition[] {
	if (state === 'input-required') return [questionTransitionOf({ seq: 2, number: 1 })]
	if (state === 'ready') return [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })]
	if (state === 'failed') return [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })]
	if (state === 'canceled')
		return [
			transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: '2026-11-08T11:00:00.000Z' }),
		]
	return []
}

/**
 * The lot `name` (`<index>-repo-<tail>`) in `state`, and the git worktree `.worktrees/<name>` its identity names, on
 * `feat/<tail>` with one commit of its own, merged into `main` unless `merged` is false: the worktree is left with
 * nothing else that keeps it (no ignored folder, no link, a reflog of two entries, a tip past the hygiene baseline
 * that was never written). `dirty` adds an untracked file.
 */
export function addLotWorktree(params: {
	workspace: BriefWorkspace
	name: string
	state: LotKeepState
	merged?: boolean
	dirty?: boolean
}): LotWorktree {
	const { workspace, name } = params
	const bare = addBareWorktree(params)
	const lotFolder = writeStoreLot({
		workspace,
		name,
		scope: KEEP_SCOPE,
		branch: bare.branch,
		later: laterTransitionsOf(params.state),
		registry: params.state === 'committed' ? 'committed' : undefined,
	})
	return { ...bare, lotFolder: realpathSync(lotFolder) }
}

/** The worktree of `addLotWorktree` with no lot at all: no record of the store names it. */
export function addBareWorktree(params: {
	workspace: BriefWorkspace
	name: string
	merged?: boolean
	dirty?: boolean
}): Omit<LotWorktree, 'lotFolder'> {
	const { workspace, name } = params
	const tail = name.split('-').slice(2).join('-')
	const branch = `feat/${tail}`
	const path = join(workspace.workspace, '.worktrees', name)
	git({ root: workspace.repository, args: ['worktree', 'add', '-q', '-b', branch, path] })
	// the baseline at the creation HEAD, as `worktree add` writes it: the commit below puts the tip past it
	writeHygieneBaseline({ root: path, now: KEEP_NOW })
	writeFiles({
		root: path,
		files: { [`src/${tail}.ts`]: `export const ${tail.replace(/-/g, '_')} = 1\n` },
	})
	git({ root: path, args: ['add', '-A'] })
	git({ root: path, args: ['commit', '-q', '-m', `feat: ${tail}`] })
	if (params.merged !== false)
		git({ root: workspace.repository, args: ['merge', '-q', '--ff-only', branch] })
	if (params.dirty) writeFiles({ root: path, files: { 'scratch.txt': 'not committed\n' } })
	return { name, branch, worktree: realpathSync(path) }
}

/**
 * A lot of the store that names no worktree of its own on disk (its worktree folder was never made, or is gone); with
 * `worktree` its identity names that existing worktree instead (a closed lot naming the worktree of an open one).
 */
export function addLotWithoutWorktree(params: {
	workspace: BriefWorkspace
	name: string
	state: LotKeepState
	simulated?: boolean
	worktree?: string
}): string {
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace: params.workspace,
			name: params.name,
			scope: KEEP_SCOPE,
			simulated: params.simulated,
			later: laterTransitionsOf(params.state),
			registry: params.state === 'committed' ? 'committed' : undefined,
		}),
	)
	if (params.worktree !== undefined) pointIdentityAt({ lotFolder, worktree: params.worktree })
	return lotFolder
}

/** Rewrites the lot's `identity.json` so that it names `worktree` (a path, any spelling). */
export function pointIdentityAt(params: { lotFolder: string; worktree: string }): void {
	const identityPath = join(params.lotFolder, 'identity.json')
	const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as Record<string, unknown>
	rmSync(identityPath, { force: true })
	writeRecordFile({
		folder: params.lotFolder,
		name: 'identity.json',
		text: `${JSON.stringify({ ...identity, worktree: params.worktree })}\n`,
	})
}

/** A hand-over of the lot's worktree is pending in it: its registry entry and the repository's lock, as `handover write` leaves them. */
export function markHandoverPending(lot: LotWorktree): void {
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	registerHandover({ root: lot.worktree, folder, branch: lot.branch, now: KEEP_NOW })
	writeFileSync(handoverLockPath(lot.worktree), `bash ${join(folder, 'commit.sh')}\n`)
}

/** The worktrees of the plan `worktree prune --json` makes for the workspace, by folder name: the keep reason, or `removable`. */
export async function worktreeFatesOf(workspace: BriefWorkspace): Promise<Record<string, string>> {
	const result = await runWorktreePrune({
		argv: ['--root', workspace.workspace, '--json'],
		cwd: workspace.workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async function never() {
			return false
		},
	})
	const plan = JSON.parse(result.output) as {
		repositories: { items: { kind: string; name: string; kept?: string; command?: string }[] }[]
	}
	return Object.fromEntries(
		plan.repositories
			.flatMap((repository) => repository.items)
			.filter((item) => item.kind === 'worktree')
			.map((item) => [basename(item.name), item.kept ?? REMOVABLE]),
	)
}
