/**
 * `dialecte new verb <namespace> <query|transaction> <name> [--version <v>]` - inside a dialecte package,
 * writes a verb in the house style (named function, query or transaction first, one params object,
 * types in their own file, a JSDoc summary and `@intent` that `skills check` refuses until filled, a
 * table-driven test with one red case marked `only`), its barrel export and, for a new namespace, its
 * registration. Prints every placeholder left to fill.
 */
import { join } from 'node:path'

import { discoverNamespace, discoverVersions, getArg } from '../lib/config.ts'
import { formatFiles, formatOptsFromArgv } from '../lib/format.ts'
import {
	OPTIONS_WITH_VALUE,
	VERB_KINDS,
	VERB_NAME_PATTERN,
} from '../lib/scaffold/new-verb.constants.ts'
import { findPlaceholders, scaffoldVerb } from '../lib/scaffold/new-verb.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { VerbKind } from '../lib/scaffold/new-verb.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runNewVerb({ cwd: process.cwd(), argv })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runNewVerb(params: { cwd: string; argv: string[] }): CommandResult {
	const { cwd, argv } = params
	const optionValue = getArg(argv, 'version')
	const words = argv.filter(
		(argument, index) =>
			!argument.startsWith('--') && !OPTIONS_WITH_VALUE.includes(argv[index - 1] ?? ''),
	)
	const [what, namespace, kind, name] = words
	if (what !== 'verb' || !namespace || !isVerbKind(kind) || !name || words.length !== 4)
		return usage('new: dialecte new verb <namespace> <query|transaction> <name> [--version <v>]')
	if (!VERB_NAME_PATTERN.test(namespace) || !VERB_NAME_PATTERN.test(name))
		return usage(`new verb: "${namespace}" and "${name}" must be camelCase, starting lowercase`)

	const versions = discoverVersions(cwd)
	if (versions.length === 0)
		return usage('new verb: not a dialecte package (no src/<version>/definition/*.generated.ts)')
	const version = optionValue ?? (versions.length === 1 ? versions[0] : undefined)
	if (!version || !versions.includes(version))
		return usage(`new verb: pick a version with --version (${versions.join(', ')})`)

	const result = scaffoldVerb({
		root: cwd,
		version,
		dialecteName: discoverNamespace(cwd),
		namespace,
		kind,
		name,
	})
	if (typeof result === 'string')
		return { exitCode: 1, output: `new verb: ${result}, nothing written` }
	const formatted = formatFiles({
		root: cwd,
		files: [...result.written, ...result.edited].map((path) => join(cwd, path)),
		options: formatOptsFromArgv(argv),
	})
	if (!formatted)
		return {
			exitCode: 1,
			output: `new verb: the files are written but the formatter failed on them (${[...result.written, ...result.edited].join(', ')}): run the package's formatter, then read the placeholders`,
		}
	return {
		exitCode: 0,
		output: [
			...result.written.map((path) => `written  ${path}`),
			...result.edited.map((path) => `edited   ${path}`),
			...findPlaceholders({ root: cwd, paths: result.written }).map((place) => `fill     ${place}`),
			`Then: run the red case (npx vitest run ${result.written.find((path) => path.endsWith('.test.ts'))}), implement, remove \`only\`, and \`dialecte gate\`.`,
		].join('\n'),
	}
}

function isVerbKind(value: string | undefined): value is VerbKind {
	return VERB_KINDS.includes(value as VerbKind)
}

function usage(message: string): CommandResult {
	return { exitCode: 2, output: message }
}
