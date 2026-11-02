/** A scratch package that declares its mutation scope, a fake Stryker, and readers of the store as git folder files. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
	MUTATION_LEDGER_FILE,
	MUTATION_RUNS_FOLDER,
	MUTATION_STORE_FOLDER,
} from '../src/lib/mutation/mutation.constants.ts'
import {
	EDITED_SCOPE_SOURCE,
	MUTANT_LOCATION,
	MUTANT_MUTATOR,
	PACKAGE_NAME,
	SCOPE_FILE,
	SCOPE_SOURCE,
} from './mutation-package.constants.ts'
import { createScratchRepository } from './scratch-repository.ts'
import { commonGitDirOf } from './scratch-tree.ts'

import type {
	Ledger,
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
