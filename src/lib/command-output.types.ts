import type { PrintedText } from './print/print.types.ts'

/**
 * What a lookup command answers inside the cli: the text it prints, built by the print boundary only, and its exit
 * code (0 answer, 1 nothing found, 2 usage). Assignable to the public `LookupOutput`.
 */
export type CommandOutput = {
	output: PrintedText
	exitCode: 0 | 1 | 2
}

/**
 * What a lookup answers, as `@dialecte/cli/lookups` exports it (`CommandOutput` there): the text the command would
 * print, already escaped, and its exit code (0 answer, 1 nothing found, 2 usage). A plain string, so a program that
 * serves the lookups in another form can build one of its own.
 * @intent read a lookup's answer, serve a lookup in another form, build a lookup answer
 */
export type LookupOutput = {
	output: string
	exitCode: 0 | 1 | 2
}
