/**
 * The lot folder's `forecast.jsonl` (33CO 4.6): one line per comparison, the lines of a run written in one append and
 * sharing its `run` id and `of`, each within the store's atomic append. A reader trusts only the newest complete run.
 */
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendLine, makeEnvelope, writeEvent } from '../events/write-event.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import {
	FORECAST_EVENT_KIND,
	FORECAST_RECORD_TEXTS,
	FORECAST_CONFLICT_CAP,
	FORECAST_LINE_LIMIT,
	FORECAST_OPTIONAL_KEYS,
	FORECAST_RANGE_CAP,
	FORECAST_REQUIRED_KEYS,
	FORECAST_SCHEMA,
	FORECAST_SHARED_CAP,
	FORECAST_TRIGGERS,
	FORECAST_VERDICT_ORDER,
} from './forecast.constants.ts'

import type {
	ForecastLine,
	ForecastRecord,
	ForecastRun,
	ForecastTrigger,
	RecordedForecast,
} from './forecast.types.ts'

/**
 * The line cut to the caps (10 shared paths, 10 conflict paths, 3 ranges per path) and then to the line limit, the
 * paths left out counted in `moreShared` and `more`; a line already within them is returned as it is.
 */
export function fitForecastLine(line: ForecastLine): ForecastLine {
	const shared = line.shared ?? []
	const conflicts = (line.conflicts ?? []).map((conflict) => ({
		...conflict,
		lines: conflict.lines.slice(0, FORECAST_RANGE_CAP),
	}))
	let keptShared = Math.min(shared.length, FORECAST_SHARED_CAP)
	let keptConflicts = Math.min(conflicts.length, FORECAST_CONFLICT_CAP)
	let fitted = cutLine({ line, shared, conflicts, keptShared, keptConflicts })
	// a line still over the limit (long paths) drops conflict paths first, then shared paths, one at a time
	while (lineBytesOf(fitted) > FORECAST_LINE_LIMIT && keptConflicts + keptShared > 0) {
		if (keptConflicts > 0) keptConflicts -= 1
		else keptShared -= 1
		fitted = cutLine({ line, shared, conflicts, keptShared, keptConflicts })
	}
	return fitted
}

/** Appends the lines of one run in one write (each line within the limit, so the run within its count of them). */
export function appendForecastRun(params: {
	lotFolder: string
	lines: readonly ForecastLine[]
}): void {
	const text = params.lines.map((line) => `${JSON.stringify(line)}\n`).join('')
	appendLine({
		file: join(params.lotFolder, STORE_FILES.forecast),
		line: Buffer.from(text, 'utf8'),
		limit: FORECAST_LINE_LIMIT * Math.max(params.lines.length, 1),
	})
}

/**
 * Records a run in the lot's own folder: its lines in one append, then its `forecast` event (the verdict counts, the
 * time spent, the run's trigger). Never throws: a write that fails is a note to print, the run's lines not written.
 */
export function recordForecastRun(params: {
	lotFolder: string
	run: ForecastRun
	trigger: ForecastTrigger
}): RecordedForecast {
	const { lotFolder, run } = params
	try {
		appendForecastRun({ lotFolder, lines: run.lines })
	} catch (error) {
		return {
			written: false,
			notes: [
				fillMessage({
					template: FORECAST_RECORD_TEXTS.writeFailure,
					values: {
						file: join(lotFolder, STORE_FILES.forecast),
						message: (error as Error).message,
					},
				}),
			],
		}
	}
	const eventNote = writeForecastEvent(params)
	return eventNote === undefined
		? { written: true, notes: [] }
		: { written: true, notes: [eventNote], eventFailed: true }
}

/** Writes the run's `forecast` event (its trigger, verdict counts and time); the line to print when it could not be. */
function writeForecastEvent(params: {
	lotFolder: string
	run: ForecastRun
	trigger: ForecastTrigger
}): string | undefined {
	const { lotFolder, run } = params
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
					lot: basename(lotFolder),
					kind: FORECAST_EVENT_KIND,
					by: 'cli',
					cli: readCliVersion(),
					simulated: false,
					hostEvent: null,
				}),
				run: run.run,
				trigger: params.trigger,
				verdict: run.verdict,
				verdicts,
				durationMs: run.durationMs,
			},
			limit: EVENT_LINE_LIMIT,
		})
		return undefined
	} catch (error) {
		return fillMessage({
			template: FORECAST_RECORD_TEXTS.eventFailure,
			values: { file, message: (error as Error).message },
		})
	}
}

