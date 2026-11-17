/**
 * A source's tree, built in memory from its checked downloads before anything is written: the archive's kept members
 * (`strip` removed first), the listed files at their paths, the crawled files at `<host><path>`; a path that is
 * absolute, climbs (`..`) or holds a backslash refuses the whole source. Then, in create's order: `exclude` globs
 * removed, a file a `marker` rule covers without any of its texts removed, `substitute` overrides placed, `wrappers`
 * written. Downloaded bytes are data: nothing in them is run or followed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	CORPUS_MESSAGES,
	SCHEMA_ROOT_PATTERN,
	TARGET_NAMESPACE_PATTERN,
	WRAPPER_HEADER,
	XSD_NAMESPACE,
} from './corpus.constants.ts'
import { fnmatches, fnmatchesAny } from './fnmatch.ts'
import { readArchive } from './read-archive.ts'

import type { CorpusFile, ManifestSource, MarkerRule, SourceTree } from './corpus.types.ts'

/** Thrown inside the build, answered as a refused tree: data only. */
class RefusedSource extends Error {}

export function sourceTreeOf(params: {
	source: ManifestSource
	/** URL -> its downloaded bytes, every pin already checked. */
	downloads: ReadonlyMap<string, Uint8Array>
	overrides: string
	/** The most bytes the source's archive may inflate to (default MAX_EXTRACTED_BYTES). */
	maxExtractedBytes?: number
}): SourceTree {
	try {
		const fetched = fetchedFilesOf(params)
		const kept = withRules({ source: params.source, files: fetched })
		const substituted = withSubstitutes({
			source: params.source,
			files: kept,
			overrides: params.overrides,
		})
		const wrapped = withWrappers({ source: params.source, files: substituted })
		return { kind: 'tree', files: [...wrapped.values()].sort(byPath) }
	} catch (error) {
		if (error instanceof RefusedSource) return { kind: 'refused', reason: error.message }
		throw error
	}
}

function byPath(left: CorpusFile, right: CorpusFile): number {
	return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
}

function refuse(params: { message: string; values: Record<string, string> }): never {
	throw new RefusedSource(fillMessage({ template: params.message, values: params.values }))
}

/** The files the source's fetch names, path -> file, every path checked. */
function fetchedFilesOf(params: {
	source: ManifestSource
	downloads: ReadonlyMap<string, Uint8Array>
	maxExtractedBytes?: number
}): Map<string, CorpusFile> {
	const { source } = params
	const files = new Map<string, CorpusFile>()
	const fetch = source.fetch
	if (fetch.kind === 'files')
		for (const [path, entry] of Object.entries(fetch.files))
			files.set(
				...checkedFileOf({
					id: source.id,
					path,
					bytes: downloadOf({ downloads: params.downloads, url: entry.url }),
				}),
			)
	else if (fetch.kind === 'crawl')
		for (const url of Object.keys(fetch.files))
			files.set(
				...checkedFileOf({
					id: source.id,
					path: crawlPathOf(url),
					bytes: downloadOf({ downloads: params.downloads, url }),
				}),
			)
	else {
		const read = readArchive({
			bytes: downloadOf({ downloads: params.downloads, url: fetch.url }),
			maxBytes: params.maxExtractedBytes,
		})
		if (read.kind === 'unknown')
			refuse({ message: CORPUS_MESSAGES.unknownArchive, values: { id: source.id, url: fetch.url } })
		if (read.kind === 'unsupported')
			refuse({
				message: CORPUS_MESSAGES.unsupportedZip,
				values: { id: source.id, url: fetch.url, reason: read.reason },
			})
		const strip = fetch.strip ?? ''
		for (const member of read.files) {
			if (!member.path.startsWith(strip)) continue
			const relative = member.path.slice(strip.length)
			if (isKept({ relative, keep: fetch.keep }))
				files.set(...checkedFileOf({ id: source.id, path: relative, bytes: member.bytes }))
		}
	}
	return files
}

/** The file keyed by its checked path. */
function checkedFileOf(params: {
	id: string
	path: string
	bytes: Uint8Array
}): [string, CorpusFile] {
	const path = checkedPath({ id: params.id, path: params.path })
	return [path, { path, bytes: params.bytes }]
}

/** The checked bytes of a URL of the source (every URL the fetch names was downloaded first). */
function downloadOf(params: {
	downloads: ReadonlyMap<string, Uint8Array>
	url: string
}): Uint8Array {
	return params.downloads.get(params.url) ?? new Uint8Array()
}

/** `<host><path>` of a crawled URL, as create wrote it. */
function crawlPathOf(url: string): string {
	const parsed = new URL(url)
	return `${parsed.host}${parsed.pathname}`
}

