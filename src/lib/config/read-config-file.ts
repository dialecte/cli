import { existsSync, readFileSync } from 'node:fs'

import { errorReasonOf } from '../error-reason.ts'
import { CONFIG_REPOS_KEY, CONFIG_SCHEMA_KEY, CONFIG_SCHEMA_VERSION } from './config.constants.ts'

import { isMap, isNode, isScalar, LineCounter, parseDocument, YAMLMap } from 'yaml'

import type {
	ConfigEntry,
	ConfigFileRead,
	ConfigFinding,
	ConfigLayer,
	ConfigRepoEntry,
} from './config.types.ts'
import type { ParsedFile } from './read-config-file.types.ts'
import type { Pair } from 'yaml'

/** The 1-based line of a pair's key (line 1 when the key carries no position). */
function lineOfPair(params: { parsed: ParsedFile; pair: Pair }): number {
	const start = isNode(params.pair.key) ? params.pair.key.range?.[0] : undefined
	return start === undefined ? 1 : params.parsed.lineCounter.linePos(start).line
}

/** A pair's key as text. */
function keyOfPair(pair: Pair): string {
	return String(isScalar(pair.key) ? pair.key.value : pair.key)
}

/** A pair's value as plain data. */
function valueOfPair(params: { parsed: ParsedFile; pair: Pair }): unknown {
	const value = params.pair.value
	return isNode(value) ? value.toJS(params.parsed.document) : value
}

/** The entries of a mapping with the line of each key, `schema` left out when `skipSchema`. */
function entriesOf(params: {
	parsed: ParsedFile
	map: YAMLMap
	skipSchema: boolean
}): ConfigEntry[] {
	return params.map.items
		.filter((pair) => !(params.skipSchema && keyOfPair(pair) === CONFIG_SCHEMA_KEY))
		.map((pair) => ({
			key: keyOfPair(pair),
			value: valueOfPair({ parsed: params.parsed, pair }),
			line: lineOfPair({ parsed: params.parsed, pair }),
		}))
}

/** The `repos:` entries of a personal file, and a finding for each part that is not a mapping. */
function reposOf(params: { parsed: ParsedFile; pair: Pair }): {
	repos: ConfigRepoEntry[]
	findings: ConfigFinding[]
} {
	const { parsed, pair } = params
	const file = parsed.file
	if (!isMap(pair.value)) {
		const line = lineOfPair({ parsed, pair })
		return {
			repos: [],
			findings: [
				{ file, line, key: CONFIG_REPOS_KEY, problem: 'repos must be a mapping of repositories' },
			],
		}
	}
	const repos: ConfigRepoEntry[] = []
	const findings: ConfigFinding[] = []
	for (const repoPair of pair.value.items) {
		const repo = keyOfPair(repoPair)
		const line = lineOfPair({ parsed, pair: repoPair })
		if (isMap(repoPair.value))
			repos.push({
				repo,
				line,
				entries: entriesOf({ parsed, map: repoPair.value, skipSchema: false }),
			})
		else
			findings.push({
				file,
				line,
				key: CONFIG_REPOS_KEY,
				problem: `repos entry '${repo}' must be a mapping of settings`,
			})
	}
	return { repos, findings }
}

/** The finding on `schema`: missing (line 1) or other than the one version (its line). */
function schemaFindings(params: { parsed: ParsedFile; map: YAMLMap }): ConfigFinding[] {
	const pair = params.map.items.find((item) => keyOfPair(item) === CONFIG_SCHEMA_KEY)
	const file = params.parsed.file
	const key = CONFIG_SCHEMA_KEY
	if (pair === undefined)
		return [
			{
				file,
				line: 1,
				key,
				problem: `schema is missing: write schema: ${CONFIG_SCHEMA_VERSION} first`,
			},
		]
	const value = valueOfPair({ parsed: params.parsed, pair })
	if (value === CONFIG_SCHEMA_VERSION) return []
	const line = lineOfPair({ parsed: params.parsed, pair })
	return [
		{
			file,
			line,
			key,
			problem: `schema ${JSON.stringify(value) ?? String(value)} is not the version this cli reads (${CONFIG_SCHEMA_VERSION})`,
		},
	]
}

/** A read of a mapping: its entries, its `repos:` entries (personal only) and the file findings. */
function readMapping(params: {
	parsed: ParsedFile
	map: YAMLMap
	layer: ConfigLayer
}): ConfigFileRead {
	const { parsed, map } = params
	const reposPair =
		params.layer === 'personal'
			? map.items.find((pair) => keyOfPair(pair) === CONFIG_REPOS_KEY)
			: undefined
	const entries = entriesOf({ parsed, map, skipSchema: true }).filter(
		(entry) => reposPair === undefined || entry.key !== CONFIG_REPOS_KEY,
	)
	const reposRead =
		reposPair === undefined ? { repos: [], findings: [] } : reposOf({ parsed, pair: reposPair })
	const findings = [...schemaFindings({ parsed, map }), ...reposRead.findings]
	return { missing: false, file: parsed.file, entries, repos: reposRead.repos, findings }
}

/** A read holding only one file finding (not YAML, not a mapping). */
function refusedRead(params: { file: string; line: number; problem: string }): ConfigFileRead {
	return { missing: false, file: params.file, entries: [], repos: [], findings: [params] }
}

/** The text of a file, or the reason it cannot be read (a folder, no permission). */
function textOrReason(file: string): { text: string } | { reason: string } {
	try {
		return { text: readFileSync(file, 'utf8') }
	} catch (error) {
		return { reason: errorReasonOf(error) }
	}
}

/**
 * One config file read: a missing file reads as missing; a path that cannot be read (a folder) holds one file
 * finding at line 0 with the reason; else its top-level entries with their 1-based line,
 * the `repos:` entries of a personal file with theirs, and the file findings (not YAML, not a mapping, `schema`
 * missing or not 1). CRLF and LF read alike. `schema` itself is not an entry.
 */
export function readConfigFile(params: { file: string; layer: ConfigLayer }): ConfigFileRead {
	const file = params.file
	if (!existsSync(file)) return { missing: true, file }
	const read = textOrReason(file)
	if ('reason' in read)
		return refusedRead({ file, line: 0, problem: `cannot be read: ${read.reason}` })
	const lineCounter = new LineCounter()
	const document = parseDocument(read.text, { lineCounter, prettyErrors: false })
	const error = document.errors[0]
	if (error !== undefined) {
		const line = lineCounter.linePos(error.pos[0]).line
		return refusedRead({ file, line, problem: `not valid YAML: ${error.message.split('\n')[0]}` })
	}
	const contents = document.contents
	if (contents !== null && !isMap(contents))
		return refusedRead({ file, line: 1, problem: 'not a mapping of settings at top level' })
	const parsed = { file, document, lineCounter }
	return readMapping({ parsed, map: contents ?? new YAMLMap(), layer: params.layer })
}
