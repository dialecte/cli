/**
 * The card's `usage` row data (33L0 section 8, D7): the lot folder's `events.jsonl` read, its station runs summed as
 * the report sums them. File reads only: no git, no child process in this module or what it imports.
 */
import { join } from 'node:path'

import { lotFolderOf } from '../store/lot-folder.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { agentTimeOf } from './attribute-steps.ts'
import { STATION_KIND_PREFIX } from './events.constants.ts'
import { summarizeStationRuns } from './lot-report.ts'
import { pairRuns, runsOfKind } from './pair-runs.ts'
import { readEvents } from './read-events.ts'

import type { HandoverUsage } from '../handover/handover.types.ts'

/**
 * The usage of a hand-over folder that is a lot folder holding at least one station event, read from its
 * `events.jsonl` only (no process, no git); undefined for any other folder.
 */
export function readHandoverUsage(params: { folder: string }): HandoverUsage | undefined {
	const lotFolder = lotFolderOf({ folder: params.folder })
	if (lotFolder === undefined) return undefined
	const { events } = readEvents({ file: join(lotFolder, STORE_FILES.events) })
	const stationRuns = runsOfKind({
		runs: pairRuns({ events }).runs,
		prefix: STATION_KIND_PREFIX,
	})
	if (stationRuns.length === 0) return undefined
	// the status of a run without its end plays no part in the usage
	const summary = summarizeStationRuns({ stationRuns, terminal: false })
	return {
		tokens: summary.tokens,
		agents: summary.agents.length,
		runs: summary.runs.length,
		// the report's figure: a run still open counts to the time the card is read
		agentTime: agentTimeOf({ stationRuns, openUntil: Date.now() }),
		money: summary.money,
	}
}
