/**
 * `dialecte doctor` - installed `@dialecte/*` versions, the core API generation they are, whether the agent
 * skills follow node_modules, local checkouts, the cli itself; ✅ or ⚠️ with the one command that fixes it.
 * `--brief` is the session-start form: nothing when in sync, one line per problem, always exit 0.
 */
import { hasFlag } from '../lib/config.ts'
import { answerDoctor, answerDoctorBrief } from '../lib/doctor/answer-doctor.ts'
import { diagnose } from '../lib/doctor/diagnose.ts'
import { missingPackage } from '../lib/missing-package.ts'
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
	process.stdout.write(result.output)
	process.exitCode = result.exitCode
}

/**
 * What `dialecte doctor` prints for `argv` run in `cwd`: each check of the installed `@dialecte/*` packages, their
 * skills, the local checkouts (`dialecteRoot`) and the cli, ✅, ⚠️ or ❌ with the command that fixes it, exit 1 when a
 * check is not ok; with `--brief`, one line per problem, nothing when in sync, always exit 0.
 *
 * @intent check a Dialecte install without the command line, tell whether the installed packages and their skills are in sync
 */
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
		return { output: '', exitCode: 0 }
	}
}

function resolveVersion(cliVersion: string | (() => string)): string {
	return typeof cliVersion === 'string' ? cliVersion : cliVersion()
}
