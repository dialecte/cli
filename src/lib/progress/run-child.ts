/**
 * The one child-process primitive: the child runs in a process group of its own, its stdin is closed
 * (end-of-file at once), its output is streamed, and a stall watchdog stops it when it prints nothing and
 * its process tree gains no CPU for `stallAfter`: the tree is reported, then killed, and the run settles
 * once it is gone. An interrupt this process receives (SIGINT, SIGTERM, SIGHUP) is passed on to the
 * child's group (`interrupt-forwarding.ts`).
 */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { StringDecoder } from 'node:string_decoder'

import { formatDuration } from './format-duration.ts'
import { isInterrupted, watchProcessGroup } from './interrupt-forwarding.ts'
import { formatProcessTree, sampleProcessTree, stopProcessTree } from './process-tree.ts'
import {
	KILL_GRACE_MILLISECONDS,
	STALL_AFTER_MILLISECONDS,
	STALL_CHECK_EVERY_MILLISECONDS,
} from './progress.constants.ts'
import { createSystemClock } from './system-clock.ts'

import type { Clock, ClockTimer } from './clock.types.ts'
import type { ProcessSample, StreamedCommand, TreeKiller, Watchdog } from './run-child.types.ts'

export function runChild(params: {
	command: string
	args: string[]
	cwd: string
	input?: string
	/** Added to this process's environment. */
	environment?: Record<string, string>
	/** Each line the child prints, on either stream, as it comes. */
	onLine?: (line: string) => void
	/** Each time the child prints anything, a line or a part of one (a progress `\r`), with that text. */
	onOutput?: (text: string) => void
	/** The child's pid, which is also its process group: the caller can stop the group on an interrupt. */
	onProcessGroup?: (pid: number) => void
	/** Default: the system clock. */
	clock?: Clock
	/** Default: stalled after 10 min, sampled every 5 s, with the machine's tools. */
	watchdog?: Watchdog
}): Promise<StreamedCommand> {
	const clock = params.clock ?? createSystemClock()
	const stallAfter = params.watchdog?.stallAfter ?? STALL_AFTER_MILLISECONDS
	const checkEvery = params.watchdog?.checkEvery ?? STALL_CHECK_EVERY_MILLISECONDS
	const killGrace = params.watchdog?.killGrace ?? KILL_GRACE_MILLISECONDS
	const sampleTree = params.watchdog?.sampleTree ?? sampleProcessTree
	const interrupted = isInterrupted()
	// an interrupt is being handled: nothing new starts; answered once it is handled (if this process lives on)
	if (interrupted)
		return interrupted.handled.then(() => ({
			exitCode: 128 + constants.signals[interrupted.signal],
			output: '',
		}))
	return new Promise(function run(resolvePromise) {
		const child = spawn(params.command, params.args, {
			cwd: params.cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, ...params.environment },
			detached: true,
		})
		const rootPid = child.pid
		if (rootPid !== undefined) params.onProcessGroup?.(rootPid)
		const kill: TreeKiller | undefined =
			params.watchdog?.kill ??
			(rootPid === undefined
				? undefined
				: (pids) => stopProcessTree({ pids, group: rootPid, grace: killGrace }))
		const release =
			rootPid === undefined ? undefined : watchProcessGroup({ group: rootPid, grace: killGrace })
		let output = ''
		let settled = false
		let stopping = false
		let lastActivity = clock.now()
		let lastSampled = clock.now()
		let previousCpu: Map<number, number> | undefined
		let timer: ClockTimer | undefined
		const pending = { stdout: '', stderr: '' }
		// one decoder per stream: a character split across two chunks stays whole
		const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }

		function settle(result: StreamedCommand): void {
			if (settled) return
			settled = true
			if (timer !== undefined) clock.clearTimeout(timer)
			timer = undefined
			release?.()
			for (const rest of [pending.stdout, pending.stderr]) if (rest) params.onLine?.(rest)
			// during an interrupt the caller hears nothing until it is handled: by then this process has
			// ended by the signal, or a host that owns the exit lives on
			const during = isInterrupted()
			if (during) void during.handled.then(() => resolvePromise(result))
			else resolvePromise(result)
		}
		function receive(
			received:
				| { stream: 'stdout' | 'stderr'; chunk: Buffer }
				| { stream: 'stdout' | 'stderr'; text: string },
		): void {
			if (settled || stopping) return
			const { stream } = received
			const text = 'text' in received ? received.text : decoders[stream].write(received.chunk)
			lastActivity = clock.now()
			if (text === '') return
			output += text
			params.onOutput?.(text)
			const lines = (pending[stream] + text).split(/\r?\n/)
			pending[stream] = lines.pop() ?? ''
			for (const line of lines) params.onLine?.(line)
		}
		/** A CPU gain: some process of the tree used more CPU than at the previous sample. */
		function gainedCpu(processes: readonly ProcessSample[]): boolean {
			const before = previousCpu
			previousCpu = new Map(processes.map((sample) => [sample.pid, sample.cpuMilliseconds]))
			if (!before) return false
			return processes.some((sample) => sample.cpuMilliseconds > (before.get(sample.pid) ?? 0))
		}
		function check(): void {
			timer = undefined
			if (settled || stopping || rootPid === undefined) return
			const now = clock.now()
			const processes = sampleTree({ rootPid })
			if (processes === undefined) {
				// no verdict on a failed sample; failing for the whole stallAfter is a stall of its own
				if (now - lastSampled >= stallAfter && now - lastActivity >= stallAfter)
					void stop({
						processes: [],
						report: `  (the process tree could not be sampled for ${formatDuration(now - lastSampled)}: the listing failed or timed out; the child's process group was killed)`,
					})
				else schedule()
				return
			}
			lastSampled = now
			const baseline = previousCpu === undefined
			if (gainedCpu(processes)) lastActivity = now
			if (!baseline && now - lastActivity >= stallAfter) {
				void stop({
					processes,
					report: processes.length
						? formatProcessTree(processes)
						: `  (the command has exited; a process it started still holds its output open)`,
				})
				return
			}
			schedule()
		}
		/** Kills the tree, then settles as stalled - also when the kill fails (its error in the report). */
		async function stop(stalled: { processes: ProcessSample[]; report: string }): Promise<void> {
			stopping = true
			let report = stalled.report
			try {
				const pids = [
					...new Set([
						...(rootPid === undefined ? [] : [rootPid]),
						...stalled.processes.map((sample) => sample.pid),
					]),
				]
				await kill?.(pids)
			} catch (error) {
				report += `\n  (the kill failed: ${error instanceof Error ? error.message : String(error)})`
			} finally {
				child.stdout.destroy()
				child.stderr.destroy()
				settle({ exitCode: undefined, output, stalled: { processes: stalled.processes, report } })
			}
		}
		function schedule(): void {
			timer = clock.setTimeout({ callback: check, milliseconds: checkEvery })
		}
		child.stdout.on('data', (chunk: Buffer) => receive({ stream: 'stdout', chunk }))
		child.stderr.on('data', (chunk: Buffer) => receive({ stream: 'stderr', chunk }))
		child.on('error', function failed(error) {
			settle({ exitCode: 127, output: `${output}${error.message}\n` })
		})
		child.on('close', function closed(code) {
			// the bytes a decoder still holds (an incomplete character at the very end)
			for (const stream of ['stdout', 'stderr'] as const)
				receive({ stream, text: decoders[stream].end() })
			if (!stopping) settle({ exitCode: code ?? 1, output })
		})
		// a closed stdin: a child that reads it gets the given text, then end-of-file - never a wait
		child.stdin.on('error', () => undefined)
		child.stdin.end(params.input ?? '')
		schedule()
	})
}
