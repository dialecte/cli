/**
 * `shared-export-changed`: a function another folder imports (a sub-folder is another folder) that the change newly
 * shares, re-signs (its parameters, return annotation, or a sibling `*.types.ts` type they name), changes the body of,
 * or removes. Importers are read through the static imports and re-exports of each side, a barrel followed one level.
 */
import { posix } from 'node:path'

import { TYPES_FILE_PATTERN } from './quality.constants.ts'

import type { FileFacts, FunctionFacts } from '../api/source-functions.types.ts'
import type {
	ChangeFacts,
	Importers,
	SharedExportSides,
	ResolveSpecifier,
	SharedExportChange,
	SharedExportChangeKind,
} from './quality.types.ts'

/**
 * The shared exports `change` changes, sorted by file, line and name; `resolveTree` and `resolveBase` resolve
 * specifiers over each side's files.
 *
 * @intent list the exports other folders depend on that the change touches
 * @internal
 */
export function findSharedExportChanges(params: {
	change: ChangeFacts
	resolveTree: ResolveSpecifier
	resolveBase: ResolveSpecifier
}): SharedExportChange[] {
	const { change } = params
	const baseFiles = baseFilesOf(change)
	const treeImporters = importersOf({ files: change.tree, resolve: params.resolveTree })
	const baseImporters = importersOf({ files: baseFiles, resolve: params.resolveBase })
	const changedTypes = changedTypesOf(change)
	const sides = { change, baseFiles, treeImporters, baseImporters, changedTypes }
	return [
		...treeExportChanges(sides),
		...removedExports({ ...sides, resolveBase: params.resolveBase }),
	].sort(compareChanges)
}

/** Every file of the base: the base side of the changed paths, and each untouched tree file as it is (the same at the base). */
function baseFilesOf(change: ChangeFacts): Map<string, FileFacts> {
	const touched = new Set(
		change.changed.flatMap((path) =>
			path.state === 'renamed' ? [path.path, path.from] : [path.path],
		),
	)
	return new Map([...[...change.tree].filter(([file]) => !touched.has(file)), ...change.base])
}

/**
 * The importers of each export of `files`: a file importing it by name; a file importing it through a barrel that
 * re-exports it (one level). Re-exports count as importers too (the barrel imports what it re-exports).
 */
function importersOf(params: {
	files: ReadonlyMap<string, FileFacts>
	resolve: ResolveSpecifier
}): Importers {
	const { files, resolve } = params
	const importers = new Map<string, { file: string; line: number }[]>()
	function add(params: { exporter: string; name: string; file: string; line: number }): void {
		const key = `${params.exporter}#${params.name}`
		importers.set(key, [...(importers.get(key) ?? []), { file: params.file, line: params.line }])
	}
	for (const [file, facts] of files)
		for (const found of facts.imports) {
			const exporter = resolve({ from: file, specifier: found.specifier })
			if (exporter === undefined) continue
			for (const name of found.names) {
				add({ exporter, name: name.imported, file, line: found.line })
				// through a barrel: the module the barrel re-exports the name from
				for (const origin of reexportOriginsOf({
					barrel: exporter,
					name: name.imported,
					files,
					resolve,
				}))
					add({ exporter: origin, name: name.imported, file, line: found.line })
			}
		}
	return importers
}

/** The files `barrel` re-exports `name` from: a named re-export of it, or an `export *`. */
function reexportOriginsOf(params: {
	barrel: string
	name: string
	files: ReadonlyMap<string, FileFacts>
	resolve: ResolveSpecifier
}): string[] {
	const facts = params.files.get(params.barrel)
	if (facts === undefined) return []
	return facts.imports
		.filter(
			(found) =>
				found.reexport &&
				(found.all === true || found.names.some((name) => name.local === params.name)),
		)
		.flatMap((found) => {
			const origin = params.resolve({ from: params.barrel, specifier: found.specifier })
			return origin === undefined ? [] : [origin]
		})
}

/** The importers of `name` exported by `exporter` that sit in another folder. */
function foreignImporters(params: {
	importers: Importers
	exporter: string
	name: string
}): { file: string; line: number }[] {
	const folder = posix.dirname(params.exporter)
	return (params.importers.get(`${params.exporter}#${params.name}`) ?? []).filter(
		(importer) => posix.dirname(importer.file) !== folder,
	)
}

/** The folders of `importers`, each once, sorted. */
function foldersOf(importers: readonly { file: string }[]): string[] {
	return [...new Set(importers.map((importer) => posix.dirname(importer.file)))].sort()
}

/** The type names each changed `*.types.ts` declares differently from the base (added, removed or re-declared), by folder. */
function changedTypesOf(change: ChangeFacts): Map<string, Set<string>> {
	const byFolder = new Map<string, Set<string>>()
	for (const path of change.changed) {
		if (!TYPES_FILE_PATTERN.test(path.path)) continue
		const tree = change.tree.get(path.path)?.types ?? []
		const base = change.base.get(path.state === 'renamed' ? path.from : path.path)?.types ?? []
		const hashes = new Map(base.map((declared) => [declared.name, declared.hash]))
		const names = [
			...tree
				.filter((declared) => hashes.get(declared.name) !== declared.hash)
				.map((declared) => declared.name),
			...base
				.filter((declared) => !tree.some((kept) => kept.name === declared.name))
				.map((declared) => declared.name),
		]
		const folder = posix.dirname(path.path)
		byFolder.set(folder, new Set([...(byFolder.get(folder) ?? []), ...names]))
	}
	return byFolder
}

