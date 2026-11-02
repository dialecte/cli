/**
 * The runs of `dialecte mutants run`, shared by every worktree of a repository:
 * `<git-common-dir>/dialecte-mutation/runs/<runId>.json`. A run's entry is written `running` before anything runs
 * and replaced `reported` when it ends, so a run killed mid-way (a closed session, a usage limit) is still found:
 * its process is gone, and it reads as `died`. The cli is the only writer; every write goes to a temporary name
 * first and is renamed into place, so a reader never sees half an entry.
 */
import { randomBytes } from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import { commonGitFolderOf, currentBranchOf } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { isProcessAlive } from '../process-alive.ts'
import { processStartTime } from '../process-start-time.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { MUTATION_RUNS_FOLDER, MUTATION_STORE_FOLDER } from './mutation.constants.ts'

import type {
	AbandonResult,
	MutationMode,
	OwnerCheck,
	RunCounts,
	RunEntry,
	StartTimeReader,
	Survivor,
} from './mutation.types.ts'

/** Writes the `running` entry of a new run, before anything runs, and answers it. */
export function startRun(params: {
	root: string
	pid: number
	lot: string
	tree: string
	mode: MutationMode
	base?: string
	/** The run's `--mutate` targets, kept so a ledger update missed when the run ended can still be made. */
	targets?: readonly string[]
	now?: Date
	/** When the owner process started; the system's answer by default. */
	startTimeOf?: StartTimeReader
}): RunEntry {
	const { root, pid, lot, tree, mode, base, targets } = params
	const startedAt = (params.now ?? new Date()).toISOString()
	const ownerStartedAt = (params.startTimeOf ?? processStartTime)(pid)
	const entry: RunEntry = {
		runId: newRunId(startedAt),
		pid,
		startedAt,
		worktree: workTreeTopOf(root) ?? root,
		branch: currentBranchOf(root),
		lot,
		tree,
		mode,
		...(base === undefined ? {} : { base }),
		package: packageNameOf(root),
		packageRoot: root,
		...(ownerStartedAt === undefined ? {} : { ownerStartedAt }),
		...(targets === undefined ? {} : { targets: [...targets] }),
		state: 'running',
	}
	writeRunEntry({ root, entry })
	return entry
}

/** Replaces the entry with a `reported` one holding the counts and survivors, atomically. */
export function finishRun(params: {
	root: string
	runId: string
	counts: RunCounts
	survivors: readonly Survivor[]
	/** The survivor keys of the mutants the run detected (killed or timed out). */
	detected?: readonly string[]
	/** The survivor keys of every mutant the run's report holds. */
	tested?: readonly string[]
	now?: Date
}): RunEntry {
	const { root, runId, counts, survivors, detected, tested } = params
	const stored = readStoredRun({ root, runId })
	if (!stored) throw new Error(`no mutation run ${runId} in ${runsFolderOf(root)}`)
	const entry: RunEntry = {
		...stored,
		state: 'reported',
		finishedAt: (params.now ?? new Date()).toISOString(),
		counts,
		survivors: [...survivors],
		...(detected === undefined ? {} : { detected: [...detected] }),
		...(tested === undefined ? {} : { tested: [...tested] }),
	}
	writeRunEntry({ root, entry })
	return entry
}

/**
 * Every run of the repository, oldest first, a `running` one whose owner is gone read as `died`: no process holds
 * its pid, or the process holding it started at another time than the owner did.
 */
export function readRuns(params: { root: string } & OwnerCheck): RunEntry[] {
	return readStoredRuns(params.root).map((entry) => classifyRun({ entry, check: params }))
}

/** Every run of the repository as its file holds it, oldest first: no owner check (no process is asked). */
export function readStoredRuns(root: string): RunEntry[] {
	const folder = runsFolderOf(root)
	if (!existsSync(folder)) return []
	return readdirSync(folder)
		.filter((file) => file.endsWith('.json'))
		.flatMap((file) => {
			const entry = parseRunEntry(join(folder, file))
			return entry ? [entry] : []
		})
		.sort((first, second) => first.startedAt.localeCompare(second.startedAt))
}

