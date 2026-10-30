/** The last lines of what a command printed, terminal control sequences removed, trailing blanks cut. */
import { stripVTControlCharacters } from 'node:util'

export function tailOf(params: { output: string; lines: number }): string {
	return stripVTControlCharacters(params.output)
		.trimEnd()
		.split('\n')
		.slice(-params.lines)
		.join('\n')
}