/**
 * The tree's exports that are shared on either side and changed: in a changed file (newly shared, signature, body), or
 * in an untouched file whose signature names a type a sibling `*.types.ts` changed.
 */
function treeExportChanges(sides: SharedExportSides): SharedExportChange[] {
	const fromOf = new Map(
		sides.change.changed.flatMap((path) => {
			if (path.state === 'renamed') return [[path.path, path.from] as const]
			return path.state === 'deleted' ? [] : [[path.path, path.path] as const]
		}),
	)
	return [...sides.change.tree].flatMap(function changesOfFile([file, facts]) {
		const basePath = fromOf.get(file)
		const typesChanged = sides.changedTypes.get(posix.dirname(file)) ?? new Set<string>()
		if (basePath === undefined && typesChanged.size === 0) return []
		const base = basePath === undefined ? facts : sides.baseFiles.get(basePath)
		return facts.functions.flatMap((tree) =>
			tree.exportedAs.flatMap((name) => {
				const before = base?.functions.find((found) => found.exportedAs.includes(name))
				const changes = changesOf({ tree, before, typesChanged })
				const treeForeign = foreignImporters({
					importers: sides.treeImporters,
					exporter: file,
					name,
				})
				const baseForeign =
					basePath === undefined
						? treeForeign
						: foreignImporters({ importers: sides.baseImporters, exporter: basePath, name })
				const all: SharedExportChangeKind[] = [
					...(treeForeign.length > 0 && (before === undefined || baseForeign.length === 0)
						? (['newly-shared'] as const)
						: []),
					...changes,
				]
				if (all.length === 0 || (treeForeign.length === 0 && baseForeign.length === 0)) return []
				return [
					{
						file,
						line: tree.line,
						name,
						folder: posix.dirname(file),
						importers: foldersOf(treeForeign.length ? treeForeign : baseForeign),
						changes: all,
					},
				]
			}),
		)
	})
}

/** The signature and behaviour changes of `tree` since `before`; none without a base function. */
function changesOf(params: {
	tree: FunctionFacts
	before: FunctionFacts | undefined
	typesChanged: ReadonlySet<string>
}): SharedExportChangeKind[] {
	const { tree, before } = params
	if (before === undefined) return []
	const signature =
		tree.signatureHash !== before.signatureHash ||
		tree.signatureTypes.some((name) => params.typesChanged.has(name))
	return [
		...(signature ? (['signature'] as const) : []),
		...(tree.bodyHash !== before.bodyHash ? (['behaviour'] as const) : []),
	]
}

/**
 * The base's shared exports of the changed paths that the tree no longer exports: on the first importer still
 * importing the name (a broken import), else on the exporter's first line.
 */
function removedExports(
	sides: SharedExportSides & { resolveBase: ResolveSpecifier },
): SharedExportChange[] {
	return sides.change.changed.flatMap(function removedOfPath(path) {
		if (path.state === 'added') return []
		const basePath = path.state === 'renamed' ? path.from : path.path
		const treePath = path.state === 'deleted' ? undefined : path.path
		const base = sides.change.base.get(basePath)
		const tree = treePath === undefined ? undefined : sides.change.tree.get(treePath)
		return (base?.functions ?? []).flatMap((before) =>
			before.exportedAs.flatMap((name): SharedExportChange[] => {
				if (tree?.functions.some((kept) => kept.exportedAs.includes(name))) return []
				const baseForeign = foreignImporters({
					importers: sides.baseImporters,
					exporter: basePath,
					name,
				})
				if (baseForeign.length === 0) return []
				const still = stillImporting({ sides, basePath, name })
				return [
					{
						file: still?.file ?? treePath ?? basePath,
						line: still?.line ?? 1,
						name,
						folder: posix.dirname(basePath),
						importers: foldersOf(baseForeign),
						changes: ['removed'],
					},
				]
			}),
		)
	})
}

/** The first tree file (by path) whose import of `name` resolves, at the base, to `basePath`; with that import's line. */
function stillImporting(params: {
	sides: SharedExportSides & { resolveBase: ResolveSpecifier }
	basePath: string
	name: string
}): { file: string; line: number } | undefined {
	const files = [...params.sides.change.tree].sort(([first], [second]) =>
		first.localeCompare(second),
	)
	for (const [file, facts] of files)
		for (const found of facts.imports) {
			if (found.reexport || !found.names.some((name) => name.imported === params.name)) continue
			if (params.sides.resolveBase({ from: file, specifier: found.specifier }) === params.basePath)
				return { file, line: found.line }
		}
	return undefined
}

/** By file, then line, then name. */
function compareChanges(first: SharedExportChange, second: SharedExportChange): number {
	return (
		first.file.localeCompare(second.file) ||
		first.line - second.line ||
		first.name.localeCompare(second.name)
	)
}
