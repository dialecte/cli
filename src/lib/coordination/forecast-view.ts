/**
 * A lot's forecast as the card, `lot status` and `plan next` read it (33CO 4.6), files only: its newest complete run's
 * main line, and for each other open lot of its store the newer of its own line against that lot and that lot's line
 * against it, so a pair is seen from both sides whichever lot ran last.
 */
import { basename, dirname, join } from 'node:path'

import { readStoreEntries } from '../handover/handover-store-read.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { registryOfLotFolder } from '../store/lot-records.ts'
import { listLotFolderNames } from '../store/store-folder.ts'
import { isExclusivePath } from './exclusive-paths.ts'
import { readForecastRecord } from './forecast-record.ts'
import {
	AGAINST_MAIN,
	FORECAST_CONFLICT_SEPARATOR,
	FORECAST_AGE_TEXTS,
	FORECAST_CONFLICT_TEXTS,
	FORECAST_HOLD_TEXTS,
	FORECAST_RANGE_SEPARATOR,
	HOURS_PER_DAY,
	MINUTE_MS,
	MINUTES_PER_HOUR,
} from './forecast.constants.ts'
import { openLotOf } from './open-lot.ts'

import type {
	ForecastConflict,
	ForecastLine,
	ForecastPairView,
	ForecastView,
} from './forecast.types.ts'

/** The merged view of the lot's forecast; no git is run. */
export function forecastViewOf(params: { lotFolder: string }): ForecastView {
	const { lotFolder } = params
	const self = basename(lotFolder)
	const own = readForecastRecord({ lotFolder }).lines
	const registry = registryOfLotFolder(lotFolder)
	const entries = readStoreEntries(registry)
	const pairs = listLotFolderNames({ store: dirname(lotFolder) }).flatMap(
		function pairOf(name): ForecastPairView[] {
			if (name === self) return []
			const otherFolder = join(dirname(lotFolder), name)
			// a lot that closed or is damaged is no pair any more: its old lines are not shown
			const other = openLotOf({ lotFolder: otherFolder, registry, entries })
			if (other === undefined || 'damage' in other) return []
			const mine = own.find((line) => line.against === name)
			const theirs = readForecastRecord({ lotFolder: otherFolder }).lines.find(
				(line) => line.against === self,
			)
			const newer = newerPairOf({ mine, theirs })
			return newer === undefined ? [] : [{ lot: name, ...newer }]
		},
	)
	return { main: own.find((line) => line.against === AGAINST_MAIN), pairs }
}

/** The newer of the two sides' lines of a pair (the lot's own on a tie); none when neither side has one. */
function newerPairOf(params: {
	mine: ForecastLine | undefined
	theirs: ForecastLine | undefined
}): Omit<ForecastPairView, 'lot'> | undefined {
	const { mine, theirs } = params
	if (theirs !== undefined && (mine === undefined || theirs.at > mine.at))
		return { line: theirs, from: 'other' }
	return mine === undefined ? undefined : { line: mine, from: 'self' }
}

/** A line's conflicts as text, then how many more the line left out; empty for none. */
export function forecastConflictsText(line: Pick<ForecastLine, 'conflicts' | 'more'>): string {
	return [
		...(line.conflicts ?? []).map(conflictTextOf),
		...(line.more
			? [
					fillMessage({
						template: FORECAST_CONFLICT_TEXTS.more,
						values: { count: String(line.more) },
					}),
				]
			: []),
	].join(FORECAST_CONFLICT_SEPARATOR)
}

/**
 * What holds a pair the forecast did not clear, as text: its conflicts, a shared lock file, or why it is unknown;
 * undefined for a clean line.
 */
export function forecastHoldText(line: ForecastLine): string | undefined {
	if (line.verdict === 'clean') return undefined
	if (line.verdict === 'unknown')
		return fillMessage({
			template: FORECAST_HOLD_TEXTS.unknown,
			values: { reason: line.reason ?? '' },
		})
	if (line.verdict === 'exclusive') return FORECAST_HOLD_TEXTS.exclusive
	return fillMessage({
		template: FORECAST_HOLD_TEXTS.conflict,
		values: { conflicts: forecastConflictsText(line) },
	})
}

/** One conflict as text: its path, its line ranges when it has some, its kind. */
function conflictTextOf(conflict: ForecastConflict): string {
	if (conflict.lines.length === 0)
		return fillMessage({
			template: FORECAST_CONFLICT_TEXTS.withoutLines,
			values: { path: conflict.path, kind: conflict.kind },
		})
	return fillMessage({
		template: FORECAST_CONFLICT_TEXTS.withLines,
		values: {
			path: conflict.path,
			kind: conflict.kind,
			ranges: conflict.lines.map(([from, to]) => `${from}-${to}`).join(FORECAST_RANGE_SEPARATOR),
		},
	})
}

/** How long ago a line was written, from `now`: whole minutes under an hour, whole hours under a day, else days. */
export function forecastAgeText(params: { at: string; now: Date }): string {
	const minutes = Math.max(
		0,
		Math.floor((params.now.getTime() - Date.parse(params.at)) / MINUTE_MS),
	)
	const hours = Math.floor(minutes / MINUTES_PER_HOUR)
	if (hours === 0)
		return fillMessage({ template: FORECAST_AGE_TEXTS.minutes, values: { count: String(minutes) } })
	if (hours < HOURS_PER_DAY)
		return fillMessage({ template: FORECAST_AGE_TEXTS.hours, values: { count: String(hours) } })
	return fillMessage({
		template: FORECAST_AGE_TEXTS.days,
		values: { count: String(Math.floor(hours / HOURS_PER_DAY)) },
	})
}

/**
 * A lot's forecast in short, for a reader that holds work by it (`plan next`): the paths its newest lines conflict on (a
 * shared lock file counted), or why one is unknown; undefined when the lot has no forecast recorded. Files only.
 */
export function forecastStandingOf(params: {
	lotFolder: string
}): { conflicts: string[] } | { unknown: string } | undefined {
	const view = forecastViewOf(params)
	if (view.main === undefined) return undefined
	const lines = [view.main, ...view.pairs.map((pair) => pair.line)]
	const unknown = lines.find((line) => line.verdict === 'unknown')
	if (unknown !== undefined) return { unknown: unknown.reason ?? '' }
	const paths = lines.flatMap((line) => [
		...(line.conflicts ?? []).map((conflict) => conflict.path),
		...(line.verdict === 'exclusive' ? (line.shared ?? []).filter(isExclusivePath) : []),
	])
	return { conflicts: [...new Set(paths)].sort() }
}
