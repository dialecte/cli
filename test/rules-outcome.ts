/** `runRules` as an outcome: a throw becomes a value an assertion can fail on, so a crash reads as a red case. */
import { runRules } from '../src/commands/rules.ts'

import type { RulesOutcome } from './rules-outcome.types.ts'

export function rulesOutcomeOf(params: {
	cwd: string
	argv: string[]
	environment?: Readonly<NodeJS.ProcessEnv>
}): RulesOutcome {
	try {
		const result = runRules(params)
		return { threw: false, exitCode: result.exitCode, output: result.output }
	} catch (error) {
		return { threw: true, message: error instanceof Error ? error.message : String(error) }
	}
}
