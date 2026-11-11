/**
 * The machine-wide live markers of heavy steps (33L0 section 4 "Heavy steps"): `<state>/dialecte/heavy/<pid>-<n>.json`,
 * live only while its pid runs with the start time it holds (a reused pid never keeps a dead marker alive).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { isProcessAlive } from '../process-alive.ts'
import { processStartTime } from '../process-start-time.ts'
import { publishOnce } from '../store/publish.ts'
import { stateFolder } from '../store/state-folder.ts'
import { HEAVY_MARKER_NAME_PATTERN, HEAVY_MARKER_SEGMENTS } from './heavy-markers.constants.ts'

import type {
	HeavyMarker,
	HeavyMarkerCheck,
	HeavyMarkerLocation,
	WriteHeavyMarkerParams,
} from './heavy-markers.types.ts'

/** This process's own start time once read (`undefined` inside when it could not be); unread until the first ask. */
let ownStartTime: { value: string | undefined } | undefined

/** The markers this process wrote so far: the `n` of the next name. */
let markerCount = 0

/** Whether this process swept the dead markers already: one sweep per process (33L0 rule 1). */
let swept = false

/**
 * Writes this process's marker `<state>/dialecte/heavy/<pid>-<n>.json` (published once), after sweeping the dead
 * markers of that folder on its first write; the path of the marker, or undefined (nothing written) when this
 * process's own start time cannot be read.
 */
export function writeHeavyMarker(params: WriteHeavyMarkerParams): string | undefined {
	const { check } = params
	const startTime = ownStartTimeOf({ check })
	if (startTime === undefined) return undefined
	const folder = markerFolderOf(params)
	mkdirSync(folder, { recursive: true })
	if (!swept) {
		swept = true
		sweepDeadMarkers({ folder, check })
	}
	const marker: HeavyMarker = {
		step: params.step,
		lot: params.lot,
		repository: params.repository,
		worktree: params.worktree,
		pid: process.pid,
		startTime,
		started: (params.now ?? new Date()).toISOString(),
	}
	for (;;) {
		markerCount += 1
		const path = join(folder, `${process.pid}-${markerCount}.json`)
		// one line: a reader may read every marker of the folder as one JSON document per line
		if (publishOnce({ path, text: `${JSON.stringify(marker)}\n`, readOnly: false })) return path
	}
}

/** Removes a marker this process wrote; nothing when it is gone already. */
export function removeHeavyMarker(params: { path: string }): void {
	rmSync(params.path, { force: true })
}

/** The markers whose process runs now with the start time they hold; dead ones are ignored and left. */
export function readLiveHeavyMarkers(
	params: HeavyMarkerLocation & { check?: HeavyMarkerCheck } = {},
): HeavyMarker[] {
	const folder = markerFolderOf(params)
	const live: { name: string; marker: HeavyMarker }[] = []
	for (const name of markerNamesIn({ folder })) {
		const marker = readMarker({ path: join(folder, name) })
		if (marker !== undefined && isLive({ marker, check: params.check })) live.push({ name, marker })
	}
	return live.sort(byStartedThenName).map(function markerOf(entry) {
		return entry.marker
	})
}

/** `<state>/dialecte/heavy`. */
function markerFolderOf(params: HeavyMarkerLocation): string {
	return join(stateFolder(params), ...HEAVY_MARKER_SEGMENTS)
}

/** The names of the folder that match the marker pattern; none when there is no folder. */
function markerNamesIn(params: { folder: string }): string[] {
	if (!existsSync(params.folder)) return []
	return readdirSync(params.folder).filter(function isMarkerName(name) {
		return HEAVY_MARKER_NAME_PATTERN.test(name)
	})
}

/**
 * Removes the dead markers of the folder: a marker whose pid does not run, or runs with another start time than
 * the one it holds (or holds none); one whose pid runs with a start time that cannot be read stays (readers still
 * count it not live); a file that does not parse goes only when the pid in its name does not run.
 */
function sweepDeadMarkers(params: { folder: string; check: HeavyMarkerCheck | undefined }): void {
	const { folder, check } = params
	for (const name of markerNamesIn({ folder })) {
		const path = join(folder, name)
		const marker = readMarker({ path })
		const dead =
			marker === undefined
				? !isAlive({ pid: Number(HEAVY_MARKER_NAME_PATTERN.exec(name)?.[1]), check })
				: isSurelyDead({ marker, check })
		if (dead) rmSync(path, { force: true })
	}
}

/** The marker a file holds; undefined when it does not read or parse into one. */
function readMarker(params: { path: string }): HeavyMarker | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(params.path, 'utf8'))
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
		return Number.isInteger((parsed as HeavyMarker).pid) ? (parsed as HeavyMarker) : undefined
	} catch {
		return undefined
	}
}

/** Live: the pid runs AND its start time is the one the marker holds (a missing or unreadable one is dead). */
function isLive(params: { marker: HeavyMarker; check: HeavyMarkerCheck | undefined }): boolean {
	const { marker, check } = params
	if (typeof marker.startTime !== 'string') return false
	if (!isAlive({ pid: marker.pid, check })) return false
	const current =
		marker.pid === process.pid ? ownStartTimeOf({ check }) : startTimeOf({ pid: marker.pid, check })
	return current !== undefined && current === marker.startTime
}

/**
 * Dead for the sweep: the pid does not run, or it runs with another start time than the marker's (or the marker holds
 * none). A pid that runs but whose start time cannot be read now is kept: a passing failure of `ps` removes nothing.
 */
function isSurelyDead(params: {
	marker: HeavyMarker
	check: HeavyMarkerCheck | undefined
}): boolean {
	const { marker, check } = params
	if (typeof marker.startTime !== 'string') return true
	if (!isAlive({ pid: marker.pid, check })) return true
	const current =
		marker.pid === process.pid ? ownStartTimeOf({ check }) : startTimeOf({ pid: marker.pid, check })
	return current !== undefined && current !== marker.startTime
}

/** Whether the pid runs, through the injected check when given. */
function isAlive(params: { pid: number; check: HeavyMarkerCheck | undefined }): boolean {
	return (params.check?.isAlive ?? isProcessAlive)(params.pid)
}

/** The pid's start time, through the injected check when given. */
function startTimeOf(params: {
	pid: number
	check: HeavyMarkerCheck | undefined
}): string | undefined {
	return (params.check?.startTimeOf ?? processStartTime)(params.pid)
}

/** This process's start time, read once per process. */
function ownStartTimeOf(params: { check: HeavyMarkerCheck | undefined }): string | undefined {
	ownStartTime ??= { value: startTimeOf({ pid: process.pid, check: params.check }) }
	return ownStartTime.value
}

/** Orders markers by `started`, then by file name. */
function byStartedThenName(
	first: { name: string; marker: HeavyMarker },
	second: { name: string; marker: HeavyMarker },
): number {
	if (first.marker.started !== second.marker.started)
		return first.marker.started < second.marker.started ? -1 : 1
	return first.name < second.name ? -1 : first.name > second.name ? 1 : 0
}
