import type { LANDING_FLOWS } from './flow.constants.ts'

/** How a repository's lots land: through a pull request and the merge queue, or through a hand-over a person runs. */
export type LandingFlowName = keyof typeof LANDING_FLOWS

/** What a flow decides: a working lot's manual next line (`{name}` the lot) and the verbs it refuses. */
export type LandingFlow = {
	manualNext: string
	refused: readonly string[]
}
