/**
 * The one writer of a `lot`, `inbox`, `tdd` and `handover` result (FIX-loud-refusals D1): a result goes to standard
 * output when it exits 0 or is an answer, else to standard error, so redirecting standard output never hides a refusal.
 */
import { printOut } from './print.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { FlushableStream, ResultSink } from './command-output.types.ts'
import type { PrintStream } from './print.types.ts'

/**
 * The stream a result goes to: standard output for exit 0 or an answer, standard error for every other exit.
 *
 * @intent keep every refusal of a writing verb off standard output
 * @internal
 */
export function streamOfResult(params: { result: CommandResult }): PrintStream {
	const { result } = params
	return result.exitCode === 0 || result.answer === true ? 'stdout' : 'stderr'
}

/**
 * Prints a result: the exit code set first (nothing after can end the process on 0), what the streams already hold
 * flushed, the output written synchronously on its stream (an empty output writes nothing), then the exit when it is
 * not 0.
 *
 * @intent print a command's result whole and on the right stream, whatever stdout is redirected to
 * @internal
 */
export async function printCommandResult(params: {
	result: CommandResult
	sink?: ResultSink
}): Promise<void> {
	const { result } = params
	const sink = params.sink ?? processResultSink()
	sink.setExitCode(result.exitCode)
	await sink.flush()
	if (result.output !== '') sink.write({ stream: streamOfResult({ result }), text: result.output })
	if (result.exitCode !== 0) sink.exit(result.exitCode)
}

/**
 * Resolves once every write queued on the streams before it is out (a write's callback fires after the ones before
 * it), or a stream errs (a reader gone): waiting for `drain` would never resolve under the high-water mark.
 *
 * @intent let a result follow the progress a command already queued, never before it
 * @internal
 */
export function flushStreams(params: { streams: readonly FlushableStream[] }): Promise<void> {
	return Promise.all(params.streams.map(flushedOf)).then(function allFlushed() {
		return undefined
	})
}

/** The process's own sink: its exit code, its two streams flushed, a synchronous write, its exit. */
function processResultSink(): ResultSink {
	return {
		setExitCode: function setExitCode(code) {
			process.exitCode = code
		},
		flush: function flush() {
			return flushStreams({ streams: [process.stdout, process.stderr] })
		},
		write: function write(params) {
			printOut({ stream: params.stream, text: params.text, synchronous: true })
		},
		exit: function exit(code) {
			process.exit(code)
		},
	}
}

/**
 * One stream flushed: its write callback, or its error (once), whichever comes first. The error listener stays: a
 * reader gone later (an exit-0 path still writing) is swallowed there instead of ending the process with a crash line.
 */
function flushedOf(stream: FlushableStream): Promise<void> {
	return new Promise(function waitForWrites(resolve) {
		stream.once('error', function readerGone() {
			resolve()
		})
		stream.write('', function written() {
			resolve()
		})
	})
}
