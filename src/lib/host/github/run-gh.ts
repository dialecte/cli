/** The one seam that spawns `gh`: argv built from the call table, the timeout from the call's kind. */
import { spawnSync } from 'node:child_process'

import { HOST_READ_TIMEOUT_MS, HOST_WRITE_TIMEOUT_MS } from '../host.constants.ts'
import { GITHUB_CALLS } from './github-calls.constants.ts'
import {
	FILTER_FLAG,
	HELP_FLAG,
	JSON_FLAG,
	QUERY_FIELD_FLAG,
	TOOL_SELECTOR,
	UNKNOWN_COMMAND_PATTERN,
	VERSION_FLAG,
} from './github-describe.constants.ts'
import {
	fieldsOfIntrospection,
	fieldsOfJsonList,
	flagsOfHelp,
	introspectionQueryOf,
	versionOfText,
} from './github-describe.ts'
import { GH_COMMAND, HOST_ENVIRONMENT } from './github.constants.ts'

import type {
	HostAbsentPart,
	HostAnswer,
	HostCallSpec,
	HostFlagAlias,
	HostGraphqlField,
	HostOptions,
	HostRefusal,
} from '../host.types.ts'
import type { GithubCall } from './github.types.ts'
import type { SpawnSyncReturns } from 'node:child_process'

/**
 * The argv the spec implies on its own: `--json <fields>`, `-f query=<graphql>`, `--jq <filter>`, in that order.
 *
 * @intent give argv and the contract check one list of the flags a spec implies
 * @internal
 */
export function impliedFlagsOf(spec: HostCallSpec): string[] {
	return [
		...(spec.fields === undefined ? [] : [JSON_FLAG, spec.fields.join(',')]),
		...(spec.graphql === undefined ? [] : [QUERY_FIELD_FLAG, `query=${spec.graphql}`]),
		...(spec.filter === undefined ? [] : [FILTER_FLAG, spec.filter]),
	]
}

/**
 * One `gh` call of the table: words, endpoint (`{x}` of `values` filled), positional, options, then the implied flags;
 * its standard output, or its first error line.
 *
 * @intent run a declared gh call with only the flags its entry allows
 * @internal
 */
export function runGh<K extends GithubCall>(params: {
	root: string
	call: K
	positional?: readonly string[]
	options?: HostOptions<typeof GITHUB_CALLS, K>
	values?: Readonly<Record<string, string>>
	input?: string
}): { output: string } | HostRefusal {
	const spec: HostCallSpec = GITHUB_CALLS[params.call]
	const args = [
		...spec.words,
		...(spec.endpoint === undefined
			? []
			: [endpointOf({ endpoint: spec.endpoint, values: params.values ?? {} })]),
		...(params.positional ?? []),
		...optionArgsOf(params.options ?? {}),
		...impliedFlagsOf(spec),
	]
	const run = spawnGh({
		root: params.root,
		args,
		timeout: spec.kind === 'read' ? HOST_READ_TIMEOUT_MS : HOST_WRITE_TIMEOUT_MS,
		input: params.input,
	})
	if (run.status === 0) return { output: run.stdout }
	return refusalOf({ run, args })
}

/** The endpoint template with each `{x}` given in `values` filled; the others left to gh. */
function endpointOf(params: {
	endpoint: string
	values: Readonly<Record<string, string>>
}): string {
	return params.endpoint.replaceAll(/\{(\w+)\}/g, function fill(placeholder, name: string) {
		return params.values[name] ?? placeholder
	})
}

/** The options as argv: `true` the flag alone, a string the flag then its value, an array the flag per value. */
function optionArgsOf(
	options: Readonly<Record<string, string | true | readonly string[] | undefined>>,
): string[] {
	return Object.entries(options).flatMap(function argsOfOption([flag, value]) {
		if (value === undefined) return []
		if (value === true) return [flag]
		if (typeof value === 'string') return [flag, value]
		return value.flatMap(function repeat(each) {
			return [flag, each]
		})
	})
}

