/**
 * The files of an index folder in the cache, written and read back: the manifest, the quality, the
 * headings, definitions, tables and cross-references per file, the logical lines of each file
 * (`lines/<name>.jsonl`), the word index with the units, and a tags file per set of installed dialectes.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	FILE_ID_SEPARATOR,
	INDEX_FILES,
	JSON_EXTENSION,
	LINES_EXTENSION,
	LINES_FOLDER,
	PER_FILE_PARTS,
	TAGS_FILE_PREFIX,
	TEMPORARY_INFIX,
} from './standard-cache.constants.ts'

import type {
	StandardIndexFolderContent,
	StandardIndexParts,
	StandardManifest,
	StandardPerFile,
	StandardTagsFile,
	StandardWordsFile,
} from './standard-cache.types.ts'
import type { StandardFileIndex, StandardLogicalLine } from './standard-index.types.ts'
import type { StandardSearchIndex } from './standard-search.types.ts'

/** Writes every file of an index folder but the tags file; the manifest last. */
export function writeIndexFolder(params: {
	folder: string
	manifest: StandardManifest
	search: StandardSearchIndex
}): void {
	const { folder, manifest, search } = params
	mkdirSync(join(folder, LINES_FOLDER), { recursive: true })
	for (const file of search.files)
		writeFileSync(
			linesPathOf({ folder, fileId: file.fileId }),
			file.logicalLines.map((line) => `${JSON.stringify(line)}\n`).join(''),
		)
	const parts: StandardIndexParts = {
		quality: perFile({
			files: search.files,
			value: (file) => ({ ...file.quality, noiseRanges: file.noiseRanges }),
		}),
		headings: perFile({ files: search.files, value: (file) => file.headings }),
		definitions: perFile({ files: search.files, value: (file) => file.definitions }),
		tables: perFile({ files: search.files, value: (file) => file.tables }),
		crossReferences: perFile({ files: search.files, value: (file) => file.crossReferences }),
	}
	for (const part of PER_FILE_PARTS)
		writeJson({ path: join(folder, INDEX_FILES[part]), content: parts[part] })
	const words: StandardWordsFile = {
		words: search.words,
		units: search.units,
		lineUnits: search.lineUnits,
	}
	writeJson({ path: join(folder, INDEX_FILES.words), content: words })
	writeJson({ path: join(folder, INDEX_FILES.manifest), content: manifest })
}

/** Whether a folder holds a complete index: its manifest is written last. */
export function isCompleteIndexFolder(params: { folder: string }): boolean {
	return existsSync(join(params.folder, INDEX_FILES.manifest))
}

/** The manifest, the files and the word index of an index folder, read back in the manifest's order. */
export function readIndexFolder(params: { folder: string }): StandardIndexFolderContent {
	const { folder } = params
	const manifest = readJson<StandardManifest>({ path: join(folder, INDEX_FILES.manifest) })
	const parts: StandardIndexParts = {
		quality: readJson({ path: join(folder, INDEX_FILES.quality) }),
		headings: readJson({ path: join(folder, INDEX_FILES.headings) }),
		definitions: readJson({ path: join(folder, INDEX_FILES.definitions) }),
		tables: readJson({ path: join(folder, INDEX_FILES.tables) }),
		crossReferences: readJson({ path: join(folder, INDEX_FILES.crossReferences) }),
	}
	const files = manifest.files.map((entry): StandardFileIndex => {
		const { noiseRanges, ...quality } = parts.quality[entry.id]
		return {
			fileId: entry.id,
			lineCount: entry.lines,
			logicalLines: readLines({ folder, fileId: entry.id }),
			noiseRanges,
			headings: parts.headings[entry.id],
			definitions: parts.definitions[entry.id],
			tables: parts.tables[entry.id],
			crossReferences: parts.crossReferences[entry.id],
			quality,
		}
	})
	return { manifest, files, words: readJson({ path: join(folder, INDEX_FILES.words) }) }
}

/** The tags file of an index folder for an installed hash. */
export function tagsPathOf(params: { folder: string; installedHash: string }): string {
	return join(params.folder, `${TAGS_FILE_PREFIX}${params.installedHash}${JSON_EXTENSION}`)
}

/** Writes a tags file whole: into a temporary file beside it, then renamed into place. */
export function writeTagsFile(params: { path: string; content: StandardTagsFile }): void {
	const temporary = `${params.path}${TEMPORARY_INFIX}${process.pid}`
	writeJson({ path: temporary, content: params.content })
	renameSync(temporary, params.path)
}

export function readTagsFile(params: { path: string }): StandardTagsFile {
	return readJson({ path: params.path })
}

function linesPathOf(params: { folder: string; fileId: string }): string {
	const name = params.fileId.slice(params.fileId.indexOf(FILE_ID_SEPARATOR) + 1)
	return join(params.folder, LINES_FOLDER, `${name}${LINES_EXTENSION}`)
}

function readLines(params: { folder: string; fileId: string }): StandardLogicalLine[] {
	return readFileSync(linesPathOf(params), 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as StandardLogicalLine)
}

function perFile<Value>(params: {
	files: StandardFileIndex[]
	value: (file: StandardFileIndex) => Value
}): StandardPerFile<Value> {
	return Object.fromEntries(params.files.map((file) => [file.fileId, params.value(file)]))
}

function writeJson(params: { path: string; content: unknown }): void {
	writeFileSync(params.path, `${JSON.stringify(params.content)}\n`)
}

function readJson<Content>(params: { path: string }): Content {
	return JSON.parse(readFileSync(params.path, 'utf8')) as Content
}
