/**
 * What a test file's imports are in a real run: the unit context (core's namespaces, and what each name the file
 * value-imports from its own package is), the names it imports that are XML literals in their module, and the
 * `.xml?raw` fixture files it reads. A name is followed through `index.ts` re-exports (named, `as` aliases,
 * `export *`) to the file that declares it: a file under a folder the package declares production for its tests
 * (`dialecte.tdd.production`), test code (a test file, a helper in a test or fixture folder), a file importing
 * vitest, or a file that value-imports one of those (one level) is test support; any other file of the package is the
 * code under test. Every import declaration that is not type-only counts for that one level: named, default,
 * namespace and side-effect-only (`import './setup.ts'`), test code included as a target; `import x = require()` and
 * dynamic `import()` are not read (the packages are ESM).
 */
import { readPackageJson } from '../package-json.ts'
import { isTestCode, productionFolderOf } from '../tdd/tdd-files.ts'
import { VITEST_PACKAGE } from '../tdd/tdd.constants.ts'
import { INDEX_MODULE_PATTERN } from './dialecte-change.constants.ts'
import { isExported, unwrapped } from './syntax-nodes.ts'
import { DEFAULT_EXPORT_NAME } from './unit-context.constants.ts'
import { RAW_XML_IMPORT_PATTERN } from './xml-literals.constants.ts'
import { isXmlLiteral } from './xml-literals.ts'

import ts from 'typescript'

import type { ImportReading } from './import-reading.types.ts'
import type { OwnImportKind, UnitContextReader, ValueImport } from './unit-context.types.ts'

/**
 * A reader for the package at `root` over the run's import reading (shared with the Dialecte-change scope): each own
 * file's kind is read once per run.
 */
export function createUnitContextReader(params: {
	root: string
	coreGroups: ReadonlySet<string>
	reading: ImportReading
}): UnitContextReader {
	const { coreGroups, reading } = params
	const kinds = new Map<string, OwnImportKind>()
	const directKinds = new Map<string, OwnImportKind>()
	return {
		unitsOf({ file, sourceFile }) {
			const ownImports = new Map<string, OwnImportKind>()
			for (const imported of valueImportsOf(sourceFile)) {
				const target = reading.localFileOf({ specifier: imported.specifier, from: file })
				if (target === undefined) continue
				const origin = originOf({ reading, file: target, name: imported.imported })
				ownImports.set(imported.name, kindOf(origin))
			}
			return { coreGroups, ownImports }
		},
		xmlImportsOf({ file, sourceFile }) {
			return new Set(
				valueImportsOf(sourceFile)
					.filter((imported) => isImportedXml({ reading, from: file, imported }))
					.map((imported) => imported.name),
			)
		},
		rawFixturesOf({ file, sourceFile }) {
			return valueImportsOf(sourceFile)
				.filter((imported) => RAW_XML_IMPORT_PATTERN.test(imported.specifier))
				.flatMap((imported) => {
					const target = reading.localFileOf({ specifier: imported.specifier, from: file })
					return target === undefined ? [] : [target]
				})
		},
	}

	function kindOf(file: string): OwnImportKind {
		const known = kinds.get(file)
		if (known !== undefined) return known
		const kind =
			directKindOf(file) === 'test-support' || importsTestSupport(file) ? 'test-support' : 'unit'
		kinds.set(file, kind)
		return kind
	}

	/** Whether the file value-imports a file that is test support by itself (one level, never followed further). */
	function importsTestSupport(file: string): boolean {
		return valueImportSpecifiersOf(reading.sourceOf(file)).some((specifier) => {
			const target = reading.localFileOf({ specifier, from: file })
			return target !== undefined && directKindOf(target) === 'test-support'
		})
	}

	/** The file's kind by itself (its folder, its name, its vitest import), its imports not read. */
	function directKindOf(file: string): OwnImportKind {
		const kind = directKinds.get(file) ?? ownFileKindOf({ root: params.root, file, reading })
		directKinds.set(file, kind)
		return kind
	}
}

/**
 * The names a file value-imports (a default import, the named imports not marked `type`), as imported and as named;
 * none for a file that cannot be read.
 */
function valueImportsOf(sourceFile: ts.SourceFile | undefined): ValueImport[] {
	return (sourceFile?.statements ?? []).flatMap((statement) => {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			return []
		const clause = statement.importClause
		if (clause === undefined || clause.isTypeOnly) return []
		const specifier = statement.moduleSpecifier.text
		const bindings = clause.namedBindings
		const named =
			bindings !== undefined && ts.isNamedImports(bindings)
				? bindings.elements
						.filter((element) => !element.isTypeOnly)
						.map((element) => ({
							name: element.name.text,
							imported: (element.propertyName ?? element.name).text,
							specifier,
						}))
				: []
		const byDefault =
			clause.name === undefined
				? []
				: [{ name: clause.name.text, imported: DEFAULT_EXPORT_NAME, specifier }]
		return [...byDefault, ...named]
	})
}

/**
 * The specifier of every import declaration of a file that is not type-only: named, default, namespace and
 * side-effect-only (`import './setup.ts'`); a named import whose every binding is marked `type` is type-only. None
 * for a file that cannot be read.
 */
function valueImportSpecifiersOf(sourceFile: ts.SourceFile | undefined): string[] {
	return (sourceFile?.statements ?? []).flatMap((statement) =>
		ts.isImportDeclaration(statement) &&
		ts.isStringLiteral(statement.moduleSpecifier) &&
		!isTypeOnlyImport(statement.importClause)
			? [statement.moduleSpecifier.text]
			: [],
	)
}

