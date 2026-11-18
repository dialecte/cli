/**
 * The code rules on the files given; without any, on the changed list a scoped gate step hands (`changedList`), else
 * on the files changed against HEAD and the new ones, a run that is recorded in the worktree's git folder
 * (`dialecte-rules.json`) for the hand-over card. A file a rule cannot read or parse is an error of that file.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { errorReasonOf } from '../error-reason.ts'
import { firstSyntaxErrorOf } from '../first-syntax-error.ts'
import { recordRules } from '../gate-records/gate-records.ts'
import { listChangedFiles, listRepositoryFiles, readGit } from '../git.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { readProfile } from '../profile/profile.ts'
import { LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import { readAddedLines, softenNotAdded } from './added-lines.ts'
import { applyAllowComments } from './allow-comments.ts'
import { checkChangelogEdit } from './changelog-edit.ts'
import { CLASS_KEYWORD_PATTERN } from './check-class-rules.constants.ts'
import { ALLOWABLE_RULES, TEXT_FILE_PATTERN } from './check-code-rules.constants.ts'
import { checkCodeRules } from './check-code-rules.ts'
import {
	NUL_SEPARATOR,
	SCRIPT_FILE_PATTERN,
	UNPARSABLE_FILE_MESSAGE,
	UNREADABLE_FILE_MESSAGE,
	UNREADABLE_LIST_FILE_MESSAGE,
} from './check-rules.constants.ts'
import { isTestShaped } from './check-test-shape-rules.ts'
import { readListedPatterns } from './committed-text.ts'
import { createDialecteChangeReader } from './dialecte-change.ts'
import { readEntryClasses } from './entry-classes.ts'
import { checkFixtureFiles, judgedAtBase, testFileLengthOf } from './file-lengths.ts'
import {
	ForbiddenWordsListError,
	forbiddenWordPatterns,
	forbiddenWordsFileOf,
	readForbiddenWords,
} from './forbidden-words.ts'
import { createImportReading, packagePathOf } from './import-reading.ts'
import { readQueryNamesWithNote } from './query-names.ts'
import { checkReleasedChangelog } from './released-changelog.ts'
import { sqlKeywordReaderOf } from './sql-literals.ts'
import { createUnitContextReader } from './unit-context.ts'

import ts from 'typescript'

import type { AllowedCounts } from './allow-comments.types.ts'
import type { CheckCodeRulesParams, RuleFinding, RuleName } from './check-code-rules.types.ts'
import type { DialecteScope, FileCheck, RulesCheck } from './check-rules.types.ts'
import type { ReferencePattern } from './committed-text.types.ts'
import type { DialecteChangeEntry } from './dialecte-change.types.ts'
import type { EntryClasses } from './entry-classes.types.ts'

export function checkRules(params: {
	root: string
	givenFiles: readonly string[]
	/** A scoped gate step's changed list (`DIALECTE_GATE_CHANGED`, NUL-separated): read when no file is given. */
	changedList?: string
	/** The user's config folders are read from it. Default: the process's environment. */
	environment?: Readonly<NodeJS.ProcessEnv>
	/** The gate's base (`DIALECTE_GATE_BASE`): an error of a quality rule on a line it does not add is a warning. */
	base?: string
	/** The tree the gate checks (`DIALECTE_GATE_TREE`): the changelog-edit rule reads its package.json. */
	tree?: string
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
	const { names: queryNames, coreGroups, note } = readQueryNamesWithNote({ root })
	const ranRules = ranRulesOf(queryNames)
	const scope = dialecteScopeOf({ root, coreGroups })
	const { base } = params
	const checked = files.map((file) =>
		checkFile({ root, file, referencePatterns, queryNames, ranRules, scope }),
	)
	const fixtures = checkFixtureFiles({
		root,
		fixtures: checked.flatMap((result) => result.fixtures ?? []),
	})
	const fileFindings = judgedAtBase({
		root,
		base,
		findings: [...checked.flatMap((result) => result.findings), ...fixtures.findings],
		overLimit: [...checked.flatMap((result) => result.overLimit ?? []), ...fixtures.overLimit],
	})
	const released = checkReleasedChangelog({
		root,
		files,
		environment: params.environment ?? process.env,
		...(params.tree !== undefined && { tree: params.tree }),
	})
	const findings = [
		...listFindings,
		...released.findings,
		...checkChangelogEdit({
			root,
			files,
			...(base !== undefined && { base }),
			...(params.tree !== undefined && { tree: params.tree }),
		}),
		...(base === undefined
			? fileFindings
			: softenNotAdded({
					findings: fileFindings,
					added: readAddedLines({ root, base, files }),
				})),
	]
	const allowed = sumAllowed([...checked.map((result) => result.allowed), ...fixtures.allowed])
	const errors = findings.filter((finding) => finding.severity === 'error').length
	const warnings = findings.length - errors
	const allowedField = Object.keys(allowed).length ? { allowed } : {}
	if (recorded) recordRules({ root, files, errors, warnings, ...allowedField })
	const notRun = note === undefined ? {} : { queryInLoopNotRun: note }
	const notJudgedRelease =
		released.notJudged === undefined ? {} : { releasedChangelogNotJudged: released.notJudged }
	const scoped = scope === undefined ? {} : scopeFieldsOf(checked)
	return {
		files,
		errors,
		warnings,
		findings,
		...allowedField,
		...noList,
		...notRun,
		...notJudgedRelease,
		...scoped,
	}
}

