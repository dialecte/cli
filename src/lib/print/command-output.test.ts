/**
 * The one writer of a command result (FIX-loud-refusals D1, D2): standard output for exit 0 or an answer, standard
 * error for every other exit; the exit code set first, the streams flushed, the output written whole, then the exit.
 */
import { EventEmitter } from 'node:events'

import { flushStreams, printCommandResult, streamOfResult } from './command-output.ts'
import { textOf } from './print.ts'

import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../command-result.types.ts'
import type { FlushableStream, ResultSink } from './command-output.types.ts'

type StreamCase = { name: string; result: CommandResult; stream: 'stdout' | 'stderr' }

const ANSWER_LINE = textOf(['the lot is failed'])

const streamCases: StreamCase[] = [
	{ name: 'exit 0 -> stdout', result: { exitCode: 0, output: ANSWER_LINE }, stream: 'stdout' },
	{
		name: 'exit 1 marked as an answer -> stdout',
		result: { exitCode: 1, output: ANSWER_LINE, answer: true },
		stream: 'stdout',
	},
	{
		name: 'exit 6 marked as an answer -> stdout',
		result: { exitCode: 6, output: ANSWER_LINE, answer: true },
		stream: 'stdout',
	},
	...[1, 2, 3, 4, 5, 6].map(function refusalCase(exitCode): StreamCase {
		return {
			name: `exit ${exitCode} not marked as an answer -> stderr`,
			result: { exitCode, output: ANSWER_LINE },
			stream: 'stderr',
		}
	}),
]

describe('streamOfResult', () => {
	it.each(streamCases)('$name', ({ result, stream }) => {
		expect(streamOfResult({ result })).toBe(stream)
	})
})

/** A sink that records what the writer does, in order. */
function recordingSink(): { sink: ResultSink; calls: string[] } {
	const calls: string[] = []
	return {
		calls,
		sink: {
			setExitCode: function setExitCode(code) {
				calls.push(`exit code ${code}`)
			},
			flush: async function flush() {
				calls.push('flush')
			},
			write: function write(params) {
				calls.push(`write ${params.stream}: ${params.text}`)
			},
			exit: function exit(code) {
				calls.push(`exit ${code}`)
			},
		},
	}
}

describe('printCommandResult', () => {
	it('a refusal -> the exit code set, the streams flushed, the refusal on stderr, then the exit', async () => {
		const { sink, calls } = recordingSink()

		await expect(
			printCommandResult({
				result: { exitCode: 2, output: textOf(['lot accept: nothing written']) },
				sink,
			}),
		).resolves.toBeUndefined()

		expect(calls).toEqual([
			'exit code 2',
			'flush',
			'write stderr: lot accept: nothing written',
			'exit 2',
		])
	})

	it('an answer exit -> written on stdout, then the exit', async () => {
		const { sink, calls } = recordingSink()

		await expect(
			printCommandResult({ result: { exitCode: 3, output: ANSWER_LINE, answer: true }, sink }),
		).resolves.toBeUndefined()

		expect(calls).toEqual(['exit code 3', 'flush', `write stdout: ${ANSWER_LINE}`, 'exit 3'])
	})

	it('exit 0 with an output -> written on stdout, no exit called', async () => {
		const { sink, calls } = recordingSink()

		await expect(
			printCommandResult({ result: { exitCode: 0, output: ANSWER_LINE }, sink }),
		).resolves.toBeUndefined()

		expect(calls).toEqual(['exit code 0', 'flush', `write stdout: ${ANSWER_LINE}`])
	})

	it('exit 2 with an empty output -> nothing written, the exit called', async () => {
		const { sink, calls } = recordingSink()

		await expect(
			printCommandResult({ result: { exitCode: 2, output: textOf([]) }, sink }),
		).resolves.toBeUndefined()

		expect(calls).toEqual(['exit code 2', 'flush', 'exit 2'])
	})

	it('exit 0 with an empty output -> nothing written, no exit called', async () => {
		const { sink, calls } = recordingSink()

		await expect(
			printCommandResult({ result: { exitCode: 0, output: textOf([]) }, sink }),
		).resolves.toBeUndefined()

		expect(calls).toEqual(['exit code 0', 'flush'])
	})
})

/** A stream whose write callback fires only when `release` is called, as a pipe holding queued bytes does. */
function delayedStream(): { stream: FlushableStream; release: () => void; emitter: EventEmitter } {
	const emitter = new EventEmitter()
	let pending: (() => void) | undefined
	return {
		emitter,
		release: function release() {
			pending?.()
		},
		stream: {
			write: function write(_chunk, callback) {
				pending = callback
				return true
			},
			once: function once(event, listener) {
				emitter.once(event, listener)
				return emitter
			},
		},
	}
}

/** The flush's state as it runs: whether it resolved, and whether it threw or rejected. */
type FlushState = { done: boolean; failed: boolean }

/** Starts a flush of `streams` and tracks its state; a throw or a rejection marks it failed. */
function trackedFlush(streams: readonly FlushableStream[]): FlushState {
	const state: FlushState = { done: false, failed: false }
	try {
		void flushStreams({ streams }).then(
			function markDone() {
				state.done = true
			},
			function markFailed() {
				state.failed = true
			},
		)
	} catch {
		state.failed = true
	}
	return state
}

/** One turn of the event loop. */
async function nextTurn(): Promise<void> {
	await new Promise(function afterIo(resolve) {
		setImmediate(resolve)
	})
}

describe('flushStreams', () => {
	it('a stream still holding queued writes -> not resolved until its write callback fires', async () => {
		const queued = delayedStream()
		const state = trackedFlush([queued.stream])
		await nextTurn()
		const before = { ...state }
		queued.release()
		await nextTurn()

		expect({ before, after: state }).toEqual({
			before: { done: false, failed: false },
			after: { done: true, failed: false },
		})
	})

	it('two streams, the first released and the second still holding writes -> not resolved', async () => {
		const first = delayedStream()
		const second = delayedStream()
		const state = trackedFlush([first.stream, second.stream])
		first.release()
		await nextTurn()

		expect(state).toEqual({ done: false, failed: false })
	})

	it('a stream whose reader is gone (an error during the flush) -> resolved, nothing thrown', async () => {
		const gone = delayedStream()
		const state = trackedFlush([gone.stream])
		// a flush that listens for the error gets it; one that does not (or threw first) gets none
		if (gone.emitter.listenerCount('error') > 0)
			gone.emitter.emit('error', new Error('write EPIPE'))
		await nextTurn()

		expect(state).toEqual({ done: true, failed: false })
	})
})
