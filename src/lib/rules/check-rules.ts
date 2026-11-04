/**
 * The code rules on the files given, or without any on the files changed against HEAD and the new ones; a run on
 * the changed files is recorded in the worktree's git folder (`dialecte-rules.json`) for the hand-over card.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { recordRules } from '../gate-records/gate-records.ts'
import { listChangedFiles, listRepositoryFiles } from '../git.ts'
import { TEXT_FILE_PATTERN } from './check-code-rules.constants.ts'
import { checkCodeRules } from './check-code-rules.ts'
import { readReferencePatterns } from './committed-text.ts'

import type { RuleFinding } from './check-code-rules.types.ts'
import type { RulesCheck } from './check-rules.types.ts'

export function checkRules(params: { root: string; givenFiles: readonly string[] }): RulesCheck {
	const { root, givenFiles } = params
	const files = givenFiles.length
		? givenFiles.flatMap((path) => expandFolder({ root, path }))
		: listChangedFiles({ root }).filter((file) => TEXT_FILE_PATTERN.test(file))
	if (files.length === 0) {
		if (givenFiles.length === 0) recordRules({ root, files, errors: 0, warnings: 0 })
		return { files, errors: 0, warnings: 0, findings: [] }
	}
	const referencePatterns = readReferencePatterns(root)
	const findings = files.flatMap((file) =>
		checkCodeRules({ file, text: readFileSync(resolve(root, file), 'utf8'), referencePatterns }),
	)
	const errors = findings.filter((finding) => finding.severity === 'error').length
	const warnings = findings.length - errors
	if (givenFiles.length === 0) recordRules({ root, files, errors, warnings })
	return { files, errors, warnings, findings }
}

/** `<file>:<line>:<column>  <severity>  <rule>  <message>`. */
export function renderRuleFinding(finding: RuleFinding): string {
	return `${finding.file}:${finding.line}:${finding.column}  ${finding.severity}  ${finding.rule}  ${finding.message}`
}

/**
 * A folder → the text files under it git knows (tracked or new, not ignored, deleted ones left out); a
 * file → itself.
 */
function expandFolder(params: { root: string; path: string }): string[] {
	const { root, path } = params
	if (!statSync(resolve(root, path)).isDirectory()) return [path]
	return listRepositoryFiles({ root, folder: path }).filter(
		(file) => TEXT_FILE_PATTERN.test(file) && existsSync(resolve(root, file)),
	)
}