/** Marks a `died` run `abandoned`; a `running` or `reported` run is refused. Deletes nothing. */
export function abandonRun(params: { root: string; runId: string } & OwnerCheck): AbandonResult {
	const { root, runId } = params
	const stored = readStoredRun({ root, runId })
	if (!stored) return { ok: false, reason: `no mutation run ${runId} in ${runsFolderOf(root)}` }
	const { state } = classifyRun({ entry: stored, check: params })
	if (state !== 'died')
		return {
			ok: false,
			reason: `run ${runId} is ${state}: only a run that died before reporting can be abandoned`,
		}
	writeRunEntry({ root, entry: { ...stored, state: 'abandoned' } })
	return { ok: true }
}

/** The store's folder in the git folder every worktree of the repository `root` is in shares. */
export function mutationStoreFolderOf(root: string): string {
	return join(commonGitFolderOf(root), MUTATION_STORE_FOLDER)
}

/** The `name` of the package.json at `root`, else the folder's name. */
export function packageNameOf(root: string): string {
	return readPackageJson(root).name ?? basename(root)
}

/** Writes `text` to `path` through a temporary name renamed into place: a reader never sees half a file. */
export function writeAtomically(params: { path: string; text: string }): void {
	const written = `${params.path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
	writeFileSync(written, params.text)
	renameSync(written, params.path)
}

function runsFolderOf(root: string): string {
	return join(mutationStoreFolderOf(root), MUTATION_RUNS_FOLDER)
}

function writeRunEntry(params: { root: string; entry: RunEntry }): void {
	const folder = runsFolderOf(params.root)
	mkdirSync(folder, { recursive: true })
	writeAtomically({
		path: join(folder, `${params.entry.runId}.json`),
		text: `${JSON.stringify(params.entry, null, '\t')}\n`,
	})
}

/** The entry as the file holds it (no liveness applied), or undefined when there is none. */
function readStoredRun(params: { root: string; runId: string }): RunEntry | undefined {
	const path = join(runsFolderOf(params.root), `${params.runId}.json`)
	return existsSync(path) ? parseRunEntry(path) : undefined
}

function parseRunEntry(path: string): RunEntry | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
		return isRunEntry(parsed) ? parsed : undefined
	} catch {
		// broken by hand: no run of this store
		return undefined
	}
}

function isRunEntry(value: unknown): value is RunEntry {
	if (typeof value !== 'object' || value === null) return false
	const entry = value as Record<string, unknown>
	return (
		typeof entry.runId === 'string' &&
		typeof entry.pid === 'number' &&
		typeof entry.startedAt === 'string' &&
		typeof entry.state === 'string'
	)
}

function classifyRun(params: { entry: RunEntry; check: OwnerCheck }): RunEntry {
	const { entry, check } = params
	if (entry.state !== 'running') return entry
	return isOwnerAlive({ entry, check }) ? entry : { ...entry, state: 'died' }
}

function isOwnerAlive(params: { entry: RunEntry; check: OwnerCheck }): boolean {
	const { entry, check } = params
	return isOwnerProcessAlive({ pid: entry.pid, startedAt: entry.ownerStartedAt, check })
}

/**
 * A process owning something (a run, a lock) still runs: its pid is held, by a process that started when the owner
 * did (when both start times are known).
 */
export function isOwnerProcessAlive(params: {
	pid: number
	startedAt: string | undefined
	check?: OwnerCheck
}): boolean {
	const { pid, startedAt, check = {} } = params
	if (!(check.isAlive ?? isProcessAlive)(pid)) return false
	if (startedAt === undefined) return true
	const started = (check.startTimeOf ?? processStartTime)(pid)
	return started === undefined || started === startedAt
}

/** A run id that sorts by start time and never repeats: `20261102T100000Z-1a2b3c4d`. */
function newRunId(startedAt: string): string {
	const stamp = startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
	return `${stamp}-${randomBytes(4).toString('hex')}`
}
