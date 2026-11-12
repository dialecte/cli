/**
 * `dialecte mutants run | status | schedule | abandon | migrate | judge | record | drop`: mutation testing of a
 * package's declared scope. A run is written to the repository's store before Stryker starts and replaced when it
 * reports, so a run that never reports is found; its survivors go to the ledger, where they stay pending until a test
 * kills them, a committed record explains them (`judge` shows them, `record` writes the record), or they are
 * scheduled for a follow-up. Every verb but `run` prints one JSON object with `--json`.
 */
import { resultOf } from '../lib/command-result.ts'
import { scheduleAllNew, scheduleItems } from '../lib/mutation/ledger.ts'
import { migrateLegacyRecords } from '../lib/mutation/migrate-legacy.ts'
import { MUTANTS_JSON_VERBS } from '../lib/mutation/mutation-agent.constants.ts'
import {
	LEGACY_RECORDS_PATH,
	MUTANTS_VERBS,
	MUTATION_RECORDS_PATH,
	RUN_MODES,
	SHORT_TREE_LENGTH,
} from '../lib/mutation/mutation.constants.ts'
import { runMutation } from '../lib/mutation/run-mutation.ts'
import { planRun } from '../lib/mutation/run-plan.ts'
import { abandonRun } from '../lib/mutation/run-store.ts'
import { statusOf } from '../lib/mutation/status-of.ts'
import { runStrykerOfPackage } from '../lib/mutation/stryker-of-package.ts'
import { packageRootOf } from '../lib/package-root.ts'
import { jsonOf, printOut } from '../lib/print/print.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { processStartTime } from '../lib/process-start-time.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { dropVerb } from './mutants-drop.ts'
import { judgeVerb } from './mutants-judge.ts'
import { answered, asksJson, refused, usageResult } from './mutants-output.ts'
import { recordVerb } from './mutants-record.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	KeyedLedgerItem,
	MutantsDependencies,
	MutantsStatus,
	ReportedRun,
	RunCounts,
	StartTimeReader,
} from '../lib/mutation/mutation.types.ts'

/** The `mutants` command of the bin: runs in the package root, with the package's own StrykerJS. */
export async function run(argv: string[]): Promise<void> {
	const root = packageRootOf(process.cwd()) ?? process.cwd()
	// Stryker resolves the options' paths from the process's folder: the package root, as the options are written
	process.chdir(root)
	const result = await runMutants({
		cwd: root,
		argv,
		dependencies: { runStryker: runStrykerOfPackage },
	})
	// a --json result is one JSON object on stdout, whatever its exit code
	const printsJson =
		MUTANTS_JSON_VERBS.some((known) => known === argv[0]) && asksJson(argv.slice(1))
	printOut({
		stream: result.exitCode === 0 || printsJson ? 'stdout' : 'stderr',
		text: result.output,
	})
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/** `dialecte mutants run | status | schedule | abandon | migrate | judge | record | drop`. */
export async function runMutants(params: {
	cwd: string
	argv: string[]
	dependencies: MutantsDependencies
}): Promise<CommandResult> {
	const [verb, ...rest] = params.argv
	if (!MUTANTS_VERBS.some((known) => known === verb)) return usage()
	const json = MUTANTS_JSON_VERBS.some((known) => known === verb) && asksJson(rest)
	const root = packageRootOf(params.cwd)
	if (!root) {
		const reason = `no package.json at or above ${params.cwd}`
		return json
			? refused({ verb, json, reason })
			: resultOf({ exitCode: 1, lines: [`mutants: ${reason}`] })
	}
	const isAlive = params.dependencies.isAlive ?? isProcessAlive
	const startTimeOf = params.dependencies.startTimeOf ?? processStartTime
	const now = params.dependencies.now ?? newDate
	try {
		if (verb === 'run')
			return await runVerb({
				root,
				argv: rest,
				runStryker: params.dependencies.runStryker,
				startTimeOf,
			})
		if (verb === 'status') return statusVerb({ root, argv: rest, isAlive, startTimeOf, now })
		if (verb === 'schedule') return scheduleVerb({ root, argv: rest })
		if (verb === 'abandon') return abandonVerb({ root, argv: rest, isAlive, startTimeOf })
		if (verb === 'judge') return judgeVerb({ root, argv: rest, isAlive, startTimeOf })
		if (verb === 'record') return recordVerb({ root, argv: rest, isAlive, startTimeOf })
		if (verb === 'drop') return dropVerb({ root, argv: rest, isAlive, startTimeOf })
		return migrateVerb({ root, argv: rest })
	} catch (error) {
		return refused({ verb, json, reason: (error as Error).message })
	}
}

async function runVerb(params: {
	root: string
	argv: string[]
	runStryker: MutantsDependencies['runStryker']
	startTimeOf: StartTimeReader
}): Promise<CommandResult> {
	const { root, runStryker, startTimeOf } = params
	const read = readArguments({ argv: params.argv, valueOptions: ['mode', 'base'] })
	if (typeof read === 'string' || read.words.length > 0) return usage(read)
	const askedMode = read.values.get('mode')
	if (askedMode !== undefined && !RUN_MODES.some((mode) => mode === askedMode))
		return runLine({
			exitCode: 2,
			line: `--mode takes ${RUN_MODES.join(' or ')}, not ${JSON.stringify(askedMode)}`,
		})
	const planned = planRun({ root, askedMode, askedBase: read.values.get('base') })
	if ('stop' in planned) return runLine(planned.stop)
	const result = await runMutation({ root, plan: planned.plan, runStryker, startTimeOf })
	if ('failure' in result)
		return resultOf({
			exitCode: 1,
			lines: [
				`mutants run: ${result.failure}`,
				`run ${result.runId} stays running until this process ends, then reads as died: rerun, or dialecte mutants abandon ${result.runId}`,
			],
		})
	return resultOf({ exitCode: 0, lines: renderRun(result) })
}

/** A line of `mutants run`, after its `mutants run: ` prefix. */
function runLine(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [`mutants run: ${params.line}`] })
}