/**
 * The newest complete run of the lot folder's `forecast.jsonl`: the last run whose readable lines number its `of`.
 * A torn last line, a line that does not read (an unknown key, a field of the wrong type) and every line of a run that
 * is not complete are counted, never read. None without the file.
 */
export function readForecastRecord(params: { lotFolder: string }): ForecastRecord {
	let content: string
	try {
		content = readFileSync(join(params.lotFolder, STORE_FILES.forecast), 'utf8')
	} catch {
		return { lines: [], unreadable: 0 }
	}
	const texts = content.split('\n')
	// the text after the last line feed is a line without its end: never trusted, even when it parses
	const torn = texts.pop()
	let unreadable = torn === undefined || torn === '' ? 0 : 1
	const runs = new Map<string, ForecastLine[]>()
	for (const text of texts) {
		if (text === '') continue
		const line = parseForecastLine(text)
		if (line === undefined) {
			unreadable += 1
			continue
		}
		runs.set(line.run, [...(runs.get(line.run) ?? []), line])
	}
	const complete = [...runs.values()].filter(isCompleteRun)
	for (const lines of runs.values()) if (!isCompleteRun(lines)) unreadable += lines.length
	return { lines: complete.at(-1) ?? [], unreadable }
}

/** A run whose lines all name the same count and number it. */
function isCompleteRun(lines: readonly ForecastLine[]): boolean {
	return lines.length > 0 && lines.every((line) => line.of === lines.length)
}

/** The line with the first `keptShared` shared paths and `keptConflicts` conflicts, the rest counted. */
function cutLine(params: {
	line: ForecastLine
	shared: readonly string[]
	conflicts: ForecastLine['conflicts'] & {}
	keptShared: number
	keptConflicts: number
}): ForecastLine {
	const { line, shared, conflicts, keptShared, keptConflicts } = params
	const { more: _more, moreShared: _moreShared, ...rest } = line
	const moreShared = shared.length - keptShared
	const more = conflicts.length - keptConflicts
	return {
		...rest,
		...(line.shared ? { shared: shared.slice(0, keptShared) } : {}),
		...(line.conflicts ? { conflicts: conflicts.slice(0, keptConflicts) } : {}),
		...(more > 0 ? { more } : {}),
		...(moreShared > 0 ? { moreShared } : {}),
	}
}

/** The bytes a line is written as: its JSON and a line feed. */
function lineBytesOf(line: ForecastLine): number {
	return Buffer.byteLength(`${JSON.stringify(line)}\n`, 'utf8')
}

/** The line a text holds: the required keys, no unknown key, each field of its type; undefined otherwise. */
function parseForecastLine(text: string): ForecastLine | undefined {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	const line = value as Record<string, unknown>
	const keys = Object.keys(line)
	if (!FORECAST_REQUIRED_KEYS.every((key) => key in line)) return undefined
	if (
		keys.some(
			(key) => !FORECAST_REQUIRED_KEYS.includes(key) && !FORECAST_OPTIONAL_KEYS.includes(key),
		)
	)
		return undefined
	const { schema, run, at, trigger, of, against, verdict } = line
	if (schema !== FORECAST_SCHEMA) return undefined
	if (![run, at, against].every((field) => typeof field === 'string' && field !== ''))
		return undefined
	if (typeof trigger !== 'string' || !FORECAST_TRIGGERS.includes(trigger)) return undefined
	if (typeof of !== 'number' || !Number.isInteger(of) || of < 1) return undefined
	if (
		typeof verdict !== 'string' ||
		!(FORECAST_VERDICT_ORDER as readonly string[]).includes(verdict)
	)
		return undefined
	if (!isObject(line.self) || !isObject(line.main)) return undefined
	return line as ForecastLine
}

/** Whether a value is a plain object. */
function isObject(value: unknown): boolean {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
