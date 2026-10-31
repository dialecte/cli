/**
 * `dialecte rules [<files...>] [--json]` - the code-rules self-check before a hand-over, on the syntax
 * tree of each file: types and constants in their own files, named functions, no `await` inside an
 * argument, object parameters, full words, no plan tag or standard citation. Without files, the files
 * changed against HEAD and the new ones, and the result recorded in the worktree's git folder
 * (`dialecte-rules.json`) for the hand-over card. Exit 1 on an error; warnings alone exit 0.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { hasFlag } from '../lib/config.ts'
import { recordRules } from '../lib/gate-records/gate-records.ts'
import { listChangedFiles, listRepositoryFiles } from '../lib/git.ts'
import { TEXT_FILE_PATTERN } from '../lib/rules/check-code-rules.constants.ts'
import { checkCodeRules } from '../lib/rules/check-code-rules.ts'
import { readReferencePatterns } from '../lib/rules/committed-text.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { RuleFinding } from '../lib/rules/check-code-rules.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runRules({ cwd: process.cwd(), argv })
	console.log(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runRules(params: { cwd: string; argv: string[] }): CommandResult {
	const { cwd, argv } = params
	const json = hasFlag(argv, 'json')
	const givenFiles = argv.filter((argument) => !argument.startsWith('--'))
	const files = givenFiles.length
		? givenFiles.flatMap((path) => expandFolder({ cwd, path }))
		: listChangedFiles({ root: cwd }).filter((file) => TEXT_FILE_PATTERN.test(file))
	if (files.length === 0) {
		if (givenFiles.length === 0) recordRules({ root: cwd, files, errors: 0, warnings: 0 })
		return {
			exitCode: 0,
			output: json
				? JSON.stringify({ files, errors: 0, warnings: 0, findings: [] }, null, 2)
				: 'rules: no changed file to check',
		}
	}

	const referencePatterns = readReferencePatterns(cwd)
	const findings = files.flatMap((file) =>
		checkCodeRules({ file, text: readFileSync(resolve(cwd, file), 'utf8'), referencePatterns }),
	)
	const errors = findings.filter((finding) => finding.severity === 'error').length
	const warnings = findings.length - errors
	if (givenFiles.length === 0) recordRules({ root: cwd, files, errors, warnings })
	const output = json
		? JSON.stringify({ files, errors, warnings, findings }, null, 2)
		: [
				...findings.map(renderFinding),
				`rules: ${files.length} file(s), ${errors} error(s), ${warnings} warning(s)`,
			].join('\n')
	return { exitCode: errors ? 1 : 0, output }
}

/**
 * A folder → the text files under it git knows (tracked or new, not ignored, deleted ones left out); a
 * file → itself.
 */
function expandFolder(params: { cwd: string; path: string }): string[] {
	const { cwd, path } = params
	if (!statSync(resolve(cwd, path)).isDirectory()) return [path]
	return listRepositoryFiles({ root: cwd, folder: path }).filter(
		(file) => TEXT_FILE_PATTERN.test(file) && existsSync(resolve(cwd, file)),
	)
}

function renderFinding(finding: RuleFinding): string {
	return `${finding.file}:${finding.line}:${finding.column}  ${finding.severity}  ${finding.rule}  ${finding.message}`
}
