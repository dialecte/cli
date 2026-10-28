/**
 * `dialecte schema <Tag>` - what an element may hold and where (parents, children in order with how often,
 * attributes with required / default / fixed / enumeration / pattern, text, namespace), read through core's
 * own readers from the installed dialectes. An unknown tag answers the closest tag names.
 */
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { answerSchema } from '../lib/schema/answer-schema.ts'
import { loadDialectes } from '../lib/schema/load-dialectes.ts'
import { SCHEMA_USAGE, SCHEMA_VALUE_OPTIONS } from './schema.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = await runSchema({ argv, cwd: process.cwd() })
	process.stdout.write(result.output)
	process.exitCode = result.exitCode
}

export async function runSchema(params: { argv: string[]; cwd: string }): Promise<CommandOutput> {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return missing
	const [tagName] = positionalArguments({ argv: params.argv, valueOptions: SCHEMA_VALUE_OPTIONS })
	if (!tagName) return { output: `${SCHEMA_USAGE}\n`, exitCode: 2 }
	const packageName = getArg(params.argv, 'package')
	const loaded = await loadDialectes({ cwd: params.cwd })
	return answerSchema({
		loaded: {
			dialectes: loaded.dialectes.filter(
				(dialecte) => packageName === undefined || dialecte.packageName === packageName,
			),
			skipped: loaded.skipped,
		},
		tagName,
		json: hasFlag(params.argv, 'json'),
	})
}
