import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { textOf } from '../lib/print/print.ts'
import { ASK_COMMAND } from './ask.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'

/**
 * A refusal of an `ask` verb: `ask: <message>`, then (a usage error) the usage lines of the command map starting
 * with `usageStart`; exit 2 unless told.
 */
export function askVerbRefused(params: {
	message: string
	usageStart?: string
	exitCode?: CommandOutput['exitCode']
}): CommandOutput {
	const { usageStart } = params
	return {
		output: textOf([
			`${ASK_COMMAND}: ${params.message}`,
			...(usageStart === undefined
				? []
				: COMMAND_MAP.ask.usage.filter((line) => line.startsWith(usageStart))),
			'',
		]),
		exitCode: params.exitCode ?? 2,
	}
}
