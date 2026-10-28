/** The numbered question `skills sync` asks when the vendor cannot be detected. */
import { createInterface } from 'node:readline/promises'

import type { VendorId } from './model-tiers.types.ts'

export async function askVendor(params: {
	candidates: readonly VendorId[]
	input: NodeJS.ReadableStream
	output: NodeJS.WritableStream
}): Promise<VendorId> {
	const terminal = createInterface({ input: params.input, output: params.output })
	try {
		prompt(params)
		// one line iterator: lines that arrive together are not lost between questions
		for await (const line of terminal) {
			const chosen = params.candidates[Number(line.trim()) - 1]
			if (chosen !== undefined) return chosen
			prompt(params)
		}
		throw new Error('skills sync: no vendor chosen (input closed)')
	} finally {
		terminal.close()
	}
}

function prompt(params: { candidates: readonly VendorId[]; output: NodeJS.WritableStream }): void {
	params.output.write("Which vendor's models does this project use?\n")
	params.candidates.forEach((candidate, index) =>
		params.output.write(`  ${index + 1}) ${candidate}\n`),
	)
	params.output.write('Number: ')
}
