import type { PlanBlock } from '../plan/plan-block.types.ts'

/** The plan entry a lot carries out (`plan-entry.json`): the plan's real path and the entry's id. */
export type LotPlanEntry = { plan: string; id: string }

/** A plan that holds a lot: its real path and its lot block. */
export type LotPlan = { plan: string; block: PlanBlock }
