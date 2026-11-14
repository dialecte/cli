/**
 * `dialecte schema <Tag>` - what an element may hold and where (parents, children in order with how often,
 * attributes with required / default / fixed / enumeration / pattern, text, namespace), read through core's
 * own readers from the installed dialectes. An unknown tag answers the closest tag names. A tag declared several
 * ways prints each declaration, or with `--under <Parent>` the one(s) that parent holds.
 */
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { printOut, textOf } from '../lib/print/print.ts'
import { answerSchema } from '../lib/schema/answer-schema.ts'
import { loadDialectes } from '../lib/schema/load-dialectes.ts'
import { SCHEMA_USAGE, SCHEMA_VALUE_OPTIONS } from './schema.constants.ts'

import type { LookupCommandOutput } from '../lib/command-output.types.ts'
import type { SchemaDialectesRead } from './schema.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = await runSchema({ argv, cwd: process.cwd() })
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

export async function runSchema(params: {
	argv: string[]
	cwd: string
}): Promise<LookupCommandOutput> {
	const read = await readSchemaDialectes(params)
	if (read.kind === 'output') return read.output
	return answerSchema({
		loaded: read.loaded,
		tagName: read.tagName,
		under: read.under,
		json: hasFlag(params.argv, 'json'),
	})
}

/**
 * The dialectes (filtered by `--package`) the tag is looked up in, or the answer that says why not.
 *
 * @intent load the installed dialectes a schema lookup answers from, read an element's schema without the command line
 */
export async function readSchemaDialectes(params: {
	argv: string[]
	cwd: string
}): Promise<SchemaDialectesRead> {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return { kind: 'output', output: missing }
	const [tagName] = positionalArguments({ argv: params.argv, valueOptions: SCHEMA_VALUE_OPTIONS })
	const under = getArg(params.argv, 'under')
	// `--under` with no value, an empty one or the next option as its value is a usage error
	const underWithoutValue =
		hasFlag(params.argv, 'under') && (under === undefined || under === '' || under.startsWith('--'))
	if (!tagName || underWithoutValue)
		return { kind: 'output', output: { output: textOf([SCHEMA_USAGE, '']), exitCode: 2 } }
	const packageName = getArg(params.argv, 'package')
	const loaded = await loadDialectes({ cwd: params.cwd })
	return {
		kind: 'dialectes',
		tagName,
		under,
		packageName,
		installed: loaded.dialectes.map((dialecte) => dialecte.packageName),
		loaded: {
			dialectes: loaded.dialectes.filter(
				(dialecte) => packageName === undefined || dialecte.packageName === packageName,
			),
			skipped: loaded.skipped,
		},
	}
}
