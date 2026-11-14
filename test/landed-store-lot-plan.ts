/**
 * A plan over one real repository `cli` (a scratch workspace with its store): the plan holds one lot entry whose scope
 * a store lot of the repository can hold. The caller unstubs the environment.
 */
import { dirname, join } from 'node:path'

import { runPlan } from '../src/commands/plan.ts'
import { createBriefWorkspace } from './brief-workspace.ts'
import { LANDED_SCOPE_FILE, PLAN_ENTRY_ID } from './landed-store-lot-plan.constants.ts'
import { lotJson, writePlanWithBlock } from './plan-command-workspace.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { CommandWorkspace } from './plan-command-workspace.types.ts'

/**
 * The scratch workspace and the plan folder beside its repository (`<workspace>/plans/plan.md`, repository `cli` at
 * `../repo`): one `lot` entry whose scope is the one file the landed lots of the cases hold.
 */
export function createLandedPlanWorkspace(): { workspace: BriefWorkspace; plan: CommandWorkspace } {
	const workspace = createBriefWorkspace()
	const planFolder = join(workspace.workspace, 'plans')
	const plan: CommandWorkspace = {
		root: workspace.workspace,
		// `$XDG_STATE_HOME`: the list of lot stores sits at `<state>/dialecte/lot-stores`
		state: dirname(dirname(workspace.storeList)),
		planFolder,
		planPath: join(planFolder, 'plan.md'),
		cli: workspace.repository,
		common: join(workspace.repository, '.git'),
	}
	writePlanWithBlock({
		workspace: plan,
		repositories: { cli: '../repo' },
		lots: [lotJson(PLAN_ENTRY_ID, { scope: { cli: [LANDED_SCOPE_FILE] } })],
	})
	return { workspace, plan }
}

/**
 * What `plan next plan.md` says of the plan's entry and of `lot`: whether the entry is proposed (under `start`), held,
 * and the labels of the groups that mention the lot.
 */
export function planViewOf(params: { plan: CommandWorkspace; lot: string }) {
	const { output } = runPlan({
		cwd: params.plan.planFolder,
		argv: ['next', 'plan.md'],
		seams: {
			machine: { load: 1, cores: 12, available: 8 * 1024 ** 3, source: 'vm_stat' },
			check: { isAlive: () => false, startTimeOf: () => undefined },
			state: { environment: { XDG_STATE_HOME: params.plan.state } },
			now: new Date('2026-11-12T10:00:00.000Z'),
		},
	})
	const lines = output.split('\n')
	function label(line: string): string {
		return line.slice(0, 10).trim()
	}
	return {
		proposed: lines.some((line) => label(line) === 'start' && line.includes(PLAN_ENTRY_ID)),
		held: lines.some((line) => label(line) === 'held'),
		lotMentionedUnder: lines.filter((line) => line.includes(params.lot)).map(label),
	}
}
