/** `dialecte config list|get|set|check`: the effective settings, their sources and the writes (33CF section 4). */
import { homedir } from 'node:os'

import { resultOf } from '../lib/command-result.ts'
import { isMapping } from '../lib/config/config-checks.ts'
import { CONFIG_KEYS } from '../lib/config/config-keys.constants.ts'
import { configRootOf } from '../lib/config/config-root-of.ts'
import { CONFIG_REPOS_KEY, CONFIG_SCHEMA_KEY } from '../lib/config/config.constants.ts'
import {
	FORBIDDEN_WORDS_CONFIG_KEY,
	FORBIDDEN_WORDS_FILE_NAME,
	OLD_HOME_KEY_PREFIX,
} from '../lib/config/find-old-homes.constants.ts'
import { findOldHomes } from '../lib/config/find-old-homes.ts'
import { readConfigFile } from '../lib/config/read-config-file.ts'
import { normalizeRepoKey } from '../lib/config/repo-key-of.ts'
import { resolveConfig } from '../lib/config/resolve-config.ts'
import { CONFIG_PATH_SEPARATOR } from '../lib/config/set-config-value.constants.ts'
import { setConfigValue } from '../lib/config/set-config-value.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { jsonOf, printOut } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { findReferences } from '../lib/rules/committed-text.ts'
import { forbiddenWordPatterns } from '../lib/rules/forbidden-words.ts'
import {
	CONFIG_CHECK_MARK,
	CONFIG_CHECK_OK,
	CONFIG_COLUMN_SEPARATOR,
	CONFIG_ENVIRONMENT_SOURCE,
	CONFIG_FILE_SOURCE,
	CONFIG_FINDING_LINE,
	CONFIG_FINDING_LINE_NO_KEY,
	CONFIG_FLAGS,
	CONFIG_JSON_FLAG,
	CONFIG_JSON_SCHEMA_VERSION,
	CONFIG_NO_SETTINGS,
	CONFIG_NOT_SET,
	CONFIG_NOTE_LINE,
	CONFIG_NOTE_MARK,
	CONFIG_REPO_SOURCE,
	CONFIG_SET_BAD_VALUE,
	CONFIG_SET_COMMENT_DROPPED,
	CONFIG_SET_FORBIDDEN_WORD,
	CONFIG_SET_NOT_PER_REPOSITORY,
	CONFIG_SET_NOT_YAML_PROBLEM,
	CONFIG_SET_PERSONAL_WRITTEN,
	CONFIG_SET_PROJECT_WRITTEN,
	CONFIG_SET_REPO_WRITTEN,
	CONFIG_SET_UNUSABLE_FILE,
	CONFIG_SET_WRONG_LAYER,
	CONFIG_TARGET_FLAGS,
	CONFIG_UNKNOWN_KEY,
	CONFIG_USAGE,
	CONFIG_VERB_WORDS,
	YAML_COMMENT_MARK,
} from './config.constants.ts'

import { Lexer, parseDocument } from 'yaml'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	ConfigContext,
	ConfigFinding,
	ConfigKeySpec,
	ConfigSource,
	ResolvedConfig,
} from '../lib/config/config.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type {
	ConfigCall,
	ConfigJsonFinding,
	ConfigPathValue,
	ConfigReport,
	ConfigTarget,
	ConfigVerb,
	ConfigWrite,
	RunConfigParams,
} from './config.types.ts'

/** The answer of `exitCode` printing `lines`. */
function linesAnswer(params: { exitCode: number; lines: readonly string[] }): CommandResult {
	return resultOf(params)
}

/** The answer of `exitCode` printing `value` as JSON. */
function jsonAnswer(params: { exitCode: number; value: unknown }): CommandResult {
	return { exitCode: params.exitCode, output: jsonOf(params.value, '\t') }
}

/** The usage fault (exit 2). */
function usageAnswer(): CommandResult {
	return linesAnswer({ exitCode: 2, lines: CONFIG_USAGE })
}

/** A one-line refusal of `set` (exit 2). */
function refusalAnswer(line: string): CommandResult {
	return linesAnswer({ exitCode: 2, lines: [line] })
}

/** True for a word naming a verb of `config`. */
function isVerb(word: string | undefined): word is ConfigVerb {
	return word !== undefined && Object.hasOwn(CONFIG_VERB_WORDS, word)
}

/** The target flags given. */
function targetsOf(read: RoundArguments): ConfigTarget[] {
	return CONFIG_TARGET_FLAGS.filter((flag) => read.flags.has(flag))
}