/**
 * The Dialecte-change scope of the package at `root`: none without a package.json (no package to tell the kind of).
 * An app (no core, dialecte, create nor cli package) that is not a contributor's judges only its Dialecte changes.
 */
function dialecteScopeOf(params: {
	root: string
	coreGroups: ReadonlySet<string>
}): DialecteScope | undefined {
	const { root } = params
	if (!existsSync(join(root, PACKAGE_MANIFEST_FILE))) return undefined
	// one import reading per run: the scope and the unit context share its resolver and trees
	const reading = createImportReading({ root })
	const reader = createDialecteChangeReader({ root, reading })
	// the entries are walked once, when a checked file first holds a class
	let entryClasses: EntryClasses | undefined
	return {
		reader,
		reading,
		entryClassesOf(file) {
			entryClasses ??= readEntryClasses({ root, reading })
			return entryClasses.get(file) ?? new Set()
		},
		judgesOnlyChanges: reader.kind === 'app' && readProfile(root) !== 'contributor',
		units: createUnitContextReader({ ...params, reading }),
	}
}

/** Each file's verdict sorted by file, and how many files were left out (absent when none). */
function scopeFieldsOf(checked: readonly FileCheck[]): {
	dialecteChanges: DialecteChangeEntry[]
	notJudged?: number
} {
	const dialecteChanges = checked
		.flatMap((result) => (result.entry === undefined ? [] : [result.entry]))
		.sort((first, second) => first.file.localeCompare(second.file))
	const notJudged = checked.filter((result) => !result.judged).length
	return { dialecteChanges, ...(notJudged > 0 && { notJudged }) }
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
 * The findings of one file: an error when it cannot be read (judged in every package, so it is never hidden) or
 * does not parse, else the code rules' once its opt-outs (in a script file) have silenced what they cover, and how
 * many each rule had silenced. In an app, a script file that is no Dialecte change is not judged. A test-shaped
 * Dialecte change also gets the test rules, with its unit context.
 */
function checkFile(params: {
	root: string
	file: string
	referencePatterns: readonly ReferencePattern[]
	queryNames: ReadonlySet<string>
	ranRules: ReadonlySet<RuleName>
	scope: DialecteScope | undefined
}): FileCheck {
	const { file, scope } = params
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
			entry: scope && { file, ...scope.reader.verdictOf({ file }) },
			judged: true,
		}
	}
	// one syntax tree per file: the scope, the rules, the opt-outs and the files importing it read the same one
	const sourceFile =
		scope?.reading.sourceOfText({ file, text }) ??
		ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
	const entry = scope && { file, ...scope.reader.verdictOf({ file, sourceFile }) }
	const script = SCRIPT_FILE_PATTERN.test(file)
	if (scope?.judgesOnlyChanges && script && !entry?.dialecteChange)
		return { findings: [], allowed: {}, entry, judged: false }
	const unparsable = parseFindingOf({ file, sourceFile })
	if (unparsable) return { findings: [unparsable], allowed: {}, entry, judged: true }
	const tested = scope && entry?.dialecteChange && isTestShaped(file) ? scope.units : undefined
	// imports resolve from the file's package path: a file given as an absolute path is judged as given relative
	const packageFile = packagePathOf({ root: params.root, file })
	const testRules = tested && {
		dialecteChange: true as const,
		units: tested.unitsOf({ file: packageFile, sourceFile }),
		xmlImports: tested.xmlImportsOf({ file: packageFile, sourceFile }),
	}
	const testLength = tested ? testFileLengthOf({ file, text }) : {}
	const entryClasses =
		scope && CLASS_KEYWORD_PATTERN.test(text) ? scope.entryClassesOf(packageFile) : undefined
	const findings = [
		...checkCodeRulesWithoutSql({
			file,
			text,
			referencePatterns: params.referencePatterns,
			queryNames: params.queryNames,
			sourceFile,
			...(entryClasses && { entryClasses }),
			...(testRules && { testRules }),
			...(scope && { packageKind: scope.reader.kind }),
		}),
		...(testLength.finding ? [testLength.finding] : []),
	]
	const fixtures = tested?.rawFixturesOf({ file: packageFile, sourceFile }) ?? []
	const overLimit = testLength.overLimit && { overLimit: [testLength.overLimit] }
	if (!script) return { findings, allowed: {}, entry, judged: true, fixtures, ...overLimit }
	return {
		...applyAllowComments({ file, text, findings, ranRules: params.ranRules, sourceFile }),
		entry,
		judged: true,
		fixtures,
		...overLimit,
	}
}

/**
 * The code rules' findings of a file, without the committed-text references that are SQL keywords inside an SQL
 * string of code: there the word is the keyword, never a name of committed text.
 */
function checkCodeRulesWithoutSql(params: CheckCodeRulesParams): RuleFinding[] {
	const isSqlKeywordAt = sqlKeywordReaderOf(params)
	return checkCodeRules(params).filter(
		(finding) => finding.rule !== 'committed-text-reference' || !isSqlKeywordAt(finding),
	)
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
	sourceFile: ts.SourceFile
}): RuleFinding | undefined {
	const { file, sourceFile } = params
	if (!SCRIPT_FILE_PATTERN.test(file)) return undefined
	const syntaxError = firstSyntaxErrorOf({ source: sourceFile })
	if (syntaxError === undefined) return undefined
	return {
		file,
		line: syntaxError.line,
		column: syntaxError.column,
		rule: 'unreadable-file',
		severity: 'error',
		message: UNPARSABLE_FILE_MESSAGE.replace('{why}', syntaxError.message),
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
