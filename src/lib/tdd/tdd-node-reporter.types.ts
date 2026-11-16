/** The error a `node --test` event carries: node wraps the real one (`cause`, a string when node itself failed the test). */
export type NodeTestError = {
	code?: string
	/** `testCodeFailure`, `testTimeoutFailure`, `subtestsFailed`, ... */
	failureType?: string
	message?: string
	cause?: { name?: string; code?: unknown; message?: string; stack?: string } | string
}

/** The data of one `node --test` event, as a reporter receives it (only what the cli reads). */
export type NodeTestEventData = {
	/** A test or suite title; the file as given on the command line for the test a file itself is. */
	name?: string
	nesting?: number
	/** Absolute path of the test file; in `test:stderr` and `test:summary`, the path as given on the command line. */
	file?: string
	/** `test:stderr`: the absolute path of the test file whose process printed. */
	entryFile?: string
	/** 1-based. */
	line?: number
	column?: number
	skip?: boolean | string
	todo?: boolean | string
	/** `test:stderr` and `test:stdout`: one chunk of what the file's process printed. */
	message?: string
	details?: { type?: 'test' | 'suite'; error?: NodeTestError }
}

/** One event of the stream `node --test` hands a custom reporter. */
export type NodeTestEvent = { type: string; data: NodeTestEventData }
