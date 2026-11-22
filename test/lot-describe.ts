/** A store lot with a pushed origin, the cli's template and its records, for `lot pr` to render. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { hashStateTree } from '../src/lib/gate-records/state-hash.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { FIXTURE_TEMPLATE_PATH } from './change-request-template.constants.ts'
import {
	LOT_FRAGMENT,
	LOT_ISSUE,
	LOT_MESSAGE,
	LOT_NAME,
	LOT_STEP,
	LOT_SUMMARY,
} from './lot-describe.constants.ts'
import { git, writeFiles } from './scratch-repository.ts'

import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { Transition } from '../src/lib/store/store.types.ts'
import type { ChangeRequestLot } from './lot-describe.types.ts'

/** The cli's own committed template: the one every dialecte repository holds. */
export function cliTemplate(): string {
	return readFileSync(
		join(import.meta.dirname, '..', '.github', 'pull_request_template.md'),
		'utf8',
	)
}

/**
 * `main` (with `template` as the repository's pull request template) pushed to a bare origin, the lot's worktree on
 * `feat/x` one commit ahead (`src/x.ts` and its changelog fragment), its store folder whose brief holds the public
 * fields with `brief` applied, and its tests record taken on the landed tree (on another tree when `staleTests`).
 */
export function changeRequestLot(
	params: {
		brief?: Record<string, unknown>
		template?: string
		staleTests?: boolean
		/** Files main holds besides the template, before the lot is cut. */
		mainFiles?: Record<string, string>
		/** Files the lot's commit writes besides `src/x.ts` and its fragment (`changes/x.md` replaced when given). */
		lotFiles?: Record<string, string>
		/** Paths the lot's commit deletes. */
		lotDeletes?: string[]
		/** The transitions after the start (a lot no longer at work). */
		later?: Transition[]
		/** The lot's registry entry (a committed lot). */
		registry?: StoreEntry['state']
	} = {},
): ChangeRequestLot {
	const workspace = createBriefWorkspace()
	const { repository } = workspace
	writeFiles({
		root: repository,
		files: {
			[FIXTURE_TEMPLATE_PATH]: params.template ?? cliTemplate(),
			...params.mainFiles,
		},
	})
	git({ root: repository, args: ['add', '-A'] })
	git({ root: repository, args: ['commit', '-qm', 'chore: the template'] })
	const origin = join(workspace.workspace, 'origin.git')
	git({ root: workspace.workspace, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: repository, args: ['remote', 'add', 'origin', origin] })
	git({ root: repository, args: ['push', '-q', '-u', 'origin', 'main'] })
	const worktree = join(workspace.workspace, '.worktrees', LOT_NAME)
	git({ root: repository, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree, 'main'] })
	const main = git({ root: repository, args: ['rev-parse', 'main'] }).trim()
	writeFiles({
		root: worktree,
		files: {
			'src/x.ts': 'export const x = 1\n',
			...(params.lotFiles ?? { 'changes/x.md': LOT_FRAGMENT }),
		},
	})
	for (const path of params.lotDeletes ?? []) git({ root: worktree, args: ['rm', '-q', path] })
	git({ root: worktree, args: ['add', '-A'] })
	git({ root: worktree, args: ['commit', '-qm', LOT_MESSAGE] })
	const lotFolder = writeStoreLot({
		workspace,
		name: LOT_NAME,
		scope: ['src/', 'changes/'],
		branch: 'feat/x',
		repository,
		worktree,
		base: { ref: 'main', commit: main },
		later: params.later,
		registry: params.registry,
		brief: {
			summary: LOT_SUMMARY,
			issue: LOT_ISSUE,
			steps: [{ ...LOT_STEP, spec: '## Step 1' }],
			lots: [{ paths: ['src/', 'changes/'], message: LOT_MESSAGE }],
			...params.brief,
		},
	})
	const treeHash = hashStateTree(git({ root: worktree, args: ['rev-parse', 'HEAD^{tree}'] }).trim())
	const testsTree = params.staleTests ? hashStateTree('another tree') : treeHash
	writeFileSync(
		join(lotFolder, 'tests.json'),
		JSON.stringify({
			schema: 1,
			tdd: {
				at: '2026-11-17T00:00:00Z',
				head: '0123456789abcdef',
				stateHash: testsTree,
				cases: [{ file: 'src/x.test.ts', name: 'x asked -> one', status: 'green' }],
				counts: { green: 1 },
			},
		}),
	)
	return { workspace, lotFolder, worktree, treeHash }
}
