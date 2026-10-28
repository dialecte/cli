/**
 * `dialecte members <expression>` - the IntelliSense walk on demand: what `doc.query`, `doc.query.reference`
 * or `tx.lifecycle.extract` hold, read from the live types of the package where it runs (its own extensions
 * included), one line per member with its JSDoc summary. Its probe file lives under node_modules/.cache.
 */
import { answerMembers } from '../lib/api/answer-members.ts'
import { discoveryPath } from '../lib/api/list-members.ts'
import { hasFlag, positionalArguments, resolveTargets, tsconfigOf } from '../lib/config.ts'
import { discoverMethods } from '../lib/discover.ts'
import { discoveryEntry } from '../lib/discovery-entry.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { MEMBERS_USAGE, MEMBERS_VALUE_OPTIONS } from './members.constants.ts'
import { METHOD_DISCOVERY_DEPTH } from './skills.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runMembers({ argv, cwd: process.cwd() })
	process.stdout.write(result.output)
	process.exitCode = result.exitCode
}

export function runMembers(params: { argv: string[]; cwd: string }): CommandOutput {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return missing
	const { argv, cwd } = params
	const [expression] = positionalArguments({ argv, valueOptions: MEMBERS_VALUE_OPTIONS })
	const [target] = resolveTargets(argv, cwd)
	if (!expression || !target) return { output: `${MEMBERS_USAGE}\n`, exitCode: 2 }
	const entries = discoverMethods({
		entrySource: discoveryEntry(target.binding),
		tsconfig: tsconfigOf(argv, cwd),
		root: cwd,
		// one level below the expression, so each group it holds is counted
		maxDepth: Math.max(METHOD_DISCOVERY_DEPTH, discoveryPath(expression).split('.').length),
	})
	return answerMembers({ entries, expression, json: hasFlag(argv, 'json') })
}
