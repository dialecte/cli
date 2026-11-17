/**
 * `dialecte lot forecast [<id>] [--json] [--against <lot>]`: the conflict forecast of a lot's work against main and every
 * open lot of its store (33CO 4.8), appended to its `forecast.jsonl` as one run, a `forecast` event in its events, and
 * printed. Exit 0 clean, 1 conflict (or exclusive), 3 unknown, 2 usage or refusal.
 */
import { basename, dirname, join } from 'node:path'

import { appendForecastRun } from '../lib/coordination/forecast-record.ts'
import {
	FORECAST_EVENT_KIND,
	FORECAST_EXIT_CODES,
	FORECAST_VERDICT_ORDER,
} from '../lib/coordination/forecast.constants.ts'
import { forecastLot } from '../lib/coordination/forecast.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { makeEnvelope, writeEvent } from '../lib/events/write-event.ts'
import { readStoreEntries } from '../lib/handover/handover-store-read.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { lotFailureExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import {
	isOpenRealLot,
	readCheckedLotState,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { lotOfWorktree, noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import {
	FORECAST_CONFLICT_SEPARATOR,
	FORECAST_FLAGS,
	FORECAST_LIST_SEPARATOR,
	FORECAST_PART_SEPARATOR,
	FORECAST_SHORT_COMMIT,
	FORECAST_VALUE_OPTIONS,
	LOT_FORECAST_TEXTS,
	SIMULATED_WORD,
} from './lot-forecast.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	ForecastConflict,
	ForecastLine,
	ForecastRun,
} from '../lib/coordination/forecast.types.ts'
import type { LotForecastJson } from './lot-forecast.types.ts'

/** Runs the forecast of the lot `<id>` names, else of the lot of the current worktree. */
export function lotForecast(params: {
	cwd: string
	argv: string[]
	now?: Date
	stepLimitMs?: number
}): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: FORECAST_VALUE_OPTIONS,
		flags: FORECAST_FLAGS,
	})
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const [id, ...extra] = read.words
	if (extra.length > 0)
		return lotUsageExit({
			reason: fillMessage({
				template: LOT_FORECAST_TEXTS.extra,
				values: { extra: extra.join(' ') },
			}),
			json,
		})
	const lotFolder = lotFolderOf({ cwd: params.cwd, id })
	if ('lines' in lotFolder) return lotRefusalExit({ lines: lotFolder.lines, json })
	const refusal = refusalOf({ lotFolder: lotFolder.folder })
	if (refusal !== undefined) return lotRefusalExit({ lines: [refusal], json })
	const against = againstOf({
		cwd: params.cwd,
		lotFolder: lotFolder.folder,
		word: read.values.get('against'),
	})
	if ('lines' in against) return lotRefusalExit({ lines: against.lines, json })
	const now = params.now
	const run = forecastLot({
		lotFolder: lotFolder.folder,
		against: against.name,
		trigger: 'forecast',
		now: now ? () => now : undefined,
		stepLimitMs: params.stepLimitMs,
	})
	const file = join(lotFolder.folder, STORE_FILES.forecast)
	try {
		appendForecastRun({ lotFolder: lotFolder.folder, lines: run.lines })
	} catch (error) {
		return lotFailureExit({
			lines: [
				fillMessage({
					template: LOT_FORECAST_TEXTS.writeFailure,
					values: { file, message: (error as Error).message },
				}),
			],
			json,
		})
	}
	const lot = basename(lotFolder.folder)
	const eventNote = writeForecastEvent({ lotFolder: lotFolder.folder, lot, run })
	const exitCode = FORECAST_EXIT_CODES[run.verdict]
	if (json) {
		const printed: LotForecastJson = { lot, verdict: run.verdict, lines: run.lines }
		return { exitCode, output: jsonOf(printed, 2) }
	}
	return {
		exitCode,
		output: textOf([...forecastTextLines({ lot, run }), ...(eventNote ? [eventNote] : [])]),
	}
}

/** The text of a run: a header, one line per comparison, the verdict last. */
export function forecastTextLines(params: { lot: string; run: ForecastRun }): string[] {
	const { lot, run } = params
	return [
		fillMessage({
			template: LOT_FORECAST_TEXTS.header,
			values: { lot, run: run.run, seconds: (run.durationMs / 1000).toFixed(1) },
		}),
		...run.lines.map(lineTextOf),
		fillMessage({ template: LOT_FORECAST_TEXTS.verdict, values: { verdict: run.verdict } }),
	]
}

/** One comparison as text: against what, its verdict, its conflicts and shared files, or why it is unknown. */
function lineTextOf(line: ForecastLine): string {
	const against =
		line.against === 'main'
			? fillMessage({
					template: LOT_FORECAST_TEXTS.mainLabel,
					values: {
						ref: line.main.ref,
						commit: (line.main.commit ?? '-').slice(0, FORECAST_SHORT_COMMIT),
					},
				})
			: line.against
	const verdict =
		line.verdict === 'unknown'
			? fillMessage({ template: LOT_FORECAST_TEXTS.unknown, values: { reason: line.reason ?? '' } })
			: line.verdict
	const parts = line.verdict === 'unknown' ? [] : detailPartsOf(line)
	return fillMessage({
		template: LOT_FORECAST_TEXTS.line,
		values: {
			against,
			verdict,
			details: parts.length === 0 ? '' : ` ${parts.join(FORECAST_PART_SEPARATOR)}`,
		},
	})
}

