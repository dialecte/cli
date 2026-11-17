/** `dialecte corpus fetch | list | check | add`: the open-licence corpora of the manifest and the personal licensed entries. */
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { CONFIG_KEYS } from '../lib/config/config-keys.constants.ts'
import { ConfigRefusal } from '../lib/config/config-refusal.ts'
import { personalConfigFileOf } from '../lib/config/personal-config-file-of.ts'
import { resolveConfig } from '../lib/config/resolve-config.ts'
import { CONFIG_PATH_SEPARATOR } from '../lib/config/set-config-value.constants.ts'
import { setConfigValue } from '../lib/config/set-config-value.ts'
import { checkCorpora } from '../lib/corpus/check-corpora.ts'
import { corporaFolderOf } from '../lib/corpus/corpora-folder-of.ts'
import { LIST_JSON_VERSION } from '../lib/corpus/corpus.constants.ts'
import { fetchCorpora } from '../lib/corpus/fetch-corpora.ts'
import { listCorpora } from '../lib/corpus/list-corpora.ts'
import { readShippedCorpus } from '../lib/corpus/shipped-corpus.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { jsonOf, printOut } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import {
	CORPORA_CONFIG_KEY,
	CORPUS_INSTANCES_OPTION,
	CORPUS_JSON_FLAG,
	CORPUS_LINES,
	CORPUS_USAGE,
	CORPUS_VERBS,
	CORPUS_XSD_OPTION,
	KIBIBYTE,
} from './corpus.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { LicensedCorpora } from '../lib/corpus/corpus.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type { CorpusVerb, RunCorpusParams } from './corpus.types.ts'

function usageAnswer(lines: readonly string[] = []): CommandResult {
	return resultOf({ exitCode: 2, lines: [...lines, ...CORPUS_USAGE] })
}

function isVerb(word: string | undefined): word is CorpusVerb {
	return (CORPUS_VERBS as readonly (string | undefined)[]).includes(word)
}

function jsonAnswer(params: { exitCode: number; value: unknown }): CommandResult {
	return { exitCode: params.exitCode, output: jsonOf(params.value, '\t') }
}

/** `corpus` on its words: the answer, never printed here (the tests call it with their own machine and manifest). */
export async function runCorpus(params: RunCorpusParams): Promise<CommandResult> {
	const read = readArguments({
		argv: params.argv,
		valueOptions: [CORPUS_XSD_OPTION, CORPUS_INSTANCES_OPTION],
		flags: [CORPUS_JSON_FLAG],
	})
	if (typeof read === 'string') return usageAnswer([`corpus: ${read}`])
	const [verb, ...words] = read.words
	if (!isVerb(verb)) return usageAnswer()
	if (verb === 'fetch') return runFetch({ params, read, ids: words })
	if (words.length > 0 && verb !== 'add') return usageAnswer()
	if (verb === 'add') return runAdd({ params, read, words })
	const licensed = licensedOf(params)
	if (licensed instanceof ConfigRefusal) return resultOf({ exitCode: 2, lines: [licensed.message] })
	return verb === 'list'
		? runList({ params, read, licensed })
		: runCheck({ params, read, licensed })
}

/**
 * The licensed entries of config.yml `corpora:`, or its refusal. Only that key is resolved: a refusal of another key
 * (an old home not migrated yet) never hides the corpora.
 */
function licensedOf(params: RunCorpusParams): LicensedCorpora | ConfigRefusal {
	const resolved = resolveConfig({
		root: params.cwd,
		environment: params.environment,
		platform: params.platform,
		home: params.home,
		keys: CONFIG_KEYS.filter((spec) => spec.key === CORPORA_CONFIG_KEY),
		layers: ['personal'],
	})
	if (resolved.refusals.length > 0) return new ConfigRefusal(resolved.refusals)
	const value = resolved.values.find((each) => each.key === CORPORA_CONFIG_KEY)?.value
	// the value passed the key's check (corporaProblem): the shape LicensedCorpora names
	return (value ?? {}) as LicensedCorpora
}

async function runFetch(context: {
	params: RunCorpusParams
	read: RoundArguments
	ids: string[]
}): Promise<CommandResult> {
	const { params, read, ids } = context
	if (read.values.size > 0) return usageAnswer()
	const known = new Set(params.shipped.manifest.sources.map((source) => source.id))
	const unknown = ids.filter((id) => !known.has(id))
	if (unknown.length > 0)
		return usageAnswer([
			fillMessage({ template: CORPUS_LINES.unknownSources, values: { ids: unknown.join(', ') } }),
		])
	const cache = corporaFolderOf({ environment: params.environment })
	const outcomes = await fetchCorpora({
		manifest: params.shipped.manifest,
		overrides: params.shipped.overrides,
		cache,
		ids,
	})
	const exitCode = outcomes.some((outcome) => outcome.kind === 'refused') ? 1 : 0
	if (read.flags.has(CORPUS_JSON_FLAG))
		return jsonAnswer({ exitCode, value: { cache, sources: outcomes } })
	const lines = outcomes.map((outcome) =>
		outcome.kind === 'refused'
			? fillMessage({ template: CORPUS_LINES.refused, values: { reason: outcome.reason } })
			: fillMessage({
					template: CORPUS_LINES.fetched,
					values: {
						id: outcome.id,
						files: String(outcome.files),
						kib: String(Math.ceil(outcome.bytes / KIBIBYTE)),
					},
				}),
	)
	return resultOf({
		exitCode,
		lines: [...lines, fillMessage({ template: CORPUS_LINES.cache, values: { cache } })],
	})
}

