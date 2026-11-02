/** A scratch package that declares its mutation scope, a fake Stryker, and readers of the store as git folder files. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { runMutants } from '../src/commands/mutants.ts'
import { scheduleItems, updateLedger } from '../src/lib/mutation/ledger.ts'
import {
	MUTATION_APPLIED_RUNS_FILE,
	MUTATION_LEDGER_FILE,
	MUTATION_RUNS_FOLDER,
	MUTATION_STORE_FOLDER,
} from '../src/lib/mutation/mutation.constants.ts'
import { finishRun, startRun } from '../src/lib/mutation/run-store.ts'
import {
	DONE_FILE,
	EDITED_SCOPE_SOURCE,
	MUTANT_LOCATION,
	MUTANT_MUTATOR,
	OTHER_FILE,
	PACKAGE_NAME,
	RECORDS_FILE,
	SCOPE_FILE,
	SCOPE_SOURCE,
} from './mutation-package.constants.ts'
import { createScratchRepository } from './scratch-repository.ts'
import { commonGitDirOf } from './scratch-tree.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type {
	Ledger,
	MutantsDependencies,
	MutationReport,
	MutationTier,
	RunEntry,
	StrykerRunner,
	Survivor,
} from '../src/lib/mutation/mutation.types.ts'
import type { MutantSpec, StrykerCall } from './mutation-package.types.ts'

/** A repository on `main` whose package declares a scope (`src/engine/*.ts`), a fast tier and, when asked, a full one. */
export function mutationPackage(
	params: { full?: boolean; files?: Record<string, string> } = {},
): string {
	const declaration = {
		scope: ['src/engine/*.ts'],
		fast: { vitestConfig: 'v.config.ts' },
		...(params.full ? { full: { command: 'npx vitest run' } } : {}),
	}
	return createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME, dialecte: { mutation: declaration } }, null, '\t')}\n`,
		[SCOPE_FILE]: SCOPE_SOURCE,
		...params.files,
	})
}

/** The runs of the store, read from the files (not through the store's own reader). */
export function storedRuns(root: string): RunEntry[] {
	const folder = join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_RUNS_FOLDER)
	return listJson(folder).map(
		(file) => JSON.parse(readFileSync(join(folder, file), 'utf8')) as RunEntry,
	)
}

/** The names of the files in the runs folder. */
export function runFiles(root: string): string[] {
	return readdirSync(join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_RUNS_FOLDER))
}

export function storedLedger(root: string): Ledger {
	return JSON.parse(
		readFileSync(join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_LEDGER_FILE), 'utf8'),
	) as Ledger
}

function listJson(folder: string): string[] {
	try {
		return readdirSync(folder).filter((file) => file.endsWith('.json'))
	} catch {
		return []
	}
}

/** The ledger's key of a survivor: its package, then its survivor key. */
export function ledgerKeyOf(params: { packageName?: string; key: string }): string {
	return `${params.packageName ?? PACKAGE_NAME}::${params.key}`
}

/** A survivor as the judge describes it. */
export function survivorOf(params: {
	key: string
	file?: string
	line?: number
	mutation?: string
}): Survivor {
	const {
		key,
		file = SCOPE_FILE,
		line = 2,
		mutation = `${MUTANT_MUTATOR}: x === 1 -> true`,
	} = params
	return {
		file,
		key,
		line,
		mutation,
		range: `${file}:${line}:8-${line}:15`,
		lineHash: `hash-${key}`,
	}
}

/** A `reported` run entry, as a ledger update takes it. */
export function reportedRun(params: {
	runId: string
	tree?: string
	lot?: string
	/** When the run started (10:00Z by default): a ledger never lets a run kill what a later-started run reported. */
	startedAt?: string
	survivors: Survivor[]
	root: string
}): RunEntry {
	return {
		runId: params.runId,
		pid: process.pid,
		startedAt: params.startedAt ?? '2026-11-02T10:00:00.000Z',
		worktree: params.root,
		branch: 'main',
		lot: params.lot ?? 'lot-a',
		tree: params.tree ?? 'a'.repeat(40),
		mode: 'changed',
		package: PACKAGE_NAME,
		state: 'reported',
		finishedAt: '2026-11-02T10:05:00.000Z',
		counts: { killed: 3, survived: params.survivors.length, timedOut: 0, noCoverage: 0 },
		survivors: params.survivors,
	}
}

/** A StrykerJS report of the scope file with these mutants, all on `x === 1`. */
export function reportOf(params: {
	mutants: MutantSpec[]
	/** The scope file's text the run saw: the edited working file by default. */
	source?: string
}): MutationReport {
	return {
		files: {
			[SCOPE_FILE]: {
				source: params.source ?? EDITED_SCOPE_SOURCE,
				mutants: params.mutants.map(({ id, status, replacement = 'true' }) => ({
					id,
					mutatorName: MUTANT_MUTATOR,
					replacement,
					status,
					location: MUTANT_LOCATION,
				})),
			},
		},
	}
}

/** The wording the command prints for the mutant of a spec: `file:line mutation`. */
export function survivorLine(params: { replacement: string; original?: string }): string {
	const { replacement, original = 'x === 2' } = params
	return `${SCOPE_FILE}:2 ${MUTANT_MUTATOR}: ${original} -> ${replacement}`
}

/** The tier a call's options are for, from the report file name the options give. */
export function tierOf(fileName: string): MutationTier {
	if (fileName.includes('report-timeouts')) return 'timeouts'
	if (fileName.includes('report-full')) return 'full'
	return 'fast'
}

/** A Stryker that writes the fixed report of the tier it is called for, and records its calls. */
export function fakeStryker(params: {
	root: string
	reports: Partial<Record<MutationTier, MutationReport>>
	calls: StrykerCall[]
	exitCode?: number
	throws?: boolean
}): StrykerRunner {
	const { root, reports, calls, exitCode = 0, throws = false } = params
	return async function runFakeStryker({ options }) {
		const tier = tierOf(options.jsonReporter.fileName)
		calls.push({ tier, options, runStatesAtCall: storedRuns(root).map((run) => run.state) })
		if (throws) throw new Error('stryker crashed')
		if (exitCode !== 0) return exitCode
		const path = resolve(root, options.jsonReporter.fileName)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, JSON.stringify(reports[tier] ?? { files: {} }))
		return 0
	}
}

/**
 * A `reported` run written straight into the store with `startRun` and `finishRun`: no ledger update takes it in, so
 * it is one of the runs a ledger reader folds in (and `dropRun` refuses until one did).
 */
export function storedReportedRun(params: {
	root: string
	startedAt: string
	/** Five minutes after `startedAt` by default. */
	finishedAt?: string
	survivors: Survivor[]
	detected?: string[]
	lot?: string
}): RunEntry {
	const { root, startedAt, survivors, detected, lot = 'lot-a' } = params
	const { runId } = startRun({
		root,
		pid: process.pid,
		lot,
		tree: 'a'.repeat(40),
		mode: 'changed',
		targets: [SCOPE_FILE],
		now: new Date(startedAt),
	})
	return finishRun({
		root,
		runId,
		counts: { killed: 0, survived: survivors.length, timedOut: 0, noCoverage: 0 },
		survivors,
		...(detected === undefined ? {} : { detected }),
		tested: survivors.map(({ key }) => key),
		now: new Date(params.finishedAt ?? new Date(Date.parse(startedAt) + 300_000).toISOString()),
	})
}

/** The text of the ledger and of the applied-runs file as the store holds them now; undefined for a file not there. */
export function storeFileTexts(root: string): { ledger?: string; applied?: string } {
	const folder = join(commonGitDirOf(root), MUTATION_STORE_FOLDER)
	return {
		ledger: textOf(join(folder, MUTATION_LEDGER_FILE)),
		applied: textOf(join(folder, MUTATION_APPLIED_RUNS_FILE)),
	}
}

/** The text of the package's records file; undefined when it is not there. */
export function recordsFileText(root: string): string | undefined {
	return textOf(join(root, RECORDS_FILE))
}

function textOf(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/**
 * Where the `occurrence`-th (from 1) `text` sits in `source`: its start line (from 1) and its range in the form
 * `--mutate` takes, `file:line:column-line:column`, every column from 0 and the end column exclusive.
 */
export function locationOfText(params: {
	file: string
	source: string
	text: string
	occurrence?: number
}): { line: number; range: string } {
	const { file, source, text, occurrence = 1 } = params
	let start = -1
	for (let found = 0; found < occurrence; found++) {
		start = source.indexOf(text, start + 1)
		if (start < 0) throw new Error(`${JSON.stringify(text)} occurs fewer than ${occurrence} times`)
	}
	const from = positionAt({ source, offset: start })
	const to = positionAt({ source, offset: start + text.length })
	return { line: from.line, range: `${file}:${from.line}:${from.column}-${to.line}:${to.column}` }
}

function positionAt(params: { source: string; offset: number }): { line: number; column: number } {
	const before = params.source.slice(0, params.offset).split('\n')
	return { line: before.length, column: before[before.length - 1].length }
}

/**
 * A package whose ledger holds one item of every state, written with the ledger's own functions: `n1` (a.ts line 2,
 * with a tests hash), `n3` (a.ts line 2), `n4` (a.ts line 9) and `n2` (b.ts line 3) new; `s1` (a.ts line 5)
 * scheduled for `later`; `kd1` (a.ts line 6) and `kd2` (done.ts) killed by run `r2`; `rc1` (a.ts line 7) recorded by
 * `r2`. No records file is written. Every item's line hash is `hash-<key>`.
 */
export function recordablePackage(): string {
	const root = mutationPackage({ files: { [OTHER_FILE]: SCOPE_SOURCE, [DONE_FILE]: SCOPE_SOURCE } })
	const first = reportedRun({
		root,
		runId: 'r1',
		survivors: [
			{ ...survivorOf({ key: 'n1', line: 2 }), testsHash: 'th-n1' },
			survivorOf({ key: 'n3', line: 2 }),
			survivorOf({ key: 'n4', line: 9 }),
			survivorOf({ key: 'n2', file: OTHER_FILE, line: 3 }),
			survivorOf({ key: 's1', line: 5 }),
			survivorOf({ key: 'kd1', line: 6 }),
			survivorOf({ key: 'kd2', file: DONE_FILE, line: 2 }),
			survivorOf({ key: 'rc1', line: 7 }),
		],
	})
	updateLedger({ root, run: first, records: {}, targets: [SCOPE_FILE] })
	scheduleItems({ root, keys: ['s1'], followUp: 'later' })
	const second = {
		...reportedRun({ root, runId: 'r2', startedAt: '2026-11-02T11:00:00.000Z', survivors: [] }),
		detected: ['kd1', 'kd2'],
	}
	const listed = {
		line: 7,
		mutation: 'ConditionalExpression: x === 1 -> true',
		family: 'wording' as const,
		reason: 'listed already',
		lineHash: 'hash-rc1',
	}
	updateLedger({
		root,
		run: second,
		records: { [SCOPE_FILE]: { rc1: listed } },
		targets: [SCOPE_FILE],
	})
	return root
}

/** `dialecte mutants <argv>` in the package at `root`, with a Stryker that is never called. */
export function runMutantsIn(params: {
	root: string
	argv: string[]
	dependencies?: Partial<MutantsDependencies>
}): Promise<CommandResult> {
	const { root, argv, dependencies } = params
	return runMutants({
		cwd: root,
		argv,
		dependencies: { runStryker: fakeStryker({ root, reports: {}, calls: [] }), ...dependencies },
	})
}

/** What a `--json` verb printed as an object; the text itself, wrapped, when it is not one JSON value. */
export function parsedOutput(output: string): unknown {
	try {
		return JSON.parse(output)
	} catch {
		return { notJson: output }
	}
}
