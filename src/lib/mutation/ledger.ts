import { randomBytes } from 'node:crypto'
/**
 * The survivor ledger of a repository, `<git-common-dir>/dialecte-mutation/ledger.json`: what is still pending after
 * the runs. Each survivor no committed record lists enters `new`; it leaves `new` (or `scheduled`) when a later run
 * detected its exact mutant (`killed`) or when the records list it (`recorded`); any other run leaves it as it is, so a
 * survivor whose line changed or went away stays pending until the lot tests it, records it or schedules it. A run that
 * started before the last run reporting a survivor never kills it: it tested older code. `schedule` moves a `new` one
 * to `scheduled` for a follow-up. An item a run moved names that run (`movedBy`; `record` when `dialecte mutants record` moved it). Items are keyed `<package>::<survivor key>`, so two packages of one
 * repository never touch each other's items. The cli is the only writer.
 *
 * Every reader and writer holds the lock file beside the ledger while it works, and takes in each reported run the
 * ledger has not taken in yet, in the order they started (then finished; their ids are kept in `applied-runs.json`): a run whose
 * ledger update was missed (the process ended between reporting and updating) still reaches the ledger, and no run is
 * ever taken in twice, so an earlier run taken in late never undoes what a later one found.
 */
import {
	closeSync,
	existsSync,
	linkSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeSync,
} from 'node:fs'
import { join } from 'node:path'

import { processStartTime } from '../process-start-time.ts'
import { isListed } from './judge.ts'
import {
	LEDGER_KEY_SEPARATOR,
	LEDGER_LOCK_ORPHAN_MS,
	LEDGER_LOCK_RETRY_MS,
	LEDGER_LOCK_TIMEOUT_MS,
	MUTATION_APPLIED_RUNS_FILE,
	MUTATION_LEDGER_FILE,
	MUTATION_LEDGER_LOCK_FILE,
} from './mutation.constants.ts'
import { readRecordsFile } from './records-file.ts'
import {
	isOwnerProcessAlive,
	mutationStoreFolderOf,
	packageNameOf,
	readRuns,
	readStoredRuns,
	writeAtomically,
} from './run-store.ts'

import type {
	KeyedLedgerItem,
	Ledger,
	GivenRun,
	LedgerItem,
	LockedLedger,
	MutationRecords,
	OwnerCheck,
	PendingItems,
	RunEntry,
	ScheduleResult,
	Survivor,
} from './mutation.types.ts'

/** The ledger of the repository the package `root` is in, with every reported run taken in. */
export function readLedger(params: { root: string }): Ledger {
	return withLedgerLock({
		root: params.root,
		work: function readFolded(state) {
			return state.ledger
		},
	})
}

/**
 * Takes a reported run into the ledger, with every other reported run not taken in yet, in the order they started:
 * new survivors enter, survivors it detected are killed (unless a run that started later reported them), newly
 * recorded ones recorded. A run already taken in is not taken in again.
 */
export function updateLedger(params: {
	root: string
	run: RunEntry
	records: MutationRecords
	/** The run's `--mutate` targets: a whole file, or a file with a line range. */
	targets: readonly string[]
}): void {
	const { root, run, records, targets } = params
	withLedgerLock({ root, given: { run, records, targets }, work: nothingMore })
}

/** Moves the `new` items of these keys to `scheduled`; an unknown key refuses the whole call. */
export function scheduleItems(params: {
	root: string
	keys: readonly string[]
	followUp: string
}): ScheduleResult {
	const { root, keys, followUp } = params
	const packageName = packageNameOf(root)
	return withLedgerLock({
		root,
		work: function scheduleKeys(state): ScheduleResult {
			const { ledger } = state
			const unknown = keys.filter((key) => ledger[ledgerKeyOf({ packageName, key })] === undefined)
			if (unknown.length > 0)
				return {
					ok: false,
					reason: `no survivor ${unknown.join(', ')} of ${packageName} in the ledger: dialecte mutants status lists the keys`,
				}
			const handled = keys.filter((key) => {
				const { state: itemState } = ledger[ledgerKeyOf({ packageName, key })]
				return itemState === 'killed' || itemState === 'recorded'
			})
			if (handled.length > 0)
				return {
					ok: false,
					reason: `survivor ${handled.join(', ')} of ${packageName} is already killed or recorded: nothing to schedule`,
				}
			return schedule({ state, packageName, keys, followUp })
		},
	})
}

