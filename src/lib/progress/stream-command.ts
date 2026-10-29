/**
 * Runs a command and prints each line it writes (standard output and error) as it comes, behind a
 * prefix; while it stays silent, a heartbeat line every `every` milliseconds says how long it has run.
 * Nothing is read from a terminal: its input is the given text, or nothing.
 */
import { spawn } from 'node:child_process'

import { formatDuration } from './format-duration.ts'
import { startHeartbeat } from './heartbeat.ts'
import { HEARTBEAT_HINT_AFTER_BEATS } from './progress.constants.ts'

import type { Clock, StreamedCommand } from './clock.types.ts'

export function streamCommand(params: {
	command: string
	args: string[]
	cwd: string
	input?: string
	/** Put before every line the command prints. */
	prefix: string
	/** The heartbeat line, given the time the command has run: `… hook running 2 m 10 s`. */
	heartbeatLabel: string
	write: (line: string) => void
	clock: Clock
	every: number
	/**
	 * Run it in a process group of its own and say its pid: the caller can then stop it and every process
	 * it started (a hook's test runner) on an interrupt.
	 */
	onProcessGroup?: (pid: number) => void
}): Promise<StreamedCommand> {
	const { clock, write } = params
	return new Promise(function run(resolvePromise) {
		const child = spawn(params.command, params.args, {
			cwd: params.cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, FORCE_COLOR: '0' },
			detached: params.onProcessGroup !== undefined,
		})
		if (params.onProcessGroup && child.pid !== undefined) params.onProcessGroup(child.pid)
		let output = ''
		const heartbeat = startHeartbeat({
			clock,
			every: params.every,
			startedAt: clock.now(),
			onBeat: function beat(beat) {
				const silence = output
					? `silent for ${formatDuration(beat.silentBeats * params.every)}`
					: 'silent since it started'
				const hint =
					beat.silentBeats === HEARTBEAT_HINT_AFTER_BEATS
						? ` - ${silence}: is it waiting for input, or running in watch mode (vitest without \`run\`)?`
						: ''
				write(`${params.heartbeatLabel} ${formatDuration(beat.elapsed)}${hint}`)
			},
		})
		const pending = { stdout: '', stderr: '' }
		function receive(received: { stream: 'stdout' | 'stderr'; chunk: Buffer }): void {
			const { stream, chunk } = received
			const text = chunk.toString('utf8')
			output += text
			heartbeat.touch()
			const lines = (pending[stream] + text).split(/\r?\n/)
			pending[stream] = lines.pop() ?? ''
			for (const line of lines) write(`${params.prefix}${line}`)
		}
		child.stdout.on('data', (chunk: Buffer) => receive({ stream: 'stdout', chunk }))
		child.stderr.on('data', (chunk: Buffer) => receive({ stream: 'stderr', chunk }))
		child.on('error', function failed(error) {
			heartbeat.stop()
			resolvePromise({ exitCode: 127, output: `${output}${error.message}\n` })
		})
		child.on('close', function closed(code) {
			heartbeat.stop()
			for (const rest of [pending.stdout, pending.stderr])
				if (rest) write(`${params.prefix}${rest}`)
			resolvePromise({ exitCode: code ?? 1, output })
		})
		child.stdin.end(params.input ?? '')
	})
}
