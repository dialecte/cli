/**
 * Writes the station agent files into `.claude/agents` and owns them through the claude skills manifest: a file
 * the manifest lists is replaced or removed by a later sync; a file of the same name that it does not list is
 * the user's and is never touched.
 */
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { AGENT_SKILL_FOLDERS } from '../skills/sync-skills.constants.ts'
import { readSyncManifest } from '../skills/sync-skills.ts'
import { CLAUDE_AGENTS_FOLDER, STATION_AGENT_FILE_PATTERN } from './station-agents.constants.ts'
import { updateStationManifest } from './station-manifest.ts'

import type { StationAgentPlan, StationAgentReport } from './station-agents.types.ts'

export function syncStationAgents(params: {
	cwd: string
	plan: StationAgentPlan
}): StationAgentReport {
	const { cwd, plan } = params
	const manifestFolder = join(cwd, AGENT_SKILL_FOLDERS.claude)
	const agentsFolder = join(cwd, CLAUDE_AGENTS_FOLDER)
	const previous = (readSyncManifest(manifestFolder).stationAgents ?? []).filter((name) =>
		STATION_AGENT_FILE_PATTERN.test(name),
	)
	const files = plan.kind === 'files' ? plan.files : []
	const report: StationAgentReport = {
		written: [],
		removed: [],
		conflicts: [],
		...(plan.kind === 'skipped' ? { skippedReason: plan.reason } : {}),
	}
	const owned: string[] = []

	const produced = new Set(files.map((file) => file.name))
	for (const name of previous.filter((candidate) => !produced.has(candidate))) {
		const path = join(agentsFolder, name)
		if (!existsSync(path) || !lstatSync(path).isFile()) continue
		rmSync(path)
		report.removed.push(name)
	}

	// the folder a sync made, once its files are gone: an empty `.claude/agents` would read as the user's
	if (report.removed.length > 0) removeFolderIfEmpty(agentsFolder)

	for (const file of files) {
		const path = join(agentsFolder, file.name)
		if (existsSync(path)) {
			if (readFileSync(path, 'utf8') === file.content) {
				owned.push(file.name)
				continue
			}
			if (!previous.includes(file.name)) {
				report.conflicts.push(path)
				continue
			}
		}
		mkdirSync(agentsFolder, { recursive: true })
		writeFileSync(path, file.content)
		owned.push(file.name)
		report.written.push(file.name)
	}

	updateStationManifest({ folder: manifestFolder, patch: { stationAgents: owned } })
	return report
}

/** `rmdir` only removes an empty folder: a file that arrived meanwhile, or a folder already gone, is not an error. */
function removeFolderIfEmpty(folder: string): void {
	try {
		rmdirSync(folder)
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException
		if (code !== 'ENOTEMPTY' && code !== 'ENOENT') throw error
	}
}
