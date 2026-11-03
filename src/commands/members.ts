/**
 * `dialecte members <expression>` - the IntelliSense walk on demand: what `doc.query`, `doc.query.reference`
 * or `tx.lifecycle.extract` hold, read from the live types of the package where it runs (its own extensions
 * included), one line per member with its JSDoc summary. Its probe file lives under node_modules/.cache.
 */
import { answerMembers } from '../lib/api/answer-members.ts'
import { chooseInstalledBinding, findInstalledBindings } from '../lib/api/installed-bindings.ts'
import { discoveryPath } from '../lib/api/list-members.ts'
import { getArg, hasFlag, positionalArguments, resolveTargets, tsconfigOf } from '../lib/config.ts'
import { discoverMethods } from '../lib/discover.ts'
import { discoveryEntry } from '../lib/discovery-entry.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { MEMBERS_USAGE, MEMBERS_VALUE_OPTIONS } from './members.constants.ts'
import { METHOD_DISCOVERY_DEPTH } from './skills.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type { Binding } from '../lib/config.ts'
import type { MemberEntriesRead } from './members.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runMembers({ argv, cwd: process.cwd() })
	process.stdout.write(result.output)
	process.exitCode = result.exitCode
}

export function runMembers(params: { argv: string[]; cwd: string }): CommandOutput {
	const read = readMemberEntries(params)
	if (read.kind === 'output') return read.output
	return answerMembers({
		entries: read.entries,
		expression: read.expression,
		json: hasFlag(params.argv, 'json'),
	})
}

/** The method entries of the live types the expression is read from, or the answer that says why not. */
export function readMemberEntries(params: { argv: string[]; cwd: string }): MemberEntriesRead {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return { kind: 'output', output: missing }
	const { argv, cwd } = params
	const [expression] = positionalArguments({ argv, valueOptions: MEMBERS_VALUE_OPTIONS })
	const usage: MemberEntriesRead = {
		kind: 'output',
		output: { output: `${MEMBERS_USAGE}\n`, exitCode: 2 },
	}
	if (!expression) return usage
	const binding = readBinding({ argv, cwd })
	if (binding.kind === 'output') return binding
	const entries = discoverMethods({
		entrySource: discoveryEntry(binding.binding),
		tsconfig: tsconfigOf(argv, cwd),
		root: cwd,
		// one level below the expression, so each group it holds is counted
		maxDepth: Math.max(METHOD_DISCOVERY_DEPTH, discoveryPath(expression).split('.').length),
	})
	return { kind: 'entries', entries, expression }
}

/**
 * The package's own binding (a dialecte repository, or `--namespace`/`--entry`), else the dialecte the app has
 * installed: the only one, or the one `--package` / `--version` names.
 */
function readBinding(params: {
	argv: string[]
	cwd: string
}): { kind: 'binding'; binding: Binding } | (MemberEntriesRead & { kind: 'output' }) {
	const [target] = resolveTargets(params.argv, params.cwd)
	if (target) return { kind: 'binding', binding: target.binding }
	const choice = chooseInstalledBinding({
		bindings: findInstalledBindings({ cwd: params.cwd }),
		packageName: getArg(params.argv, 'package'),
		version: getArg(params.argv, 'version'),
	})
	if (choice.kind === 'binding') return { kind: 'binding', binding: choice.binding.binding }
	return { kind: 'output', output: { output: choice.message, exitCode: 2 } }
}
