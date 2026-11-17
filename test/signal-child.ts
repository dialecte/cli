/** A node script run as a child process, sent a signal once it says it is ready: what it printed and how it ended. */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from './scratch-repository.ts'

/**
 * Writes `script` (an ES module; it prints `ready` once set up, then keeps running) to a folder of its own, runs it
 * with node, sends it `signal` after `ready`, and answers its output lines and how it ended. A child still alive
 * after the signal is SIGKILLed once `timeoutMs` ran out.
 */
export async function signalChildScript(params: {
	script: string
	signal: NodeJS.Signals
	timeoutMs: number
}): Promise<{ lines: string[]; code: number | null; signal: NodeJS.Signals | null }> {
	const path = join(temporaryFolder('dialecte-signal-child-'), 'child.mjs')
	writeFileSync(path, params.script)
	// this process's own node: a PATH without node, or another node first on it, never runs the child
	const child = spawn(process.execPath, [path], { stdio: ['ignore', 'pipe', 'inherit'] })
	let output = ''
	const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		function waitForExit(resolve) {
			child.on('exit', function exited(code, signal) {
				resolve({ code, signal })
			})
		},
	)
	child.stdout.on('data', function collect(chunk: Buffer) {
		const wasReady = /^ready$/m.test(output)
		output += chunk.toString('utf8')
		if (!wasReady && /^ready$/m.test(output)) child.kill(params.signal)
	})
	const timer = setTimeout(function killHung() {
		child.kill('SIGKILL')
	}, params.timeoutMs)
	const end = await ended
	clearTimeout(timer)
	return { lines: output.split('\n').filter(Boolean), ...end }
}
