/** What `dialecte ci publish-decision` answers. */

/** One printed line with the stream it goes to. */
export type PrintedLine = { stream: 'stdout' | 'stderr'; line: string }

/** The publish decision's exit code and its lines, each on its own stream. */
export type DecisionResult = { exitCode: number; lines: PrintedLine[] }
