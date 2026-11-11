/**
 * `dialecte doctor` - installed `@dialecte/*` versions, the core API generation they are, whether the agent
 * skills follow node_modules, local checkouts, the cli itself; ✅ or ⚠️ with the one command that fixes it.
 * `--brief` is the session-start form: nothing when in sync, one line per problem, always exit 0.
 */
import { hasFlag } from '../lib/config.ts'
import { answerDoctor, answerDoctorBrief } from '../lib/doctor/answer-doctor.ts'
import { diagnose } from '../lib/doctor/diagnose.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { printOut, textOf } from '../lib/print/print.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type { DoctorContext } from '../lib/doctor/doctor.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runDoctor({
		argv,
		cwd: process.cwd(),
		dialecteRoot: process.env.DIALECTE_ROOT,
		cliVersion: readCliVersion,
	})
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

export function runDoctor(params: {
	argv: readonly string[]
	cwd: string
	dialecteRoot: string | undefined
	/** The cli's version, or how to read it: `--brief` reads it inside its guard, so a failure never shows. */
	cliVersion: string | (() => string)
}): CommandOutput {
	const { argv, cliVersion, ...rest } = params
	if (hasFlag([...argv], 'brief')) return runBrief({ ...rest, cliVersion })
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return missing
	return answerDoctor({
		lines: diagnose({ ...rest, cliVersion: resolveVersion(cliVersion) }),
		json: hasFlag([...argv], 'json'),
	})
}

/** The session-start check: silent when in sync, and never a failure, whatever the folder holds. */
function runBrief(
	context: Omit<DoctorContext, 'cliVersion'> & { cliVersion: string | (() => string) },
): CommandOutput {
	try {
		return answerDoctorBrief(
			diagnose({ ...context, cliVersion: resolveVersion(context.cliVersion), brief: true }),
		)
	} catch {
		return { output: textOf([]), exitCode: 0 }
	}
}

function resolveVersion(cliVersion: string | (() => string)): string {
	return typeof cliVersion === 'string' ? cliVersion : cliVersion()
}