/** The details of a known comparison: its conflicts (then how many more), its shared files (then how many more). */
function detailPartsOf(line: ForecastLine): string[] {
	const conflicts = [
		...(line.conflicts ?? []).map(conflictTextOf),
		...(line.more ? [moreTextOf(line.more)] : []),
	]
	const shared = [...(line.shared ?? []), ...(line.moreShared ? [moreTextOf(line.moreShared)] : [])]
	return [
		...(conflicts.length === 0 ? [] : [conflicts.join(FORECAST_CONFLICT_SEPARATOR)]),
		...(shared.length === 0
			? []
			: [
					fillMessage({
						template: LOT_FORECAST_TEXTS.shares,
						values: { paths: shared.join(FORECAST_LIST_SEPARATOR) },
					}),
				]),
	]
}

/** One conflict as text: its path, its line ranges when it has some, its kind. */
function conflictTextOf(conflict: ForecastConflict): string {
	if (conflict.lines.length === 0)
		return fillMessage({
			template: LOT_FORECAST_TEXTS.conflictWithoutLines,
			values: { path: conflict.path, kind: conflict.kind },
		})
	return fillMessage({
		template: LOT_FORECAST_TEXTS.conflictWithLines,
		values: {
			path: conflict.path,
			kind: conflict.kind,
			ranges: conflict.lines.map(([from, to]) => `${from}-${to}`).join(FORECAST_LIST_SEPARATOR),
		},
	})
}

/** `<count> more`: the paths a line left out. */
function moreTextOf(count: number): string {
	return fillMessage({ template: LOT_FORECAST_TEXTS.more, values: { count: String(count) } })
}

/** The lot folder `<id>` names, else the lot of the worktree holding `cwd`; the refusal lines when there is none. */
function lotFolderOf(params: {
	cwd: string
	id: string | undefined
}): { folder: string } | { lines: string[] } {
	if (params.id !== undefined) {
		const required = requiredLotOf({ argument: params.id, cwd: params.cwd, mode: 'read' })
		return 'exitCode' in required ? { lines: [...required.lines] } : { folder: required.lot }
	}
	const folder = lotOfWorktree({ cwd: params.cwd })
	return folder === undefined ? { lines: [LOT_FORECAST_TEXTS.noLot] } : { folder }
}

/**
 * Why the lot cannot be forecast: it does not read, it is damaged, simulated or no longer open (committed, canceled, or
 * failed on an overlap); undefined for an open real lot.
 */
function refusalOf(params: { lotFolder: string }): string | undefined {
	const { lotFolder } = params
	const lot = basename(lotFolder)
	const registry = registryOfLotFolder(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry, entries: readStoreEntries(registry) })
	if (checked === undefined) return noLotRefusal(lot)
	if ('damage' in checked)
		return fillMessage({
			template: LOT_FORECAST_TEXTS.damaged,
			values: { lot, damage: checked.damage },
		})
	// a simulated lot is never open; named so, never by the state its scenario plays
	if (checked.input.identity.simulated)
		return fillMessage({
			template: LOT_FORECAST_TEXTS.notOpen,
			values: { lot, state: SIMULATED_WORD },
		})
	if (isOpenRealLot(checked.input)) return undefined
	return fillMessage({
		template: LOT_FORECAST_TEXTS.notOpen,
		values: { lot, state: lotState(checked.input).state },
	})
}

/** The lot `--against` names, of the same store and not the lot itself; none without the option. */
function againstOf(params: {
	cwd: string
	lotFolder: string
	word: string | undefined
}): { name: string | undefined } | { lines: string[] } {
	const { word } = params
	if (word === undefined) return { name: undefined }
	const required = requiredLotOf({ argument: word, cwd: params.cwd, mode: 'read' })
	if ('exitCode' in required) return { lines: [...required.lines] }
	if (required.lot === params.lotFolder) return { lines: [LOT_FORECAST_TEXTS.againstSelf] }
	if (dirname(required.lot) !== dirname(params.lotFolder))
		return {
			lines: [
				fillMessage({
					template: LOT_FORECAST_TEXTS.againstClosed,
					values: { lot: basename(required.lot) },
				}),
			],
		}
	return { name: basename(required.lot) }
}

/** Writes the run's `forecast` event (its verdict counts and time); the line to print when it could not be. */
function writeForecastEvent(params: {
	lotFolder: string
	lot: string
	run: ForecastRun
}): string | undefined {
	const { lotFolder, lot, run } = params
	const file = join(lotFolder, STORE_FILES.events)
	const verdicts = Object.fromEntries(
		FORECAST_VERDICT_ORDER.map((verdict) => [
			verdict,
			run.lines.filter((line) => line.verdict === verdict).length,
		]),
	)
	try {
		writeEvent({
			file,
			event: {
				...makeEnvelope({
					lot,
					kind: FORECAST_EVENT_KIND,
					by: 'cli',
					cli: readCliVersion(),
					simulated: false,
					hostEvent: null,
				}),
				run: run.run,
				trigger: 'forecast',
				verdict: run.verdict,
				verdicts,
				durationMs: run.durationMs,
			},
			limit: EVENT_LINE_LIMIT,
		})
		return undefined
	} catch (error) {
		return fillMessage({
			template: LOT_FORECAST_TEXTS.eventFailure,
			values: { file, message: (error as Error).message },
		})
	}
}