/** The last lines of a run: package, lot, tree, mode, counts, each survivor the ledger now holds as new, and each item the run moved to killed or recorded. */
function renderRun(params: ReportedRun): string[] {
	const { run, fresh, moved } = params
	return [
		`mutants run ${run.runId}: ${run.package} · lot ${run.lot} · tree ${run.tree.slice(0, SHORT_TREE_LENGTH)} · ${run.mode}`,
		renderCounts(run.counts),
		fresh.length === 0
			? 'no new survivor'
			: `${fresh.length} new survivor${fresh.length === 1 ? '' : 's'} (test it, record its reason, or dialecte mutants schedule <follow-up> <key>):`,
		...fresh.map(
			(survivor) => `  ${survivor.key}  ${survivor.file}:${survivor.line} ${survivor.mutation}`,
		),
		...(moved.length === 0
			? []
			: [
					`${moved.length} ledger item${moved.length === 1 ? '' : 's'} moved by this run:`,
					...moved.map((item) => `  ${item.key}  ${item.file}:${item.line}  ${item.state}`),
				]),
	]
}

function renderCounts(counts: RunCounts | undefined): string {
	const { killed = 0, survived = 0, timedOut = 0, noCoverage = 0 } = counts ?? {}
	return `killed ${killed} · survived ${survived} · timed out ${timedOut} · no coverage ${noCoverage}`
}

function statusVerb(params: {
	root: string
	argv: string[]
	isAlive: (pid: number) => boolean
	startTimeOf: StartTimeReader
	now: () => Date
}): CommandResult {
	const { root, isAlive, startTimeOf, now } = params
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['json'] })
	if (typeof read === 'string' || read.words.length > 0)
		return usageResult({ verb: 'status', json: asksJson(params.argv), read })
	const { packageName, status } = statusOf({ root, isAlive, startTimeOf })
	if (read.flags.has('json')) return { exitCode: 0, output: jsonOf(status, 2) }
	return resultOf({ exitCode: 0, lines: renderStatus({ packageName, status, now: now() }) })
}

