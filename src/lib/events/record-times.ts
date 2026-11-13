import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { GATE_RECORD_FILE } from '../gate-records/gate-records.constants.ts'
import { MUTATION_RUNS_FOLDER, MUTATION_STORE_FOLDER } from '../mutation/mutation.constants.ts'
import { isRunEntry } from '../mutation/run-entry.ts'
import { GIT_ENTRY, GITDIR_LINE_PATTERN } from '../store/store.constants.ts'
import { LEDGER_VERSION, TDD_LEDGER_FILE } from '../tdd/tdd.constants.ts'
import {
	FAILED_STEP_STATUS,
	RECORD_MODES,
	RUN_FILE_EXTENSION,
	TDD_ENTRY_LIMIT,
	TDD_STEP_OF_KIND,
} from './record-times.constants.ts'
import { GATE_RECORD_FAMILIES } from './unrecorded-steps.constants.ts'

import type { FrozenRecords } from './cards-log.types.ts'
import type {
	GateRecordResult,
	MutationRunFile,
	ReadRecordTimes,
	RecordTimesRead,
} from './record-times.types.ts'
import type { SuiteFamily, TddEntryTime } from './unrecorded-steps.types.ts'

/**
 * The record times of a worktree TOP (`identity.worktree`, a `removing` line's `path`), read with file reads only (no
 * git process) from its git folder, found through `<worktree>/.git` alone (never walking up: a removed worktree under
 * the main checkout is `gone`, never the main checkout's records; a sub-folder is not a top). `worktree` answers
 * the real path. The times are the gate records' `at` and the tdd ledger's entries as `{ at, step }` (a red receipt
 * or a freeze is `tdd-red`, a green receipt `tdd-green`, any other kind `null`), the newest 200 with `cut` beyond.
 * A gate record that does not exist is `null`; one that exists but cannot be read or parsed is `null` with its
 * family in `unreadableGates`; a ledger that cannot be read is `tdd: null`; a worktree with no git folder is `gone`.
 */
export function readRecordTimes(params: { worktree: string }): RecordTimesRead {
	const top = realPathOrUndefined({ path: params.worktree })
	if (top === undefined) return { gone: true }
	const gitFolder = gitFolderOfTop({ top })
	if (gitFolder === undefined) return { gone: true }
	const ledger = readLedgerTimes({ gitFolder })
	const gates = {} as Omit<ReadRecordTimes, 'worktree' | 'tdd' | 'unreadableGates'>
	const unreadableGates: SuiteFamily[] = []
	for (const { field, family } of GATE_RECORD_FAMILIES) {
		const read = gateRecordAt({ gitFolder, mode: RECORD_MODES[field] })
		gates[field] = read.at
		if (read.unreadable) unreadableGates.push(family)
	}
	return {
		gone: false,
		cut: ledger.cut,
		times: {
			worktree: top,
			...gates,
			tdd: ledger.tdd,
			...(unreadableGates.length > 0 && { unreadableGates }),
		},
	}
}

/**
 * The gate record of `mode` (`fast`, `full`, `contrib`) of a worktree TOP with its result, read with file reads only
 * beside `readRecordTimes` (whose shape stays its callers'): green when no recorded step has status `failed` (a
 * skipped or not-run step fails nothing), with the state hash it ran on when it carries one. Null when the git folder, the record or its `at` is missing, or the record
 * does not parse.
 */
export function readGateRecordResult(params: {
	worktree: string
	mode: string
}): GateRecordResult | null {
	const top = realPathOrUndefined({ path: params.worktree })
	const gitFolder = top === undefined ? undefined : gitFolderOfTop({ top })
	if (gitFolder === undefined) return null
	const record = jsonOf({
		path: join(gitFolder, GATE_RECORD_FILE.replace('{mode}', params.mode)),
	}) as { at?: unknown; steps?: unknown; stateHash?: unknown } | null | undefined
	const at = record?.at
	if (typeof at !== 'string') return null
	const steps = Array.isArray(record?.steps) ? (record.steps as { status?: unknown }[]) : []
	return {
		at,
		green: !steps.some((step) => step?.status === FAILED_STEP_STATUS),
		...(typeof record?.stateHash === 'string' && { stateHash: record.stateHash }),
	}
}

/**
 * The record times of a worktree TOP as a `cards.log` line freezes them (`readRecordTimes`, file reads only);
 * `null` when its git folder is gone.
 */
export function freezeRecordTimes(params: { worktree: string }): FrozenRecords | null {
	const read = readRecordTimes(params)
	if (read.gone) return null
	const { times } = read
	return {
		'gate-fast': times.gateFast,
		'gate-full': times.gateFull,
		'gate-release': times.gateRelease,
		contrib: times.contrib,
		'gate-hook': times.gateHook,
		tdd: times.tdd,
		...(read.cut && { cut: true }),
		...(times.unreadableGates && { unreadable: times.unreadableGates }),
	}
}

