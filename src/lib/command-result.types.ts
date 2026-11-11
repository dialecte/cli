import type { PrintedText } from './print/print.types.ts'

/** What a contributor command answers: printed by the cli, read as is by the tests. */
export type CommandResult = {
	/** 0 = green / answered, 1 = a check failed or nothing found, 2 = usage error. */
	exitCode: number
	output: PrintedText
}
