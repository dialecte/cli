/**
 * `dialecte lot wait <id> [--timeout <seconds>] [--json]` (33S section 7): returns the lot's status and the exit code
 * of section 6 as soon as there is something for the host; plays a simulated lot's scenario, polls a real lot.
 * Reads files only for a real lot (it writes nothing) and starts no process; the refreshing line is a plain `\r`
 * writer, so no progress module is reached but the duration format.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
	entryOfFolder,
	entryPathOf,
	readStoreEntries,
} from '../lib/handover/handover-store-read.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { endedOf, jsonOf, printOut, refreshedOf, textOf } from '../lib/print/print.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { formatDuration } from '../lib/progress/format-duration.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { exitCodeOfState } from '../lib/store/exit-code-of-state.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { lotDamagedExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { isCanceledByMarkerOnly, lotState } from '../lib/store/lot-state.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { playSimulatedLot } from '../lib/store/simulate.ts'
import {
	MILLISECONDS_PER_SECOND,
	POLL_MS,
	REREAD_PAUSE_MS,
	STORE_FILES,
} from '../lib/store/store.constants.ts'
import { lotStatusLines, lotStatusOfInput } from './lot-status.ts'
import {
	MISSING_SIGNATURE,
	NAMES_SEPARATOR,
	SYSTEM_CLOCK,
	WAIT_FLAGS,
	WAIT_VALUE_OPTIONS,
	WAITING_LINE,
} from './lot-wait.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { PrintedText } from '../lib/print/print.types.ts'
import type { StateExitVerb } from '../lib/store/exit-code-of-state.types.ts'
import type { LotStateInput, LotStateReport } from '../lib/store/store.types.ts'
import type { WaitClock, WaitParams, WaitRead, WaitSleep } from './lot-wait.types.ts'

/**
 * Waits on the lot `<id>` names; every exit is JSON under `--json`. Returns at once on a lot that is not
 * `working` or whose last transition is a `limit`, on a damaged lot (exit 6), and on a simulated lot with nothing
 * left to play (as `lot result` answers it); else plays (simulated) or reads (real) the lot again, sleeping until
 * the next step falls due or a second passes, up to `--timeout` (exit 5).
 */
export async function waitLot(params: WaitParams): Promise<CommandResult> {
	const read = readArguments({
		argv: params.argv,
		valueOptions: WAIT_VALUE_OPTIONS,
		flags: WAIT_FLAGS,
	})
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const [id, ...extra] = read.words
	if (id === undefined) return lotUsageExit({ reason: 'lot wait takes one id: none given', json })
	if (extra.length > 0)
		return lotUsageExit({ reason: `lot wait takes one id, not also ${extra.join(' ')}`, json })
	const timeout = read.values.get('timeout')
	const seconds = timeout === undefined ? undefined : Number(timeout)
	if (seconds !== undefined && !(Number.isFinite(seconds) && seconds >= 0))
		return lotUsageExit({
			reason: `--timeout takes a number of seconds, 0 or more, not ${timeout}`,
			json,
		})
	const required = requiredLotOf({ argument: id, cwd: params.cwd, mode: 'read' })
	if ('exitCode' in required) return lotRefusalExit({ lines: required.lines, json })
	return waitOn({
		lotFolder: required.lot,
		id,
		seconds,
		json,
		sleep: params.sleep ?? sleepFor,
		clock: params.clock ?? SYSTEM_CLOCK,
		write: params.isTerminal && !json ? (params.write ?? writeToStandardError) : undefined,
		onRead: params.onRead,
	})
}

/**
 * The wait loop on a lot folder: play (simulated) or look for a change (real), read the records only when they
 * changed, settle the marker-only seam, return or sleep.
 */