/** True when the words and flags fit the verb: its word count, one target for `set` only, `--json` never on `set`. */
function fitsVerb(params: { verb: ConfigVerb; read: RoundArguments }): boolean {
	const { verb, read } = params
	if (read.words.length !== CONFIG_VERB_WORDS[verb]) return false
	const targets = targetsOf(read).length
	if (verb !== 'set') return targets === 0
	return targets === 1 && !read.flags.has(CONFIG_JSON_FLAG)
}

/** The context of the readers for a call. */
function contextOf(params: RunConfigParams): ConfigContext {
	return {
		root: configRootOf({ cwd: params.cwd }),
		environment: params.environment,
		platform: params.platform,
		home: params.home,
	}
}

/** A source as a value line prints it. */
function sourceText(source: ConfigSource): string {
	if (source.kind === 'environment')
		return fillMessage({
			template: CONFIG_ENVIRONMENT_SOURCE,
			values: { variable: source.variable },
		})
	const values = { file: source.file, line: String(source.line) }
	if (source.kind === 'repo')
		return fillMessage({ template: CONFIG_REPO_SOURCE, values: { ...values, repo: source.repo } })
	return fillMessage({ template: CONFIG_FILE_SOURCE, values })
}

/** One value line: the key, the value as compact JSON, the source. */
function valueLine(params: { key: string; value: unknown; source: ConfigSource }): string {
	return [params.key, JSON.stringify(params.value), sourceText(params.source)].join(
		CONFIG_COLUMN_SEPARATOR,
	)
}

/** One finding line: file:line first, then the key, then the problem. */
function findingLine(params: { mark: string; finding: ConfigFinding }): string {
	const { finding } = params
	const values = {
		mark: params.mark,
		file: finding.file,
		line: String(finding.line),
		key: finding.key ?? '',
		problem: finding.problem,
	}
	const template = finding.key === undefined ? CONFIG_FINDING_LINE_NO_KEY : CONFIG_FINDING_LINE
	return fillMessage({ template, values })
}

/** One note line. */
function noteLine(note: string): string {
	return fillMessage({ template: CONFIG_NOTE_LINE, values: { mark: CONFIG_NOTE_MARK, note } })
}

/** The findings of the resolved files with their refused flag (file order). */
function fileFindingsOf(resolved: ResolvedConfig): ConfigJsonFinding[] {
	return resolved.findings.map((finding) => ({
		...finding,
		refused: resolved.refusals.includes(finding),
	}))
}

/** Both files resolved and the old homes of both layers: every finding (refused flag), then the notes. */
function reportOf(params: RunConfigParams): ConfigReport {
	const context = contextOf(params)
	const resolved = resolveConfig(context)
	const project = findOldHomes({ context, layer: 'project' })
	const personal = findOldHomes({ context, layer: 'personal' })
	const oldHomeRefusals = [...project.refusals, ...personal.refusals].map((finding) => ({
		...finding,
		refused: true,
	}))
	return {
		resolved,
		findings: [...fileFindingsOf(resolved), ...oldHomeRefusals],
		notes: [...project.notes, ...personal.notes],
	}
}

/** `config list`: one line per value, then each finding and note as a `!` line; exit 0 whatever it finds. */
function runList(call: ConfigCall): CommandResult {
	const { resolved, findings, notes } = reportOf(call.params)
	if (call.read.flags.has(CONFIG_JSON_FLAG)) {
		const { projectFile, personalFile, repo, values } = resolved
		const value = { schema: CONFIG_JSON_SCHEMA_VERSION, projectFile, personalFile, repo }
		return jsonAnswer({ exitCode: 0, value: { ...value, values, findings, notes } })
	}
	const noSettings = fillMessage({
		template: CONFIG_NO_SETTINGS,
		values: { projectFile: resolved.projectFile, personalFile: resolved.personalFile },
	})
	const empty = resolved.values.length === 0 && findings.length === 0
	const lines = [
		...(empty ? [noSettings] : resolved.values.map(valueLine)),
		...findings.map((finding) => findingLine({ mark: CONFIG_NOTE_MARK, finding })),
		...notes.map(noteLine),
	]
	return linesAnswer({ exitCode: 0, lines })
}

