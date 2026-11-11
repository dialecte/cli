/**
 * The code rules on the files given; without any, on the changed list a scoped gate step hands (`changedList`), else
 * on the files changed against HEAD and the new ones, a run that is recorded in the worktree's git folder
 * (`dialecte-rules.json`) for the hand-over card. A file a rule cannot read or parse is an error of that file.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { errorReasonOf } from '../error-reason.ts'
import { recordRules } from '../gate-records/gate-records.ts'
import { listChangedFiles, listRepositoryFiles, readGit } from '../git.ts'
import { readProfile } from '../profile/profile.ts'
import { LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import { TEXT_FILE_PATTERN } from './check-code-rules.constants.ts'
import { checkCodeRules } from './check-code-rules.ts'
import {
	NUL_SEPARATOR,
	SCRIPT_FILE_PATTERN,
	UNPARSABLE_FILE_MESSAGE,
	UNREADABLE_FILE_MESSAGE,
	UNREADABLE_LIST_FILE_MESSAGE,
} from './check-rules.constants.ts'
import { readListedPatterns } from './committed-text.ts'
import {
	ForbiddenWordsListError,
	forbiddenWordPatterns,
	forbiddenWordsFileOf,
	readForbiddenWords,
} from './forbidden-words.ts'

import ts from 'typescript'

import type { RuleFinding } from './check-code-rules.types.ts'
import type { RulesCheck } from './check-rules.types.ts'
import type { ReferencePattern } from './committed-text.types.ts'

export function checkRules(params: {
	root: string
	givenFiles: readonly string[]
	/** A scoped gate step's changed list (`DIALECTE_GATE_CHANGED`, NUL-separated): read when no file is given. */
	changedList?: string
	/** The user's config folders are read from it. Default: the process's environment. */
	environment?: Readonly<NodeJS.ProcessEnv>
}): RulesCheck {
	const { root, givenFiles } = params
	const picked = pickFiles(params)
	const words = readWordsOf({ root, environment: params.environment })
	const listFindings = [...picked.findings, ...words.findings]
	const { files } = picked
	const recorded = givenFiles.length === 0 && params.changedList === undefined
	const noList = words.noList === undefined ? {} : { noForbiddenWordsList: words.noList }
	if (files.length === 0) {
		const errors = listFindings.length
		if (recorded) recordRules({ root, files, errors, warnings: 0 })
		return { files, errors, warnings: 0, findings: listFindings, ...noList }
	}
	const referencePatterns = [...readListedPatterns(root), ...words.patterns]
	const findings = [
		...listFindings,
		...files.flatMap((file) => checkFile({ root, file, referencePatterns })),
	]
	const errors = findings.filter((finding) => finding.severity === 'error').length
	const warnings = findings.length - errors
	if (recorded) recordRules({ root, files, errors, warnings })
	return { files, errors, warnings, findings, ...noList }
}

/** `<file>:<line>:<column>  <severity>  <rule>  <message>`. */
export function renderRuleFinding(finding: RuleFinding): string {
	return `${finding.file}:${finding.line}:${finding.column}  ${finding.severity}  ${finding.rule}  ${finding.message}`
}

/**
 * The files to check: those given (a folder's text files); else the text files of the changed list still on disk,
 * as the package names them (an unreadable list is an error); else the text files changed against HEAD and the new
 * ones.
 */
