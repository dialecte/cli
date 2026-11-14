/**
 * `dialecte api` - find a Dialecte method by what it is for, and read its contract, from the `api.json`
 * the installed packages ship (no repository needed); with `--source`, the own package's exported source
 * functions too.
 *
 *   find "<need>"         the methods whose intents, summary or name share words with the need, best first
 *   show <path>           signature, summary, intents, other routes, declaration and an example of one method
 *   show <file>#<name>    the same of an exported function of the own package's source
 */
import { findByPath } from '../lib/api/find-by-path.ts'
import { findMethods } from '../lib/api/find-methods.ts'
import { readApiIndexes } from '../lib/api/read-api-indexes.ts'
import { noteLinesOf, renderFound, renderShown } from '../lib/api/render-api.ts'
import {
	isSourcePath,
	searchedIndexesOf,
	showSource,
	sourceRootOf,
} from '../lib/api/source-lookup.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { printOut, textOf } from '../lib/print/print.ts'
import {
	API_SUBCOMMANDS,
	API_USAGE,
	API_VALUE_OPTIONS,
	DEFAULT_FIND_LIMIT,
	SOURCE_FLAG,
} from './api.constants.ts'

import type { ApiJson } from '../lib/api/api-json.types.ts'
import type { LookupCommandOutput } from '../lib/command-output.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runApi({ argv, cwd: process.cwd() })
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

/**
 * What `dialecte api <find|show> ...` prints for `argv` (the words after `api`) run in `cwd`: the methods found for a
 * need, or one method's contract, read from the `api.json` of the installed packages (with `--source` or a
 * `<file>#<name>` path, the own package's source functions too); the usage with exit code 2 on a bad call.
 *
 * @intent answer an api lookup without the command line, find a Dialecte method by what it is for, show a method's contract from another program
 */
export function runApi(params: { argv: readonly string[]; cwd: string }): LookupCommandOutput {
	const [subcommand, ...rest] = params.argv
	const words = positionalArguments({ argv: rest, valueOptions: API_VALUE_OPTIONS })
	const sourceFlag = hasFlag([...rest], SOURCE_FLAG)
	const reachesSource = sourceFlag || (subcommand === 'show' && isSourcePath(words[0] ?? ''))
	if (!reachesSource) {
		const missing = missingPackage({ cwd: params.cwd })
		if (missing) return missing
	}
	const limit = Number(getArg([...rest], 'limit') ?? DEFAULT_FIND_LIMIT)
	if (!isSubcommand(subcommand) || words.length === 0 || !Number.isInteger(limit) || limit < 1)
		return { output: textOf([API_USAGE, '']), exitCode: 2 }

	const packageName = getArg([...rest], 'package')
	const json = hasFlag([...rest], 'json')
	const sourceRoot = reachesSource
		? sourceRootOf({
				cwd: params.cwd,
				command: ['api', subcommand, ...(sourceFlag ? [`--${SOURCE_FLAG}`] : [])].join(' '),
			})
		: { root: params.cwd }
	if ('refusal' in sourceRoot) return sourceRoot.refusal
	const { root } = sourceRoot
	if (reachesSource && subcommand === 'show' && isSourcePath(words[0]))
		return showSource({ root, packageName, path: words[0], json })
	const installed = readApiIndexes({ cwd: root }).filter(
		(index) => packageName === undefined || index.package === packageName,
	)
	const { indexes, notes } = reachesSource
		? searchedIndexesOf({ root, packageName, indexes: installed })
		: { indexes: installed, notes: undefined }
	return subcommand === 'find'
		? find({ indexes, need: words.join(' '), limit, json, notes })
		: show({ indexes, path: words[0], json, notes })
}

function isSubcommand(value: string | undefined): value is (typeof API_SUBCOMMANDS)[number] {
	return API_SUBCOMMANDS.some((subcommand) => subcommand === value)
}

function find(params: {
	indexes: ApiJson[]
	need: string
	limit: number
	json: boolean
	notes?: readonly string[]
}): LookupCommandOutput {
	const found = findMethods(params)
	if (found.length === 0 && !params.json)
		return {
			output: textOf([
				`no method found for "${params.need}" in ${packagesText(params.indexes)}: try other words, or \`npx @dialecte/cli members <expression>\` for the live types`,
				...noteLinesOf(params.notes),
				'',
			]),
			exitCode: 1,
		}
	return {
		output: renderFound({ need: params.need, found, json: params.json, notes: params.notes }),
		exitCode: found.length ? 0 : 1,
	}
}

function show(params: {
	indexes: ApiJson[]
	path: string
	json: boolean
	notes?: readonly string[]
}): LookupCommandOutput {
	const methods = findByPath(params)
	if (methods.length === 0 && !params.json)
		return {
			output: textOf([
				`no method "${params.path}" in ${packagesText(params.indexes)}: \`npx @dialecte/cli api find "<what you need>"\` lists the routes`,
				...noteLinesOf(params.notes),
				'',
			]),
			exitCode: 1,
		}
	return {
		output: renderShown({ methods, json: params.json, notes: params.notes }),
		exitCode: methods.length ? 0 : 1,
	}
}

/**
 * The packages an api lookup searched, as its not-found answer names them: their names joined by commas (a package
 * searched by its index and its source named once), or the line that says no installed package ships an `api.json`.
 *
 * @intent name the packages an api lookup searched, word a not-found api answer
 */
export function packagesText(indexes: readonly ApiJson[]): string {
	return indexes.length
		? [...new Set(indexes.map((index) => index.package))].join(', ')
		: 'no installed package (none ships skills/<name>/references/api.json)'
}
