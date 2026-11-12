/**
 * Processes the cases leave running in a worktree, and what they need around them: a launcher that hands the idle
 * process to a parent that is not the test (a watcher whose shell has ended), a direct child, the kill of every one
 * started, a search path without `lsof` or `ps`, and a package whose hand-over card is READY.
 */
import { spawn, spawnSync } from 'node:child_process'
import { symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { findExecutable } from '../src/lib/editor/find-executable.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../src/lib/standard/standard.constants.ts'
import { editedPackage } from './handover-profile.ts'
import { CLI_SOURCE, STORE_BRANCH } from './handover-store-scenario.constants.ts'
import {
	IDLE_SCRIPT,
	KILL_BOUND_MS,
	LAUNCH_ARGV0_VARIABLE,
	LAUNCH_LAST_WORD_VARIABLE,
	LAUNCHER_SCRIPT,
	PIPELINE_BOUND_MS,
	PS,
	REPARENT_BOUND_MS,
	WAIT_STEP_MS,
} from './rule-gaps-processes.constants.ts'
import { runGateIn } from './scratch-checks.ts'
import { git, isolateGitConfig, temporaryFolder } from './scratch-repository.ts'

import { vi } from 'vitest'

import type { ChildProcess } from 'node:child_process'

/** The pids of the processes started and not stopped yet. */
const started = new Set<number>()

/**
 * An idle process working in `cwd`, detached (its own session, no terminal) and handed to a parent that is neither
 * the running test nor the launcher (pid 1, or a subreaper): none of the test's descendants, as a watcher left by a
 * shell that has ended. `argv0` is the first word of its command line. Its pid; it is stopped by `stopStarted`.
 */
export async function startLeftBehind(params: {
	cwd: string
	argv0?: string
	lastWord?: string
}): Promise<number> {
	const launcher = spawn(process.execPath, ['-e', LAUNCHER_SCRIPT], {
		cwd: params.cwd,
		stdio: ['ignore', 'pipe', 'ignore'],
		env: {
			...process.env,
			[LAUNCH_ARGV0_VARIABLE]: params.argv0 ?? '',
			[LAUNCH_LAST_WORD_VARIABLE]: params.lastWord ?? '',
		},
	})
	const pid = await pidPrintedBy(launcher)
	await waitUntil({
		isDone: () => {
			const parent = parentOf(pid)
			return parent !== undefined && parent !== process.pid && parent !== launcher.pid
		},
		bound: REPARENT_BOUND_MS,
		what: `process ${pid} handed to another parent`,
	})
	return pid
}

/** An idle process working in `cwd` that is a direct child of the running test: a descendant of the cli's own tree. */
export function startOwnChild(params: { cwd: string }): number {
	const child = spawn(process.execPath, ['-e', IDLE_SCRIPT], { cwd: params.cwd, stdio: 'ignore' })
	if (child.pid === undefined) throw new Error('the idle child did not start')
	started.add(child.pid)
	return child.pid
}

/**
 * The real cli through a shell pipeline (`node cli <argv> | cat`) in `cwd`: the shell has its own session and no
 * terminal, as a pipeline run by an agent's shell has, so the cli and `cat` are two processes of one process group,
 * both working in `cwd`. The bound kills the shell, never a hang.
 */
export function runCliThroughCat(params: {
	cwd: string
	argv: readonly string[]
}): Promise<{ exitCode: number | null; output: string }> {
	const words = [process.execPath, CLI_SOURCE, ...params.argv].map(quoted).join(' ')
	return new Promise((resolve, reject) => {
		const shell = spawn('sh', ['-c', `${words} | cat`], {
			cwd: params.cwd,
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let output = ''
		const stop = setTimeout(() => {
			try {
				process.kill(-(shell.pid ?? 0), 'SIGKILL')
			} catch {
				// already gone
			}
		}, PIPELINE_BOUND_MS)
		for (const stream of [shell.stdout, shell.stderr])
			stream.on('data', (chunk: Buffer) => {
				output += chunk.toString()
			})
		shell.once('error', (error) => {
			clearTimeout(stop)
			reject(error)
		})
		shell.once('close', (code) => {
			clearTimeout(stop)
			resolve({ exitCode: code, output })
		})
	})
}

/** `word` as one shell word. */
function quoted(word: string): string {
	return `'${word.replaceAll("'", "'\\''")}'`
}

/** Kills one process of the started ones and waits until it is gone. */
export async function stopProcess(pid: number): Promise<void> {
	killQuietly(pid)
	await waitUntil({
		isDone: () => !isRunning(pid),
		bound: KILL_BOUND_MS,
		what: `process ${pid} gone`,
	})
	started.delete(pid)
}

/** Kills every process started and not stopped yet, even after a failed case: put it in an `afterEach`. */
export async function stopStarted(): Promise<void> {
	const pids = [...started]
	for (const pid of pids) killQuietly(pid)
	await Promise.all(
		pids.map((pid) =>
			waitUntil({
				isDone: () => !isRunning(pid),
				bound: KILL_BOUND_MS,
				what: `process ${pid} gone`,
			}),
		),
	)
	started.clear()
}

/**
 * Leaves the process's search path holding `git` and the commands of `keep` that exist, for the rest of the test:
 * the others cannot run (`lsof` and `ps` by default, so the process list is not known). The caller restores the
 * environment (`vi.unstubAllEnvs`).
 */
export function stubSearchPathWith(params: { keep?: readonly string[] } = {}): void {
	const folder = temporaryFolder('dialecte-limited-path-')
	for (const word of ['git', ...(params.keep ?? [])]) {
		const found = findExecutable({ word, searchPath: process.env.PATH, cwd: process.cwd() })
		if (found !== undefined) symlinkSync(found, join(folder, word))
		else if (word === 'git') throw new Error('git is not on the search path')
	}
	vi.stubEnv('PATH', folder)
}

/**
 * A package on the store scenario's branch with one edited file and a green gate run on that tree (the card of its
 * hand-over is READY), git reading a config of the test's own, the host's standard never blocking it. The caller
 * restores the environment (`vi.unstubAllEnvs`).
 */
export async function gatedRepository(): Promise<string> {
	isolateGitConfig()
	vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)
	const root = editedPackage({ profile: null })
	git({ root, args: ['checkout', '-q', '-b', STORE_BRANCH] })
	await runGateIn({ cwd: root, argv: [] })
	return root
}

/** The pid the launcher printed before it ended; tracked for the kill the moment it is known. */
function pidPrintedBy(launcher: ChildProcess): Promise<number> {
	return new Promise((resolve, reject) => {
		let printed = ''
		launcher.stdout?.on('data', (chunk: Buffer) => {
			printed += chunk.toString()
		})
		launcher.once('error', reject)
		launcher.once('close', () => {
			const pid = Number(printed)
			if (!Number.isInteger(pid) || pid <= 0)
				return reject(new Error(`the launcher printed no pid: ${JSON.stringify(printed)}`))
			started.add(pid)
			resolve(pid)
		})
	})
}

/** The parent of `pid` as `ps` shows it; undefined when there is no such process. */
function parentOf(pid: number): number | undefined {
	const answer = spawnSync(PS, ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' })
	return answer.stdout.trim() === '' ? undefined : Number(answer.stdout.trim())
}

/** Whether `pid` still runs the idle script a case started (a pid the system handed out again does not). */
function isRunning(pid: number): boolean {
	const answer = spawnSync(PS, ['-o', 'args=', '-p', String(pid)], { encoding: 'utf8' })
	return answer.stdout.includes(IDLE_SCRIPT)
}

/** SIGKILL, only to a pid that still runs the idle script a case started. */
function killQuietly(pid: number): void {
	if (!isRunning(pid)) return
	try {
		process.kill(pid, 'SIGKILL')
	} catch {
		// already gone
	}
}

/** Looks every `WAIT_STEP_MS` until `isDone`; throws past `bound`, naming `what`. */
async function waitUntil(params: {
	isDone: () => boolean
	bound: number
	what: string
}): Promise<void> {
	const deadline = Date.now() + params.bound
	while (!params.isDone()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${params.what}`)
		await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
	}
}
