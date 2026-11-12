/**
 * The module that builds the card's usage starts no process (33L0 section 8: it reads `events.jsonl` only, D7): its
 * import graph reaches no `node:child_process`, and the card builder imports it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { reachFrom } from '../../../test/import-reach.ts'
import { REPORT_NOW } from '../../../test/lot-report-workspace.constants.ts'
import { appendLotEvents } from '../../../test/lot-report-workspace.ts'
import { createStationLot } from '../../../test/lot-station-workspace.ts'
import { stationRun } from '../../../test/report-events.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readHandoverUsage } from './handover-usage.ts'
import { readLotReport } from './read-lot-report.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../../test/lot-station-workspace.types.ts'
import type { LotEvent } from './event.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const REPORTED_SECONDS = 600

/** A committed lot whose stations all ended with no start: `first` reports a duration, the others none. */
function endOnlyLot(params: { reportedFirst: boolean; runs: number }): StationLot {
	const lot = createStationLot({ state: 'committed' })
	const events: LotEvent[] = Array.from({ length: params.runs }, (_unused, index) =>
		stationRun({
			run: `run-${index}`,
			station: 'implementer',
			start: null,
			end: `10:${String(10 + index)}`,
			endFields: index === 0 && params.reportedFirst ? { duration: REPORTED_SECONDS } : {},
		}),
	).flat()
	appendLotEvents({ lot, events })
	return lot
}

/** The agent time the usage row and the report give for the same lot. */
function agentTimesOf(lot: StationLot) {
	return {
		usage: readHandoverUsage({ folder: lot.lotFolder })?.agentTime,
		report: readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.totals.time.agentTime,
	}
}

const USAGE_MODULE = join(import.meta.dirname, 'handover-usage.ts')
const CARD_MODULE = join(import.meta.dirname, '..', 'handover', 'handover-card.ts')
const USAGE_SPECIFIER = '../events/handover-usage.ts'

describe('the usage of a hand-over', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the usage module reaches no node:child_process, and the card builder imports it', () => {
		expect({
			childProcessImporters: reachFrom(USAGE_MODULE).childProcessImporters,
			importedByTheCard: readFileSync(CARD_MODULE, 'utf8').includes(`from '${USAGE_SPECIFIER}'`),
		}).toEqual({ childProcessImporters: [], importedByTheCard: true })
	})
})

describe('the agent time of a lot: the usage row and the report give one figure', () => {
	it('two end-only station runs with no duration → both say null (unknown), never 0', () => {
		expect(agentTimesOf(endOnlyLot({ reportedFirst: false, runs: 2 }))).toEqual({
			usage: null,
			report: null,
		})
	})

	it('one end-only run reporting a duration and one reporting none → both say the known seconds and 1 unknown run', () => {
		const known = { known: REPORTED_SECONDS, unknownRuns: 1 }

		expect(agentTimesOf(endOnlyLot({ reportedFirst: true, runs: 2 }))).toEqual({
			usage: known,
			report: known,
		})
	})
})