function renderStatus(params: { packageName: string; status: MutantsStatus; now: Date }): string[] {
	const { packageName, status, now } = params
	const lines = [`mutants status: ${packageName}`]
	for (const run of status.running)
		lines.push(
			`  running  ${run.runId}  lot ${run.lot}  tree ${run.tree.slice(0, SHORT_TREE_LENGTH)}  ${run.mode}  ${ageOf({ since: run.startedAt, now })} (pid ${run.pid})`,
		)
	for (const run of status.died)
		lines.push(
			`  died     ${run.runId}  lot ${run.lot}  tree ${run.tree.slice(0, SHORT_TREE_LENGTH)}  ${run.mode}: rerun, or dialecte mutants abandon ${run.runId}`,
		)
	for (const [lot, items] of Object.entries(status.new))
		lines.push(`  new, first seen in lot ${lot}:`, ...items.map(renderItem))
	for (const [followUp, items] of Object.entries(status.scheduled))
		lines.push(`  scheduled for ${followUp}:`, ...items.map(renderItem))
	if (lines.length === 1) lines.push('  nothing pending')
	return lines
}

function renderItem(item: KeyedLedgerItem): string {
	return `    ${item.key}  ${item.file}:${item.line} ${item.mutation}`
}

/** How long ago `since` was: seconds under a minute, minutes under an hour, then hours and minutes. */
function ageOf(params: { since: string; now: Date }): string {
	const seconds = Math.max(
		0,
		Math.round((params.now.getTime() - new Date(params.since).getTime()) / 1000),
	)
	if (seconds < 60) return `${seconds} s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes} m`
	return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

function scheduleVerb(params: { root: string; argv: string[] }): CommandResult {
	const { root } = params
	const json = asksJson(params.argv)
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['all-new', 'json'] })
	if (typeof read === 'string') return usageResult({ verb: 'schedule', json, read })
	const [followUp, ...keys] = read.words
	const allNew = read.flags.has('all-new')
	if (!followUp || (keys.length === 0) === !allNew) return usageResult({ verb: 'schedule', json })
	const result = allNew
		? scheduleAllNew({ root, followUp })
		: scheduleItems({ root, keys, followUp })
	if (!result.ok) return refused({ verb: 'schedule', json, reason: result.reason })
	return answered({
		verb: 'schedule',
		json,
		lines: [
			`mutants schedule: ${result.scheduled.length} survivor${result.scheduled.length === 1 ? '' : 's'} scheduled for ${followUp}`,
			...result.scheduled.map((key) => `  ${key}`),
		],
		fields: { followUp, scheduled: result.scheduled },
	})
}

function abandonVerb(params: {
	root: string
	argv: string[]
	isAlive: (pid: number) => boolean
	startTimeOf: StartTimeReader
}): CommandResult {
	const { root, isAlive, startTimeOf } = params
	const json = asksJson(params.argv)
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['json'] })
	if (typeof read === 'string' || read.words.length !== 1)
		return usageResult({ verb: 'abandon', json, read })
	const [runId] = read.words
	const result = abandonRun({ root, runId, isAlive, startTimeOf })
	if (!result.ok) return refused({ verb: 'abandon', json, reason: result.reason })
	return answered({
		verb: 'abandon',
		json,
		lines: [`mutants abandon: run ${runId} abandoned (its entry is kept)`],
		fields: { runId },
	})
}

function migrateVerb(params: { root: string; argv: string[] }): CommandResult {
	const { root } = params
	const json = asksJson(params.argv)
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['json'] })
	if (typeof read === 'string' || read.words.length > 0)
		return usageResult({ verb: 'migrate', json, read })
	const migration = migrateLegacyRecords({ root })
	if ('refused' in migration) return refused({ verb: 'migrate', json, reason: migration.refused })
	const count = migration.written
	return answered({
		verb: 'migrate',
		json,
		lines: [
			`mutants migrate: ${count} record${count === 1 ? '' : 's'} written to ${MUTATION_RECORDS_PATH} (${LEGACY_RECORDS_PATH} kept)`,
		],
		fields: { path: MUTATION_RECORDS_PATH, written: count },
	})
}

function usage(read?: unknown): CommandResult {
	return usageResult({ read })
}

function newDate(): Date {
	return new Date()
}
