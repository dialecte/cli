/**
 * A whole-workspace run of `plan next` over an on-disk workspace of two repositories: a shared branch with a
 * committed entry and an open one in the same worktree, a store lot matched to an entry, one outside the plan, an
 * unattributed pending hand-over, spec work for two files. No git process, no real `vm_stat`.
 */
import { join } from 'node:path'

import {
	createCommandWorkspace,
	lotJson,
	writePlanWithBlock,
} from '../../test/plan-command-workspace.ts'
import {
	commonOf,
	writeMainCheckout,
	writePlanStoreLot,
	writeRegistryEntry,
	writeWorktreeRecord,
} from '../../test/plan-facts.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { runPlan } from './plan.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const QUIET = { load: 1, cores: 12, available: 8 * 1024 ** 3, source: 'vm_stat' } as const

function writeWorkspace() {
	const workspace = createCommandWorkspace()
	const core = writeMainCheckout({ root: workspace.root, name: 'core' })
	const shared = { match: { branch: 'feat/shared' } }
	writePlanWithBlock({
		workspace,
		repositories: { cli: '../cli', core: '../core' },
		shared: { cli: ['CHANGELOG.md'] },
		lots: [
			lotJson('L00', {
				scope: { cli: ['src/cleanup/'] },
				match: { ...shared.match, handover: 'handovers/L00' },
			}),
			lotJson('L0a1', {
				dependsOn: ['L00'],
				scope: { cli: ['src/events/'] },
				match: { ...shared.match, handover: 'handovers/L0a1' },
			}),
			lotJson('P0', { scope: { cli: ['src/card/'] } }),
			lotJson('FixOne', { kind: 'fix' }),
			lotJson('C1', { scope: { core: ['src/c/'] } }),
			lotJson('Q', { dependsOn: ['P0'], spec: 'q-spec.md' }),
			lotJson('N', { dependsOn: ['L0a1'], spec: 'n-spec.md' }),
		],
	})
	writeRecordFile({ folder: workspace.planFolder, name: 'q-spec.md', text: 'Status: DRAFT\n' })
	writeRecordFile({ folder: workspace.planFolder, name: 'n-spec.md', text: 'Status: DRAFT\n' })
	writeRegistryEntry({
		common: workspace.common,
		name: '2026-11-01-l00',
		folder: join(workspace.planFolder, 'handovers', 'L00'),
		branch: 'feat/shared',
		state: 'committed',
	})
	writeWorktreeRecord({
		common: workspace.common,
		name: '0016-cli-events',
		head: 'ref: refs/heads/feat/shared',
		worktreeFolder: join(workspace.root, 'worktrees', '0016-cli-events'),
	})
	writePlanStoreLot({
		root: workspace.root,
		common: workspace.common,
		name: '0015-cli-p0',
		scope: ['src/card/'],
		branch: 'feat/p0',
	})
	writePlanStoreLot({
		root: workspace.root,
		common: workspace.common,
		name: '0030-cli-extra',
		scope: ['src/extra/'],
		branch: 'feat/extra',
	})
	writeRegistryEntry({
		common: workspace.common,
		name: '2026-11-04-feat-stray',
		folder: join(workspace.root, 'stray'),
		branch: 'feat/stray',
		state: 'pending',
	})
	return { workspace, coreCommon: commonOf(core) }
}

function callOf(params: {
	workspace: ReturnType<typeof writeWorkspace>['workspace']
	extra?: string[]
}) {
	return {
		cwd: params.workspace.planFolder,
		argv: ['next', 'plan.md', ...(params.extra ?? [])],
		seams: {
			machine: QUIET,
			check: { isAlive: () => false, startTimeOf: () => undefined },
			state: { environment: { XDG_STATE_HOME: params.workspace.state } },
			now: new Date('2026-11-10T10:06:30.000Z'),
		},
	}
}

function viewOf<View>(params: {
	result: CommandResult
	view: (result: CommandResult) => View
}): View {
	return params.view(params.result)
}

function hasLine(params: { output: string; label: string; fragments: string[] }): boolean {
	return params.output
		.split('\n')
		.some(
			(line) =>
				line.startsWith(params.label === '' ? ' '.repeat(10) : params.label.padEnd(10)) &&
				params.fragments.every((fragment) => line.includes(fragment)),
		)
}

describe('plan next: a whole workspace of two repositories', () => {
	it('two repositories, the shared branch, outside work, merge, spec work: exit 0 and every line', () => {
		const { workspace } = writeWorkspace()

		expect(
			viewOf({
				result: runPlan(callOf({ workspace })),
				view: (result) => ({
					exitCode: result.exitCode,
					head: result.output
						.split('\n')[0]
						.includes('repositories cli, core  ·  done 1 · open 2 · ready 2'),
					open: [
						hasLine({
							output: result.output,
							label: 'open',
							fragments: ['L0a1', 'manual, no hand-over yet (worktree 0016-cli-events)'],
						}),
						hasLine({
							output: result.output,
							label: '',
							fragments: ['P0', 'cli', '0015-cli-p0'],
						}),
						hasLine({ output: result.output, label: '', fragments: ['0030-cli-extra', 'cli'] }),
						hasLine({
							output: result.output,
							label: '',
							fragments: ['unattributed: hand-over 2026-11-04-feat-stray pending since 2026-11-04'],
						}),
					],
					fix: hasLine({
						output: result.output,
						label: 'start',
						fragments: [
							'FixOne',
							'merge: L0a1, P0, 0030-cli-extra',
							'unverified: 2026-11-04-feat-stray',
						],
					}),
					core:
						hasLine({ output: result.output, label: '', fragments: ['C1'] }) &&
						!hasLine({ output: result.output, label: '', fragments: ['C1', 'unverified'] }),
					spec: hasLine({
						output: result.output,
						label: 'spec',
						fragments: ['q-spec.md DRAFT (Q)', 'n-spec.md DRAFT (N)'],
					}),
				}),
			}),
		).toEqual({
			exitCode: 0,
			head: true,
			open: [true, true, true, true],
			fix: true,
			core: true,
			spec: true,
		})
	})

	it('--json: L00 done, L0a1 open by the worktree, P0 open by its store lot, the extra store lot held in no entry', () => {
		const { workspace } = writeWorkspace()

		expect(
			viewOf({
				result: runPlan(callOf({ workspace, extra: ['--json'] })),
				view: (result) =>
					(
						JSON.parse(result.output) as {
							entries: Array<{ id: string; state: string; realizedBy: { kind: string } | null }>
						}
					).entries.map((entry) => [entry.id, entry.state, entry.realizedBy?.kind ?? null]),
			}),
		).toEqual([
			['L00', 'done', 'registry'],
			['L0a1', 'open', 'worktree'],
			['P0', 'open', 'store'],
			['FixOne', 'ready', null],
			['C1', 'ready', null],
			['Q', 'waiting', null],
			['N', 'waiting', null],
		])
	})
})
