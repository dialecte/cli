/**
 * The plan entry a lot carries out: found at its start among the plans that hold it (the brief's own plan, and every
 * plan marked on this machine one of whose entries is on the brief's branch), recorded in `plan-entry.json` when
 * exactly one entry is on that branch, never a guess. The public-text checks read the recorded plan's ids, whatever
 * the machine's marks say later.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { readPlanBlock } from '../plan/plan-block.ts'
import { listMarkedPlans } from '../plan/plan-marks.ts'
import { PLAN_ENTRY_SCHEMA } from './plan-entry.constants.ts'
import { publishOnce, recordText } from './publish.ts'
import { STORE_FILES } from './store.constants.ts'

import type { LotPlan, LotPlanEntry } from './plan-entry.types.ts'

/**
 * The plans that hold a lot: the plan at `planPath` when its block reads (the brief's own plan), and every plan marked
 * on this machine one of whose entries is on `branch`. A plan whose block cannot be read holds none.
 */
export function plansHoldingLot(params: {
	planPath: string | undefined
	branch: string | undefined
}): LotPlan[] {
	const own = params.planPath === undefined ? undefined : realPathOf(params.planPath)
	const plans = [...(own === undefined ? [] : [own]), ...listMarkedPlans()]
	return [...new Set(plans)].flatMap(function lotPlanOf(plan): LotPlan[] {
		const read = readPlanBlock({ planPath: plan })
		if ('faults' in read) return []
		const holdsLot =
			plan === own ||
			read.block.lots.some(function isOfBranch(entry) {
				return params.branch !== undefined && entry.match?.branch === params.branch
			})
		return holdsLot ? [{ plan, block: read.block }] : []
	})
}

/** The one entry on `branch` of the plans that hold the lot; undefined for none or several. */
export function findPlanEntry(params: {
	planPath: string | undefined
	branch: string
}): LotPlanEntry | undefined {
	const entries = plansHoldingLot(params).flatMap(function entriesOnBranch({ plan, block }) {
		return block.lots
			.filter((entry) => entry.match?.branch === params.branch)
			.map((entry) => ({ plan, id: entry.id }))
	})
	return entries.length === 1 ? entries[0] : undefined
}

/** Publishes the folder's `plan-entry.json`, read-only, once. */
export function writePlanEntry(params: { folder: string; entry: LotPlanEntry }): void {
	publishOnce({
		path: join(params.folder, STORE_FILES.planEntry),
		text: recordText({ schema: PLAN_ENTRY_SCHEMA, ...params.entry }),
		readOnly: true,
	})
}

/** The folder's recorded plan entry; undefined without one or when it does not read. */
export function readPlanEntry(params: { folder: string }): LotPlanEntry | undefined {
	const path = join(params.folder, STORE_FILES.planEntry)
	if (!existsSync(path)) return undefined
	try {
		const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
		return value.schema === PLAN_ENTRY_SCHEMA &&
			typeof value.plan === 'string' &&
			typeof value.id === 'string'
			? { plan: value.plan, id: value.id }
			: undefined
	} catch {
		return undefined
	}
}
