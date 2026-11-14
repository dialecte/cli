import type { COMMAND_EXIT_CODES, LOOKUP_EXIT_CODES } from './command-output.constants.ts'
import type { PrintedText } from './print/print.types.ts'

/** An exit code of a command: 0 answer, 1 nothing found, 2 usage, 3 needs readers (`ask`). */
export type CommandExitCode = (typeof COMMAND_EXIT_CODES)[number]

/** An exit code of a lookup: 0 answer, 1 nothing found, 2 usage (no lookup exits 3). */
export type LookupExitCode = (typeof LOOKUP_EXIT_CODES)[number]

/**
 * What a command answers inside the cli: the text it prints, built by the print boundary only, and its exit code.
 */
export type CommandOutput = {
	output: PrintedText
	exitCode: CommandExitCode
}

/**
 * What a lookup answers inside the cli (`runApi`, `runDoctor`, `runModels`, `answerSchema`, the schema and members
 * reads, and the helpers they return): a `CommandOutput` whose exit code is a lookup's, so it stays assignable to
 * the public `LookupOutput`.
 */
export type LookupCommandOutput = {
	output: PrintedText
	exitCode: LookupExitCode
}

/**
 * What a lookup answers, as `@dialecte/cli/lookups` exports it (`CommandOutput` there): the text the command would
 * print, already escaped, and its exit code (0 answer, 1 nothing found, 2 usage). A plain string, so a program that
 * serves the lookups in another form can build one of its own.
 * @intent read a lookup's answer, serve a lookup in another form, build a lookup answer
 */
export type LookupOutput = {
	output: string
	exitCode: LookupExitCode
}
