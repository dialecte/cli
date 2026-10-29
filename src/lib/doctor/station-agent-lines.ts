/** `dialecte doctor`: the station agent files against what `skills sync` would write now. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readRememberedVendor } from '../models/remembered-vendor.ts'
import { AGENT_SKILL_FOLDERS, MANIFEST_FILE } from '../skills/sync-skills.constants.ts'
import { readSyncManifest } from '../skills/sync-skills.ts'
import { planStationAgents } from '../stations/render-station-agent.ts'
import { CLAUDE_AGENTS_FOLDER } from '../stations/station-agents.constants.ts'
import { STATION_AGENTS_SUBJECT as SUBJECT, SYNC_COMMAND } from './doctor.constants.ts'

import type { DoctorLine } from './doctor.types.ts'

/**
 * Only for a project whose manifest records station agents (synced for Claude Code, vendor anthropic). A file sync does not list is the user's
 * own: not compared.
 */
export function stationAgentLines(cwd: string): DoctorLine[] {
	const manifestFolder = join(cwd, AGENT_SKILL_FOLDERS.claude)
	if (!existsSync(join(manifestFolder, MANIFEST_FILE))) return []
	// only what a sync recorded: a project that dropped the claude target, or never got agents, is not nagged
	const listed = readSyncManifest(manifestFolder).stationAgents ?? []
	if (listed.length === 0) return []
	const plan = planStationAgents({ vendor: readRememberedVendor(cwd).vendor })
	if (plan.kind !== 'files') return []
	const missing: string[] = []
	const stale: string[] = []
	for (const file of plan.files) {
		const path = join(cwd, CLAUDE_AGENTS_FOLDER, file.name)
		if (!existsSync(path)) missing.push(file.name)
		else if (listed.includes(file.name) && readFileSync(path, 'utf8') !== file.content)
			stale.push(file.name)
	}
	if (missing.length === 0 && stale.length === 0)
		return [{ status: 'ok', subject: SUBJECT, detail: `${CLAUDE_AGENTS_FOLDER} in sync` }]
	const parts = [
		...(stale.length ? [`holds stale ${stale.join(', ')}`] : []),
		...(missing.length ? [`lacks ${missing.join(', ')}`] : []),
	]
	return [
		{
			status: 'warning',
			subject: SUBJECT,
			detail: `${CLAUDE_AGENTS_FOLDER} ${parts.join('; ')}`,
			fix: SYNC_COMMAND,
		},
	]
}
