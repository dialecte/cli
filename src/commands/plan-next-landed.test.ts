/**
 * `dialecte plan next` over a real repository whose store holds a lot whose hand-over was committed outside its folder:
 * once its branch is on main the lot is no longer open work, holds nothing, and is said as `landed`; one whose branch
 * is not on main, or whose hand-over `lot close` already closed, says nothing of the kind.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { LANDED_SCOPE_FILE, PLAN_ENTRY_ID } from '../../test/landed-store-lot-plan.constants.ts'
import { createLandedPlanWorkspace } from '../../test/landed-store-lot-plan.ts'
import { LANDED_CLOSED_AT, LANDED_LOT } from '../../test/landed-store-lot-workspace.constants.ts'
import {
	addLandedLot,
	deleteLotBranch,
	landedLineText,
} from '../../test/landed-store-lot-workspace.ts'
import { KEEP_NOW } from '../../test/lot-keep-workspace.constants.ts'
import { CLI_SURFACE_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { handoverStoreOf, recordHandoverClosed } from '../lib/handover/handover-store.ts'
import { runLotClose } from './lot-close.ts'
import { runPlan } from './plan.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandWorkspace } from '../../test/plan-command-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const QUIET = { load: 1, cores: 12, available: 8 * 1024 ** 3, source: 'vm_stat' } as const

/** `plan next plan.md` from the plan's folder, the machine quiet and no step running. */
function nextOf(params: { plan: CommandWorkspace; extra?: string[] }) {
	return runPlan({
		cwd: params.plan.planFolder,
		argv: ['next', 'plan.md', ...(params.extra ?? [])],
		seams: {
			machine: QUIET,
			check: { isAlive: () => false, startTimeOf: () => undefined },
			state: { environment: { XDG_STATE_HOME: params.plan.state } },
			now: new Date('2026-11-12T10:00:00.000Z'),
		},
	})
}

/** The label column of a line: the group it opens, blank on a continuation. */
function labelOf(line: string): string {
	return line.slice(0, 10).trim()
}

/** The labels of the lines of `output` that carry `text`. */
function labelsCarrying(params: { output: string; text: string }): string[] {
	return params.output
		.split('\n')
		.filter((line) => line.includes(params.text))
		.map(labelOf)
}

/** Whether a line under `label` carries every fragment. */
function hasLine(params: { output: string; label: string; fragments: string[] }): boolean {
	return params.output
		.split('\n')
		.some(
			(line) =>
				labelOf(line) === params.label &&
				params.fragments.every((fragment) => line.includes(fragment)),
		)
}

/** Whether a line of `output` opens the group `label`. */
function hasLabel(params: { output: string; label: string }): boolean {
	return params.output.split('\n').some((line) => labelOf(line) === params.label)
}

