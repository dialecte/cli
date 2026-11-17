/** Lot plans with a `dialecte-lots` block, as the plan readers take them, and their marks on this machine. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { appendPlanMark } from '../src/lib/plan/plan-marks.ts'
import { PLAN_TEXT } from './brief-workspace.constants.ts'

/** `PLAN_TEXT` with a lot block holding `lots`; its one repository is the workspace's. */
export function planWithBlock(lots: readonly Record<string, unknown>[]): string {
	return `${PLAN_TEXT}\n\`\`\`json dialecte-lots\n${JSON.stringify({
		schema: 1,
		repositories: { repo: '../../repo' },
		lots,
	})}\n\`\`\`\n`
}

/** A lot entry of the block: `id`, on `branch`. */
export function planEntryOf(params: { id: string; branch: string }): Record<string, unknown> {
	return {
		id: params.id,
		title: 'an entry',
		kind: 'lot',
		scope: { repo: ['src/'] },
		match: { branch: params.branch },
	}
}

/** A plan `file` beside the brief holding `lots`, marked on this machine as `dialecte plan mark` does; its path. */
export function writeMarkedPlan(params: {
	briefFolder: string
	file: string
	lots: readonly Record<string, unknown>[]
}): string {
	const planPath = join(params.briefFolder, params.file)
	writeFileSync(planPath, planWithBlock(params.lots))
	appendPlanMark({ planPath, id: String(params.lots[0].id), by: 'a person' })
	return planPath
}
