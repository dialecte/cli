import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { isProcessAlive } from '../process-alive.ts'

import { describe, expect, it } from 'vitest'

const RUN_CHILD = join(import.meta.dirname, 'run-child.ts')

/** A harness process that runs `sh -c 'sleep 30 & echo $!; wait'` through runChild and says the pids it knows. */
function writeHarness(folder: string): string {
	const path = join(folder, 'harness.mjs')
	writeFileSync(
		path,
		`import { runChild } from ${JSON.stringify(RUN_CHILD)}
const result = await runChild({
	command: 'sh',
	args: ['-c', 'sleep 30 & echo grandchild $!; wait'],
	cwd: ${JSON.stringify(folder)},
	onLine: (line) => console.log(line),
	onProcessGroup: (pid) => console.log('root ' + pid),
})
console.log('resolved ' + JSON.stringify(result.exitCode))
`,
	)
	return path
}

describe('runChild and an interrupt', { timeout: 30_000 }, () => {
	it('the parent gets SIGINT while the child runs → the child and its grandchild are stopped and the parent exits non-zero', async () => {
		const folder = temporaryFolder('dialecte-interrupt-')
		const harness = spawn('node', [writeHarness(folder)], { stdio: ['ignore', 'pipe', 'inherit'] })
		const pids: Record<string, number> = {}
		let output = ''
		const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
			harness.on('exit', (code, signal) => resolve({ code, signal })),
		)
		const ready = new Promise<void>((resolve) =>
			harness.stdout.on('data', (chunk: Buffer) => {
				output += chunk.toString('utf8')
				for (const match of output.matchAll(/^(root|grandchild) (\d+)$/gm))
					pids[match[1]] = Number(match[2])
				if (pids.root && pids.grandchild) resolve()
			}),
		)
		await ready

		harness.kill('SIGINT')
		const { code, signal } = await exited
		for (
			let attempt = 0;
			attempt < 40 && (isProcessAlive(pids.root) || isProcessAlive(pids.grandchild));
			attempt += 1
		)
			await new Promise((resolve) => setTimeout(resolve, 50))
		const alive = Object.entries(pids).filter(([, pid]) => isProcessAlive(pid))
		for (const [, pid] of alive) process.kill(pid, 'SIGKILL')

		expect(signal !== null || code !== 0).toBe(true)
		expect(alive.map(([name]) => name)).toEqual([])
	})

	it('two runChild children at once, one trapping INT and TERM, SIGINT to the parent → both groups are dead when the parent ends', async () => {
		const folder = temporaryFolder('dialecte-interrupt-')
		const path = join(folder, 'two.mjs')
		writeFileSync(
			path,
			`import { runChild } from ${JSON.stringify(RUN_CHILD)}
function run(name, script) {
	return runChild({
		command: 'sh',
		args: ['-c', script],
		cwd: ${JSON.stringify(folder)},
		onLine: (line) => console.log(name + '-grandchild ' + line),
		onProcessGroup: (pid) => console.log(name + '-root ' + pid),
	})
}
await Promise.all([
	run('a', 'sleep 30 & echo $!; wait'),
	run('b', 'trap "" INT TERM; sleep 30 & echo $!; wait'),
])
`,
		)
		const harness = spawn('node', [path], { stdio: ['ignore', 'pipe', 'inherit'] })
		const pids: Record<string, number> = {}
		let output = ''
		const exited = new Promise<void>((resolve) => harness.on('exit', () => resolve()))
		const ready = new Promise<void>((resolve) =>
			harness.stdout.on('data', (chunk: Buffer) => {
				output += chunk.toString('utf8')
				for (const match of output.matchAll(/^(\w-(?:root|grandchild)) (\d+)$/gm))
					pids[match[1]] = Number(match[2])
				if (Object.keys(pids).length === 4) resolve()
			}),
		)
		await ready

		harness.kill('SIGINT')
		await exited
		for (let attempt = 0; attempt < 10 && Object.values(pids).some(isProcessAlive); attempt += 1)
			await new Promise((resolve) => setTimeout(resolve, 50))
		const alive = Object.entries(pids).filter(([, pid]) => isProcessAlive(pid))
		for (const [, pid] of alive) process.kill(pid, 'SIGKILL')

		expect(alive.map(([name]) => name)).toEqual([])
	})

	it('a child exiting 0 on INT, a second runChild queued after it, SIGINT to the parent → the parent ends by SIGINT, the second child never runs, no pid is left', async () => {
		const folder = temporaryFolder('dialecte-interrupt-')
		const marker = join(folder, 'second-ran')
		const path = join(folder, 'queued.mjs')
		writeFileSync(
			path,
			`import { runChild } from ${JSON.stringify(RUN_CHILD)}
await runChild({
	command: 'sh',
	args: ['-c', 'trap "exit 0" INT; sleep 30 & echo $!; wait'],
	cwd: ${JSON.stringify(folder)},
	onLine: (line) => console.log('grandchild ' + line),
	onProcessGroup: (pid) => console.log('root ' + pid),
})
await runChild({
	command: 'sh',
	args: ['-c', 'touch ' + ${JSON.stringify(marker)}],
	cwd: ${JSON.stringify(folder)},
})
process.exit(0)
`,
		)
		const harness = spawn('node', [path], { stdio: ['ignore', 'pipe', 'inherit'] })
		const pids: Record<string, number> = {}
		let output = ''
		const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
			harness.on('exit', (code, signal) => resolve({ code, signal })),
		)
		const ready = new Promise<void>((resolve) =>
			harness.stdout.on('data', (chunk: Buffer) => {
				output += chunk.toString('utf8')
				for (const match of output.matchAll(/^(root|grandchild) (\d+)$/gm))
					pids[match[1]] = Number(match[2])
				if (pids.root && pids.grandchild) resolve()
			}),
		)
		await ready

		harness.kill('SIGINT')
		const { code, signal } = await exited
		await new Promise((resolve) => setTimeout(resolve, 500))
		const alive = Object.entries(pids).filter(([, pid]) => isProcessAlive(pid))
		for (const [, pid] of alive) process.kill(pid, 'SIGKILL')

		expect({ code, signal }).toEqual({ code: null, signal: 'SIGINT' })
		expect(existsSync(marker)).toBe(false)
		expect(alive.map(([name]) => name)).toEqual([])
	})
})