/** Schedules every `new` item of the package. */
export function scheduleAllNew(params: { root: string; followUp: string }): ScheduleResult {
	const { root, followUp } = params
	const packageName = packageNameOf(root)
	return withLedgerLock({
		root,
		work: function scheduleEveryNew(state): ScheduleResult {
			const keys = itemsOf({ ledger: state.ledger, packageName })
				.filter((item) => item.state === 'new')
				.map((item) => item.key)
			return schedule({ state, packageName, keys, followUp })
		},
	})
}

/** What the package still owes: its `new` items, died runs and running runs. */
export function pendingOf(params: { root: string } & OwnerCheck): PendingItems {
	const { root, isAlive, startTimeOf } = params
	const packageName = packageNameOf(root)
	const ledger = readLedger({ root })
	const runs = readRuns({ root, isAlive, startTimeOf }).filter((run) => run.package === packageName)
	return {
		new: itemsOf({ ledger, packageName }).filter((item) => item.state === 'new'),
		died: runs.filter((run) => run.state === 'died'),
		running: runs.filter((run) => run.state === 'running'),
	}
}

/** The items of one package, each with its bare survivor key. */
export function itemsOf(params: { ledger: Ledger; packageName: string }): KeyedLedgerItem[] {
	return Object.entries(params.ledger)
		.filter(([, item]) => item.package === params.packageName)
		.map(([ledgerKey, item]) => ({ ...item, key: survivorKeyOf(ledgerKey) }))
}

/**
 * Runs `work` holding the ledger lock, on the ledger with every reported run not yet taken in folded in (`given`, the
 * run the caller reports, among them, with its records and targets); writes the ledger and the applied runs when they
 * changed.
 */
export function withLedgerLock<Result>(params: {
	root: string
	given?: GivenRun
	work: (state: LockedLedger) => Result
}): Result {
	const { root, given, work } = params
	const folder = mutationStoreFolderOf(root)
	mkdirSync(folder, { recursive: true })
	const lock = join(folder, MUTATION_LEDGER_LOCK_FILE)
	takeLock(lock)
	try {
		const state: LockedLedger = {
			ledger: readJson<Ledger>({ path: join(folder, MUTATION_LEDGER_FILE), empty: {} }),
			applied: new Set(
				readJson<string[]>({ path: join(folder, MUTATION_APPLIED_RUNS_FILE), empty: [] }),
			),
			// the ledger file exists once anything took it in: a reader of a fresh store writes nothing
			changed: false,
		}
		foldMissedRuns({ root, state, given })
		const result = work(state)
		if (state.changed) {
			writeAtomically({
				path: join(folder, MUTATION_LEDGER_FILE),
				text: `${JSON.stringify(state.ledger, null, '\t')}\n`,
			})
			writeAtomically({
				path: join(folder, MUTATION_APPLIED_RUNS_FILE),
				text: `${JSON.stringify([...state.applied], null, '\t')}\n`,
			})
		}
		return result
	} finally {
		// forced: a lock judged stale and taken over by another process is already gone
		rmSync(lock, { force: true })
	}
}

/**
 * Takes every reported run the ledger has not taken in, the caller's `given` one included, in the order they
 * started (two runs started at once in the order they finished). The stored runs are read as their files hold them: a reported run needs no owner check.
 */
function foldMissedRuns(params: { root: string; state: LockedLedger; given?: GivenRun }): void {
	const { root, state, given } = params
	const stored: GivenRun[] = readStoredRuns(root)
		.filter((run) => run.state === 'reported' && run.runId !== given?.run.runId)
		.map((run) => ({ run, records: recordsOfRun(run), targets: run.targets ?? [] }))
	const missed = [...stored, ...(given ? [given] : [])]
		.filter(({ run }) => !state.applied.has(run.runId))
		.sort((first, second) => compareRunsInFoldOrder(first.run, second.run))
	for (const { run, records } of missed) {
		state.ledger = applyRun({ ledger: state.ledger, run, records })
		state.applied.add(run.runId)
		state.changed = true
	}
}

/** The order the ledger takes reported runs in: by start, two runs started at once by finish. */
export function compareRunsInFoldOrder(first: RunEntry, second: RunEntry): number {
	return (
		first.startedAt.localeCompare(second.startedAt) ||
		(first.finishedAt ?? '').localeCompare(second.finishedAt ?? '')
	)
}

/** `updateLedger`'s work under the lock: the fold already took its run in. */
function nothingMore(): void {}