/** Kept when it is a prefix's own name (its `/` dropped) or starts with one; `''` keeps everything. */
function isKept(params: { relative: string; keep: readonly string[] }): boolean {
	return params.keep.some(
		(prefix) =>
			params.relative === prefix.replace(/\/+$/u, '') || params.relative.startsWith(prefix),
	)
}

/** `path` when it stays inside the source's folder; refuses it otherwise. */
function checkedPath(params: { id: string; path: string }): string {
	const { path } = params
	const parts = path.split('/')
	const refused =
		path === '' ||
		path.includes('\\') ||
		path.includes('\0') ||
		posix.isAbsolute(path) ||
		/^[A-Za-z]:/u.test(path) ||
		parts.includes('..') ||
		parts.every((part) => part === '' || part === '.')
	if (refused)
		refuse({
			message: CORPUS_MESSAGES.refusedPath,
			values: { id: params.id, path: JSON.stringify(path) },
		})
	// one spelling per file: `./a` and `a//b` are written, locked and checked as `a` and `a/b`
	return posix.normalize(path)
}

/** `exclude` and `marker`, file by file. */
function withRules(params: {
	source: ManifestSource
	files: Map<string, CorpusFile>
}): Map<string, CorpusFile> {
	const exclude = params.source.exclude ?? []
	const markers = params.source.marker ?? []
	const kept = new Map<string, CorpusFile>()
	for (const [path, file] of params.files) {
		if (fnmatchesAny({ path, patterns: exclude })) continue
		if (markers.some((rule) => lacksMarker({ rule, file }))) continue
		kept.set(path, file)
	}
	return kept
}

function lacksMarker(params: { rule: MarkerRule; file: CorpusFile }): boolean {
	const { rule, file } = params
	if (!fnmatches({ path: file.path, pattern: rule.glob })) return false
	if (fnmatchesAny({ path: file.path, patterns: rule.except ?? [] })) return false
	const texts = typeof rule.text === 'string' ? [rule.text] : rule.text
	const bytes = Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength)
	return !texts.some((text) => bytes.includes(Buffer.from(text, 'utf8')))
}

/** The override files at their paths. */
function withSubstitutes(params: {
	source: ManifestSource
	files: Map<string, CorpusFile>
	overrides: string
}): Map<string, CorpusFile> {
	const files = new Map(params.files)
	for (const [path, override] of Object.entries(params.source.substitute ?? {})) {
		const file = join(params.overrides, checkedPath({ id: params.source.id, path: override }))
		if (!existsSync(file))
			refuse({
				message: CORPUS_MESSAGES.unknownOverride,
				values: { id: params.source.id, override },
			})
		files.set(
			...checkedFileOf({
				id: params.source.id,
				path,
				bytes: new Uint8Array(readFileSync(file)),
			}),
		)
	}
	return files
}

/** Each wrapper: a schema of ours importing the documents its globs match, in glob then path order. */
function withWrappers(params: {
	source: ManifestSource
	files: Map<string, CorpusFile>
}): Map<string, CorpusFile> {
	const files = new Map(params.files)
	for (const [path, patterns] of Object.entries(params.source.wrappers ?? {})) {
		const folder = posix.dirname(checkedPath({ id: params.source.id, path }))
		const imports: string[] = []
		for (const pattern of patterns) {
			const matched = [...params.files.values()]
				.filter((file) => fnmatches({ path: file.path, pattern }))
				.sort(byPath)
			if (matched.length === 0)
				refuse({
					message: CORPUS_MESSAGES.wrapperUnmatched,
					values: { id: params.source.id, path, pattern },
				})
			for (const file of matched)
				imports.push(
					`\t<xs:import namespace="${targetNamespaceOf(file)}" schemaLocation="${posix.relative(folder, file.path)}"/>\n`,
				)
		}
		const text = `${WRAPPER_HEADER}<xs:schema xmlns:xs="${XSD_NAMESPACE}">\n${imports.join('')}</xs:schema>\n`
		files.set(path, { path, bytes: new Uint8Array(Buffer.from(text, 'utf8')) })
	}
	return files
}

/** The `targetNamespace` of a schema document's root element, `''` when it has none. */
function targetNamespaceOf(file: CorpusFile): string {
	const text = Buffer.from(
		file.bytes.buffer,
		file.bytes.byteOffset,
		file.bytes.byteLength,
	).toString('utf8')
	const root = SCHEMA_ROOT_PATTERN.exec(text)?.[0] ?? ''
	return TARGET_NAMESPACE_PATTERN.exec(root)?.[2] ?? ''
}
