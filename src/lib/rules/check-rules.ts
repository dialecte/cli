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
import { readAddedLines, softenNotAdded } from './added-lines.ts'
import { applyAllowComments } from './allow-comments.ts'
import { ALLOWABLE_RULES, TEXT_FILE_PATTERN } from './check-code-rules.constants.ts'
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
import { readQueryNamesWithNote } from './query-names.ts'

import ts from 'typescript'

import type { AllowedCounts } from './allow-comments.types.ts'
import type { RuleFinding, RuleName } from './check-code-rules.types.ts'
import type { RulesCheck } from './check-rules.types.ts'
import type { ReferencePattern } from './committed-text.types.ts'

export function checkRules(params: {
	root: string
	givenFiles: readonly string[]
	/** A scoped gate step's changed list (`DIALECTE_GATE_CHANGED`, NUL-separated): read when no file is given. */
	changedList?: string
	/** The user's config folders are read from it. Default: the process's environment. */
	environment?: Readonly<NodeJS.ProcessEnv>
	/** The gate's base (`DIALECTE_GATE_BASE`): an error of a quality rule on a line it does not add is a warning. */
	base?: string
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
	const { names: queryNames, note } = readQueryNamesWithNote({ root })
	const ranRules = ranRulesOf(queryNames)
	const checked = files.map((file) =>
		checkFile({ root, file, referencePatterns, queryNames, ranRules }),
	)
	const fileFindings = checked.flatMap((result) => result.findings)
	const findings = [
		...listFindings,
		...(params.base === undefined
			? fileFindings
			: softenNotAdded({
					findings: fileFindings,
					added: readAddedLines({ root, base: params.base, files }),
				})),
	]
	const allowed = sumAllowed(checked.map((result) => result.allowed))
	const errors = findings.filter((finding) => finding.severity === 'error').length
	const warnings = findings.length - errors
	const allowedField = Object.keys(allowed).length ? { allowed } : {}
	if (recorded) recordRules({ root, files, errors, warnings, ...allowedField })
	const notRun = note === undefined ? {} : { queryInLoopNotRun: note }
	return { files, errors, warnings, findings, ...allowedField, ...noList, ...notRun }
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

/**
 * The findings of one file: an error when it cannot be read or does not parse, else the code rules' once its
 * opt-outs (in a script file) have silenced what they cover, and how many each rule had silenced.
 */
function checkFile(params: {
	root: string
	file: string
	referencePatterns: readonly ReferencePattern[]
	queryNames: ReadonlySet<string>
	ranRules: ReadonlySet<RuleName>
}): { findings: RuleFinding[]; allowed: AllowedCounts } {
	const { file } = params
	let text: string
	try {
		text = readFileSync(resolve(params.root, file), 'utf8')
	} catch (error) {
		return {
			findings: [
				unreadableFinding({
					file,
					message: UNREADABLE_FILE_MESSAGE.replace('{why}', errorReasonOf(error)),
				}),
			],
			allowed: {},
		}
	}
	// one syntax tree per file: the rules and the opt-outs read the same one
	const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
	const unparsable = parseFindingOf({ file, text, sourceFile })
	if (unparsable) return { findings: [unparsable], allowed: {} }
	const findings = checkCodeRules({
		file,
		text,
		referencePatterns: params.referencePatterns,
		queryNames: params.queryNames,
		sourceFile,
	})
	if (!SCRIPT_FILE_PATTERN.test(file)) return { findings, allowed: {} }
	return applyAllowComments({ file, text, findings, ranRules: params.ranRules, sourceFile })
}

/** The quality rules a run judges: all of them, `query-in-loop` only when the API indexes name query reads. */
function ranRulesOf(queryNames: ReadonlySet<string>): ReadonlySet<RuleName> {
	return new Set<RuleName>(
		ALLOWABLE_RULES.filter((rule) => rule !== 'query-in-loop' || queryNames.size > 0),
	)
}

/** The per-rule counts of every file added up. */
function sumAllowed(counts: readonly AllowedCounts[]): AllowedCounts {
	const total: AllowedCounts = {}
	for (const count of counts)
		for (const rule of ALLOWABLE_RULES) {
			const silenced = count[rule]
			if (silenced) total[rule] = (total[rule] ?? 0) + silenced
		}
	return total
}

/** The first syntax error of a script file, as a finding at its place; undefined when it parses (or is no script). */
function parseFindingOf(params: {
	file: string
	text: string
	sourceFile: ts.SourceFile
}): RuleFinding | undefined {
	const { file, text, sourceFile } = params
	if (!SCRIPT_FILE_PATTERN.test(file)) return undefined
	const [first] =
		ts.transpileModule(text, { fileName: file, reportDiagnostics: true }).diagnostics ?? []
	if (first === undefined) return undefined
	const position = sourceFile.getLineAndCharacterOfPosition(first.start ?? 0)
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