/** `config check`: each finding as a `✗` line (exit 1), or the ok line (exit 0); then the notes. */
function runCheck(call: ConfigCall): CommandResult {
	const { resolved, findings, notes } = reportOf(call.params)
	const ok = findings.length === 0
	const exitCode = ok ? 0 : 1
	if (call.read.flags.has(CONFIG_JSON_FLAG))
		return jsonAnswer({
			exitCode,
			value: { schema: CONFIG_JSON_SCHEMA_VERSION, ok, findings, notes },
		})
	const okLine = fillMessage({
		template: CONFIG_CHECK_OK,
		values: { projectFile: resolved.projectFile, personalFile: resolved.personalFile },
	})
	const findingLines = findings.map((finding) => findingLine({ mark: CONFIG_CHECK_MARK, finding }))
	return linesAnswer({
		exitCode,
		lines: [...(ok ? [okLine] : findingLines), ...notes.map(noteLine)],
	})
}

/** The value at `path` inside `value` (each step a mapping holding the next key). */
function valueAtPath(params: { value: unknown; path: readonly string[] }): ConfigPathValue {
	let current = params.value
	for (const key of params.path) {
		if (!isMapping(current) || !Object.hasOwn(current, key)) return { found: false }
		current = current[key]
	}
	return { found: true, value: current }
}

/** The registry entry of a key path's top-level key, if any. */
function specOf(keyPath: string): ConfigKeySpec | undefined {
	const top = keyPath.split(CONFIG_PATH_SEPARATOR)[0]
	return CONFIG_KEYS.find((spec) => spec.key === top)
}

/** The unknown-key fault (exit 2). */
function unknownKeyAnswer(keyPath: string): CommandResult {
	return refusalAnswer(fillMessage({ template: CONFIG_UNKNOWN_KEY, values: { key: keyPath } }))
}

/** `get` of a key with no value: `not set` then the key's findings (D21), or its JSON with them (D24); exit 1. */
function notSetAnswer(params: {
	keyPath: string
	findings: ConfigJsonFinding[]
	json: boolean
}): CommandResult {
	const { keyPath, findings } = params
	if (params.json) {
		const value = { schema: CONFIG_JSON_SCHEMA_VERSION, key: keyPath, value: null, source: null }
		return jsonAnswer({ exitCode: 1, value: { ...value, findings } })
	}
	const notSet = fillMessage({ template: CONFIG_NOT_SET, values: { key: keyPath } })
	const lines = findings.map((finding) => findingLine({ mark: CONFIG_NOTE_MARK, finding }))
	return linesAnswer({ exitCode: 1, lines: [notSet, ...lines] })
}

/** True for a finding on a whole file (no key, or its `schema`): it refuses every key of that file (D6). */
function isFileLevel(finding: ConfigFinding): boolean {
	return finding.key === undefined || finding.key === CONFIG_SCHEMA_KEY
}

/** The key of the old home a personal key moved from: its git key, or the forbidden-words file. */
function oldHomeKeysOf(spec: ConfigKeySpec): string[] {
	const gitKey = `${OLD_HOME_KEY_PREFIX}${spec.key}`
	return spec.key === FORBIDDEN_WORDS_CONFIG_KEY ? [gitKey, FORBIDDEN_WORDS_FILE_NAME] : [gitKey]
}

/**
 * What hides a key that `get` finds not set: its own findings and the file-level refusals of its layer's file (file
 * order), then for a personal key the refusal of the old home it moved from (its git key, the forbidden-words file).
 */
function notSetFindingsOf(params: {
	spec: ConfigKeySpec
	resolved: ResolvedConfig
	context: ConfigContext
}): ConfigJsonFinding[] {
	const { spec, resolved } = params
	const layerFile = spec.layer === 'project' ? resolved.projectFile : resolved.personalFile
	const fileFindings = fileFindingsOf(resolved).filter(
		(finding) =>
			finding.key === spec.key ||
			(finding.file === layerFile && finding.refused && isFileLevel(finding)),
	)
	if (spec.layer !== 'personal') return fileFindings
	const oldHomeKeys = oldHomeKeysOf(spec)
	const oldHomes = findOldHomes({ context: params.context, layer: 'personal' })
	const oldHomeFindings = oldHomes.refusals
		.filter((finding) => finding.key !== undefined && oldHomeKeys.includes(finding.key))
		.map((finding) => ({ ...finding, refused: true }))
	return [...fileFindings, ...oldHomeFindings]
}

