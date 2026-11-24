import type { PrintedText, PrintStream } from './print.types.ts'

/**
 * Where a command result goes: the process's exit code, the flush of what is already queued on its streams, the
 * synchronous write of the result, and the exit. The process's own sink in the cli; a recording one in the tests.
 */
export type ResultSink = {
	setExitCode: (code: number) => void
	flush: () => Promise<void>
	write: (params: { stream: PrintStream; text: PrintedText }) => void
	exit: (code: number) => void
}

/** A stream the flush waits on: its write with a callback, and its error event (a reader gone during the flush). */
export type FlushableStream = {
	write: (chunk: string, callback: () => void) => boolean
	once: (event: 'error', listener: () => void) => unknown
}