/** `gh <words> --help`, read by `flagsOfHelp`. */
export function helpOf(params: {
	root: string
	words: readonly string[]
}): HostAnswer<{ flags: string[]; aliases: HostFlagAlias[] }> | HostRefusal {
	const args = [...params.words, HELP_FLAG]
	const run = spawnGh({ root: params.root, args, timeout: HOST_READ_TIMEOUT_MS })
	if (run.status !== 0) return refusalOf({ run, args })
	return { raw: run.stdout, ...flagsOfHelp({ text: run.stdout }) }
}

/** `gh <words> --json`: the field list gh prints on stderr (exit 1 is expected). */
export function fieldsOf(params: {
	root: string
	words: readonly string[]
}): HostAnswer<{ fields: string[] }> | HostRefusal {
	const args = [...params.words, JSON_FLAG]
	const run = spawnGh({ root: params.root, args, timeout: HOST_READ_TIMEOUT_MS })
	const fields = run.error ? [] : fieldsOfJsonList({ text: run.stderr })
	if (!fields.length) return refusalOf({ run, args })
	return { raw: run.stderr, fields }
}

/** `gh api graphql` introspection of one type: its fields, each with its argument names and unwrapped type name. */
export function typeOf(params: {
	root: string
	name: string
}): HostAnswer<{ fields: Record<string, HostGraphqlField> }> | HostRefusal {
	const args = [
		...GITHUB_CALLS.queuedState.words,
		GITHUB_CALLS.queuedState.endpoint,
		QUERY_FIELD_FLAG,
		`query=${introspectionQueryOf({ name: params.name })}`,
	]
	const run = spawnGh({ root: params.root, args, timeout: HOST_READ_TIMEOUT_MS })
	if (run.status !== 0) return refusalOf({ run, args })
	const fields = fieldsOfIntrospection({ text: run.stdout })
	if (!fields)
		return { refusal: `${GH_COMMAND} ${args.slice(0, 2).join(' ')}: no type ${params.name}` }
	return { raw: run.stdout, fields }
}

/** `gh --version` for `cli`, `gh <part> --version` for a part (`stack`); absent when gh does not know the part. */
export function versionOf(params: {
	root: string
	selector: string
}): HostAnswer<{ version: string }> | HostAbsentPart | HostRefusal {
	const args = [...(params.selector === TOOL_SELECTOR ? [] : [params.selector]), VERSION_FLAG]
	const run = spawnGh({ root: params.root, args, timeout: HOST_READ_TIMEOUT_MS })
	if (run.status !== 0) {
		const refusal = refusalOf({ run, args })
		// a spawn that failed (no gh) wrote nothing: only gh's own answer can name an unknown part
		return run.error === undefined && UNKNOWN_COMMAND_PATTERN.test(run.stderr)
			? { ...refusal, absent: `${GH_COMMAND}-${params.selector}` }
			: refusal
	}
	const version = versionOfText({ text: run.stdout })
	if (version === undefined)
		return { refusal: `${GH_COMMAND} ${args.join(' ')}: no version printed` }
	return { raw: run.stdout, version }
}

/** The one spawn of gh: in `root`, never prompting, plain text, within `timeout`. */
function spawnGh(params: {
	root: string
	args: readonly string[]
	timeout: number
	input?: string
}): SpawnSyncReturns<string> {
	return spawnSync(GH_COMMAND, params.args, {
		cwd: params.root,
		encoding: 'utf8',
		timeout: params.timeout,
		...(params.input === undefined
			? { stdio: ['ignore', 'pipe', 'pipe'] }
			: { input: params.input }),
		env: { ...process.env, ...HOST_ENVIRONMENT },
	})
}

/** A failed run's refusal: the command's first two words, then the error, gh's first error line or its exit. */
function refusalOf(params: {
	run: SpawnSyncReturns<string>
	args: readonly string[]
}): HostRefusal {
	const { run, args } = params
	const reason = run.error?.message ?? (run.stderr?.trim().split('\n')[0] || `exit ${run.status}`)
	return { refusal: `${GH_COMMAND} ${args.slice(0, 2).join(' ')}: ${reason}` }
}
