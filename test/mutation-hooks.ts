/**
 * The world the mutation hooks read, built through the store's own writers (`startRun`, `finishRun`,
 * `updateLedger`, `scheduleItems`, `abandonRun`) on scratch repositories: runs of a branch, survivors the ledger
 * holds, and the hand-overs and recaps that read them.
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runGate } from '../src/commands/gate.ts'
import { runHandover, runHandoverRun } from '../src/commands/handover.ts'
import { runRules } from '../src/commands/rules.ts'
import { computeStateHash } from '../src/lib/gate-records/state-hash.ts'
import { currentBranchOf } from '../src/lib/git.ts'
import { GUARD_NAME_WIDTH } from '../src/lib/handover/handover.constants.ts'
import { scheduleItems, updateLedger } from '../src/lib/mutation/ledger.ts'
import { abandonRun, finishRun, startRun } from '../src/lib/mutation/run-store.ts'
import { deadPid } from './dead-pid.ts'
import { createFakeClock } from './fake-clock.ts'
import { gitPathOf } from './gate-records.ts'
import { removeHookLogs } from './hook-logs.ts'
import {
	FOLLOW_UP,
	GREEN_CHECK_RUN,
	HOOKS_TREE,
	MERGED_BRANCH,
	OTHER_PACKAGE_FOLDER,
	OTHER_PACKAGE_NAME,
	SLEEPER_SECONDS,
} from './mutation-hooks.constants.ts'
import { PACKAGE_NAME, SCOPE_FILE } from './mutation-package.constants.ts'
import { mutationPackage } from './mutation-package.ts'
import { WRITER_CLI } from './scratch-checks.constants.ts'
import { git, initializeRepository, temporaryFolder, writeFiles } from './scratch-repository.ts'

import type { GateRecord, RulesRecord } from '../src/lib/gate-records/gate-records.types.ts'
import type {
	MutationRecords,
	RunCounts,
	RunEntry,
	Survivor,
} from '../src/lib/mutation/mutation.types.ts'
import type { ChildProcess } from 'node:child_process'

/** The scratch package: the root declares the mutation scope; `packages/other` is a second package of the repository. */
export function declaredRepositoryWithOtherPackage(): { root: string; other: string } {
	const root = mutationPackage({
		files: {
			[`${OTHER_PACKAGE_FOLDER}/package.json`]: `${JSON.stringify({ name: OTHER_PACKAGE_NAME })}\n`,
		},
	})
	return { root, other: join(root, OTHER_PACKAGE_FOLDER) }
}

/** A repository on `main` whose package gates with one passing step, declaring its mutation scope or not. */
export function hooksRepository(params: { declared: boolean }): string {
	const dialecte = {
		gate: { fast: [{ name: 'check', run: GREEN_CHECK_RUN }] },
		...(params.declared
			? { mutation: { scope: ['src/engine/*.ts'], fast: { vitestConfig: 'v.config.ts' } } }
			: {}),
	}
	return initializeRepository({
		root: temporaryFolder('dialecte-hooks-'),
		files: {
			'package.json': `${JSON.stringify({ name: PACKAGE_NAME, scripts: {}, dialecte }, null, '\t')}\n`,
			'src/read.ts': 'export function read() {}\n',
		},
	})
}

export function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The time of the n-th run of a case: runs started in this order, a minute apart. */
export function startedAt(minute: number): Date {
	return new Date(Date.UTC(2026, 10, 2, 10, minute, 0))
}

/** Runs `work` with `branch` checked out (made when it does not exist), the branch the root was on checked out again after. */
export function onBranch<Result>(params: {
	root: string
	branch: string | undefined
	work: () => Result
}): Result {
	const { root, branch, work } = params
	const previous = currentBranchOf(root)
	if (branch === undefined || branch === previous) return work()
	const exists = git({ root, args: ['branch', '--list', branch] }).trim() !== ''
	git({ root, args: exists ? ['checkout', '-q', branch] : ['checkout', '-q', '-b', branch] })
	try {
		return work()
	} finally {
		git({ root, args: ['checkout', '-q', previous] })
	}
}

/** A `running` run of `branch` (the current one by default) owned by this process, or by `pid`. */
export function startRunning(params: {
	root: string
	branch?: string
	pid?: number
	now?: Date
	tree?: string
}): RunEntry {
	const { root, branch, pid = process.pid, now, tree = HOOKS_TREE } = params
	return onBranch({
		root,
		branch,
		work: () =>
			startRun({
				root,
				pid,
				lot: branch ?? currentBranchOf(root),
				tree,
				mode: 'changed',
				targets: [SCOPE_FILE],
				now,
			}),
	})
}

/** A run of `branch` whose owner process is gone: it reads `died`. */
export function startDied(params: { root: string; branch?: string; now?: Date }): RunEntry {
	return startRunning({ ...params, pid: deadPid() })
}

