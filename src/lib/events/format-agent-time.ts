/** The one agent-time phrase of the report's time line and the card's usage row (33L0 sections 7 and 8). */
import { formatDuration } from '../progress/format-duration.ts'
import { MS_PER_SECOND } from './attribute-steps.constants.ts'

import type { AgentTime, AgentTimeTexts } from './attribute-steps.types.ts'

/**
 * The agent time of `runs` station runs in the place's `texts`: `known` when every run is timed, `atLeast` (a lower
 * bound and how many of the runs are unknown) when some are not, `unknown` when none is. Never a 0 for an unknown.
 */
export function formatAgentTime(params: {
	agentTime: AgentTime
	runs: number
	texts: AgentTimeTexts
}): string {
	const { agentTime, texts } = params
	if (agentTime === null) return texts.unknown
	const time = formatDuration(agentTime.known * MS_PER_SECOND)
	if (agentTime.unknownRuns === 0) return texts.known.replace('{time}', time)
	return texts.atLeast
		.replace('{time}', time)
		.replace('{unknown}', String(agentTime.unknownRuns))
		.replace('{runs}', String(params.runs))
}