function pickFiles(params: { root: string; givenFiles: readonly string[]; changedList?: string }): {
	files: string[]
	findings: RuleFinding[]
} {
	const { root, givenFiles, changedList } = params
	if (givenFiles.length)
		return { files: givenFiles.flatMap((path) => expandFolder({ root, path })), findings: [] }
	if (changedList === undefined)
		return {
			files: listChangedFiles({ root }).filter((file) => TEXT_FILE_PATTERN.test(file)),
			findings: [],
		}
	let text: string
	try {
		text = readFileSync(changedList, 'utf8')
	} catch (error) {
		return {
			files: [],
			findings: [
				unreadableFinding({
					file: changedList,
					message: UNREADABLE_LIST_FILE_MESSAGE.replace('{why}', errorReasonOf(error)),
				}),
			],
		}
	}
	// the list names paths from the repository's top; the package may sit in a folder of it
	const prefix = readGit({ root, args: ['rev-parse', '--show-prefix'] }).trim()
	const files = text
		.split(NUL_SEPARATOR)
		.filter((path) => path !== '' && path.startsWith(prefix))
		.map((path) => path.slice(prefix.length))
		.filter(
			(file) =>
				TEXT_FILE_PATTERN.test(file) &&
				!LOT_FILE_PATTERN.test(file) &&
				// a path the change deleted: nothing to check there, as the default leaves deleted files out
				existsSync(resolve(root, file)),
		)
	return { files: [...new Set(files)].sort(), findings: [] }
}

/**
 * A contributor's forbidden words as patterns, the user file when no list is configured, or the error of a list file
 * that cannot be read; a consumer's: nothing.
 */
function readWordsOf(params: { root: string; environment?: Readonly<NodeJS.ProcessEnv> }): {
	patterns: ReferencePattern[]
	findings: RuleFinding[]
	noList?: string
} {
	if (readProfile(params.root) !== 'contributor') return { patterns: [], findings: [] }
	try {
		const words = readForbiddenWords(params)
		if (words.length) return { patterns: forbiddenWordPatterns(words), findings: [] }
		return {
			patterns: [],
			findings: [],
			noList: forbiddenWordsFileOf({ environment: params.environment }),
		}
	} catch (error) {
		if (!(error instanceof ForbiddenWordsListError)) throw error
		return {
			patterns: [],
			findings: [unreadableFinding({ file: error.file, message: error.message })],
		}
	}
}

/** The findings of one file: an error when it cannot be read or does not parse, else the code rules'. */
function checkFile(params: {
	root: string
	file: string
	referencePatterns: readonly ReferencePattern[]
}): RuleFinding[] {
	const { file } = params
	let text: string
	try {
		text = readFileSync(resolve(params.root, file), 'utf8')
	} catch (error) {
		return [
			unreadableFinding({
				file,
				message: UNREADABLE_FILE_MESSAGE.replace('{why}', errorReasonOf(error)),
			}),
		]
	}
	const unparsable = parseFindingOf({ file, text })
	if (unparsable) return [unparsable]
	return checkCodeRules({ file, text, referencePatterns: params.referencePatterns })
}

/** The first syntax error of a script file, as a finding at its place; undefined when it parses (or is no script). */
function parseFindingOf(params: { file: string; text: string }): RuleFinding | undefined {
	const { file, text } = params
	if (!SCRIPT_FILE_PATTERN.test(file)) return undefined
	const [first] =
		ts.transpileModule(text, { fileName: file, reportDiagnostics: true }).diagnostics ?? []
	if (first === undefined) return undefined
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest)
	const position = source.getLineAndCharacterOfPosition(first.start ?? 0)
	return {
		file,
		line: position.line + 1,
		column: position.character + 1,
		rule: 'unreadable-file',
		severity: 'error',
		message: UNPARSABLE_FILE_MESSAGE.replace(
			'{why}',
			ts.flattenDiagnosticMessageText(first.messageText, ' '),
		),
	}
}

/** An error at the first position of `file`: it could not be read. */
function unreadableFinding(params: { file: string; message: string }): RuleFinding {
	return {
		file: params.file,
		line: 1,
		column: 1,
		rule: 'unreadable-file',
		severity: 'error',
		message: params.message,
	}
}

/**
 * A folder → the text files under it git knows (tracked or new, not ignored, deleted ones left out); a
 * file → itself, and a path that is not there too (its read is the error).
 */
function expandFolder(params: { root: string; path: string }): string[] {
	const { root, path } = params
	const full = resolve(root, path)
	if (!existsSync(full) || !statSync(full).isDirectory()) return [path]
	return listRepositoryFiles({ root, folder: path }).filter(
		(file) => TEXT_FILE_PATTERN.test(file) && existsSync(resolve(root, file)),
	)
}
