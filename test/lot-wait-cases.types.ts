import type { FlowStep } from './simulated-lot.types.ts'

/** A scenario waited on from start to end: the steps taken, what each reported, the transitions left in the folder. */
export type FlowRow = {
	scenario: string
	steps: FlowStep[]
	observed: string[]
	summary: string[]
}

/** A usage error or unknown id of `lot wait`: its title and the words given. */
export type UsageRow = { title: string; argv: string[] }