/** Whether an import clause brings in types only (`import type`, or named bindings all marked `type`). */
function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
	if (clause === undefined) return false
	if (clause.isTypeOnly) return true
	const bindings = clause.namedBindings
	return (
		clause.name === undefined &&
		bindings !== undefined &&
		ts.isNamedImports(bindings) &&
		bindings.elements.length > 0 &&
		bindings.elements.every((element) => element.isTypeOnly)
	)
}

/**
 * The file that declares `name` for an importer of `file`: through an index's named re-export (its `as` alias
 * followed) or `export *` of a file exporting it, each index once; else the file itself.
 */
function originOf(params: {
	reading: ImportReading
	file: string
	name: string
	visited?: ReadonlySet<string>
}): string {
	const { reading, file, name } = params
	if (!INDEX_MODULE_PATTERN.test(file) || params.visited?.has(file)) return file
	const visited = new Set([...(params.visited ?? []), file])
	for (const reexport of reexportsOf({ reading, file })) {
		const target = reading.localFileOf({ specifier: reexport.specifier, from: file })
		if (target === undefined) continue
		const clause = reexport.declaration.exportClause
		if (clause === undefined && exportsName({ reading, file: target, name, visited }))
			return originOf({ reading, file: target, name, visited })
		if (clause === undefined || !ts.isNamedExports(clause)) continue
		const element = clause.elements.find(
			(candidate) => !candidate.isTypeOnly && candidate.name.text === name,
		)
		if (element)
			return originOf({
				reading,
				file: target,
				name: (element.propertyName ?? element.name).text,
				visited,
			})
	}
	return file
}

/** Whether the file exports `name`: declared there, named in an export list, or through an index's `export *`. */
function exportsName(params: {
	reading: ImportReading
	file: string
	name: string
	visited: ReadonlySet<string>
}): boolean {
	const { reading, file, name } = params
	const source = reading.sourceOf(file)
	if (source === undefined || params.visited.has(file)) return false
	if (source.statements.some((statement) => declaredExportsOf(statement).includes(name)))
		return true
	if (!INDEX_MODULE_PATTERN.test(file)) return false
	const visited = new Set([...params.visited, file])
	return reexportsOf({ reading, file }).some((reexport) => {
		if (reexport.declaration.exportClause !== undefined) return false
		const target = reading.localFileOf({ specifier: reexport.specifier, from: file })
		return target !== undefined && exportsName({ reading, file: target, name, visited })
	})
}

/** The names a statement exports: an exported declaration's, or those of an export list (`export { a as b }` → b). */
function declaredExportsOf(statement: ts.Statement): string[] {
	if (ts.isExportDeclaration(statement)) {
		const clause = statement.exportClause
		return clause !== undefined && ts.isNamedExports(clause)
			? clause.elements.map((element) => element.name.text)
			: []
	}
	if (ts.isVariableStatement(statement))
		return statement.declarationList.declarations.flatMap((declaration) =>
			ts.isIdentifier(declaration.name) && isExported(declaration) ? [declaration.name.text] : [],
		)
	const declared =
		ts.isFunctionDeclaration(statement) ||
		ts.isClassDeclaration(statement) ||
		ts.isEnumDeclaration(statement)
	return declared && statement.name !== undefined && isExported(statement)
		? [statement.name.text]
		: []
}

/** The value re-exports from a module (`export { … } from`, `export * from`) of the file. */
function reexportsOf(params: {
	reading: ImportReading
	file: string
}): { declaration: ts.ExportDeclaration; specifier: string }[] {
	const source = params.reading.sourceOf(params.file)
	return (source?.statements ?? []).flatMap((statement) =>
		ts.isExportDeclaration(statement) &&
		!statement.isTypeOnly &&
		statement.moduleSpecifier !== undefined &&
		ts.isStringLiteral(statement.moduleSpecifier)
			? [{ declaration: statement, specifier: statement.moduleSpecifier.text }]
			: [],
	)
}

/** Whether the imported name is a `const` of its module (one level, no re-export followed) holding an XML literal. */
function isImportedXml(params: {
	reading: ImportReading
	from: string
	imported: ValueImport
}): boolean {
	const { reading, imported } = params
	if (RAW_XML_IMPORT_PATTERN.test(imported.specifier)) return false
	const target = reading.localFileOf({ specifier: imported.specifier, from: params.from })
	const source = target === undefined ? undefined : reading.sourceOf(target)
	return (source?.statements ?? []).some(
		(statement) =>
			ts.isVariableStatement(statement) &&
			statement.declarationList.declarations.some(
				(declaration) =>
					isExported(declaration) &&
					ts.isIdentifier(declaration.name) &&
					declaration.name.text === imported.imported &&
					declaration.initializer !== undefined &&
					isXmlLiteral(unwrapped(declaration.initializer)),
			),
	)
}

/**
 * Test support by itself: a file under a folder the package declares production for its tests, test code, or a
 * file importing vitest; any other file is the code under test.
 */
function ownFileKindOf(params: {
	root: string
	file: string
	reading: ImportReading
}): OwnImportKind {
	const { file } = params
	const declared = productionFolderOf({ file, packageJson: readPackageJson(params.root) })
	return declared !== undefined || isTestCode(file) || importsVitest(params.reading.sourceOf(file))
		? 'test-support'
		: 'unit'
}

/** Whether the file imports vitest; false for a file that cannot be read. */
function importsVitest(source: ts.SourceFile | undefined): boolean {
	return (source?.statements ?? []).some(
		(statement) =>
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === VITEST_PACKAGE,
	)
}