async function waitOn(params: {
	lotFolder: string
	id: string
	seconds: number | undefined
	json: boolean
	sleep: WaitSleep
	clock: WaitClock
	/** Where the refreshing line goes; none off a terminal or under `--json`. */
	write: ((text: PrintedText) => void) | undefined
	onRead: (() => void) | undefined
}): Promise<CommandResult> {
	const { lotFolder, sleep, clock, write } = params
	const registry = registryOfLotFolder(lotFolder)
	const started = clock.now()
	const deadline =
		params.seconds === undefined ? undefined : started + params.seconds * MILLISECONDS_PER_SECOND
	const simulated = readIdentity({ lotFolder })?.simulated ?? false
	let wroteLine = false
	let previous: { signature: string; read: WaitRead } | undefined
	for (;;) {
		const nextDue = simulated
			? playSimulatedLot({ lotFolder, now: new Date(clock.now()) }).nextDue
			: undefined
		// a real lot's records are read again only when their folders, the registry folder or the lot's own entry
		// changed since the last read, or when the run the last read saw live has died (a dead run changes no file)
		const ownEntry = previous && ownEntryPathOf({ read: previous.read, lotFolder, registry })
		const signature = recordsSignatureOf({ lotFolder, registry, ownEntry })
		const current =
			previous !== undefined && previous.signature === signature && !cachedRunDied(previous.read)
				? previous.read
				: await readSettled({ lotFolder, registry, sleep, onRead: params.onRead })
		const readEntry = ownEntryPathOf({ read: current, lotFolder, registry })
		previous = {
			// the lot's entry found by this read (the first, or a new one): its stat joins the signature now; a write
			// by rename shows on the registry folder already
			signature:
				readEntry === ownEntry
					? signature
					: recordsSignatureOf({ lotFolder, registry, ownEntry: readEntry }),
			read: current,
		}
		const { checked } = current
		if (checked === undefined)
			return lotRefusalExit({ lines: [noLotRefusal(params.id)], json: params.json })
		if ('damage' in checked) {
			if (wroteLine) write?.(endedOf(textOf([])))
			return lotDamagedExit({ lotFolder, damage: checked.damage, json: params.json })
		}
		const { input } = checked
		const report = lotState(input)
		const at = clock.now()
		const timedOut = deadline !== undefined && at >= deadline
		// a simulated lot with nothing left to play (no scenario, every step played) never waits (P2.6)
		const nothingToPlay = simulated && nextDue === undefined
		if (report.state !== 'working' || report.limit || timedOut || nothingToPlay) {
			if (wroteLine) write?.(endedOf(textOf([])))
			return statusResult({
				lotFolder,
				input,
				entries: current.entries,
				report,
				json: params.json,
				timedOut,
				// answered now as `lot result` answers a working lot
				verb: nothingToPlay && !timedOut && !report.limit ? 'result' : 'wait',
			})
		}
		const wake = Math.min(
			nextDue === undefined ? at + POLL_MS : nextDue.getTime(),
			deadline ?? Number.POSITIVE_INFINITY,
		)
		if (write) {
			write(
				refreshedOf(
					textOf([
						WAITING_LINE.replace('{name}', input.identity.name)
							.replace('{state}', report.state)
							.replace('{elapsed}', formatDuration(at - started)),
					]),
				),
			)
			wroteLine = true
		}
		await sleep(Math.max(0, wake - at))
	}
}

/**
 * What tells a change of the records the wait reads, without reading them: the lot folder (its markers), its
 * transitions and answers folders, the registry folder (an entry added, removed or replaced by a rename) and the
 * lot's own entry file (rewritten in place), each by change time (a restored mtime still moves it) and size; and
 * the sorted names of the transitions and answers (two writes in one tick). Never another lot's entry: a poll
 * costs the same however many entries the registry holds.
 */
function recordsSignatureOf(params: {
	lotFolder: string
	registry: string
	/** The file of the registry entry naming the lot, as the last read found it; none when it found none. */
	ownEntry: string | undefined
}): string {
	const { lotFolder, registry, ownEntry } = params
	const transitions = join(lotFolder, STORE_FILES.transitions)
	const answers = join(lotFolder, STORE_FILES.answers)
	const watched = [lotFolder, transitions, answers, registry, ...(ownEntry ? [ownEntry] : [])]
	const stats = watched.map(statSignatureOf)
	const names = [transitions, answers].map(namesSignatureOf)
	return [...stats, ...names].join(' ')
}

