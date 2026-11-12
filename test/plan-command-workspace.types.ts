import type { PlanWorkspace } from './plan-facts.types.ts'

/** The plan workspace with its one repository `cli`, a git main checkout made of files beside the plan folder. */
export type CommandWorkspace = PlanWorkspace & {
	/** `<root>/cli`. */
	cli: string
	/** `<root>/cli/.git`. */
	common: string
}
