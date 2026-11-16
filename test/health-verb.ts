/** The health verb's cases: scratch common dirs, a store list, the run of the verb, and the writer cases' lots. */
import { spawn } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { runHandoverRun } from '../src/commands/handover.ts'
import { runHealth } from '../src/commands/health.ts'
import { startStep } from '../src/lib/events/record-step.ts'
import { isProcessAlive } from '../src/lib/process-alive.ts'
import { createFakeClock } from './fake-clock.ts'
import { LOTS_FOLDER, VERB_NOW, VERB_USAGE_LINE } from './health-verb.constants.ts'
import { writeHealthCommon } from './health.ts'
import { removeHookLogs } from './hook-logs.ts'
import { snapshotOf } from './lot-start-workspace.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { createStepLot, seenFile, stepEventsOf } from './step-events-lot.ts'
import { createRecordingSpawner } from './worktree-pool.ts'

import type { HealthJson } from '../src/commands/health.types.ts'
import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { CheckKey } from '../src/lib/gate-records/gate-records.types.ts'
import type { HealthFinding } from '../src/lib/health/health.types.ts'
import type {
	FindingKey,
	RehearsedLot,
	RunHealthOnParams,
	VerbSummary,
} from './health-verb.types.ts'
import type { HandoverLot } from './step-events-handover.types.ts'
import type { StepLot } from './step-events-lot.types.ts'

/** A common dir whose store folder exists and holds no lot and no record. */
export function emptyHealthCommon(): string {
	const common = writeHealthCommon({})
	mkdirSync(join(common, LOTS_FOLDER), { recursive: true })
	return common
}

/**
 * Runs `health` on a common dir: from a folder outside every repository (or from the repository itself), the common
 * dir's store on a store list of its own (never the machine's), the scratch folder an empty one.
 */
export function runHealthOn(params: RunHealthOnParams): CommandResult {
	const {
		common,
		argv = [],
		now = VERB_NOW,
		cwd = 'elsewhere',
		listed = true,
		scratch = [],
	} = params
	const tmp = temporaryFolder('dialecte-health-tmp-')
	for (const { name, ageMs } of scratch) {
		const folder = join(tmp, name)
		mkdirSync(folder)
		const modified = new Date(now.getTime() - ageMs)
		utimesSync(folder, modified, modified)
	}
	const listPath = join(temporaryFolder('dialecte-health-list-'), 'lot-stores')
	if (listed) writeFileSync(listPath, `${join(common, LOTS_FOLDER)}\n`)
	return runHealth({
		cwd: cwd === 'repository' ? join(common, '..') : temporaryFolder('dialecte-health-cwd-'),
		argv,
		now,
		tmp,
		listPath,
		isAlive: () => false,
	})
}

/** The exit code and the lines of a run. */
export function summaryOf(result: CommandResult): VerbSummary {
	return { exitCode: result.exitCode, lines: result.output.split('\n') }
}

/** The exit code, the header and whether the first finding line is red. */
export function headOf(result: CommandResult): {
	exitCode: number
	header: string
	first: boolean
} {
	const lines = result.output.split('\n')
	return { exitCode: result.exitCode, header: lines[0], first: lines[1]?.startsWith('✗ ') ?? false }
}

/** The exit code, the header and whether the second line is the scratch finding. */
export function scratchHeadOf(result: CommandResult): {
	exitCode: number
	header: string
	second: boolean
} {
	const lines = result.output.split('\n')
	return {
		exitCode: result.exitCode,
		header: lines[0],
		second: lines[1]?.startsWith('! worktrees  scratch') ?? false,
	}
}

/** A `--json` run: the exit code and what its document holds. */
export function jsonRunOf(result: CommandResult): {
	exitCode: number
	since: string
	keys: FindingKey[]
	counts: HealthJson['counts']
	repositories: string[]
} {
	const json: HealthJson = JSON.parse(result.output)
	return {
		exitCode: result.exitCode,
		since: json.since,
		keys: findingKeysOf(json.findings),
		counts: json.counts,
		repositories: json.findings.map((finding) => finding.repository),
	}
}

/** A usage error: the exit code, whether the text names the reason, whether it holds the usage line. */
export function usageOf(params: { result: CommandResult; mention: string }): {
	exitCode: number
	reason: boolean
	usage: boolean
} {
	const text = params.result.output
	return {
		exitCode: params.result.exitCode,
		reason: text.includes(params.mention),
		usage: text.includes(VERB_USAGE_LINE),
	}
}

