/** The yes/no question `skills sync` asks on a terminal when there is no `AGENTS.md` to put the check in. */
import { createInterface } from 'node:readline/promises'

import { AGENTS_CREATE_QUESTION } from './agents-file-check.constants.ts'

/** True on `y` / `yes` (any case); anything else, or an input closed with no answer, is no. */
export async function askCreateAgentsFile(params: {
	input: NodeJS.ReadableStream
	output: NodeJS.WritableStream
}): Promise<boolean> {
	const terminal = createInterface({ input: params.input, output: params.output })
	try {
		params.output.write(AGENTS_CREATE_QUESTION)
		// one line iterator, as the vendor question reads: lines that arrive together are not lost
		for await (const line of terminal) return isYes(line)
		return false
	} finally {
		terminal.close()
	}
}

function isYes(answer: string): boolean {
	return ['y', 'yes'].includes(answer.trim().toLowerCase())
}
