/** A command's answer built from its lines, through the print boundary. */
import { textOf } from './print/print.ts'

import type { CommandResult } from './command-result.types.ts'

/** The result of `exitCode` whose output is `lines`, each escaped once (one entry per printed line). */
export function resultOf(params: { exitCode: number; lines: readonly string[] }): CommandResult {
	return { exitCode: params.exitCode, output: textOf(params.lines) }
}
