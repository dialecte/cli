/**
 * `dialecte doctor` - installed `@dialecte/*` versions, the core API generation they are, whether the agent
 * skills follow node_modules, local checkouts, the cli itself; ✅ or ⚠️ with the one command that fixes it.
 */
import { hasFlag } from '../lib/config.ts'
import { answerDoctor } from '../lib/doctor/answer-doctor.ts'
import { diagnose } from '../lib/doctor/diagnose.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runDoctor({
		argv,
		cwd: process.cwd(),
		dialecteRoot: process.env.DIALECTE_ROOT,
		cliVersion: readCliVersion(),
	})
	process.stdout.write(result.output)
	process.exitCode = result.exitCode
}

export function runDoctor(params: {
	argv: readonly string[]
	cwd: string
	dialecteRoot: string | undefined
	cliVersion: string
}): CommandOutput {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return missing
	const { argv, ...context } = params
	return answerDoctor({ lines: diagnose(context), json: hasFlag([...argv], 'json') })
}
