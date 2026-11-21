/**
 * Which files of a package are Dialecte changes, the scope the test rules judge. A file is one when a rule takes it
 * and no exclusion leaves it out. Exclusions first: every file of the cli (the tool whose rules these are), and the
 * generated, declaration and config files. Then: the source of core or of a dialecte package (`src/`, the package
 * holding a generated definition there); a template's source in the create package (`templates/<name>/src/`); a
 * file with a value import of `@dialecte/core` or of an installed dialecte (its `dist` holds the generated
 * definition), any subpath; a file with a value import of a file of its own package that the import rule takes
 * directly (one level, a folder's index followed to what it re-exports). Type-only imports never count; files that
 * are not scripts (a `.vue` file) are not parsed.
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, posix, resolve, sep } from 'node:path'

import { readPackageJson } from '../package-json.ts'
import { SCRIPT_FILE_PATTERN } from './check-rules.constants.ts'
import {
	CLI_PACKAGE_NAME,
	CORE_PACKAGE_NAME,
	CREATE_PACKAGE_NAME,
	DIALECTE_SCOPE,
	DIST_DEFINITION_PATTERN,
	DIST_FOLDER,
	EXCLUDED_FILE_KINDS,
	INDEX_MODULE_PATTERN,
	NODE_MODULES_FOLDER,
	PACKAGE_SOURCE_PATTERN,
	SOURCE_DEFINITION_PATTERN,
	SOURCE_FOLDER,
	TEMPLATE_SOURCE_PATTERN,
} from './dialecte-change.constants.ts'
import { fileKindOf } from './file-kind.ts'
import { createImportReading, packagePathOf } from './import-reading.ts'

import ts from 'typescript'

import type {
	DialecteChangeReader,
	DialecteChangeContext,
	DialecteChangeVerdict,
	ModuleReference,
	PackageKind,
	PackageTree,
} from './dialecte-change.types.ts'
import type { ImportReading } from './import-reading.types.ts'

/**
 * The kind of the package at `root`, from its name and whether its `src` holds a generated definition: read from the
 * disk, or from `tree` when given (a commit's package.json and file set, relative to `root`).
 */
export function packageKindOf(params: { root: string; tree?: PackageTree }): PackageKind {
	const { tree } = params
	const { name } = tree === undefined ? readPackageJson(params.root) : (tree.packageJson ?? {})
	if (name === CORE_PACKAGE_NAME) return 'core'
	if (name === CREATE_PACKAGE_NAME) return 'create'
	if (name === CLI_PACKAGE_NAME) return 'cli'
	const holdsDefinition =
		tree === undefined
			? holdsFileMatching({
					folder: join(params.root, SOURCE_FOLDER),
					pattern: SOURCE_DEFINITION_PATTERN,
				})
			: [...tree.files].some(
					(file) =>
						file.startsWith(`${SOURCE_FOLDER}/`) &&
						SOURCE_DEFINITION_PATTERN.test(file.slice(SOURCE_FOLDER.length + 1)),
				)
	return holdsDefinition ? 'dialecte' : 'app'
}

/**
 * A reader of the package at `root`: the verdict of each file. What it reads is kept for the run: whether an
 * `@dialecte/*` package is installed with a definition, each file's imports, and the run's import reading (given to
 * share it with the unit context, else its own).
 */
export function createDialecteChangeReader(params: {
	root: string
	reading?: ImportReading
	/** The package as a commit holds it: its kind read from there, never the disk. */
	tree?: PackageTree
}): DialecteChangeReader {
	const root = resolve(params.root)
	const kind = packageKindOf({ root, ...(params.tree !== undefined && { tree: params.tree }) })
	const reading = params.reading ?? createImportReading({ root })
	const installedDialectes = new Map<string, boolean>()
	const valueReferences = new Map<string, ModuleReference[]>()
	const context: DialecteChangeContext = {
		root,
		kind,
		importsDialecte,
		valueReferencesOf,
		localFileOf: reading.localFileOf,
		sourceOf: reading.sourceOf,
	}
	return {
		kind,
		verdictOf(request) {
			return verdictOfFile({ context, ...request })
		},
	}

	function importsDialecte(specifier: string): boolean {
		const packageName = dialectePackageOf(specifier)
		if (packageName === undefined) return false
		if (packageName === CORE_PACKAGE_NAME) return true
		const known = installedDialectes.get(packageName)
		if (known !== undefined) return known
		const installed = isInstalledDialecte({ root, packageName })
		installedDialectes.set(packageName, installed)
		return installed
	}

	function valueReferencesOf(file: string): ModuleReference[] {
		const known = valueReferences.get(file)
		if (known !== undefined) return known
		const references = referencesOf({ context, file }).filter((reference) => reference.value)
		valueReferences.set(file, references)
		return references
	}
}

/** Whether `file` of the package at `root` is a Dialecte change, with the rule that decided it. */
export function isDialecteChange(params: { root: string; file: string }): DialecteChangeVerdict {
	return createDialecteChangeReader({ root: params.root }).verdictOf({ file: params.file })
}