/** `finishRun` and the ledger update of a started run, as the command makes them. */
export function finishRunning(params: {
	root: string
	run: RunEntry
	survivors: Survivor[]
	detected?: string[]
	tested?: string[]
	records?: MutationRecords
	counts?: RunCounts
}): RunEntry {
	const { root, run, survivors, detected, tested, records = {} } = params
	const reported = finishRun({
		root,
		runId: run.runId,
		counts: params.counts ?? { killed: 3, survived: survivors.length, timedOut: 0, noCoverage: 0 },
		survivors,
		detected,
		tested,
	})
	updateLedger({ root, run: reported, records, targets: [SCOPE_FILE] })
	return reported
}

/** A whole run of `branch`: started, reported with these survivors, taken into the ledger. */
export function reportRun(params: {
	root: string
	branch?: string
	survivors: Survivor[]
	detected?: string[]
	tested?: string[]
	records?: MutationRecords
	counts?: RunCounts
	now?: Date
	tree?: string
}): RunEntry {
	const run = startRunning({
		root: params.root,
		branch: params.branch,
		now: params.now,
		tree: params.tree,
	})
	return finishRunning({ ...params, run })
}

export function scheduleSurvivor(params: { root: string; key: string }): void {
	const result = scheduleItems({ root: params.root, keys: [params.key], followUp: FOLLOW_UP })
	if (!result.ok) throw new Error(result.reason)
}

export function abandonDied(params: { root: string; run: RunEntry }): void {
	const result = abandonRun({ root: params.root, runId: params.run.runId })
	if (!result.ok) throw new Error(result.reason)
}

/** A process that lives until stopped, for a run whose owner dies between the card and the hand-over. */
export function startSleeper(): ChildProcess {
	const child = spawn('sleep', [SLEEPER_SECONDS], { stdio: 'ignore' })
	if (child.pid === undefined) throw new Error('could not start a child process')
	return child
}

export async function stopSleeper(child: ChildProcess): Promise<void> {
	child.kill()
	await once(child, 'exit')
}

/** The gate and the rules run on the tree as it is: every gate line of the card is green or `!`. */
export async function recordGreenGates(root: string): Promise<void> {
	const gated = await runGate({ cwd: root, argv: [] })
	expectExit({ name: 'gate', exitCode: gated.exitCode })
	expectExit({ name: 'rules', exitCode: runRules({ cwd: root, argv: [] }).exitCode })
}

function expectExit(params: { name: string; exitCode: number }): void {
	if (params.exitCode !== 0) throw new Error(`${params.name} exited ${params.exitCode}`)
}

/** The gate and rules records of the tree as it is, written as a gate and a rules run leave them (no command run). */
export function writeGreenRecords(root: string): void {
	const stateHash = computeStateHash(root)
	const gate: GateRecord = {
		mode: 'fast',
		at: '2026-11-02T10:00:00.000Z',
		head: headOf(root),
		stateHash,
		steps: [
			{
				name: 'check',
				status: 'passed',
				counts: { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } },
			},
		],
	}
	const rules: RulesRecord = {
		at: '2026-11-02T10:00:00.000Z',
		head: headOf(root),
		stateHash,
		files: [],
		errors: 0,
		warnings: 0,
	}
	writeFileSync(gitPathOf({ root, name: 'dialecte-gate-fast.json' }), JSON.stringify(gate, null, 2))
	writeFileSync(gitPathOf({ root, name: 'dialecte-rules.json' }), JSON.stringify(rules, null, 2))
}

/** Two changed files in a repository, a lots file for each, the hand-over not written yet. */
export function hooksHandover(params: { declared: boolean }): {
	root: string
	lotsPath: string
	out: string
} {
	const root = hooksRepository(params)
	writeFiles({
		root,
		files: {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'CHANGELOG.md': '# Changelog\n\n- read answers 1\n',
		},
	})
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	writeFileSync(
		lotsPath,
		JSON.stringify({
			repository: root,
			branch: 'main',
			head: headOf(root).slice(0, 7),
			gates: 'npm run check',
			lots: [
				{ paths: ['src/'], message: 'feat(read): read answers one\n\nThe body.' },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
			],
		}),
	)
	return { root, lotsPath, out }
}

/** `dialecte handover <lots file>`: the card as printed. */
export function writeHandover(lotsPath: string): { exitCode: number; output: string } {
	return runHandover({ argv: [lotsPath], cliPath: WRITER_CLI })
}

/** `dialecte handover run <folder>`, every line it printed kept. */
export async function runFolder(params: {
	out: string
	argv?: string[]
}): Promise<{ exitCode: number; lines: string[] }> {
	const lines: string[] = []
	removeHookLogs({ lines })
	const exitCode = await runHandoverRun({
		argv: [params.out, ...(params.argv ?? [])],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
	})
	return { exitCode, lines }
}

