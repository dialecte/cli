import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { CONFIG_REPOS_KEY, CONFIG_SCHEMA_KEY, CONFIG_SCHEMA_VERSION } from './config.constants.ts'
import { normalizeRepoKey } from './repo-key-of.ts'
import {
	CONFIG_FILE_HEADERS,
	CONFIG_PATH_SEPARATOR,
	CRLF,
	DEFAULT_INDENT,
	EXACT_PATH_PLATFORM,
	LF,
	YAML_WRITE_OPTIONS,
} from './set-config-value.constants.ts'

import { isCollection, isMap, isNode, isScalar, isSeq, LineCounter, parseDocument } from 'yaml'

import type { ConfigLayer } from './config.types.ts'
import type { Document } from 'yaml'

/** The text of a file the writer creates: its layer's header, then `schema: 1`. */
function newFileText(layer: ConfigLayer): string {
	return `${CONFIG_FILE_HEADERS[layer]}${LF}${CONFIG_SCHEMA_KEY}: ${CONFIG_SCHEMA_VERSION}${LF}`
}

/** The 0-based column of a node's first character, when the parser gave it a range. */
function columnOf(params: { node: unknown; lineCounter: LineCounter }): number | undefined {
	if (!isNode(params.node) || params.node.range === undefined || params.node.range === null)
		return undefined
	return params.lineCounter.linePos(params.node.range[0]).col - 1
}

/**
 * The indent of a parsed file: the column of the first key of the first block mapping nested in the top-level
 * mapping, less that of its parent's key; the default (2) when there is none. Read from the parsed document, so a
 * block scalar's content (`note: |` then `    see: x`) never counts.
 */
function indentOf(params: { document: Document; lineCounter: LineCounter }): number {
	const { document, lineCounter } = params
	if (!isMap(document.contents) || document.contents.flow === true) return DEFAULT_INDENT
	for (const pair of document.contents.items) {
		const nested = pair.value
		if (!isMap(nested) || nested.flow === true || nested.items.length === 0) continue
		const parentColumn = columnOf({ node: pair.key, lineCounter })
		const childColumn = columnOf({ node: nested.items[0].key, lineCounter })
		if (parentColumn === undefined || childColumn === undefined) continue
		if (childColumn > parentColumn) return childColumn - parentColumn
	}
	return DEFAULT_INDENT
}

/** True when `text` reads as YAML holding exactly `expected` (a splice that broke the file does not). */
function readsAs(params: { text: string; expected: unknown }): boolean {
	const document = parseDocument(params.text)
	return document.errors.length === 0 && isDeepStrictEqual(document.toJS(), params.expected)
}

/** `value` under the keys of `path`, outermost first (`['a', 'b']`, 1 -> `{ a: { b: 1 } }`). */
function nestedValueOf(params: { path: readonly string[]; value: unknown }): unknown {
	return params.path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), params.value)
}

/**
 * The spelling of the `repos:` key naming `repo` in the file (normalized match, so an entry written as the https
 * remote is the same repository); `repo` itself when none does.
 */
function repoKeySpellingOf(params: {
	document: Document
	repo: string
	platform: NodeJS.Platform
}): string {
	const repos = params.document.get(CONFIG_REPOS_KEY, true)
	if (!isMap(repos)) return params.repo
	const wanted = normalizeRepoKey({ key: params.repo, platform: params.platform })
	for (const pair of repos.items) {
		const key = String(isScalar(pair.key) ? pair.key.value : pair.key)
		if (normalizeRepoKey({ key, platform: params.platform }) === wanted) return key
	}
	return params.repo
}

/** The shortest prefix of `path` holding something other than a mapping (a scalar, a list), if any. */
function blockingPrefixOf(params: {
	document: Document
	path: readonly string[]
}): string[] | undefined {
	for (let length = 1; length < params.path.length; length++) {
		const prefix = params.path.slice(0, length)
		const node = params.document.getIn(prefix, true)
		if (node !== undefined && !isMap(node)) return prefix
	}
	return undefined
}

/**
 * The style of a new collection at `path`: that of the first collection of its kind (a list, a mapping) beside it in
 * its parent mapping (`fast: [a]` -> a new `full` list in flow too); block when none is.
 */