/** `config get <key[.path]>`: the value and the source of its top-level key. */
function runGet(call: ConfigCall): CommandResult {
	const keyPath = call.words[0]
	const spec = specOf(keyPath)
	if (spec === undefined) return unknownKeyAnswer(keyPath)
	const json = call.read.flags.has(CONFIG_JSON_FLAG)
	const resolved = resolveConfig(contextOf(call.params))
	const top = resolved.values.find((value) => value.key === spec.key)
	const path = keyPath.split(CONFIG_PATH_SEPARATOR).slice(1)
	const found: ConfigPathValue =
		top === undefined ? { found: false } : valueAtPath({ value: top.value, path })
	if (top === undefined || !found.found) {
		const findings = notSetFindingsOf({ spec, resolved, context: contextOf(call.params) })
		return notSetAnswer({ keyPath, findings, json })
	}
	const { source } = top
	if (json)
		return jsonAnswer({
			exitCode: 0,
			value: { schema: CONFIG_JSON_SCHEMA_VERSION, key: keyPath, value: found.value, source },
		})
	return linesAnswer({
		exitCode: 0,
		lines: [valueLine({ key: keyPath, value: found.value, source })],
	})
}

/** Why `spec` cannot be written to `target` (the other layer, or not per repository), undefined when it can. */
function targetRefusal(params: { spec: ConfigKeySpec; target: ConfigTarget }): string | undefined {
	const { spec, target } = params
	const targetLayer = target === 'project' ? 'project' : 'personal'
	if (spec.layer !== targetLayer)
		return fillMessage({
			template: CONFIG_SET_WRONG_LAYER,
			values: { key: spec.key, layer: spec.layer, target },
		})
	if (target === 'repo' && !spec.repoOverride)
		return fillMessage({ template: CONFIG_SET_NOT_PER_REPOSITORY, values: { key: spec.key } })
	return undefined
}

/** True when YAML reads a comment in the value text (an unquoted ` #`), a part of the text it then drops. */
function holdsComment(text: string): boolean {
	return [...new Lexer().lex(text)].some((token) => token.startsWith(YAML_COMMENT_MARK))
}

/**
 * The value text read as YAML, or the problem of a text that is not YAML or that YAML would cut at a comment
 * (`code #wait` reads as `code`: the text must be quoted).
 */
function parsedValueOf(text: string): { value: unknown } | { problem: string } {
	const document = parseDocument(text, { prettyErrors: false })
	const error = document.errors[0]
	if (error !== undefined) {
		const why = error.message.split('\n')[0]
		return { problem: fillMessage({ template: CONFIG_SET_NOT_YAML_PROBLEM, values: { why } }) }
	}
	if (holdsComment(text)) return { problem: CONFIG_SET_COMMENT_DROPPED }
	return { value: document.toJS() as unknown }
}

/** `value` set at `path` inside `base`, a copy (a step that is not a mapping starts a new one). */
function withPathValue(params: {
	base: unknown
	path: readonly string[]
	value: unknown
}): unknown {
	const [key, ...rest] = params.path
	if (key === undefined) return params.value
	const base = isMapping(params.base) ? params.base : {}
	return { ...base, [key]: withPathValue({ base: base[key], path: rest, value: params.value }) }
}

/**
 * The target file's current value of `key` (its top level, or this repository's `repos:` entry), or the refusal of
 * a file `set` cannot edit (not YAML, not a mapping, `schema` missing or not 1; D22).
 */
function currentValueOf(params: {
	write: ConfigWrite
	layer: 'project' | 'personal'
	key: string
	platform: NodeJS.Platform
}): { value: unknown } | { refusal: string } {
	const { write, key, platform } = params
	const read = readConfigFile({ file: write.file, layer: params.layer })
	if (read.missing) return { value: undefined }
	const unusable = read.findings.find((finding) => finding.key !== CONFIG_REPOS_KEY)
	if (unusable !== undefined) {
		const values = { file: unusable.file, line: String(unusable.line), problem: unusable.problem }
		return { refusal: fillMessage({ template: CONFIG_SET_UNUSABLE_FILE, values }) }
	}
	const wanted = normalizeRepoKey({ key: write.repo, platform })
	const entries =
		write.target === 'repo'
			? read.repos.find((entry) => normalizeRepoKey({ key: entry.repo, platform }) === wanted)
					?.entries
			: read.entries
	return { value: entries?.find((entry) => entry.key === key)?.value }
}

