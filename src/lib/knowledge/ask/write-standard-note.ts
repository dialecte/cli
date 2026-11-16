import { join } from 'node:path'

import { printLines } from '../../print/print.ts'
import {
	STANDARD_FILE,
	STANDARD_OUTSIDE_CONFIRMED_SUFFIX,
	STANDARD_OUTSIDE_UNCHECKED_SUFFIX,
} from '../../standard/standard.constants.ts'
import { recordText, replaceWhole } from '../../store/publish.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	CLAIM_MESSAGES,
	NOTE_LOCK_FILE,
	NOTE_LOCK_POLL_MS,
	NOTE_LOCK_STALE_MS,
	NOTE_LOCK_WAIT_LIMIT_MS,
} from './ask.constants.ts'
import { claimFile, claimHolderOf, releaseClaim, startTimesOf } from './claim-file.ts'
import { lotAskStatesOf, noteTextOf } from './standard-note-of.ts'

import type { StandardRecord } from '../../standard/standard.types.ts'
import type {
	LotAskState,
	StartTimes,
	WriteStandardNoteNowParams,
	WriteStandardNoteParams,
} from './ask.types.ts'

/**
 * The lot's `standard.json` (D12): the note recomputed from every ask's state (`askStateOf`), state `outside` when
 * any ask past rung 2 went outside (U18), else `consulted`; written whole under an exclusive claim file, a claim left by
 * a dead process taken over. A lot whose asks all stopped at rungs 0-2 records nothing (D42). With no other writer
 * and no seam it runs to its end before it first waits.
 */
export async function writeStandardNote(params: WriteStandardNoteParams): Promise<void> {
	const claim = join(params.lotHome, NOTE_LOCK_FILE)
	// one start-time read per pid for the whole wait (L-4)
	const starts = startTimesOf({ onStartRead: params.lock?.onStartRead })
	if (!claimFile({ path: claim, staleMs: NOTE_LOCK_STALE_MS, starts }))
		await claimWaited({ path: claim, starts })
	try {
		const asks = lotAskStatesOf({ asksFolder: params.asksFolder })
		const afterRead = params.lock?.afterRead
		if (afterRead !== undefined) await afterRead()
		writeNoteRecord({ lotHome: params.lotHome, asks, now: params.now })
	} finally {
		releaseClaim({ path: claim })
	}
}

/**
 * `writeStandardNote` for a synchronous caller (the answer hook, R1-11): the note written before it returns, after a
 * bounded wait on the note's claim (`waitLimitMs`, else `NOTE_LOCK_WAIT_LIMIT_MS`); throws (naming the claim and the
 * fix) past it.
 */
export function writeStandardNoteNow(params: WriteStandardNoteNowParams): void {
	const claim = join(params.lotHome, NOTE_LOCK_FILE)
	const waitLimitMs = params.waitLimitMs ?? NOTE_LOCK_WAIT_LIMIT_MS
	const started = Date.now()
	// one start-time read per pid for the whole wait (L-4)
	const starts = startTimesOf({})
	while (!claimFile({ path: claim, staleMs: NOTE_LOCK_STALE_MS, starts })) {
		if (Date.now() - started > waitLimitMs) throw waitedError({ path: claim, waitLimitMs })
		pauseNow({ milliseconds: NOTE_LOCK_POLL_MS })
	}
	try {
		const asks = lotAskStatesOf({ asksFolder: params.asksFolder })
		writeNoteRecord({ lotHome: params.lotHome, asks, now: params.now })
	} finally {
		releaseClaim({ path: claim })
	}
}

/**
 * `rewriteLotNote` for a synchronous caller (the answer hook, R1-11): the note written before it returns; one that
 * cannot be written (its claim held past the wait limit) prints its line on standard error, the answer kept.
 */
export function rewriteLotNoteNow(params: WriteStandardNoteNowParams): void {
	try {
		writeStandardNoteNow(params)
	} catch (error) {
		printNoteFailure({ lotHome: params.lotHome, error })
	}
}

