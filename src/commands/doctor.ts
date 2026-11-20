/**
 * `dialecte doctor` - installed `@dialecte/*` versions, the core API generation they are, whether the agent
 * skills follow node_modules, local checkouts, the cli itself; ✅ or ⚠️ with the one command that fixes it.
 * `--brief` is the session-start form: nothing when in sync, one line per problem, always exit 0.
 * `--host` probes every read of the repository's host vendor (or the one `--vendor` names) once, for real.
 */
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { getArg, hasFlag } from '../lib/config.ts'
import { answerDoctor, answerDoctorBrief, answerHostDoctor } from '../lib/doctor/answer-doctor.ts'
import { diagnose } from '../lib/doctor/diagnose.ts'
import {
	HOST_SUBJECT,
	HOST_USAGE_START,
	VENDOR_EQUALS_FORM,
	VENDOR_EQUALS_PREFIX,
	VENDOR_NEEDS_NAME,
} from '../lib/doctor/doctor.constants.ts'
import { hostLines as probeHost } from '../lib/doctor/host-lines.ts'
import { readGitVersion } from '../lib/git.ts'
import { vendorNamed, vendorOrRefusalOf } from '../lib/host/select-host.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { printOut, textOf } from '../lib/print/print.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'

import type { LookupCommandOutput } from '../lib/command-output.types.ts'
import type { DoctorContext, DoctorLine } from '../lib/doctor/doctor.types.ts'
import type { HostVendorRecord } from '../lib/host/host.types.ts'

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

/**
 * What `dialecte doctor` prints for `argv` run in `cwd`: each check of the installed `@dialecte/*` packages, their
 * skills, the local checkouts (`dialecteRoot`) and the cli, ✅, ⚠️ or ❌ with the command that fixes it, exit 1 when a
 * check is not ok; with `--brief`, one line per problem, nothing when in sync, always exit 0; with `--host`, only the
 * host lines, exit 1 on an error only.
 *
 * @intent check a Dialecte install without the command line, tell whether the installed packages and their skills are in sync
 */
export function runDoctor(params: {
	argv: readonly string[]
	cwd: string
	dialecteRoot: string | undefined
	/** The cli's version, or how to read it: `--brief` reads it inside its guard, so a failure never shows. */
	cliVersion: string | (() => string)
	/** The host check of `--host` (the vendor of the folder, or the one `--vendor` names); default: the real one. */
	hostLines?: (params: { root: string; vendor: HostVendorRecord }) => DoctorLine[]
}): LookupCommandOutput {
	const { argv, cliVersion, hostLines, ...rest } = params
	if (hasFlag([...argv], 'brief')) return runBrief({ ...rest, cliVersion })
	if (hasFlag([...argv], 'host'))
		return runHost({ argv, cwd: params.cwd, hostLines: hostLines ?? realHostLines })
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return missing
	return answerDoctor({
		lines: diagnose({ ...rest, cliVersion: resolveVersion(cliVersion) }),
		json: hasFlag([...argv], 'json'),
	})
}

/** The host check: the vendor `--vendor` names, else the folder's; an error line when there is none. */
function runHost(params: {
	argv: readonly string[]
	cwd: string
	hostLines: (params: { root: string; vendor: HostVendorRecord }) => DoctorLine[]
}): LookupCommandOutput {
	const argv = [...params.argv]
	if (argv.some(isVendorEqualsForm)) return vendorUsageError({ why: VENDOR_EQUALS_FORM })
	if (hasFlag(argv, 'vendor') && !vendorNameGiven({ argv }))
		return vendorUsageError({ why: VENDOR_NEEDS_NAME })
	const selected = selectedVendorOf({ argv: params.argv, cwd: params.cwd })
	if ('refusal' in selected)
		return answerHostDoctor({
			lines: [{ status: 'error', subject: HOST_SUBJECT, detail: selected.refusal }],
		})
	return answerHostDoctor({
		lines: params.hostLines({ root: params.cwd, vendor: selected.vendor }),
	})
}

/** The vendor `--vendor` names (one of the known), else the vendor of the folder; why none, when none. */
function selectedVendorOf(params: {
	argv: readonly string[]
	cwd: string
}): { vendor: HostVendorRecord } | { refusal: string } {
	const name = getArg([...params.argv], 'vendor')
	return name === undefined ? vendorOrRefusalOf({ root: params.cwd }) : vendorNamed({ name })
}

/** Whether `--vendor` is followed by a name (not the end of the line, not another flag). */
function vendorNameGiven(params: { argv: string[] }): boolean {
	const name = getArg(params.argv, 'vendor')
	return name !== undefined && !name.startsWith('-')
}

/** `--vendor` given with no name, or in the `=` form: `why`, then the usage line of `doctor --host`. */
function vendorUsageError(params: { why: string }): LookupCommandOutput {
	const usage = COMMAND_MAP.doctor.usage.filter(function isHostUsage(line) {
		return line.startsWith(HOST_USAGE_START)
	})
	return { output: textOf([params.why, ...usage, '']), exitCode: 2 }
}

/** `--vendor=<name>`: the cli reads a flag's value from the next word only. */
function isVendorEqualsForm(word: string): boolean {
	return word.startsWith(VENDOR_EQUALS_PREFIX)
}

/** The host lines on the real tool: the vendor's adapter, its runner and its describe reads, and the git on PATH. */
function realHostLines(params: { root: string; vendor: HostVendorRecord }): DoctorLine[] {
	const { root, vendor } = params
	return probeHost({
		root,
		vendor,
		host: vendor.createAdapter(),
		run: vendor.run,
		describe: vendor.describe,
		readGitVersion,
	})
}

/** The session-start check: silent when in sync, and never a failure, whatever the folder holds. */
function runBrief(
	context: Omit<DoctorContext, 'cliVersion'> & { cliVersion: string | (() => string) },
): LookupCommandOutput {
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