/** True when the value text holds a word of the personal `forbiddenWords` (D16; none when that value is refused). */
function holdsForbiddenWord(params: { resolved: ResolvedConfig; text: string }): boolean {
	const listed = params.resolved.values.find((value) => value.key === FORBIDDEN_WORDS_CONFIG_KEY)
	const words = Array.isArray(listed?.value)
		? listed.value.filter((word) => typeof word === 'string')
		: []
	const patterns = forbiddenWordPatterns(words)
	return findReferences({ text: params.text, patterns }).length > 0
}

/** The line `set` prints once written. */
function writtenLine(write: ConfigWrite): string {
	const values = { key: write.keyPath, file: write.file, repo: write.repo }
	if (write.target === 'project')
		return fillMessage({ template: CONFIG_SET_PROJECT_WRITTEN, values })
	if (write.target === 'repo') return fillMessage({ template: CONFIG_SET_REPO_WRITTEN, values })
	return fillMessage({ template: CONFIG_SET_PERSONAL_WRITTEN, values })
}

/**
 * The checks of the value `set` writes (D22: only its own): the key's check on the top-level value it makes, then
 * the forbidden words (never for `forbiddenWords` itself, D18). Undefined when it may be written.
 */
function valueRefusal(params: {
	call: ConfigCall
	write: ConfigWrite
	spec: ConfigKeySpec
	resolved: ResolvedConfig
}): string | undefined {
	const { write, spec } = params
	const platform = params.call.params.platform
	const current = currentValueOf({ write, layer: spec.layer, key: spec.key, platform })
	if ('refusal' in current) return current.refusal
	const path = write.keyPath.split(CONFIG_PATH_SEPARATOR).slice(1)
	const topValue = withPathValue({ base: current.value, path, value: write.value })
	const problem = spec.problemOf(topValue)
	if (problem !== undefined)
		return fillMessage({ template: CONFIG_SET_BAD_VALUE, values: { key: write.keyPath, problem } })
	const text = params.call.words[1]
	if (spec.key !== FORBIDDEN_WORDS_CONFIG_KEY && holdsForbiddenWord({ ...params, text }))
		return CONFIG_SET_FORBIDDEN_WORD
	return undefined
}

/** `config set <key[.path]> <value> --project|--personal|--repo`: the checks, then one write. */
function runSet(call: ConfigCall): CommandResult {
	const [keyPath, text] = call.words
	const spec = specOf(keyPath)
	if (spec === undefined) return unknownKeyAnswer(keyPath)
	const target = targetsOf(call.read)[0]
	const layerRefusal = targetRefusal({ spec, target })
	if (layerRefusal !== undefined) return refusalAnswer(layerRefusal)
	const parsed = parsedValueOf(text)
	if ('problem' in parsed)
		return refusalAnswer(
			fillMessage({
				template: CONFIG_SET_BAD_VALUE,
				values: { key: keyPath, problem: parsed.problem },
			}),
		)
	const resolved = resolveConfig(contextOf(call.params))
	const file = target === 'project' ? resolved.projectFile : resolved.personalFile
	const repo = resolved.repo?.key ?? ''
	const write = { file, keyPath, value: parsed.value, target, repo }
	const refusal = valueRefusal({ call, write, spec, resolved })
	if (refusal !== undefined) return refusalAnswer(refusal)
	setConfigValue({
		file,
		layer: spec.layer,
		path: keyPath,
		value: parsed.value,
		repo: target === 'repo' ? repo : undefined,
		platform: call.params.platform,
	})
	return linesAnswer({ exitCode: 0, lines: [writtenLine(write)] })
}

/** The verbs of `config`. */
const RUN_VERB: Readonly<Record<ConfigVerb, (call: ConfigCall) => CommandResult>> = {
	list: runList,
	get: runGet,
	set: runSet,
	check: runCheck,
}

/** `config` on its words: the answer, never printed here (the tests call it with their own machine). */
export function runConfig(params: RunConfigParams): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: CONFIG_FLAGS })
	if (typeof read === 'string') return usageAnswer()
	const verb = read.words[0]
	if (!isVerb(verb) || !fitsVerb({ verb, read })) return usageAnswer()
	return RUN_VERB[verb]({ params, read, words: read.words.slice(1) })
}

/** The entry of `dialecte config`: prints the answer and exits with its code. */
export async function run(argv: string[]): Promise<void> {
	const result = runConfig({
		cwd: process.cwd(),
		argv,
		environment: process.env,
		platform: process.platform,
		home: homedir(),
	})
	printOut({ stream: 'stdout', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}