/** The committed records of the package a run was started in, as they are now; none when they cannot be read. */
function recordsOfRun(run: RunEntry): MutationRecords {
	if (run.packageRoot === undefined || !existsSync(run.packageRoot)) return {}
	try {
		return readRecordsFile({ root: run.packageRoot })
	} catch {
		// records broken by hand: the run's survivors enter new, the next run with readable records sorts them
		return {}
	}
}

/** The ledger with one reported run taken in. */
function applyRun(params: { ledger: Ledger; run: RunEntry; records: MutationRecords }): Ledger {
	const { run, records } = params
	const ledger: Ledger = { ...params.ledger }
	const reported = new Map(
		(run.survivors ?? []).map((survivor) => [
			ledgerKeyOf({ packageName: run.package, key: survivor.key }),
			survivor,
		]),
	)

	// a run without detected keys (written before they were kept) kills nothing
	const detected = new Set(run.detected ?? [])
	for (const [ledgerKey, item] of Object.entries(ledger)) {
		const pending = item.state === 'new' || item.state === 'scheduled'
		if (item.package !== run.package || !pending || reported.has(ledgerKey)) continue
		const key = survivorKeyOf(ledgerKey)
		if (isListed({ record: records[item.file]?.[key] }))
			ledger[ledgerKey] = { ...item, state: 'recorded', movedBy: run.runId }
		else if (detected.has(key) && !testedOlderCode({ run, item }))
			ledger[ledgerKey] = { ...item, state: 'killed', movedBy: run.runId }
	}

	for (const [ledgerKey, survivor] of reported) {
		const known = ledger[ledgerKey]
		const seen = {
			lastReportedStartedAt: latestOf({
				first: known?.lastReportedStartedAt,
				second: run.startedAt,
			}),
		}
		if (isListed({ record: records[survivor.file]?.[survivor.key] })) {
			// an item already recorded stays as it is: the run moved nothing
			if (known)
				ledger[ledgerKey] =
					known.state === 'recorded'
						? { ...known, ...seen }
						: { ...known, ...seen, state: 'recorded', movedBy: run.runId }
			continue
		}
		if (known?.state === 'scheduled') {
			ledger[ledgerKey] = { ...known, ...seen }
			continue
		}
		ledger[ledgerKey] = known
			? { ...known, ...locationOf(survivor), ...seen, state: 'new' }
			: {
					...locationOf(survivor),
					package: run.package,
					firstSeen: { runId: run.runId, tree: run.tree, lot: run.lot },
					...seen,
					state: 'new',
				}
	}
	return ledger
}

/** The run started before the last run that reported the item: it tested older code, and cannot speak for it. */
function testedOlderCode(params: { run: RunEntry; item: LedgerItem }): boolean {
	const { run, item } = params
	return item.lastReportedStartedAt !== undefined && run.startedAt < item.lastReportedStartedAt
}

/** The later of two ISO times; the second when the first is absent. */
function latestOf(params: { first: string | undefined; second: string }): string {
	const { first, second } = params
	return first !== undefined && first > second ? first : second
}

function schedule(params: {
	state: LockedLedger
	packageName: string
	keys: readonly string[]
	followUp: string
}): ScheduleResult {
	const { state, packageName, keys, followUp } = params
	const ledger: Ledger = { ...state.ledger }
	for (const key of keys) {
		const ledgerKey = ledgerKeyOf({ packageName, key })
		ledger[ledgerKey] = { ...ledger[ledgerKey], state: 'scheduled', followUp }
	}
	state.ledger = ledger
	state.changed = true
	return { ok: true, scheduled: [...keys] }
}

/**
 * Creates the lock file (`wx`: only one creator wins), holding this process's pid and start time. A stale lock is
 * taken over: its owner is gone (no process holds its pid, or the one holding it started at another time), or it names
 * no owner and is older than its creator needs to write it. A lock held by a live owner is waited for, up to the
 * timeout.
 */
function takeLock(lock: string): void {
	const deadline = Date.now() + LEDGER_LOCK_TIMEOUT_MS
	for (;;) {
		if (createLock(lock)) return
		const holder = lockHolderOf(lock)
		if (isStaleLock({ lock, holder })) {
			removeStaleLock({ lock, holder })
			continue
		}
		if (Date.now() > deadline)
			throw new Error(
				`the mutation ledger is locked by process ${holder?.pid ?? '(unknown)'} (${lock}); it is released when that process ends`,
			)
		sleep(LEDGER_LOCK_RETRY_MS)
	}
}

