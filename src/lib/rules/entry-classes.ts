/**
 * The classes a package's entries export: from the source of each `exports` entry, every exported name followed
 * through the package's own modules (`export *`, `export * as ns`, `export { a as b } from`, an imported name
 * exported again, `export default`), type-only exports included: a facade exported for its type is still the
 * package's public face. A module of another package ends the walk.
 */
import { readExportEntries } from '../skills/export-entries.ts'
import { classNameOf } from './class-name.ts'
import { ALL_EXPORTS, DEFAULT_EXPORT, STAR_EXPORTS } from './entry-classes.constants.ts'
import { unwrapped } from './syntax-nodes.ts'

import ts from 'typescript'

import type { EntryClasses, ExportRequest, ModuleName } from './entry-classes.types.ts'
import type { ImportReading } from './import-reading.types.ts'

/** The classes the entries of the package at `root` export; none for a package without a readable `exports` map. */
export function readEntryClasses(params: { root: string; reading: ImportReading }): EntryClasses {
	const { reading } = params
	const classes = new Map<string, Set<string>>()
	const asked = new Set<string>()
	const pending: ExportRequest[] = entrySourcesOf(params.root).map((file) => ({
		file,
		name: ALL_EXPORTS,
	}))
	for (let request = pending.pop(); request; request = pending.pop()) {
		const key = `${request.file}\0${request.name}`
		if (asked.has(key)) continue
		asked.add(key)
		const source = reading.sourceOf(request.file)
		if (source === undefined) continue
		const answer = answerOf({ request, source, reading })
		for (const name of answer.classes) {
			const names = classes.get(request.file) ?? new Set<string>()
			names.add(name)
			classes.set(request.file, names)
		}
		pending.push(...answer.next)
	}
	return classes
}

function entrySourcesOf(root: string): string[] {
	try {
		return readExportEntries({ root }).map((entry) => entry.source)
	} catch {
		// no package.json, or an entry without its source: no entry admits a class
		return []
	}
}

/** What one module answers to a name asked of it: the classes of its own it exports by that name, and where else to ask. */
function answerOf(params: {
	request: ExportRequest
	source: ts.SourceFile
	reading: ImportReading
}): { classes: string[]; next: ExportRequest[] } {
	const { request, source, reading } = params
	function wanted(name: string): boolean {
		if (request.name === STAR_EXPORTS) return name !== DEFAULT_EXPORT
		return request.name === ALL_EXPORTS || request.name === name
	}
	const classes: string[] = []
	const next: ExportRequest[] = []
	function follow(params: { specifier: string; name: string }): void {
		const file = reading.localFileOf({ specifier: params.specifier, from: request.file })
		if (file !== undefined) next.push({ file, name: params.name })
	}
	function local(name: string): void {
		const found = localOf({ source, name })
		if (found?.kind === 'class') classes.push(found.name)
		if (found?.kind === 'import') follow(found)
	}
	for (const statement of source.statements) {
		if (ts.isClassDeclaration(statement) && isExportedDeclaration(statement)) {
			const exported = isDefault(statement) ? DEFAULT_EXPORT : classNameOf(statement)
			if (wanted(exported)) classes.push(classNameOf(statement))
		}
		if (ts.isVariableStatement(statement) && isExportedDeclaration(statement))
			for (const declaration of statement.declarationList.declarations)
				if (ts.isIdentifier(declaration.name) && wanted(declaration.name.text))
					local(declaration.name.text)
		if (
			ts.isTypeAliasDeclaration(statement) &&
			hasModifier({ node: statement, kind: ts.SyntaxKind.ExportKeyword }) &&
			wanted(statement.name.text)
		)
			local(statement.name.text)
		if (ts.isExportAssignment(statement) && !statement.isExportEquals && wanted(DEFAULT_EXPORT)) {
			const expression = statement.expression
			if (ts.isIdentifier(expression)) local(expression.text)
		}
		if (!ts.isExportDeclaration(statement)) continue
		const specifier =
			statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
				? statement.moduleSpecifier.text
				: undefined
		const clause = statement.exportClause
		if (clause === undefined) {
			// `export *` never re-exports a default
			if (specifier !== undefined && request.name !== DEFAULT_EXPORT)
				follow({ specifier, name: request.name === ALL_EXPORTS ? STAR_EXPORTS : request.name })
			continue
		}
		if (ts.isNamespaceExport(clause)) {
			if (specifier !== undefined && wanted(clause.name.text))
				follow({ specifier, name: ALL_EXPORTS })
			continue
		}
		for (const element of clause.elements) {
			if (!wanted(element.name.text)) continue
			const original = (element.propertyName ?? element.name).text
			if (specifier === undefined) local(original)
			else follow({ specifier, name: original })
		}
	}
	return { classes, next }
}

/**
 * What a module-level name is: a class declared there (or a class expression a variable holds), an imported name
 * (followed to the module it comes from), a const or a type alias naming another of them (`const Store = Memory`,
 * `type Facade = Impl<T>`), followed until a class or an import, each name once; else nothing a class rule cares for.
 */
function localOf(params: {
	source: ts.SourceFile
	name: string
	followed?: ReadonlySet<string>
}): ModuleName | undefined {
	const { source, name } = params
	if (params.followed?.has(name)) return undefined
	const followed = new Set([...(params.followed ?? []), name])
	for (const statement of source.statements) {
		if (ts.isClassDeclaration(statement) && statement.name?.text === name)
			return { kind: 'class', name }
		if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) {
			const named = ts.isTypeReferenceNode(statement.type) ? statement.type.typeName : undefined
			return named && ts.isIdentifier(named)
				? localOf({ source, name: named.text, followed })
				: undefined
		}
		if (ts.isVariableStatement(statement))
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue
				const initializer = declaration.initializer && unwrapped(declaration.initializer)
				if (initializer && ts.isClassExpression(initializer))
					return { kind: 'class', name: classNameOf(initializer) }
				return initializer && ts.isIdentifier(initializer)
					? localOf({ source, name: initializer.text, followed })
					: undefined
			}
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue
		const imported = importedNameOf({ clause: statement.importClause, name })
		if (imported !== undefined)
			return { kind: 'import', specifier: statement.moduleSpecifier.text, name: imported }
	}
	return undefined
}

/** The name `name` is imported by (`default`, `*` for a namespace, the original of an alias); undefined when not. */
function importedNameOf(params: {
	clause: ts.ImportClause | undefined
	name: string
}): string | undefined {
	const { clause, name } = params
	if (clause === undefined) return undefined
	if (clause.name?.text === name) return DEFAULT_EXPORT
	const bindings = clause.namedBindings
	if (bindings === undefined) return undefined
	if (ts.isNamespaceImport(bindings)) return bindings.name.text === name ? ALL_EXPORTS : undefined
	const element = bindings.elements.find((candidate) => candidate.name.text === name)
	return element && (element.propertyName ?? element.name).text
}

function isExportedDeclaration(node: ts.ClassDeclaration | ts.VariableStatement): boolean {
	return hasModifier({ node, kind: ts.SyntaxKind.ExportKeyword })
}

function isDefault(node: ts.ClassDeclaration): boolean {
	return hasModifier({ node, kind: ts.SyntaxKind.DefaultKeyword })
}

function hasModifier(params: {
	node: ts.ClassDeclaration | ts.VariableStatement | ts.TypeAliasDeclaration
	kind: ts.SyntaxKind
}): boolean {
	return (ts.getModifiers(params.node) ?? []).some((modifier) => modifier.kind === params.kind)
}
