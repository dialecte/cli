/**
 * The one step recorder (33L0 section 4 "Step events", "Interrupted steps", "Heavy steps"; D10-D12): `step.start`
 * and `step.end` of a gate or contrib run in its lot's `events.jsonl`, the heavy markers, and the interrupted end.
 * It never throws and never changes an exit: every failure becomes one warning line.
 */
import { writeSync } from 'node:fs'
import { join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { onSignalExit } from '../progress/interrupt-forwarding.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { readIdentity } from '../store/identity.ts'
import { lotFolderOf } from '../store/lot-folder.ts'
import { locateStore, workTreeHolding } from '../store/store-folder.ts'
import { LOT_LINK_SEGMENTS, STORE_FILES } from '../store/store.constants.ts'
import { EVENT_LINE_LIMIT } from './events.constants.ts'
import { fitParts } from './fit-parts.ts'
import { removeHeavyMarker, writeHeavyMarker } from './heavy-markers.ts'
import { lotOfStep } from './lot-of-step.ts'
import {
	ALWAYS_RUN_PARTS,
	FOREIGN_STEP_LINE,
	MARKERS_NOT_WRITTEN_PREFIX,
	NOT_RECORDED_PREFIX,
	STANDARD_ERROR_DESCRIPTOR,
} from './record-step.constants.ts'
import { worktreeCliOf } from './worktree-cli.ts'
import { cutEvent, makeEnvelope, writeEvent } from './write-event.ts'

import type { StepResult } from '../gate/gate.types.ts'
import type { LotEvent } from './event.types.ts'
import type {
	EndStepParams,
	PartsOfParams,
	StartStepParams,
	StepExplicitPlace,
	StepHandle,
	StepPart,
	StepPlace,
	StepReuse,
} from './record-step.types.ts'

/**
 * Starts a recorded step: finds its lot from `cwd`, writes `step.start` (and the marker of a heavy run), and answers
 * the handle that records its parts and its end. No lot: no event and no file, but a heavy step still writes its
 * machine-wide marker (`lot: null`). A worktree that is another lot's: one
 * `step.foreign` and a warning line, no start or end.
 */
export function startStep(params: StartStepParams): StepHandle {
	const warn = params.warn ?? warnOnStandardError
	const warnOnce = onceWarner(warn)
	// the markers have their own line and their own once-slot: a marker failure never hides an events one
	const warnMarkersOnce = onceWarner(warn)
	/** Runs `work`; a failure becomes the one events warning line, and the answer is undefined. */
	function safely<Value>(work: () => Value): Value | undefined {
		try {
			return work()
		} catch (error) {
			warnOnce(`${NOT_RECORDED_PREFIX}${(error as Error).message}`)
			return undefined
		}
	}
	/** Runs a marker's `work`; a failure becomes the one markers warning line, and the answer is undefined. */
	function markerSafely<Value>(work: () => Value): Value | undefined {
		try {
			return work()
		} catch (error) {
			warnMarkersOnce(`${MARKERS_NOT_WRITTEN_PREFIX}${(error as Error).message}`)
			return undefined
		}
	}
	const startedAt = Date.now()
	const located = safely(function locate() {
		return params.place === undefined
			? placeOf({ cwd: params.cwd, step: params.step, warn: warnOnce })
			: explicitPlaceOf({ cwd: params.cwd, place: params.place })
	})
	const place = located?.place
	const worktree = located?.worktree ?? params.cwd
	/** Writes a heavy marker named `step`; its path, or undefined when none was written. */
	function markerOf(step: string): string | undefined {
		return markerSafely(function writeMarker() {
			return writeHeavyMarker({
				step,
				lot: place?.lot ?? null,
				repository: located?.repository ?? worktree,
				worktree,
			})
		})
	}
	const runMarker = params.heavy ? markerOf(params.step) : undefined
	const partMarkers = new Set<string>()
	let ranHeavy = false
	let ended = false
	let run: string | undefined
	if (place !== undefined)
		safely(function writeStart() {
			const start = envelopeOf({ place, kind: 'step.start' })
			run = start.id
			writeStepEvent({
				file: place.file,
				event: {
					...start,
					run,
					step: params.step,
					heavy: params.heavy,
					worktree: place.worktree,
					throwaway: place.throwaway,
				},
			})
		})
	/** Writes the end once: the markers removed first, then the event (when the step has a lot and a start). */
	function end(ending: EndStepParams): void {
		if (ended) return
		ended = true
		removeInterruptHook()
		for (const path of [...partMarkers, ...(runMarker === undefined ? [] : [runMarker])])
			markerSafely(function removeMarker() {
				removeHeavyMarker({ path })
			})
		if (place === undefined || run === undefined) return
		const startedRun = run
		safely(function writeEnd() {
			const event: LotEvent = {
				...envelopeOf({ place, kind: 'step.end' }),
				run: startedRun,
				step: params.step,
				heavy: params.heavy || ranHeavy,
				worktree: place.worktree,
				throwaway: place.throwaway,
				...(ending.outcome === undefined ? { exit: ending.exit } : { outcome: ending.outcome }),
				durationMs: Date.now() - startedAt,
				stateHash: ending.stateHash,
				...(ending.reuse === undefined ? {} : { reuse: ending.reuse }),
			}
			writeStepEvent({ file: place.file, event, parts: ending.parts })
		})
	}
	const removeInterruptHook = onSignalExit(function interrupted() {
		end({ outcome: 'interrupted', parts: [], reuse: 'none', stateHash: null })
	})
	return {
		startPart(part) {
			const partStarted = Date.now()
			if (part.heavy) ranHeavy = true
			const marker =
				part.heavy && !params.heavy ? markerOf(`${params.step}: ${part.name}`) : undefined
			if (marker !== undefined) partMarkers.add(marker)
			return function finishPart() {
				if (marker !== undefined) {
					partMarkers.delete(marker)
					markerSafely(function removePartMarker() {
						removeHeavyMarker({ path: marker })
					})
				}
				return Date.now() - partStarted
			}
		},
		end,
	}
}

/** The parts of a run, in run order, from its results. */
export function partsOf(params: PartsOfParams): StepPart[] {
	return params.results.map(function partOf(result: StepResult): StepPart {
		return {
			name: result.step.name,
			status: result.status,
			counts: result.counts,
			durationMs: params.durations.get(result) ?? 0,
			reused: params.reused.has(result),
			rerun: result.rerun !== undefined,
			heavy: result.step.heavy === true,
			selection: result.selection
				? {
						base: result.selection.base,
						ids: result.selection.ids,
						changed: result.selection.changed,
					}
				: null,
			failing: result.failing ?? null,
		}
	})
}

/** `whole` when a record answered every configured part, `partly` some, `none` none; hygiene and tdd never count. */
export function reuseOf(parts: readonly StepPart[]): StepReuse {
	const configured = parts.filter(function isConfigured(part) {
		return !ALWAYS_RUN_PARTS.includes(part.name)
	})
	const reused = configured.filter(function isReused(part) {
		return part.reused
	})
	if (reused.length === 0) return 'none'
	return reused.length === configured.length ? 'whole' : 'partly'
}

/**
 * Where the step writes: its lot's file, or none (no lot: undefined; a foreign worktree: one `step.foreign` in the
 * linked lot and its line). Also the real path of the worktree and the repository, for the markers.
 */
function placeOf(params: { cwd: string; step: string; warn: (line: string) => void }): {
	place: StepPlace | undefined
	worktree: string
	repository: string
} {
	const workTree = workTreeHolding({ from: params.cwd })
	const worktree = realPathOf(workTree ?? params.cwd)
	const found = lotOfStep({ cwd: params.cwd })
	if (workTree === undefined || found === undefined)
		return { place: undefined, worktree, repository: worktree }
	const linked = lotFolderOf({ folder: join(workTree, ...LOT_LINK_SEGMENTS) })
	if ('foreign' in found) {
		if (linked !== undefined) {
			const foreign = placeIn({ lotFolder: linked, worktree, throwaway: false })
			writeStepEvent({
				file: foreign.place.file,
				event: {
					...envelopeOf({ place: foreign.place, kind: 'step.foreign' }),
					step: params.step,
					worktree,
				},
			})
		}
		params.warn(
			FOREIGN_STEP_LINE.replace('{step}', params.step)
				.replace('{worktree}', worktree)
				.replace('{lot}', found.foreign),
		)
		return { place: undefined, worktree, repository: worktree }
	}
	const store = locateStore({ from: workTree })?.store
	const lotFolder = linked ?? (store === undefined ? undefined : join(store, found.lot))
	if (lotFolder === undefined) return { place: undefined, worktree, repository: worktree }
	const placed = placeIn({ lotFolder, worktree: found.worktree, throwaway: found.throwaway })
	return { place: placed.place, worktree: found.worktree, repository: placed.repository }
}

/** Where a step that knows its lot writes: that lot (none for `null`), never one found from `cwd`. */
function explicitPlaceOf(params: { cwd: string; place: StepExplicitPlace | null }): {
	place: StepPlace | undefined
	worktree: string
	repository: string
} {
	const { place } = params
	if (place === null) {
		const worktree = realPathOf(workTreeHolding({ from: params.cwd }) ?? params.cwd)
		return { place: undefined, worktree, repository: worktree }
	}
	const placed = placeIn({
		lotFolder: place.lot,
		worktree: place.worktree,
		throwaway: place.throwaway,
	})
	return { place: placed.place, worktree: place.worktree, repository: placed.repository }
}

/** The place of a lot folder: its file, its name, whether it is simulated, and its repository. */
function placeIn(params: { lotFolder: string; worktree: string; throwaway: boolean }): {
	place: StepPlace
	repository: string
} {
	const identity = readIdentity({ lotFolder: params.lotFolder })
	if (identity === undefined) throw new Error(`the lot ${params.lotFolder} does not read`)
	return {
		place: {
			lot: identity.name,
			file: join(params.lotFolder, STORE_FILES.events),
			simulated: identity.simulated,
			worktree: params.worktree,
			throwaway: params.throwaway,
			worktreeCli: worktreeCliOf({ worktree: identity.worktree }),
		},
		repository: identity.repository,
	}
}

/** The one write of a cli step event: a list of parts fitted, anything else cut (33L0 section 4, the cut). */
function writeStepEvent(params: {
	file: string
	event: LotEvent
	parts?: EndStepParams['parts']
}): void {
	const { file, event, parts } = params
	writeEvent({
		file,
		event: Array.isArray(parts)
			? fitParts({ event, parts })
			: cutEvent({ event: parts === undefined ? event : { ...event, parts } }),
		limit: EVENT_LINE_LIMIT,
	})
}

/** The envelope of a cli event in the step's lot. */
function envelopeOf(params: { place: StepPlace; kind: string }): LotEvent {
	return makeEnvelope({
		lot: params.place.lot,
		kind: params.kind,
		by: 'cli',
		cli: readCliVersion(),
		simulated: params.place.simulated,
		hostEvent: null,
		worktreeCli: params.place.worktreeCli,
	})
}

/** A warner that says its first line only (D11: one line per step). */
function onceWarner(warn: (line: string) => void): (line: string) => void {
	let warned = false
	return function warnOnce(line) {
		if (warned) return
		warned = true
		try {
			warn(line)
		} catch {
			// a warning that cannot be said changes nothing either
		}
	}
}

/** The default warning channel: one line on standard error, so `--json` output stays one document. */
function warnOnStandardError(line: string): void {
	// one synchronous write: a closed pipe throws here (caught) instead of raising an async EPIPE that ends the process
	try {
		writeSync(STANDARD_ERROR_DESCRIPTOR, `${line}\n`)
	} catch {
		// a warning nobody can read changes nothing
	}
}
