/** The line `plan next` prints for a landed lot: its name, the folder of its hand-over and the branch it is on. */
import { LANDED_LINE } from './lot-entry.constants.ts'

/** The line that says why the lot `name` reads committed, from the folder of its hand-over and the target branch. */
export function landedLineFrom(params: { name: string; folder: string; target: string }): string {
	return LANDED_LINE.replace('{name}', () => params.name)
		.replace('{folder}', () => params.folder)
		.replace('{target}', () => params.target)
}