function verdictOfFile(params: {
	context: DialecteChangeContext
	file: string
	sourceFile?: ts.SourceFile
}): DialecteChangeVerdict {
	const { context } = params
	const file = packagePathOf({ root: context.root, file: params.file })
	if (context.kind === 'cli') return { dialecteChange: false, rule: 'cli' }
	if (EXCLUDED_FILE_KINDS.has(fileKindOf(file))) return { dialecteChange: false, rule: 'file-kind' }
	const ownsSource = context.kind === 'core' || context.kind === 'dialecte'
	if (ownsSource && PACKAGE_SOURCE_PATTERN.test(file))
		return { dialecteChange: true, rule: 'package-source' }
	if (context.kind === 'create' && TEMPLATE_SOURCE_PATTERN.test(file))
		return { dialecteChange: true, rule: 'template' }
	const values = referencesOf({ context, file, sourceFile: params.sourceFile }).filter(
		(reference) => reference.value,
	)
	if (values.some((reference) => context.importsDialecte(reference.specifier)))
		return { dialecteChange: true, rule: 'import' }
	if (values.some((reference) => importsOwnChange({ context, from: file, reference })))
		return { dialecteChange: true, rule: 'own-import' }
	return { dialecteChange: false, rule: 'none' }
}

/** The modules a script file imports or re-exports; none for a file that is no script or cannot be read. */
function referencesOf(params: {
	context: DialecteChangeContext
	file: string
	sourceFile?: ts.SourceFile
}): ModuleReference[] {
	const { context, file } = params
	if (!SCRIPT_FILE_PATTERN.test(file)) return []
	const sourceFile = params.sourceFile ?? context.sourceOf(file)
	if (sourceFile === undefined) return []
	return sourceFile.statements.flatMap(referenceOf)
}

/** The module an import or re-export statement names; none for any other statement. */
function referenceOf(statement: ts.Statement): ModuleReference[] {
	if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier))
		return [
			{
				specifier: statement.moduleSpecifier.text,
				value: bringsValueImport(statement.importClause),
				reexport: false,
			},
		]
	if (
		ts.isExportDeclaration(statement) &&
		statement.moduleSpecifier !== undefined &&
		ts.isStringLiteral(statement.moduleSpecifier)
	)
		return [
			{
				specifier: statement.moduleSpecifier.text,
				value: bringsValueExport(statement),
				reexport: true,
			},
		]
	return []
}

/** An import brings a value unless it is `import type`, or each of its named specifiers is `type`. */
function bringsValueImport(clause: ts.ImportClause | undefined): boolean {
	if (clause === undefined) return true
	if (clause.isTypeOnly) return false
	if (clause.name !== undefined) return true
	const bindings = clause.namedBindings
	if (bindings === undefined || ts.isNamespaceImport(bindings)) return true
	return bindings.elements.length === 0 || bindings.elements.some((element) => !element.isTypeOnly)
}

/** A re-export brings a value unless it is `export type`, or each of its named specifiers is `type`. */
function bringsValueExport(declaration: ts.ExportDeclaration): boolean {
	if (declaration.isTypeOnly) return false
	const clause = declaration.exportClause
	if (clause === undefined || ts.isNamespaceExport(clause)) return true
	return clause.elements.length === 0 || clause.elements.some((element) => !element.isTypeOnly)
}

/** The `@dialecte/<name>` package a specifier names, any subpath of it; undefined outside the scope. */
function dialectePackageOf(specifier: string): string | undefined {
	if (!specifier.startsWith(DIALECTE_SCOPE)) return undefined
	return specifier.split('/').slice(0, 2).join('/')
}

/** The package as Node finds it (the nearest `node_modules` up from the root), its `dist` holding a definition. */
function isInstalledDialecte(params: { root: string; packageName: string }): boolean {
	let folder = params.root
	for (;;) {
		const installed = join(folder, NODE_MODULES_FOLDER, params.packageName)
		if (existsSync(installed))
			return holdsFileMatching({
				folder: join(installed, DIST_FOLDER),
				pattern: DIST_DEFINITION_PATTERN,
			})
		const parent = dirname(folder)
		if (parent === folder) return false
		folder = parent
	}
}

/** Whether a file under `folder` (at any depth) has a path from it matching `pattern`. */
function holdsFileMatching(params: { folder: string; pattern: RegExp }): boolean {
	if (!existsSync(params.folder)) return false
	return readdirSync(params.folder, { recursive: true, encoding: 'utf8' }).some((entry) =>
		params.pattern.test(entry.split(sep).join(posix.sep)),
	)
}

/** A value import of a file of the package that value-imports Dialecte itself (a folder's index followed). */
function importsOwnChange(params: {
	context: DialecteChangeContext
	from: string
	reference: ModuleReference
}): boolean {
	const { context } = params
	const target = context.localFileOf({ from: params.from, specifier: params.reference.specifier })
	return target !== undefined && takesDirectly({ context, file: target, visited: new Set() })
}

/**
 * Whether the file value-imports Dialecte itself; a folder's index also when a file it value-re-exports does (an
 * index of an index followed, each file once).
 */
function takesDirectly(params: {
	context: DialecteChangeContext
	file: string
	visited: ReadonlySet<string>
}): boolean {
	const { context, file } = params
	if (params.visited.has(file)) return false
	const references = context.valueReferencesOf(file)
	if (references.some((reference) => context.importsDialecte(reference.specifier))) return true
	if (!INDEX_MODULE_PATTERN.test(file)) return false
	const visited = new Set([...params.visited, file])
	return references.some(function reexportsChange(reference) {
		if (!reference.reexport) return false
		const target = context.localFileOf({ from: file, specifier: reference.specifier })
		return target !== undefined && takesDirectly({ context, file: target, visited })
	})
}