/**
 * The guard `name` as `handover run` printed it - its line without the duration - and the lines indented under it.
 * Empty when no such guard line was printed.
 */
export function guardLines(params: { lines: readonly string[]; name: string }): string[] {
	const start = params.lines.findIndex((line) =>
		new RegExp(`^[✓✗] ${params.name.padEnd(GUARD_NAME_WIDTH)} `).test(line),
	)
	if (start < 0) return []
	const indented = params.lines.slice(start + 1)
	const following = indented.findIndex((line) => !line.startsWith('    '))
	return [
		params.lines[start].replace(/ {2}\d+(?:\.\d)? [smh]$/, ''),
		...indented.slice(0, following < 0 ? indented.length : following),
	]
}

/** The line a guard prints for a result: its mark, its name padded, its detail. */
export function guardRow(params: { mark: '✓' | '✗'; name: string; detail: string }): string {
	return `${params.mark} ${params.name.padEnd(GUARD_NAME_WIDTH)} ${params.detail}`
}

/** A hand-over folder as `dialecte handover` writes it, for a lot of one file (not committed). */
export function writeRecapFolder(params: { root: string; folder: string; branch?: string }): void {
	const { root, folder } = params
	const files = ['docs/guide.md']
	writeFiles({ root, files: { 'docs/guide.md': '# Guide\n' } })
	mkdirSync(folder, { recursive: true })
	writeFileSync(
		join(folder, 'lots.json'),
		JSON.stringify({
			repository: root,
			branch: params.branch ?? 'main',
			head: headOf(root),
			lots: [{ paths: ['docs/'], message: 'docs: describe it' }],
		}),
	)
	writeFileSync(join(folder, 'files.txt'), files.map((file) => `${file}\n`).join(''))
	writeFileSync(
		join(folder, 'files.sha256'),
		files.map((file) => `${'0'.repeat(64)}  ${file}\n`).join(''),
	)
	writeFileSync(join(folder, 'files.deleted'), '')
	writeFileSync(join(folder, 'lots.sha256'), `${'0'.repeat(64)}\n`)
}

/** A hand-over folder path named `lot`, outside every repository; not created. */
export function recapFolderPath(): string {
	return join(realpathSync(temporaryFolder('dialecte-recap-')), 'lot')
}

/** The lines of the recap section whose heading is `heading`, up to the next heading, blank lines left out. */
export function recapSection(params: { output: string; heading: string }): string[] {
	const lines = params.output.split('\n')
	const start = lines.indexOf(params.heading)
	if (start < 0) return []
	const rest = lines.slice(start + 1)
	const end = rest.findIndex((line) => line.startsWith('### '))
	return (end < 0 ? rest : rest.slice(0, end)).filter((line) => line !== '')
}

/** The headings of the recap, in order. */
export function recapHeadings(output: string): string[] {
	return output.split('\n').filter((line) => line.startsWith('### '))
}

/**
 * A repository whose branch `feat/x` (one commit) is merged into `main` (one commit of its own) by a merge lot with
 * no conflict, the hand-over of that lot not written yet; `tree` is the tree its rehearsal reports (a real run needs it).
 */
export function mergeHandover(params: { tree?: string }): {
	root: string
	lotsPath: string
	out: string
} {
	const root = hooksRepository({ declared: true })
	git({ root, args: ['checkout', '-q', '-b', MERGED_BRANCH] })
	writeFiles({ root, files: { 'feature.txt': 'feature\n' } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: the branch work'] })
	const tip = headOf(root)
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: { 'main.txt': 'main\n' } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: the main work'] })
	const out = temporaryFolder('dialecte-merge-handover-')
	const lotsPath = join(out, 'lots.json')
	writeFileSync(
		lotsPath,
		JSON.stringify({
			repository: root,
			branch: 'main',
			head: headOf(root),
			gates: 'npm run check',
			lots: [
				{
					kind: 'merge',
					branch: MERGED_BRANCH,
					tip,
					resolved: {},
					message: 'merge: bring feat/x in\n\nThe body.',
					...(params.tree && { tree: params.tree }),
				},
			],
		}),
	)
	return { root, lotsPath, out }
}

/** The tree the rehearsal of `mergeHandover` reports, which a real run's lots file must record. */
export async function rehearsedMergeTree(): Promise<string> {
	const { lotsPath, out } = mergeHandover({})
	if (writeHandover(lotsPath).exitCode !== 0) throw new Error('the merge hand-over was refused')
	const rehearsal = await runFolder({ out, argv: ['--rehearse'] })
	const tree = /tree ([0-9a-f]{40})/.exec(rehearsal.lines.join('\n'))?.[1]
	if (tree === undefined)
		throw new Error(`no tree in the rehearsal:\n${rehearsal.lines.join('\n')}`)
	return tree
}
