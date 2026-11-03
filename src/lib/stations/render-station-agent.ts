/** The Claude Code agent file of each station of `dialecte-lot`: the envelope (model, tools), never the skills' text. */
import { MODEL_TIERS } from '../models/model-tiers.constants.ts'
import {
	BRIEF_DEFINED_STATIONS,
	CLAUDE_MODEL_ALIASES,
	CLAUDE_TOOLS_BY_ACCESS,
	GENERATED_NOTE,
	LOAD_SKILLS_LINE,
	LOT_SKILL,
	STATIONS_PAGE_PATH,
	NEVER_LINE,
	STATION_AGENT_PREFIX,
	STATIONS,
} from './station-agents.constants.ts'

import type { VendorId } from '../models/model-tiers.types.ts'
import type {
	StationAgentFile,
	StationAgentPlan,
	StationDefinition,
} from './station-agents.types.ts'

/** The `model:` value Claude Code accepts for a tier-map model name (`Sonnet 5.5` -> `sonnet`). */
export function claudeModelAlias(modelName: string): string | undefined {
	const alias = modelName.split(' ')[0].toLowerCase()
	return CLAUDE_MODEL_ALIASES.includes(alias) ? alias : undefined
}

/** The station line and the load line; a station that runs a skill under test reads none of the lot's skills. */
function stationLines(params: { station: StationDefinition }): string[] {
	const { station } = params
	const play = `You play the \`${station.name}\` station of \`${LOT_SKILL}\`:`
	if (BRIEF_DEFINED_STATIONS.includes(station.name))
		return [
			`${play} your brief carries your definition and names the only skill text you read; read no other.`,
			'',
		]
	return [
		`${play} its definition is ${STATIONS_PAGE_PATH}, section \`${station.name}\`.`,
		'',
		LOAD_SKILLS_LINE,
		'',
	]
}

/** The agent file of one station; `model` is the alias Claude Code accepts. */
export function renderStationAgent(params: { station: StationDefinition; model: string }): string {
	const { station, model } = params
	return [
		'---',
		`name: ${STATION_AGENT_PREFIX}${station.name}`,
		`description: ${JSON.stringify(station.description)}`,
		`tools: ${CLAUDE_TOOLS_BY_ACCESS[station.access].join(', ')}`,
		`model: ${model}`,
		'---',
		`<!-- ${GENERATED_NOTE} -->`,
		'',
		...stationLines({ station }),
		NEVER_LINE,
		'',
	].join('\n')
}

/** The agent files for Claude Code from the tier map of the project's vendor; none for another vendor. */
export function planStationAgents(params: { vendor: VendorId | undefined }): StationAgentPlan {
	const { vendor } = params
	if (vendor === undefined)
		return {
			kind: 'skipped',
			reason:
				'no model vendor known for this project, so no Claude Code station agents: run `skills sync --vendor anthropic`',
		}
	if (vendor !== 'anthropic')
		return {
			kind: 'skipped',
			reason: `no Claude Code station agents: the project's vendor is ${vendor}, whose tiers are named by \`dialecte models\``,
		}
	const tiers = MODEL_TIERS.vendors[vendor].tiers
	const files: StationAgentFile[] = []
	for (const station of STATIONS) {
		const modelName = tiers[station.tier].model
		const model = claudeModelAlias(modelName)
		if (model === undefined)
			return {
				kind: 'skipped',
				reason: `no Claude Code station agents: "${modelName}" (${station.tier}) is not a model name Claude Code accepts`,
			}
		files.push({
			name: `${STATION_AGENT_PREFIX}${station.name}.md`,
			content: renderStationAgent({ station, model }),
		})
	}
	return { kind: 'files', files }
}