function runList(context: {
	params: RunCorpusParams
	read: RoundArguments
	licensed: LicensedCorpora
}): CommandResult {
	const { params, read } = context
	if (read.values.size > 0) return usageAnswer()
	const cache = corporaFolderOf({ environment: params.environment })
	const corpora = listCorpora({
		manifest: params.shipped.manifest,
		cache,
		licensed: context.licensed,
	})
	if (read.flags.has(CORPUS_JSON_FLAG))
		return jsonAnswer({ exitCode: 0, value: { version: LIST_JSON_VERSION, cache, corpora } })
	const lines = corpora.map((entry) =>
		fillMessage({
			template: CORPUS_LINES.listed,
			values: {
				name: entry.name,
				source: entry.source,
				verdict: entry.verdict,
				state: entry.state,
				count: String(entry.instanceCount),
			},
		}),
	)
	return resultOf({
		exitCode: 0,
		lines: [
			...(lines.length === 0 ? [CORPUS_LINES.nothingListed] : lines),
			fillMessage({ template: CORPUS_LINES.cache, values: { cache } }),
		],
	})
}

function runCheck(context: {
	params: RunCorpusParams
	read: RoundArguments
	licensed: LicensedCorpora
}): CommandResult {
	const { params, read } = context
	if (read.values.size > 0) return usageAnswer()
	const cache = corporaFolderOf({ environment: params.environment })
	const problems = checkCorpora({
		manifest: params.shipped.manifest,
		cache,
		licensed: context.licensed,
	})
	const exitCode = problems.length > 0 ? 1 : 0
	if (read.flags.has(CORPUS_JSON_FLAG)) return jsonAnswer({ exitCode, value: { problems } })
	return resultOf({
		exitCode,
		lines:
			problems.length === 0
				? [CORPUS_LINES.checked]
				: problems.map((problem) =>
						fillMessage({ template: CORPUS_LINES.problem, values: { problem: problem.problem } }),
					),
	})
}

/** Writes `corpora.<name>` of the personal config.yml, its paths made absolute from the folder the command runs in. */
function runAdd(context: {
	params: RunCorpusParams
	read: RoundArguments
	words: string[]
}): CommandResult {
	const { params, read, words } = context
	if (read.flags.has(CORPUS_JSON_FLAG) || words.length > 1) return usageAnswer()
	const name = words[0]
	if (name === undefined) return usageAnswer([CORPUS_LINES.needsName])
	if (name.includes(CONFIG_PATH_SEPARATOR))
		return usageAnswer([fillMessage({ template: CORPUS_LINES.badName, values: { name } })])
	const given = read.values.get(CORPUS_XSD_OPTION)
	if (given === undefined) return usageAnswer([CORPUS_LINES.needsXsd])
	const xsd = resolve(params.cwd, given)
	if (!existsSync(xsd) || !statSync(xsd).isFile())
		return usageAnswer([fillMessage({ template: CORPUS_LINES.noXsd, values: { path: xsd } })])
	const instancesGiven = read.values.get(CORPUS_INSTANCES_OPTION)
	const instances = instancesGiven === undefined ? undefined : resolve(params.cwd, instancesGiven)
	if (instances !== undefined && (!existsSync(instances) || !statSync(instances).isDirectory()))
		return usageAnswer([
			fillMessage({ template: CORPUS_LINES.noInstances, values: { path: instances } }),
		])
	const file = personalConfigFileOf(params)
	setConfigValue({
		file,
		layer: 'personal',
		path: [CORPORA_CONFIG_KEY, name].join(CONFIG_PATH_SEPARATOR),
		value: instances === undefined ? { xsd } : { xsd, instances },
	})
	return resultOf({
		exitCode: 0,
		lines: [fillMessage({ template: CORPUS_LINES.added, values: { name, file } })],
	})
}

/** The entry of `dialecte corpus`: prints the answer and exits with its code. */
export async function run(argv: string[]): Promise<void> {
	const result = await runCorpus({
		cwd: process.cwd(),
		argv,
		environment: process.env,
		platform: process.platform,
		home: homedir(),
		shipped: readShippedCorpus(),
	})
	printOut({ stream: 'stdout', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}
