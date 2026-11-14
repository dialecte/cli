import type { ReaskUncheckedParams } from '../src/lib/knowledge/ask/ask.types.ts'

/** The facts folder of a re-ask case, the claim and the questions it was given, in order. */
export type ReaskScenario = {
	folder: string
	claim: ReaskUncheckedParams['claim']
	claimed: { question: string }[]
}