/** The file of the registry entry a read found naming the lot; undefined when none names it. */
function ownEntryPathOf(params: {
	read: WaitRead
	lotFolder: string
	registry: string
}): string | undefined {
	const entry = entryOfFolder({ entries: params.read.entries, folder: params.lotFolder })
	return entry && entryPathOf({ store: params.registry, name: entry.name })
}

/** Whether the run marker the cached read held live names a process gone since: its pid checked, no file read. */
function cachedRunDied(read: WaitRead): boolean {
	const marker =
		read.checked !== undefined && 'input' in read.checked ? read.checked.input.runMarker : undefined
	return marker !== undefined && !isProcessAlive(marker.pid)
}

/** A path's change time and size, or the missing mark. */
function statSignatureOf(path: string): string {
	const stat = statSync(path, { bigint: true, throwIfNoEntry: false })
	return stat === undefined ? MISSING_SIGNATURE : `${stat.ctimeNs}/${stat.size}`
}

/** A folder's entry names, sorted, or the missing mark. */
function namesSignatureOf(folder: string): string {
	return existsSync(folder) ? namesOf(folder).join(NAMES_SEPARATOR) : MISSING_SIGNATURE
}

/** A folder's entry names, sorted; none when it cannot be listed (missing, or no folder). */
function namesOf(folder: string): string[] {
	try {
		return readdirSync(folder).sort()
	} catch {
		return []
	}
}

/**
 * The lot's records and the registry's entries, read once (`onRead` told), settled: when `abandoned.json` is its
 * only evidence of `canceled`, one sleep of 100 ms and a second read decide (a crossing run may take the abandon
 * back).
 */
async function readSettled(params: {
	lotFolder: string
	registry: string
	sleep: WaitSleep
	onRead: (() => void) | undefined
}): Promise<WaitRead> {
	const first = readRecords(params)
	const { checked } = first
	if (checked === undefined || !('input' in checked) || !isCanceledByMarkerOnly(checked.input))
		return first
	await params.sleep(REREAD_PAUSE_MS)
	return readRecords(params)
}

/** One read of the lot's records with the registry's entries, told to `onRead`. */
function readRecords(params: {
	lotFolder: string
	registry: string
	onRead: (() => void) | undefined
}): WaitRead {
	params.onRead?.()
	const entries = readStoreEntries(params.registry)
	return {
		entries,
		checked: readCheckedLotState({
			lotFolder: params.lotFolder,
			registry: params.registry,
			entries,
		}),
	}
}

/**
 * The status of the lot as `wait` answers it, from the records the loop decided on: JSON or text, its exit code
 * (`verb` `result` for a lot answered now, as `lot result` would).
 */
function statusResult(params: {
	lotFolder: string
	input: LotStateInput
	entries: readonly StoreEntry[]
	report: LotStateReport
	json: boolean
	timedOut: boolean
	verb: StateExitVerb
}): CommandResult {
	const { input, entries } = params
	const exitCode = exitCodeOfState({
		verb: params.verb,
		state: params.report.state,
		limit: params.report.limit,
		timedOut: params.timedOut,
	})
	const status = lotStatusOfInput({ input, lotFolder: params.lotFolder, entries })
	return {
		exitCode,
		output: params.json ? jsonOf(status, 2) : textOf(lotStatusLines(status)),
	}
}

/** A real sleep of `milliseconds`. */
function sleepFor(milliseconds: number): Promise<void> {
	return new Promise(function resolveLater(resolve) {
		setTimeout(resolve, milliseconds)
	})
}

/** The refreshing line's default target: the process's standard error, so standard output stays the answer. */
function writeToStandardError(text: PrintedText): void {
	printOut({ stream: 'stderr', text, ending: 'as-is' })
}
