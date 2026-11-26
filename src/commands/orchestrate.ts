import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { orchestratorPaths } from '../lib/orchestrator/orchestrator-paths.ts'
import { printCommandResult } from '../lib/print/command-output.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { orchestrateStatus } from './orchestrate-status.ts'
import {
	ORCHESTRATE_FLAGS,
	ORCHESTRATE_STATUS_VERB,
	ORCHESTRATE_VALUE_OPTIONS,
} from './orchestrate.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { RunOrchestrateParams } from './orchestrate.types.ts'

/** Print the read-only orchestrator answer with the command result's common stream and exit handling. */
export async function run(argv: string[]): Promise<void> {
	const result = runOrchestrate({
		cwd: process.cwd(),
		argv,
		environment: process.env,
		home: homedir(),
	})
	await printCommandResult({ result })
}

/** The read-only orchestrator status, with every machine input handed by the caller. */
export function runOrchestrate(params: RunOrchestrateParams): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: ORCHESTRATE_VALUE_OPTIONS,
		flags: ORCHESTRATE_FLAGS,
	})
	if (typeof read === 'string')
		return usageExit({ reason: read, json: params.argv.includes('--json') })
	const [verb, ...words] = read.words
	if (verb !== ORCHESTRATE_STATUS_VERB)
		return usageExit({
			reason: verb === undefined ? 'status is required' : `unknown verb ${verb}`,
			json: read.flags.has('json'),
		})
	if (words.length > 0)
		return usageExit({
			reason: `unknown argument ${words.join(' ')}`,
			json: read.flags.has('json'),
		})

	const workspace = resolve(params.cwd, read.values.get('workspace') ?? params.cwd)
	let paths
	try {
		paths = orchestratorPaths({
			workspace,
			environment: params.environment ?? {},
			home: params.home ?? params.cwd,
		})
	} catch (error) {
		return usageExit({
			reason: error instanceof Error ? error.message : String(error),
			usage: false,
			json: read.flags.has('json'),
		})
	}
	return orchestrateStatus({ paths, json: read.flags.has('json') })
}

// dialecte-allow duplicate-read: this command intentionally prints one exact usage line, not a help section
function usageExit(params: { reason: string; usage?: boolean; json: boolean }): CommandResult {
	const usage = COMMAND_MAP.orchestrate.usage[0]
	if (params.json)
		return {
			exitCode: 2,
			output: jsonOf({
				error: params.reason,
				...(params.usage === false ? {} : { usage }),
				next: null,
			}),
		}
	const lines = [params.reason, ...(params.usage === false ? [] : [`Usage: ${usage}`])]
	return { exitCode: 2, output: textOf(lines) }
}
