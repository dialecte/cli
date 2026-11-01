import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { constants } from 'node:os'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runLockRun } from './lock.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { ChildProcess } from 'node:child_process'

/** Starting node a few times on a loaded machine: seconds, never a measure of speed. */
const LOCK_PROCESS_TIMEOUT_MILLISECONDS = 30_000

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

const USAGE = 'lock: run [--no-wait] -- <command> [<argument>...]'

/** Writes, to the file named by its first argument, the lock file named by its second and the holder variable. */
const REPORT_SCRIPT =
	"const[,out,lock]=process.argv;const fs=require('fs');fs.writeFileSync(out,JSON.stringify({lock:fs.readFileSync(lock,'utf8'),holder:process.env.DIALECTE_MACHINE_LOCK_HOLDER??null}))"

/** Writes `ran` to the file named by its first argument. */
const MARK_SCRIPT = "require('fs').writeFileSync(process.argv[1],'ran')"

function lockIn(folder: string): string {
	return join(folder, 'heavy-run.lock')
}

function holdBy(params: { path: string; pid: number }): void {
	writeFileSync(
		params.path,
		JSON.stringify({
			pid: params.pid,
			command: 'dialecte gate --full',
			startedAt: '2026-10-29T10:00:00.000Z',
		}),
	)
}

/** The lock in a folder of the test's own, never waited on with the real clock. */
function quietLock(path: string) {
	return { path, clock: createFakeClock(), write: () => undefined }
}