describe('plan next: landed lots', { timeout: STORE_CASE_TIMEOUT }, () => {
	const SCOPE = [LANDED_SCOPE_FILE]

	it('a lot of another feature holding the file of the entry, its hand-over committed elsewhere, its branch on main → the entry proposed, not held; the lot only under "landed"', () => {
		const { workspace, plan } = createLandedPlanWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', scope: SCOPE })
		const [handover] = lot.handovers

		const { exitCode, output } = nextOf({ plan })

		expect({
			exitCode,
			proposed: hasLine({ output, label: 'start', fragments: [PLAN_ENTRY_ID] }),
			held: hasLabel({ output, label: 'held' }),
			lotUnder: labelsCarrying({ output, text: LANDED_LOT }),
			landed: hasLine({
				output,
				label: 'landed',
				fragments: [
					'cli',
					landedLineText({ lot: LANDED_LOT, folder: handover.folder, target: 'main' }),
				],
			}),
		}).toEqual({ exitCode: 0, proposed: true, held: false, lotUnder: ['landed'], landed: true })
	})

	it('the same workspace with --json → the entry proposed, nothing held, landed holding the repository, the lot, the folder and the target', () => {
		const { workspace, plan } = createLandedPlanWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', scope: SCOPE })
		const [handover] = lot.handovers

		const { output } = nextOf({ plan, extra: ['--json'] })
		const json = JSON.parse(output) as {
			proposals: { id: string }[]
			held: unknown[]
			landed: unknown
		}

		expect({
			proposed: json.proposals.map((proposal) => proposal.id),
			held: json.held,
			landed: json.landed,
		}).toEqual({
			proposed: [PLAN_ENTRY_ID],
			held: [],
			landed: [{ repository: 'cli', lot: LANDED_LOT, folder: handover.folder, target: 'main' }],
		})
	})

	it('the same lot with its branch not on main → the entry held by it, the lot listed open, no landed line, landed empty in --json', () => {
		const { workspace, plan } = createLandedPlanWorkspace()
		addLandedLot({ workspace, merge: 'none', scope: SCOPE })

		const text = nextOf({ plan })
		const json = JSON.parse(nextOf({ plan, extra: ['--json'] }).output) as { landed: unknown }

		expect({
			exitCode: text.exitCode,
			held: hasLine({ output: text.output, label: 'held', fragments: [PLAN_ENTRY_ID] }),
			open: hasLine({ output: text.output, label: 'open', fragments: [LANDED_LOT] }),
			landedLine: hasLabel({ output: text.output, label: 'landed' }),
			landed: json.landed,
		}).toEqual({ exitCode: 1, held: true, open: true, landedLine: false, landed: [] })
	})

	it('a landed lot whose hand-over lot close already closed → the entry proposed, the lot nowhere in the text, landed empty in --json', () => {
		const { workspace, plan } = createLandedPlanWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', scope: SCOPE })
		recordHandoverClosed({
			store: handoverStoreOf(workspace.repository),
			name: lot.handovers[0].name,
			at: LANDED_CLOSED_AT,
		})

		const text = nextOf({ plan })
		const json = JSON.parse(nextOf({ plan, extra: ['--json'] }).output) as { landed: unknown }

		expect({
			exitCode: text.exitCode,
			proposed: hasLine({ output: text.output, label: 'start', fragments: [PLAN_ENTRY_ID] }),
			lotUnder: labelsCarrying({ output: text.output, text: LANDED_LOT }),
			landed: json.landed,
		}).toEqual({ exitCode: 0, proposed: true, lotUnder: [], landed: [] })
	})
})

describe('plan next: a landed lot after lot close', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a landed lot closed by a real lot close → the entry proposed, the lot not open, no landed line; the lot branch then deleted → still the same', () => {
		const { workspace, plan } = createLandedPlanWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', scope: [LANDED_SCOPE_FILE] })
		const { spawner } = createRecordingSpawner()
		const closed = runLotClose({
			cwd: workspace.repository,
			argv: [lot.handovers[0].name, '--json'],
			now: KEEP_NOW,
			spawner,
			listProcesses: function none() {
				return []
			},
		})
		const afterClose = nextOf({ plan })
		deleteLotBranch({ workspace, branch: lot.branch })
		const afterDelete = nextOf({ plan })

		expect({
			closeExit: closed.exitCode,
			views: [afterClose, afterDelete].map(({ output }) => ({
				proposed: hasLine({ output, label: 'start', fragments: [PLAN_ENTRY_ID] }),
				held: hasLabel({ output, label: 'held' }),
				lotMentioned: labelsCarrying({ output, text: LANDED_LOT }),
				landedLine: hasLabel({ output, label: 'landed' }),
			})),
		}).toEqual({
			closeExit: 0,
			views: [
				{ proposed: true, held: false, lotMentioned: [], landedLine: false },
				{ proposed: true, held: false, lotMentioned: [], landedLine: false },
			],
		})
	})
})

describe('plan --help: what plan next reads', () => {
	it(
		'--help → the next line says no git process except one probe per lot whose hand-over was committed outside its folder',
		() => {
			const result = spawnSync(
				process.execPath,
				[join(import.meta.dirname, '..', 'cli.ts'), 'plan', '--help'],
				{
					encoding: 'utf8',
				},
			)

			expect({
				status: result.status,
				outside: result.stdout.includes('outside its folder'),
			}).toEqual({
				status: 0,
				outside: true,
			})
		},
		CLI_SURFACE_CASE_TIMEOUT,
	)
})