/** Creates the lock with this process as its owner; false when it exists. A write that fails leaves no lock behind. */
function createLock(lock: string): boolean {
	let descriptor: number
	try {
		descriptor = openSync(lock, 'wx')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
		throw error
	}
	try {
		const owner = { pid: process.pid, startedAt: processStartTime(process.pid) }
		writeSync(descriptor, `${JSON.stringify(owner)}\n`)
	} catch (error) {
		closeSync(descriptor)
		rmSync(lock, { force: true })
		throw error
	}
	closeSync(descriptor)
	return true
}

/** The owner a lock file names; undefined when it names none (its creator is writing it, or crashed first). */
function lockHolderOf(lock: string): { pid: number; startedAt?: string } | undefined {
	try {
		const { pid, startedAt } = JSON.parse(readFileSync(lock, 'utf8')) as {
			pid?: unknown
			startedAt?: unknown
		}
		if (typeof pid !== 'number') return undefined
		return typeof startedAt === 'string' ? { pid, startedAt } : { pid }
	} catch {
		return undefined
	}
}

function isStaleLock(params: {
	lock: string
	holder: { pid: number; startedAt?: string } | undefined
}): boolean {
	const { lock, holder } = params
	// a lock naming this very process is its own, left by an earlier call: the ledger's work is synchronous, so no
	// call of this process holds it now
	if (holder !== undefined && isThisProcess(holder)) return true
	if (holder !== undefined)
		return !isOwnerProcessAlive({ pid: holder.pid, startedAt: holder.startedAt })
	try {
		return Date.now() - statSync(lock).mtimeMs > LEDGER_LOCK_ORPHAN_MS
	} catch {
		// gone meanwhile: the next try creates it
		return false
	}
}

/**
 * Removes the lock judged stale - and only that one. It is first renamed to a name of this process's own (one rename
 * wins), then read again: another process may have taken the stale lock over and written a live lock of its own
 * between the judgement and the rename. A lock that is not the one judged stale is put back (only where no lock is,
 * never over one) and is waited for like any live lock; when a newer lock is already in place, the set-aside one is
 * kept rather than deleted.
 */
function removeStaleLock(params: {
	lock: string
	holder: { pid: number; startedAt?: string } | undefined
}): void {
	const { lock, holder } = params
	const aside = `${lock}.${process.pid}.${randomBytes(4).toString('hex')}.stale`
	try {
		renameSync(lock, aside)
	} catch (error) {
		// another process took the stale lock over first: try again
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
		throw error
	}
	const moved = lockHolderOf(aside)
	const same =
		moved?.pid === holder?.pid &&
		moved?.startedAt === holder?.startedAt &&
		isStaleLock({ lock: aside, holder: moved })
	if (!same) {
		try {
			linkSync(aside, lock)
		} catch (error) {
			// a newer lock is already in place: the set-aside one may still be a live owner's, so it is kept (its owner
			// removes the lock it created, not this file; a later takeover judges it again by name)
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') return
			throw error
		}
	}
	rmSync(aside, { force: true })
}

/** The lock names this process: its pid, and its start time when the lock holds one. */
function isThisProcess(holder: { pid: number; startedAt?: string }): boolean {
	return (
		holder.pid === process.pid &&
		(holder.startedAt === undefined || holder.startedAt === processStartTime(process.pid))
	)
}

/** Blocks this thread for `milliseconds`: the ledger's readers and writers are synchronous. */
function sleep(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function readJson<Value>(params: { path: string; empty: Value }): Value {
	return existsSync(params.path)
		? (JSON.parse(readFileSync(params.path, 'utf8')) as Value)
		: params.empty
}

/** The key the ledger file holds a package's survivor under: `<package>::<survivor key>`. */
export function ledgerKeyOf(params: { packageName: string; key: string }): string {
	return `${params.packageName}${LEDGER_KEY_SEPARATOR}${params.key}`
}

/** The survivor key of a ledger key: what follows the package name. */
function survivorKeyOf(ledgerKey: string): string {
	return ledgerKey.slice(ledgerKey.lastIndexOf(LEDGER_KEY_SEPARATOR) + LEDGER_KEY_SEPARATOR.length)
}

function locationOf(
	survivor: Survivor,
): Pick<LedgerItem, 'file' | 'line' | 'mutation' | 'lineHash' | 'testsHash'> {
	const { file, line, mutation, lineHash, testsHash } = survivor
	return { file, line, mutation, lineHash, ...(testsHash === undefined ? {} : { testsHash }) }
}