/**
 * The commit the last commit hook of a worktree TOP let through: its hook record's `head` (a file read, no git);
 * undefined when the git folder, the record or its `head` is missing.
 */
export function readHookHead(params: { worktree: string }): string | undefined {
	const top = realPathOrUndefined({ path: params.worktree })
	const gitFolder = top === undefined ? undefined : gitFolderOfTop({ top })
	if (gitFolder === undefined) return undefined
	const record = jsonOf({
		path: join(gitFolder, GATE_RECORD_FILE.replace('{mode}', RECORD_MODES.gateHook)),
	})
	const head = (record as { head?: unknown } | undefined)?.head
	return typeof head === 'string' && head !== '' ? head : undefined
}

/** The mutation run files of a repository, from `<common folder>/dialecte-mutation/runs/`; nothing filtered. */
export function readMutationRunFiles(params: { commonFolder: string }): MutationRunFile[] {
	const folder = join(params.commonFolder, MUTATION_STORE_FOLDER, MUTATION_RUNS_FOLDER)
	let names: string[]
	try {
		names = readdirSync(folder)
	} catch {
		return []
	}
	return names
		.filter((name) => name.endsWith(RUN_FILE_EXTENSION))
		.flatMap((name) => {
			const entry = jsonOf({ path: join(folder, name) })
			if (!isRunEntry(entry) || typeof entry.worktree !== 'string') return []
			return [{ worktree: entry.worktree, startedAt: entry.startedAt, state: entry.state }]
		})
}

/** The real path of a path, or undefined when it does not exist. */
function realPathOrUndefined(params: { path: string }): string | undefined {
	try {
		return realpathSync(params.path)
	} catch {
		return undefined
	}
}

/** The git folder of a work tree top: its `.git` folder, or the existing folder its `.git` file names. */
function gitFolderOfTop(params: { top: string }): string | undefined {
	const entry = join(params.top, GIT_ENTRY)
	try {
		if (statSync(entry).isDirectory()) return entry
		const target = GITDIR_LINE_PATTERN.exec(readFileSync(entry, 'utf8'))?.[1]
		if (target === undefined) return undefined
		const gitFolder = resolve(params.top, target)
		return statSync(gitFolder).isDirectory() ? gitFolder : undefined
	} catch {
		return undefined
	}
}

/**
 * The `at` of a gate record of the git folder (`null` without one), and whether the record exists but cannot be read
 * or parsed (its family is then unknown, never read as no record).
 */
function gateRecordAt(params: { gitFolder: string; mode: string }): {
	at: string | null
	unreadable: boolean
} {
	let text: string
	try {
		text = readFileSync(
			join(params.gitFolder, GATE_RECORD_FILE.replace('{mode}', params.mode)),
			'utf8',
		)
	} catch (error) {
		return { at: null, unreadable: (error as NodeJS.ErrnoException).code !== 'ENOENT' }
	}
	const record = parsedOf({ text })
	if (record === undefined) return { at: null, unreadable: true }
	const at = (record as { at?: unknown } | null)?.at
	return { at: typeof at === 'string' ? at : null, unreadable: false }
}

/** The tdd ledger's entries as times, the newest 200; `[]` without a ledger, `null` for one that cannot be read. */
function readLedgerTimes(params: { gitFolder: string }): {
	tdd: TddEntryTime[] | null
	cut: boolean
} {
	const path = join(params.gitFolder, TDD_LEDGER_FILE)
	let text: string
	try {
		text = readFileSync(path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { tdd: [], cut: false }
		return { tdd: null, cut: false }
	}
	const ledger = parsedOf({ text }) as { version?: unknown; entries?: unknown } | undefined
	if (ledger?.version !== LEDGER_VERSION || !Array.isArray(ledger.entries))
		return { tdd: null, cut: false }
	const times = (ledger.entries as { kind?: unknown; at?: unknown }[]).flatMap((entry) =>
		typeof entry?.at === 'string'
			? [{ at: entry.at, step: TDD_STEP_OF_KIND[String(entry.kind)] ?? null }]
			: [],
	)
	return { tdd: times.slice(-TDD_ENTRY_LIMIT), cut: times.length > TDD_ENTRY_LIMIT }
}

/** The JSON a file holds, or undefined when it does not exist or does not parse. */
function jsonOf(params: { path: string }): unknown {
	try {
		return parsedOf({ text: readFileSync(params.path, 'utf8') })
	} catch {
		return undefined
	}
}

/** The value a text parses to, or undefined. */
function parsedOf(params: { text: string }): unknown {
	try {
		return JSON.parse(params.text)
	} catch {
		return undefined
	}
}