function siblingFlowOf(params: {
	document: Document
	path: readonly string[]
	list: boolean
}): boolean {
	const parent =
		params.path.length === 1
			? params.document.contents
			: params.document.getIn(params.path.slice(0, -1), true)
	if (!isMap(parent)) return false
	const sibling = parent.items
		.map((pair) => pair.value)
		.find((node) => (params.list ? isSeq(node) : isMap(node)))
	return isCollection(sibling) ? sibling.flow === true : false
}

/**
 * `value` set at `path` of the document: a scalar written into the existing scalar (its comments kept), a collection
 * as a new node in the style of the one it replaces (flow stays flow, the comments carried over), else of a sibling
 * of its kind; a path through a scalar or a list replaces it from there.
 */
function setValueIn(params: { document: Document; path: readonly string[]; value: unknown }): void {
	const { document, path, value } = params
	const blocking = blockingPrefixOf({ document, path })
	if (blocking !== undefined) {
		const rest = path.slice(blocking.length)
		document.setIn(blocking, document.createNode(nestedValueOf({ path: rest, value })))
		return
	}
	if (typeof value !== 'object' || value === null) {
		document.setIn(path, value)
		return
	}
	const previous = document.getIn(path, true)
	const flow = isCollection(previous)
		? previous.flow === true
		: siblingFlowOf({ document, path, list: Array.isArray(value) })
	const node = document.createNode(value, { flow })
	if (isCollection(previous)) {
		node.comment = previous.comment
		node.commentBefore = previous.commentBefore
	}
	document.setIn(path, node)
}

/** The number of leading entries two lists share, at most `limit`. */
function sharedPrefixLength(params: {
	left: readonly string[]
	right: readonly string[]
	limit: number
}): number {
	let length = 0
	while (length < params.limit && params.left[length] === params.right[length]) length++
	return length
}

/**
 * The original text with only the lines the edit changed replaced: the renderings before and after the edit are
 * compared, the lines they share at the start and at the end are taken from the original bytes (the printer
 * normalizes some forms, `{ a: 1 }` -> `{a: 1}`, which must not touch an untouched line). When the printer does not
 * keep the original's lines one for one, the rendering after the edit is the text.
 */
function splicedText(params: { original: string; before: string; after: string }): string {
	const original = params.original.split(LF)
	const before = params.before.split(LF)
	const after = params.after.split(LF)
	if (before.length !== original.length) return params.after
	const limit = Math.min(before.length, after.length)
	const head = sharedPrefixLength({ left: before, right: after, limit })
	const tail = sharedPrefixLength({
		left: [...before].reverse(),
		right: [...after].reverse(),
		limit: limit - head,
	})
	return [
		...original.slice(0, head),
		...after.slice(head, after.length - tail),
		...original.slice(original.length - tail),
	].join(LF)
}

/**
 * Writes `value` at the dotted `path` of a config file, keeping the file's comments, blank lines, key order, indent
 * (read from the parsed document) and line ending (D23); when the spliced text would not read back as the edited
 * document, the whole rendering (in that indent) is written instead. A missing file is created (folders too) with its
 * layer's header and `schema: 1`. `repo` writes under
 * the `repos:` entry naming that repository (a normalized match, changed in place) or a new entry after the others.
 * `platform` compares path keys of `repos:` (exactly when not given).
 */
export function setConfigValue(params: {
	file: string
	layer: ConfigLayer
	path: string
	value: unknown
	repo?: string
	platform?: NodeJS.Platform
}): void {
	const { file } = params
	const text = existsSync(file) ? readFileSync(file, 'utf8') : newFileText(params.layer)
	const crlf = text.includes(CRLF)
	const original = crlf ? text.replaceAll(CRLF, LF) : text
	const lineCounter = new LineCounter()
	const document = parseDocument(original, { lineCounter })
	const options = { ...YAML_WRITE_OPTIONS, indent: indentOf({ document, lineCounter }) }
	const before = document.toString(options)
	const keys = params.path.split(CONFIG_PATH_SEPARATOR)
	const repo = params.repo
	const platform = params.platform ?? EXACT_PATH_PLATFORM
	const path =
		repo === undefined
			? keys
			: [CONFIG_REPOS_KEY, repoKeySpellingOf({ document, repo, platform }), ...keys]
	setValueIn({ document, path, value: params.value })
	const after = document.toString(options)
	const spliced = splicedText({ original, before, after })
	const written = readsAs({ text: spliced, expected: document.toJS() }) ? spliced : after
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, crlf ? written.replaceAll(LF, CRLF) : written)
}
