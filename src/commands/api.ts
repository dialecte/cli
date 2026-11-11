/**
 * `dialecte api` - find a Dialecte method by what it is for, and read its contract, from the `api.json`
 * the installed packages ship (no repository needed).
 *
 *   find "<need>"  the methods whose intents, summary or name share words with the need, best first
 *   show <path>    signature, summary, intents, other routes, declaration and an example of one method
 */
import { findByPath } from '../lib/api/find-by-path.ts'
import { findMethods } from '../lib/api/find-methods.ts'
import { readApiIndexes } from '../lib/api/read-api-indexes.ts'
import { renderFound, renderShown } from '../lib/api/render-api.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { printOut, textOf } from '../lib/print/print.ts'
import {
	API_SUBCOMMANDS,
	API_USAGE,
	API_VALUE_OPTIONS,
	DEFAULT_FIND_LIMIT,
} from './api.constants.ts'

import type { ApiJson } from '../lib/api/api-json.types.ts'
import type { CommandOutput } from '../lib/command-output.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runApi({ argv, cwd: process.cwd() })
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

export function runApi(params: { argv: readonly string[]; cwd: string }): CommandOutput {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return missing
	const [subcommand, ...rest] = params.argv
	const words = positionalArguments({ argv: rest, valueOptions: API_VALUE_OPTIONS })
	const limit = Number(getArg([...rest], 'limit') ?? DEFAULT_FIND_LIMIT)
	if (!isSubcommand(subcommand) || words.length === 0 || !Number.isInteger(limit) || limit < 1)
		return { output: textOf([API_USAGE, '']), exitCode: 2 }

	const packageName = getArg([...rest], 'package')
	const indexes = readApiIndexes({ cwd: params.cwd }).filter(
		(index) => packageName === undefined || index.package === packageName,
	)
	const json = hasFlag([...rest], 'json')
	return subcommand === 'find'
		? find({ indexes, need: words.join(' '), limit, json })
		: show({ indexes, path: words[0], json })
}

function isSubcommand(value: string | undefined): value is (typeof API_SUBCOMMANDS)[number] {
	return API_SUBCOMMANDS.some((subcommand) => subcommand === value)
}

function find(params: {
	indexes: ApiJson[]
	need: string
	limit: number
	json: boolean
}): CommandOutput {
	const found = findMethods(params)
	if (found.length === 0 && !params.json)
		return {
			output: textOf([
				`no method found for "${params.need}" in ${packagesText(params.indexes)}: try other words, or \`npx @dialecte/cli members <expression>\` for the live types`,
				'',
			]),
			exitCode: 1,
		}
	return {
		output: renderFound({ need: params.need, found, json: params.json }),
		exitCode: found.length ? 0 : 1,
	}
}

function show(params: { indexes: ApiJson[]; path: string; json: boolean }): CommandOutput {
	const methods = findByPath(params)
	if (methods.length === 0 && !params.json)
		return {
			output: textOf([
				`no method "${params.path}" in ${packagesText(params.indexes)}: \`npx @dialecte/cli api find "<what you need>"\` lists the routes`,
				'',
			]),
			exitCode: 1,
		}
	return { output: renderShown({ methods, json: params.json }), exitCode: methods.length ? 0 : 1 }
}

export function packagesText(indexes: readonly ApiJson[]): string {
	return indexes.length
		? indexes.map((index) => index.package).join(', ')
		: 'no installed package (none ships skills/<name>/references/api.json)'
}
