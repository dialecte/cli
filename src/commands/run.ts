/**
 * `dialecte run <script>` - run a script against an in-memory project of the installed dialecte and
 * answer one structured outcome: the error (code, key, element path), the diagnostics, the operations
 * per tag, the staged transaction under `--prepare`, the expectations under `--expect`. Ids are seeded
 * (`--seed`), time can be frozen (`--now`), so the same script, input and seed give the same outcome.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { formatRunOutcome } from '../lib/run/format-run-outcome.ts'
import { loadRunEnvironment } from '../lib/run/load-run-environment.ts'
import { runScript } from '../lib/run/run-script.ts'
import { DEFAULT_RUN_SEED, DEFAULT_RUN_TIMEOUT_IN_MILLISECONDS } from '../lib/run/run.constants.ts'
import { splitArguments } from '../lib/split-arguments.ts'
import {
	EXIT_FAILED,
	EXIT_OK,
	EXIT_USAGE,
	RUN_BOOLEAN_FLAGS,
	RUN_USAGE,
	RUN_VALUE_FLAGS,
} from './run.constants.ts'

import type { RunScript } from '../lib/run/run.types.ts'
import type { CommandOutput, RunCommandParams, RunOptions } from './run.types.ts'
import type { Expectation } from '@dialecte/core/helpers'

export async function run(argv: string[]): Promise<void> {
	const exitCode = await runCommand({
		argv,
		cwd: process.cwd(),
		output: {
			stdout: (text) => process.stdout.write(`${text}\n`),
			stderr: (text) => process.stderr.write(`${text}\n`),
		},
	})
	if (exitCode !== EXIT_OK) process.exit(exitCode)
}

/** Runs the command and answers its exit code: 0 ok, 1 the run failed or an expectation is not met, 2 usage. */
export async function runCommand(params: RunCommandParams): Promise<number> {
	const { argv, cwd, output } = params
	const parsed = parseRunOptions({ argv })
	if (typeof parsed === 'string') {
		output.stderr(`run: ${parsed}\n${RUN_USAGE}`)
		return EXIT_USAGE
	}
	const options = parsed

	let expectations: Expectation[] | undefined
	let environment: Awaited<ReturnType<typeof loadRunEnvironment>>
	try {
		expectations = options.expectPath
			? readExpectations({ path: resolve(cwd, options.expectPath) })
			: undefined
		environment = await loadRunEnvironment({
			projectDirectory: cwd,
			packageName: options.packageName,
		})
	} catch (thrown) {
		output.stderr(thrown instanceof Error ? thrown.message : String(thrown))
		return EXIT_USAGE
	}

	const input = options.inputPath ? readInput({ path: resolve(cwd, options.inputPath) }) : undefined
	const restoreConsole = sendScriptLogsTo({ output })
	let result: Awaited<ReturnType<typeof runScript>>
	try {
		result = await runScript({
			// imported once ids are seeded: what the module does at its top level is repeatable too
			loadScript: () => loadScript({ path: resolve(cwd, options.scriptPath) }),
			environment,
			mode: options.prepare ? 'prepare' : 'commit',
			seed: options.seed,
			now: options.now,
			input,
			expectations,
			exportDocument: options.outPath !== undefined,
			timeoutInMilliseconds: options.timeoutInMilliseconds,
		})
	} catch (thrown) {
		// only loading the script throws: anything the script does is in the outcome
		output.stderr(thrown instanceof Error ? thrown.message : String(thrown))
		return EXIT_USAGE
	} finally {
		restoreConsole()
	}

	const { outcome, file } = result
	if (file && options.outPath) {
		const bytes = await file.arrayBuffer()
		writeFileSync(resolve(cwd, options.outPath), Buffer.from(bytes))
	}

	output.stdout(options.json ? JSON.stringify(outcome, null, 2) : formatRunOutcome({ outcome }))
	return outcome.ok ? EXIT_OK : EXIT_FAILED
}

/** The options, or what is wrong with the command line. */
export function parseRunOptions(params: { argv: string[] }): RunOptions | string {
	const split = splitArguments({
		argv: params.argv,
		valueFlags: RUN_VALUE_FLAGS,
		booleanFlags: RUN_BOOLEAN_FLAGS,
	})
	if (typeof split === 'string') return split
	const { positionals, values, flags } = split

	if (positionals.length !== 1) return 'name one script'
	const seed = Number(values.get('seed') ?? DEFAULT_RUN_SEED)
	if (!Number.isInteger(seed)) return '--seed takes an integer'
	const timeoutInMilliseconds = Number(values.get('timeout') ?? DEFAULT_RUN_TIMEOUT_IN_MILLISECONDS)
	if (!Number.isInteger(timeoutInMilliseconds) || timeoutInMilliseconds <= 0)
		return '--timeout takes a positive number of milliseconds'
	const nowText = values.get('now')
	const now = nowText === undefined ? undefined : new Date(nowText)
	if (now && Number.isNaN(now.getTime())) return '--now takes an ISO date, 2026-01-31T12:00:00Z'
	if (flags.has('prepare') && values.has('out'))
		return '--out with --prepare: nothing is committed, there is nothing new to export'

	return {
		scriptPath: positionals[0],
		inputPath: values.get('in'),
		outPath: values.get('out'),
		expectPath: values.get('expect'),
		packageName: values.get('package'),
		prepare: flags.has('prepare'),
		json: flags.has('json'),
		seed,
		now,
		timeoutInMilliseconds,
	}
}

/** The script's default export: a function given the run's context. */
async function loadScript(params: { path: string }): Promise<RunScript> {
	const loaded = (await import(pathToFileURL(params.path).href)) as { default?: unknown }
	if (typeof loaded.default !== 'function')
		throw new Error(
			`run: ${params.path} has no default export function - export default async function ({ project, doc, dialecte, helpers, utils }) { ... }`,
		)
	return loaded.default as RunScript
}

/** A JSON array of expectations: `[{ "tag": "Part", "under": { "tag": "Assembly" }, "count": 2 }]`. */
function readExpectations(params: { path: string }): Expectation[] {
	const parsed: unknown = JSON.parse(readFileSync(params.path, 'utf8'))
	const isExpectationList =
		Array.isArray(parsed) &&
		parsed.every(
			(entry) => typeof entry === 'object' && entry !== null && typeof entry.tag === 'string',
		)
	if (!isExpectationList)
		throw new Error(
			`run: ${params.path} is not a JSON array of expectations ({ "tag", "where"?, "under"?, "count"? })`,
		)
	return parsed as Expectation[]
}

function readInput(params: { path: string }): File {
	const { path } = params
	return new File([readFileSync(path)], path.slice(path.lastIndexOf('/') + 1), {
		type: 'application/xml',
	})
}

/** The script's console.log/info/debug go to stderr while it runs: stdout holds the outcome alone. */
function sendScriptLogsTo(params: { output: CommandOutput }): () => void {
	const { output } = params
	const { log, info, debug } = console
	function toStderr(...loggedArguments: unknown[]): void {
		output.stderr(
			loggedArguments
				.map((argument) => (typeof argument === 'string' ? argument : JSON.stringify(argument)))
				.join(' '),
		)
	}
	console.log = toStderr
	console.info = toStderr
	console.debug = toStderr
	return function restoreConsole(): void {
		console.log = log
		console.info = info
		console.debug = debug
	}
}