describe('lock run', { timeout: 60_000 }, () => {
	it('the lock free → the command runs holding it (holder named after the command, the holder variable set), then it is released', async () => {
		const folder = temporaryFolder('dialecte-lock-run-')
		const path = lockIn(folder)
		const out = join(folder, 'report.json')
		const words = [process.execPath, '-e', REPORT_SCRIPT, out, path]

		await expect(
			runLockRun({ argv: ['--', ...words], machineLock: quietLock(path) }),
		).resolves.toMatchObject({ exitCode: 0 })

		const report = JSON.parse(readFileSync(out, 'utf8'))
		expect(JSON.parse(report.lock)).toMatchObject({
			pid: process.pid,
			command: `dialecte lock run -- ${words.join(' ')}`,
		})
		expect(report.holder).toMatch(new RegExp(`^${process.pid}:\\S.*$`))
		expect(existsSync(path)).toBe(false)
	})

	for (const code of [1, 7, 255])
		it(`the command exits ${code} → exit ${code}, the lock released`, async () => {
			const path = lockIn(temporaryFolder('dialecte-lock-run-'))

			await expect(
				runLockRun({
					argv: ['--', process.execPath, '-e', `process.exit(${code})`],
					machineLock: quietLock(path),
				}),
			).resolves.toMatchObject({ exitCode: code })
			expect(existsSync(path)).toBe(false)
		})

	for (const signal of ['SIGTERM', 'SIGKILL'] as const)
		it(`the command ended by ${signal} → exit 128 + its number, the lock released`, async () => {
			const path = lockIn(temporaryFolder('dialecte-lock-run-'))

			await expect(
				runLockRun({
					argv: ['--', process.execPath, '-e', `process.kill(process.pid,'${signal}')`],
					machineLock: quietLock(path),
				}),
			).resolves.toMatchObject({ exitCode: 128 + constants.signals[signal] })
			expect(existsSync(path)).toBe(false)
		})

	it('a command that cannot start → exit 127 naming it and why, the lock released', async () => {
		const path = lockIn(temporaryFolder('dialecte-lock-run-'))

		await expect(
			runLockRun({ argv: ['--', 'dialecte-no-such-command-2026'], machineLock: quietLock(path) }),
		).resolves.toEqual({
			exitCode: 127,
			output: expect.stringMatching(/^lock run: cannot start dialecte-no-such-command-2026: \S/),
		})
		expect(existsSync(path)).toBe(false)
	})

	it('a command found but not executable → exit 126 naming it and why, the lock released', async () => {
		const folder = temporaryFolder('dialecte-lock-run-')
		const path = lockIn(folder)
		const command = join(folder, 'not-executable')
		writeFileSync(command, '#!/bin/sh\nexit 0\n', { mode: 0o644 })

		await expect(
			runLockRun({ argv: ['--', command], machineLock: quietLock(path) }),
		).resolves.toEqual({
			exitCode: 126,
			output: expect.stringMatching(
				new RegExp(`^lock run: cannot start ${escapeRegExp(command)}: \\S`),
			),
		})
		expect(existsSync(path)).toBe(false)
	})

	it('held by another live process → waits with a line every 30 s naming the holder, then runs the command', async () => {
		const folder = temporaryFolder('dialecte-lock-run-')
		const path = lockIn(folder)
		holdBy({ path, pid: 1111 })
		const marker = join(folder, 'ran')
		const clock = createFakeClock()
		const lines: string[] = []

		await expect(
			runLockRun({
				argv: ['--', process.execPath, '-e', MARK_SCRIPT, marker],
				machineLock: {
					path,
					clock,
					write: (line) => lines.push(line),
					isAlive: (pid) => pid !== 1111 || clock.now() < 65_000,
				},
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(lines).toEqual([
			'… waiting 0.0 s for the machine lock: pid 1111 runs "dialecte gate --full" since 2026-10-29T10:00:00.000Z',
			'… waiting 30 s for the machine lock: pid 1111 runs "dialecte gate --full" since 2026-10-29T10:00:00.000Z',
			'… waiting 1 m 0 s for the machine lock: pid 1111 runs "dialecte gate --full" since 2026-10-29T10:00:00.000Z',
		])
		expect(readFileSync(marker, 'utf8')).toBe('ran')
	})

	it('held by another live process, --no-wait → refused at once with exit 1 naming the holder; the command not run, the lock kept', async () => {
		const folder = temporaryFolder('dialecte-lock-run-')
		const path = lockIn(folder)
		holdBy({ path, pid: 1111 })
		const marker = join(folder, 'ran')
		const clock = createFakeClock()
		clock.onSleep = () => {
			throw new Error('--no-wait waited')
		}

		await expect(
			runLockRun({
				argv: ['--no-wait', '--', process.execPath, '-e', MARK_SCRIPT, marker],
				machineLock: { path, clock, write: () => undefined, isAlive: () => true },
			}),
		).resolves.toEqual({
			exitCode: 1,
			output:
				'lock run: the machine lock is held (--no-wait): pid 1111 runs "dialecte gate --full" since 2026-10-29T10:00:00.000Z',
		})
		expect(existsSync(marker)).toBe(false)
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(1111)
	})

	for (const argv of [[], ['--'], ['--no-wait', '--'], ['--no-wait']])
		it(`lock run ${argv.join(' ')} (no command after --) → exit 2 with the usage`, async () => {
			const path = lockIn(temporaryFolder('dialecte-lock-run-'))

			await expect(runLockRun({ argv, machineLock: quietLock(path) })).resolves.toEqual({
				exitCode: 2,
				output: USAGE,
			})
			expect(existsSync(path)).toBe(false)
		})
})

/**
 * The cli run as `dialecte lock <argv>` in a process group of its own (a signal to the group reaches it and
 * its command, never the test runner), its lock in `cacheFolder`, outside any outer lock run.
 */
function startLock(params: {
	argv: string[]
	cacheFolder: string
	/** Variables added to the environment the cli is given. */
	environment?: Record<string, string>
	/** Where the cli runs; default: the test runner's folder. */
	cwd?: string
}): {
	child: ChildProcess
	output: () => string
} {
	const { DIALECTE_MACHINE_LOCK_HOLDER: _outerHolder, ...environment } = process.env
	const child = spawn(process.execPath, [CLI_SOURCE, 'lock', ...params.argv], {
		env: { ...environment, ...params.environment, DIALECTE_CACHE_DIR: params.cacheFolder },
		...(params.cwd && { cwd: params.cwd }),
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	})
	let output = ''
	child.stdout?.on('data', (chunk) => {
		output += String(chunk)
	})
	child.stderr?.on('data', (chunk) => {
		output += String(chunk)
	})
	onTestFinished(function stopGroup() {
		try {
			process.kill(-(child.pid as number), 'SIGKILL')
		} catch {
			// the group is gone: the lock process and its command ended
		}
	})
	return { child, output: () => output }
}

/** How the process ended; `timeout` when it did not within the bound. */
function exitOf(child: ChildProcess): Promise<{ code: number | null; signal: string | null }> {
	if (child.exitCode !== null || child.signalCode !== null)
		return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
	return new Promise(function waitForExit(resolve) {
		const timer = setTimeout(
			() => resolve({ code: null, signal: 'timeout' }),
			LOCK_PROCESS_TIMEOUT_MILLISECONDS,
		)
		child.on('exit', (code, signal) => {
			clearTimeout(timer)
			resolve({ code, signal })
		})
	})
}

/** True once `path` exists; false when the process ended first or the bound passed. */
async function appears(params: { path: string; child: ChildProcess }): Promise<boolean> {
	const giveUpAt = Date.now() + LOCK_PROCESS_TIMEOUT_MILLISECONDS
	while (
		!existsSync(params.path) &&
		params.child.exitCode === null &&
		params.child.signalCode === null &&
		Date.now() < giveUpAt
	)
		await new Promise((resolve) => setTimeout(resolve, 50))
	return existsSync(params.path)
}

describe('dialecte lock (the process)', { timeout: 60_000 }, () => {
	for (const argv of [['run', '--'], ['hold', '--', 'true'], []])
		it(`dialecte lock ${argv.join(' ') || '(nothing)'} → exit 2 with the usage`, async () => {
			const cacheFolder = temporaryFolder('dialecte-lock-cache-')
			const lock = startLock({ argv, cacheFolder })

			await expect(exitOf(lock.child)).resolves.toEqual({ code: 2, signal: null })
			expect(lock.output()).toContain(USAGE)
		})

	it('the command writes to stdout → it reaches the lock process stdout (inherited)', async () => {
		const cacheFolder = temporaryFolder('dialecte-lock-cache-')
		const lock = startLock({
			argv: ['run', '--', process.execPath, '-e', "process.stdout.write('from the command\\n')"],
			cacheFolder,
		})

		await expect(exitOf(lock.child)).resolves.toEqual({ code: 0, signal: null })
		expect(lock.output()).toContain('from the command')
		expect(existsSync(lockIn(cacheFolder))).toBe(false)
	})

	it('SIGTERM sent to the lock process → forwarded to the command; the lock process exits with its code, the lock released', async () => {
		const cacheFolder = temporaryFolder('dialecte-lock-cache-')
		const ready = join(cacheFolder, 'ready')
		const received = join(cacheFolder, 'received')
		const script = `const fs=require('fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.argv[2],'SIGTERM');process.exit(0)});fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000)`
		const lock = startLock({
			argv: ['run', '--', process.execPath, '-e', script, ready, received],
			cacheFolder,
		})

		const started = await appears({ path: ready, child: lock.child })
		expect(started).toBe(true)
		process.kill(lock.child.pid as number, 'SIGTERM')

		await expect(exitOf(lock.child)).resolves.toEqual({ code: 0, signal: null })
		expect(readFileSync(received, 'utf8')).toBe('SIGTERM')
		expect(existsSync(lockIn(cacheFolder))).toBe(false)
	})

	it('SIGINT sent to the whole process group (Ctrl-C) → the lock process outlives it, the command gets it; exit with its code', async () => {
		const cacheFolder = temporaryFolder('dialecte-lock-cache-')
		const ready = join(cacheFolder, 'ready')
		const received = join(cacheFolder, 'received')
		const script = `const fs=require('fs');process.on('SIGINT',()=>{fs.writeFileSync(process.argv[2],'SIGINT');process.exit(3)});fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000)`
		const lock = startLock({
			argv: ['run', '--', process.execPath, '-e', script, ready, received],
			cacheFolder,
		})

		const started = await appears({ path: ready, child: lock.child })
		expect(started).toBe(true)
		process.kill(-(lock.child.pid as number), 'SIGINT')

		await expect(exitOf(lock.child)).resolves.toEqual({ code: 3, signal: null })
		expect(readFileSync(received, 'utf8')).toBe('SIGINT')
		expect(existsSync(lockIn(cacheFolder))).toBe(false)
	})

	it('SIGTERM sent to the whole process group → the lock process outlives it, the command gets it; exit with its code', async () => {
		const cacheFolder = temporaryFolder('dialecte-lock-cache-')
		const ready = join(cacheFolder, 'ready')
		const received = join(cacheFolder, 'received')
		const script = `const fs=require('fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.argv[2],'SIGTERM');process.exit(3)});fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000)`
		const lock = startLock({
			argv: ['run', '--', process.execPath, '-e', script, ready, received],
			cacheFolder,
		})

		const started = await appears({ path: ready, child: lock.child })
		expect(started).toBe(true)
		process.kill(-(lock.child.pid as number), 'SIGTERM')

		await expect(exitOf(lock.child)).resolves.toEqual({ code: 3, signal: null })
		expect(readFileSync(received, 'utf8')).toBe('SIGTERM')
		expect(existsSync(lockIn(cacheFolder))).toBe(false)
	})

	it('a lock run inside a lock run, --no-wait → the inner one takes the lock at once and runs its command', async () => {
		const cacheFolder = temporaryFolder('dialecte-lock-cache-')
		const marker = join(cacheFolder, 'ran')
		const lock = startLock({
			argv: [
				'run',
				'--',
				process.execPath,
				CLI_SOURCE,
				'lock',
				'run',
				'--no-wait',
				'--',
				process.execPath,
				'-e',
				MARK_SCRIPT,
				marker,
			],
			cacheFolder,
		})

		await expect(exitOf(lock.child)).resolves.toEqual({ code: 0, signal: null })
		expect(readFileSync(marker, 'utf8')).toBe('ran')
		expect(existsSync(lockIn(cacheFolder))).toBe(false)
	})

	for (const flag of ['-h', '--help'])
		it(`${flag} after -- → given to the command, which runs; before -- (lock ${flag}, lock run ${flag}) → the help`, async () => {
			const cacheFolder = temporaryFolder('dialecte-lock-cache-')
			const marker = join(cacheFolder, 'ran')
			const command = startLock({
				argv: ['run', '--', process.execPath, '-e', MARK_SCRIPT, marker, flag],
				cacheFolder,
			})
			const commandExit = await exitOf(command.child)
			const lockHelp = startLock({ argv: [flag], cacheFolder })
			const lockHelpExit = await exitOf(lockHelp.child)
			const runHelp = startLock({ argv: ['run', flag], cacheFolder })
			const runHelpExit = await exitOf(runHelp.child)

			expect(commandExit).toEqual({ code: 0, signal: null })
			expect(existsSync(marker) ? readFileSync(marker, 'utf8') : undefined).toBe('ran')
			expect([lockHelpExit, runHelpExit]).toEqual([
				{ code: 0, signal: null },
				{ code: 0, signal: null },
			])
			expect([lockHelp.output(), runHelp.output()]).toEqual([
				expect.stringContaining('Usage:'),
				expect.stringContaining('Usage:'),
			])
		})

	it('GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE given to lock run → the command sees them as given', async () => {
		const cacheFolder = temporaryFolder('dialecte-lock-cache-')
		const out = join(cacheFolder, 'environment.json')
		const given = {
			GIT_DIR: join(cacheFolder, 'elsewhere.git'),
			GIT_INDEX_FILE: join(cacheFolder, 'elsewhere.index'),
			GIT_WORK_TREE: join(cacheFolder, 'elsewhere'),
		}
		const script =
			"require('fs').writeFileSync(process.argv[1],JSON.stringify({GIT_DIR:process.env.GIT_DIR,GIT_INDEX_FILE:process.env.GIT_INDEX_FILE,GIT_WORK_TREE:process.env.GIT_WORK_TREE}))"
		const lock = startLock({
			argv: ['run', '--', process.execPath, '-e', script, out],
			cacheFolder,
			environment: given,
			cwd: cacheFolder,
		})

		await expect(exitOf(lock.child)).resolves.toEqual({ code: 0, signal: null })
		expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(given)
	})

	it('three lock runs nested, each --no-wait inside the first → the innermost command runs, the holder variable naming the outermost holder with its start', async () => {
		const cacheFolder = temporaryFolder('dialecte-lock-cache-')
		const out = join(cacheFolder, 'holder')
		const script =
			"require('fs').writeFileSync(process.argv[1],process.env.DIALECTE_MACHINE_LOCK_HOLDER??'')"
		const lock = startLock({
			argv: [
				'run',
				'--',
				process.execPath,
				CLI_SOURCE,
				'lock',
				'run',
				'--no-wait',
				'--',
				process.execPath,
				CLI_SOURCE,
				'lock',
				'run',
				'--no-wait',
				'--',
				process.execPath,
				'-e',
				script,
				out,
			],
			cacheFolder,
		})

		await expect(exitOf(lock.child)).resolves.toEqual({ code: 0, signal: null })
		expect(readFileSync(out, 'utf8')).toMatch(new RegExp(`^${lock.child.pid}:\\S.*$`))
		expect(existsSync(lockIn(cacheFolder))).toBe(false)
	})
})

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