/** The findings reduced to their rule, severity and time. */
export function findingKeysOf(findings: readonly HealthFinding[]): FindingKey[] {
	return findings.map((finding) => ({
		rule: finding.rule,
		severity: finding.severity,
		at: finding.at,
	}))
}

/** Every file under `folder` with its bytes and its modification time: equal states mean nothing was touched. */
export function fileStatesOf(folder: string): Record<string, string> {
	const states: Record<string, string> = {}
	const bytes = snapshotOf(folder)
	for (const name of readdirSync(folder, { recursive: true, encoding: 'utf8' }))
		states[name] = `${statSync(join(folder, name)).mtimeMs}`
	for (const [name, text] of Object.entries(bytes)) states[`bytes ${name}`] = text
	return states
}

/**
 * Ends one run of the lot through the step recorder, with `key` when given (the call is made here so that a throw
 * comes from a frame inside an `expect`); the end events of the lot, in file order.
 */
export function endsOfRunsWith(params: {
	lot: StepLot
	keys: (CheckKey | undefined)[]
}): LotEvent[] {
	for (const key of params.keys) {
		const handle = startStep({
			cwd: params.lot.worktree,
			step: 'gate-fast',
			heavy: false,
			warn: () => undefined,
		})
		handle.end({
			exit: 0,
			parts: [],
			reuse: 'none',
			stateHash: null,
			...(key === undefined ? {} : { key }),
		})
	}
	return stepEventsOf(params.lot).filter((event) => event.kind === 'step.end')
}

/** `handover run` of the lot's hand-over folder, in process, from the bystander lot's worktree. */
export async function runHandoverIn(params: { lot: HandoverLot; argv: string[] }): Promise<number> {
	const lines: string[] = []
	removeHookLogs({ lines })
	return runHandoverRun({
		probe: noRepositoryCli,
		argv: [params.lot.folder, ...params.argv],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		spawner: createRecordingSpawner().spawner,
		cwd: params.lot.bystander.worktree,
	})
}

/** The lots a hand-over folder's `rehearsal.json` holds, reduced to lot, tree and decision. */
export function rehearsalLotsOf(folder: string): RehearsedLot[] {
	const plan: { lots: RehearsedLot[] } = JSON.parse(
		readFileSync(join(folder, 'rehearsal.json'), 'utf8'),
	)
	return plan.lots.map(({ lot, tree, decision }) => ({ lot, tree, decision }))
}

/** The pid a step wrote to `file`, once it holds a whole number. */
function pidIn(file: string): number | undefined {
	if (!existsSync(file)) return undefined
	const text = readFileSync(file, 'utf8').trim()
	return /^\d+$/.test(text) ? Number(text) : undefined
}

async function waitFor(params: { check: () => boolean; bound: number }): Promise<void> {
	const deadline = Date.now() + params.bound
	while (!params.check()) {
		if (Date.now() > deadline) throw new Error(`still waiting after ${params.bound} ms`)
		await new Promise((resolveWait) => setTimeout(resolveWait, 100))
	}
}

/**
 * Runs `cli gate --full` of the lot (its one step sleeps) as a child process, sends it SIGINT once the step runs and
 * waits for it to end. Whatever happens, the cli and the step's child are killed.
 */
export async function interruptGateOf(params: {
	cliSource: string
	lot: StepLot
	pidFile: string
	bound: number
}): Promise<void> {
	const run = spawn(process.execPath, [params.cliSource, 'gate', '--full'], {
		cwd: params.lot.worktree,
		env: process.env,
		stdio: 'ignore',
	})
	let childPid: number | undefined
	try {
		const exited = new Promise<number | null>((resolveExit) => run.on('exit', resolveExit))
		await waitFor({ check: () => pidIn(params.pidFile) !== undefined, bound: params.bound })
		childPid = pidIn(params.pidFile)
		run.kill('SIGINT')
		await exited
		if (childPid !== undefined) {
			const pid = childPid
			await waitFor({ check: () => !isProcessAlive(pid), bound: params.bound })
		}
	} finally {
		run.kill('SIGKILL')
		if (childPid !== undefined && isProcessAlive(childPid)) process.kill(childPid, 'SIGKILL')
	}
}

/** A lot whose `full` gate is one step that records its pid and sleeps until a signal. */
export function createHangingLot(): { lot: StepLot; pidFile: string } {
	const pidFile = seenFile()
	const lot = createStepLot({
		fast: [{ name: 'one', run: 'echo one' }],
		full: [{ name: 'hang', run: `sleep 60 & echo $! > '${pidFile}'; wait` }],
	})
	return { lot, pidFile }
}
