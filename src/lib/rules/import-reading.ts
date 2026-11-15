/**
 * One run's reading of a package's imports: one module resolver, each resolution and each file's syntax tree read
 * once, shared by the Dialecte-change scope and the unit context.
 */
import { readFileSync } from 'node:fs'
import { join, posix, relative, resolve, sep } from 'node:path'

import { createModuleResolver } from '../tdd/module-resolver.ts'

import ts from 'typescript'

import type { ModuleResolver } from '../tdd/tdd.types.ts'
import type { ImportReading } from './import-reading.types.ts'

/** A reading of the package at `root` for one run: the resolver, resolutions and trees are kept for the run. */
export function createImportReading(params: { root: string }): ImportReading {
	const root = resolve(params.root)
	let resolver: ModuleResolver | undefined
	const resolutions = new Map<string, string | undefined>()
	const sources = new Map<string, ts.SourceFile | undefined>()
	return {
		localFileOf(request) {
			const key = `${request.from}\0${request.specifier}`
			if (resolutions.has(key)) return resolutions.get(key)
			resolver ??= createModuleResolver({ root })
			const resolution = resolver(request)
			const file =
				resolution.kind === 'local' ? resolution.file.split(sep).join(posix.sep) : undefined
			resolutions.set(key, file)
			return file
		},
		sourceOf(file) {
			const path = packagePathOf({ root, file })
			if (!sources.has(path)) sources.set(path, parsedFileOf({ root, file: path }))
			return sources.get(path)
		},
		sourceOfText({ file, text }) {
			const path = packagePathOf({ root, file })
			const kept = sources.get(path)
			if (kept !== undefined && kept.text === text) return kept
			const sourceFile = parsedTextOf({ file, text })
			sources.set(path, sourceFile)
			return sourceFile
		},
	}
}

/** The file as a path from the package root, with `/` separators. */
export function packagePathOf(params: { root: string; file: string }): string {
	return relative(params.root, resolve(params.root, params.file)).split(sep).join(posix.sep)
}

/** The file's syntax tree; undefined for a file that cannot be read. */
function parsedFileOf(params: { root: string; file: string }): ts.SourceFile | undefined {
	let text: string
	try {
		text = readFileSync(join(params.root, params.file), 'utf8')
	} catch {
		return undefined
	}
	return parsedTextOf({ file: params.file, text })
}

/** The syntax tree of a file's text, with parent nodes set. */
function parsedTextOf(params: { file: string; text: string }): ts.SourceFile {
	return ts.createSourceFile(params.file, params.text, ts.ScriptTarget.Latest, true)
}