/** Writes the note's record of the asks' states, whole; nothing when no ask went past rung 2. */
function writeNoteRecord(params: {
	lotHome: string
	asks: LotAskState[]
	now: (() => Date) | undefined
}): void {
	const record = noteRecordOf({ asks: params.asks, now: params.now })
	if (record !== undefined)
		replaceWhole({ path: join(params.lotHome, STANDARD_FILE), text: recordText(record) })
}

/** The line of a note that could not be written, on standard error. */
function printNoteFailure(params: { lotHome: string; error: unknown }): void {
	const { error } = params
	printLines({
		stream: 'stderr',
		lines: [
			fillMessage({
				template: CLAIM_MESSAGES.noteFailed,
				values: {
					path: join(params.lotHome, STANDARD_FILE),
					reason: error instanceof Error ? error.message : String(error),
				},
			}),
		],
	})
}

/**
 * Rewrites the lot's note after a command changed an ask's state; a note that cannot be written prints its line on
 * standard error and the command goes on (its exit code kept). Nothing for an ask that belongs to no lot.
 */
export async function rewriteLotNote(params: {
	lotHome: string | undefined
	asksFolder: string
	now: (() => Date) | undefined
}): Promise<void> {
	const { lotHome } = params
	if (lotHome === undefined) return
	try {
		await writeStandardNote({ lotHome, asksFolder: params.asksFolder, now: params.now })
	} catch (error) {
		printNoteFailure({ lotHome, error })
	}
}

/**
 * The note's record, or undefined when no ask went past rung 2 (neither documents nor outside readers): `outside`
 * when any of those went outside (U18), its note ending `(all confirmed)` and `confirmed: true` when a person
 * confirmed each outside ask, else `(all unchecked)`; else `consulted`.
 */
function noteRecordOf(params: {
	asks: LotAskState[]
	now: (() => Date) | undefined
}): StandardRecord | undefined {
	const read = params.asks.filter((entry) => entry.read.source !== null)
	if (read.length === 0) return undefined
	// outside when any ask went outside (U18), every ask listed; confirmed when each outside ask is
	const outsideAsks = read.filter((entry) => entry.read.source === 'outside')
	const outside = outsideAsks.length > 0
	const confirmed = outside && outsideAsks.every((entry) => entry.read.confirmed)
	const suffix = !outside
		? ''
		: confirmed
			? STANDARD_OUTSIDE_CONFIRMED_SUFFIX
			: STANDARD_OUTSIDE_UNCHECKED_SUFFIX
	return {
		state: outside ? 'outside' : 'consulted',
		note: `${noteTextOf({ asks: params.asks })}${suffix}`,
		at: (params.now?.() ?? new Date()).toISOString(),
		// the card reads this flag, never the note's text (R1-10); only an outside record carries it
		...(outside ? { confirmed } : {}),
	}
}

/** Waits until the claim is this writer's; throws (naming the claim and the fix) past the wait limit. */
async function claimWaited(params: { path: string; starts: StartTimes }): Promise<void> {
	const started = Date.now()
	while (!claimFile({ path: params.path, staleMs: NOTE_LOCK_STALE_MS, starts: params.starts })) {
		if (Date.now() - started > NOTE_LOCK_WAIT_LIMIT_MS)
			throw waitedError({ path: params.path, waitLimitMs: NOTE_LOCK_WAIT_LIMIT_MS })
		await pause({ milliseconds: NOTE_LOCK_POLL_MS })
	}
}

/** The error of a note claim still held past the wait limit: the claim, its process, the wait and the fix. */
function waitedError(params: { path: string; waitLimitMs: number }): Error {
	return new Error(
		fillMessage({
			template: CLAIM_MESSAGES.noteWaited,
			values: {
				path: params.path,
				pid: String(claimHolderOf({ path: params.path })?.pid ?? ''),
				seconds: String(params.waitLimitMs / 1000),
			},
		}),
	)
}

/** Blocks this thread for a while: the synchronous writer's wait between two tries of the claim. */
function pauseNow(params: { milliseconds: number }): void {
	Atomics.wait(
		new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
		0,
		0,
		params.milliseconds,
	)
}

/** Resolves after a while. */
function pause(params: { milliseconds: number }): Promise<void> {
	return new Promise(function resolveLater(resolve) {
		setTimeout(resolve, params.milliseconds)
	})
}
