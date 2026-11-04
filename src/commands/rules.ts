/**
 * `dialecte rules [<files...>] [--json]` - the code-rules self-check before a hand-over, on the syntax
 * tree of each file: types and constants in their own files, named functions, no `await` inside an
 * argument, object parameters, full words, no plan tag or standard citation. Without files, the files
 * changed against HEAD and the new ones, and the result recorded in the worktree's git folder
 * (`dialecte-rules.json`) for the hand-over card. Exit 1 on an error; warnings alone exit 0.
 */
import { hasFlag } from '../lib/config.ts'
import { checkRules, renderRuleFinding } from '../lib/rules/check-rules.ts'

import type { CommandResult } from '../lib/command-result.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runRules({ cwd: process.cwd(), argv })
	console.log(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runRules(params: { cwd: string; argv: string[] }): CommandResult {
	const { cwd, argv } = params
	const json = hasFlag(argv, 'json')
	const givenFiles = argv.filter((argument) => !argument.startsWith('--'))
	const check = checkRules({ root: cwd, givenFiles })
	const { files, errors, warnings, findings } = check
	if (json) return { exitCode: errors ? 1 : 0, output: JSON.stringify(check, null, 2) }
	if (files.length === 0) return { exitCode: 0, output: 'rules: no changed file to check' }
	const output = [
		...findings.map(renderRuleFinding),
		`rules: ${files.length} file(s), ${errors} error(s), ${warnings} warning(s)`,
	].join('\n')
	return { exitCode: errors ? 1 : 0, output }
}
