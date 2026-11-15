import { join } from 'node:path'

import { checkConfigEntry } from './check-config-entry.ts'
import { CONFIG_KEYS } from './config-keys.constants.ts'
import {
	CONFIG_LAYERS,
	CONFIG_REPOS_KEY,
	CONFIG_SOURCE_RANKS,
	DUPLICATE_REPOS_ENTRY_PROBLEM,
	PROJECT_CONFIG_FILE_NAME,
} from './config.constants.ts'
import { personalConfigFileOf } from './personal-config-file-of.ts'
import { readConfigFile } from './read-config-file.ts'
import { normalizeRepoKey, repoKeyOf } from './repo-key-of.ts'

import type {
	ConfigContext,
	ConfigEntry,
	ConfigKeySpec,
	ConfigLayer,
	ConfigRepoEntry,
	ConfigSource,
	ConfigValue,
	ResolvedConfig,
} from './config.types.ts'
import type { ConfigCheck, ConfigLayerRead } from './resolve-config.types.ts'

/** The checks of a list of entries and the values of those accepted, each with the source `sourceOf` gives. */
function readEntries(params: {
	entries: readonly ConfigEntry[]
	file: string
	layer: ConfigLayer
	inRepos: boolean
	keys: readonly ConfigKeySpec[]
	sourceOf: (entry: ConfigEntry) => ConfigSource | undefined
}): ConfigLayerRead {
	const checks: ConfigCheck[] = []
	const candidates: ConfigValue[] = []
	for (const entry of params.entries) {
		const result = checkConfigEntry({ ...params, entry })
		const source = params.sourceOf(entry)
		if (result.verdict === 'accepted') {
			if (source !== undefined) candidates.push({ key: entry.key, value: entry.value, source })
			continue
		}
		const finding = { file: params.file, line: entry.line, key: entry.key, problem: result.problem }
		checks.push({ finding, refused: result.verdict === 'refused' })
	}
	return { checks, candidates }
}

/**
 * The `repos:` entries of a file: each entry's checks and values (only this repository's); a second entry naming
 * an already-seen repository gets a finding (D14) and is never used.
 */
function readRepos(params: {
	repos: readonly ConfigRepoEntry[]
	file: string
	layer: ConfigLayer
	keys: readonly ConfigKeySpec[]
	repoKey: string | undefined
	platform: NodeJS.Platform
}): ConfigLayerRead[] {
	const { file } = params
	const seen = new Set<string>()
	return params.repos.map((repoEntry) => {
		const repo = normalizeRepoKey({ key: repoEntry.repo, platform: params.platform })
		const duplicate = seen.has(repo)
		seen.add(repo)
		const matches = !duplicate && repo === params.repoKey
		const read = readEntries({
			entries: repoEntry.entries,
			file,
			layer: params.layer,
			inRepos: true,
			keys: params.keys,
			sourceOf: (entry) => (matches ? { kind: 'repo', file, line: entry.line, repo } : undefined),
		})
		if (!duplicate) return read
		const finding = {
			file,
			line: repoEntry.line,
			key: CONFIG_REPOS_KEY,
			problem: DUPLICATE_REPOS_ENTRY_PROBLEM.replace('{repo}', repoEntry.repo),
		}
		return { ...read, checks: [{ finding, refused: false }, ...read.checks] }
	})
}

/**
 * What one file of `layer` brings: its findings, in line order, and its values; a file with a file finding gives
 * no value (D6).
 */
function readLayer(params: {
	file: string
	layer: ConfigLayer
	keys: readonly ConfigKeySpec[]
	repoKey: string | undefined
	platform: NodeJS.Platform
}): ConfigLayerRead {
	const { file, layer, keys } = params
	const read = readConfigFile({ file, layer })
	if (read.missing) return { checks: [], candidates: [] }
	const fileChecks = read.findings.map((finding) => ({ finding, refused: true }))
	const top = readEntries({
		entries: read.entries,
		file,
		layer,
		inRepos: false,
		keys,
		sourceOf: (entry) => ({ kind: layer, file, line: entry.line }),
	})
	const repos = readRepos({ ...params, repos: read.repos })
	const parts = [top, ...repos]
	const candidates = fileChecks.length > 0 ? [] : parts.flatMap((part) => part.candidates)
	const checks = [...fileChecks, ...parts.flatMap((part) => part.checks)].sort(
		(left, right) => left.finding.line - right.finding.line,
	)
	return { checks, candidates }
}

/** The value of one key: its variable when set, else the file value of the highest source (D5). */
function valueOf(params: {
	spec: ConfigKeySpec
	environment: ConfigContext['environment']
	candidates: readonly ConfigValue[]
}): ConfigValue | undefined {
	const { spec } = params
	const variableText =
		spec.environment === undefined ? undefined : params.environment[spec.environment]
	if (spec.environment !== undefined && variableText !== undefined && variableText !== '')
		return {
			key: spec.key,
			value: variableText,
			source: { kind: 'environment', variable: spec.environment },
		}
	const ofKey = params.candidates.filter((candidate) => candidate.key === spec.key)
	for (const kind of CONFIG_SOURCE_RANKS) {
		const found = ofKey.find((candidate) => candidate.source.kind === kind)
		if (found !== undefined) return found
	}
	return undefined
}

/**
 * Every effective value with its source, in registry order (D5: per top-level key the highest layer wins whole;
 * project keys: environment > `.dialecterc`; personal keys: environment > the `repos:` entry of this repository >
 * the personal top level), the refusals every reader makes (D6) and the findings `check` reports (the refusals
 * plus the unknown keys), in file order (the project file, then the personal file; inside a file, line order).
 * `layers` (default both) limits the files read and the keys resolved: without `personal`, no repository key.
 */
export function resolveConfig(context: ConfigContext): ResolvedConfig {
	const keys = context.keys ?? CONFIG_KEYS
	const layers = context.layers ?? CONFIG_LAYERS
	const projectFile = join(context.root, PROJECT_CONFIG_FILE_NAME)
	const personalFile = personalConfigFileOf(context)
	const repo = layers.includes('personal')
		? repoKeyOf({ root: context.root, platform: context.platform })
		: undefined
	const layerOf = { keys, repoKey: repo?.key, platform: context.platform }
	const files = { project: projectFile, personal: personalFile }
	const reads = CONFIG_LAYERS.filter((layer) => layers.includes(layer)).map((layer) =>
		readLayer({ ...layerOf, file: files[layer], layer }),
	)
	const checks = reads.flatMap((read) => read.checks)
	const candidates = reads.flatMap((read) => read.candidates)
	const values = keys
		.filter((spec) => layers.includes(spec.layer))
		.map((spec) => valueOf({ spec, environment: context.environment, candidates }))
		.filter((value) => value !== undefined)
	return {
		projectFile,
		personalFile,
		repo,
		values,
		refusals: checks.filter((check) => check.refused).map((check) => check.finding),
		findings: checks.map((check) => check.finding),
	}
}
