/**
 * The facts of one source file the base-aware rules compare, read from its syntax tree alone (no type checker) and
 * free of its path: what a function reads (its read keys), the functions it calls by name, its tokens hashed (format
 * and comments ignored), and the file's imports and declared types.
 */
import { createHash } from 'node:crypto'

import {
	ATTRIBUTE_BINDING_PATTERN,
	ATTRIBUTE_READERS,
	ITERATING_METHODS,
	NAMED_SET_PATTERN,
	TAG_PROPERTIES,
	TOKEN_SEPARATOR,
} from './read-keys.constants.ts'

import ts from 'typescript'

import type { CallFacts, ImportFacts, ReadKeys, TypeFacts } from './source-functions.types.ts'

/**
 * The keys `node` reads: the elements it names, the attributes it reads, the named sets it reads through (a constant
 * of `lists`, the file's lists of string literals, gives its names instead). Each sorted, each once.
 *
 * @intent tell what a function reads, to find another function that already reads it
 * @internal
 */
export function readKeysOf(params: {
	node: ts.Node
	lists: ReadonlyMap<string, readonly string[]>
}): ReadKeys {
	const elements = new Set<string>()
	const attributes = new Set<string>()
	const sets = new Set<string>()
	const bindings = attributeBindingsOf(params.node)
	let readsAttributes = false
	function visit(node: ts.Node): void {
		elementOf(node)?.forEach((element) => elements.add(element))
		if (ts.isCallExpression(node) && isAttributeReader(node)) {
			readsAttributes = true
			for (const argument of node.arguments)
				attributesOfArgument(argument).forEach((name) => attributes.add(name))
		}
		attributeOfAccess({ node, bindings })?.forEach((name) => attributes.add(name))
		const set = namedSetOf(node)
		if (set !== undefined) sets.add(set)
		ts.forEachChild(node, visit)
	}
	visit(params.node)
	const namedSets = readsAttributes ? [...sets] : []
	for (const set of namedSets) params.lists.get(set)?.forEach((name) => attributes.add(name))
	return {
		elements: [...elements].sort(),
		attributes: [...attributes].sort(),
		namedSets: namedSets.filter((set) => !params.lists.has(set)).sort(),
	}
}

/**
 * The functions `node` calls by a bare name, each once in the order first called, with the specifier of the import
 * that binds the name when one does; a method call (`x.y()`) is no call by name.
 *
 * @intent list what a function calls, so a call is never read as a duplicate
 * @internal
 */
export function callsOf(params: {
	node: ts.Node
	imported: ReadonlyMap<string, string>
}): CallFacts[] {
	const calls = new Map<string, CallFacts>()
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const name = node.expression.text
			const specifier = params.imported.get(name)
			if (!calls.has(name))
				calls.set(name, specifier === undefined ? { name } : { name, specifier })
		}
		ts.forEachChild(node, visit)
	}
	visit(params.node)
	return [...calls.values()]
}

/**
 * The tokens of `parts` hashed, comments, whitespace and semicolons left out: two texts a formatter makes equal hash
 * the same; with how many tokens they hold.
 *
 * @intent compare code by its tokens, never by its formatting
 * @internal
 */
export function tokenHashOf(params: { texts: readonly string[] }): { hash: string; count: number } {
	const tokens = params.texts.flatMap(tokensOf)
	return {
		hash: createHash('sha256').update(tokens.join(TOKEN_SEPARATOR)).digest('hex'),
		count: tokens.length,
	}
}

/**
 * The type names `nodes` reference (`Params`, `Result<Count>` gives `Result` and `Count`), each once, sorted.
 *
 * @intent tell which declared types a signature depends on
 * @internal
 */
export function typeReferencesOf(nodes: readonly ts.Node[]): string[] {
	const names = new Set<string>()
	function visit(node: ts.Node): void {
		if (ts.isTypeReferenceNode(node)) names.add(node.typeName.getText())
		ts.forEachChild(node, visit)
	}
	nodes.forEach(visit)
	return [...names].sort()
}

/**
 * The static imports and re-exports of `source`, type-only ones left out, in the order written.
 *
 * @intent list where a file's names come from and what it re-exports
 * @internal
 */
export function importsOf(source: ts.SourceFile): ImportFacts[] {
	return source.statements.flatMap(function importOf(statement): ImportFacts[] {
		const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1
		if (ts.isImportDeclaration(statement)) return importDeclarationOf({ statement, line })
		if (ts.isExportDeclaration(statement)) return exportDeclarationOf({ statement, line })
		return []
	})
}

/**
 * The type aliases and interfaces `source` declares at its top level, each with its tokens hashed.
 *
 * @intent tell when a declared type changed, formatting left aside
 * @internal
 */
export function typesOf(source: ts.SourceFile): TypeFacts[] {
	return source.statements.flatMap(function typeOf(statement): TypeFacts[] {
		if (!ts.isTypeAliasDeclaration(statement) && !ts.isInterfaceDeclaration(statement)) return []
		return [
			{ name: statement.name.text, hash: tokenHashOf({ texts: [statement.getText(source)] }).hash },
		]
	})
}

/**
 * The top-level constants of `source` whose value is a list of string literals (`as const` or not): name to names.
 *
 * @intent expand a constant of attribute names into the names it lists
 * @internal
 */
export function stringListsOf(source: ts.SourceFile): Map<string, string[]> {
	const lists = new Map<string, string[]>()
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) continue
		for (const declaration of statement.declarationList.declarations) {
			const value = withoutAssertion(declaration.initializer)
			if (!ts.isIdentifier(declaration.name) || value === undefined) continue
			if (!ts.isArrayLiteralExpression(value)) continue
			if (!value.elements.every(ts.isStringLiteral)) continue
			lists.set(
				declaration.name.text,
				value.elements.map((element) => (element as ts.StringLiteral).text),
			)
		}
	}
	return lists
}

/**
 * The local names the imports of `source` bind, each with the specifier it comes from.
 *
 * @intent tell which called names come from another module
 * @internal
 */
export function importedNamesOf(imports: readonly ImportFacts[]): Map<string, string> {
	return new Map(
		imports
			.filter((found) => !found.reexport)
			.flatMap((found) => found.names.map((name) => [name.local, found.specifier] as const)),
	)
}

/** An import declaration as facts: none for a type-only one or a bare side-effect import. */
function importDeclarationOf(params: {
	statement: ts.ImportDeclaration
	line: number
}): ImportFacts[] {
	const { statement, line } = params
	const clause = statement.importClause
	if (clause === undefined || clause.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier))
		return []
	const specifier = statement.moduleSpecifier.text
	const bindings = clause.namedBindings
	if (bindings !== undefined && ts.isNamespaceImport(bindings))
		return [
			{
				specifier,
				line,
				names: [{ imported: '*', local: bindings.name.text }],
				reexport: false,
				all: true,
			},
		]
	const named =
		bindings === undefined
			? []
			: bindings.elements
					.filter((element) => !element.isTypeOnly)
					.map((element) => ({
						imported: (element.propertyName ?? element.name).text,
						local: element.name.text,
					}))
	const names =
		clause.name === undefined ? named : [{ imported: 'default', local: clause.name.text }, ...named]
	return names.length ? [{ specifier, line, names, reexport: false }] : []
}

/** A re-export (`export … from`) as facts; none for a local export list or a type-only re-export. */
function exportDeclarationOf(params: {
	statement: ts.ExportDeclaration
	line: number
}): ImportFacts[] {
	const { statement, line } = params
	const module = statement.moduleSpecifier
	if (module === undefined || statement.isTypeOnly || !ts.isStringLiteral(module)) return []
	const specifier = module.text
	const clause = statement.exportClause
	if (clause === undefined) return [{ specifier, line, names: [], reexport: true, all: true }]
	if (ts.isNamespaceExport(clause))
		return [
			{
				specifier,
				line,
				names: [{ imported: '*', local: clause.name.text }],
				reexport: true,
				all: true,
			},
		]
	const names = clause.elements
		.filter((element) => !element.isTypeOnly)
		.map((element) => ({
			imported: (element.propertyName ?? element.name).text,
			local: element.name.text,
		}))
	return [{ specifier, line, names, reexport: true }]
}

/** The tokens of `text`, comments, whitespace and semicolons left out. */
function tokensOf(text: string): string[] {
	const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text)
	const tokens: string[] = []
	for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan())
		if (kind !== ts.SyntaxKind.SemicolonToken) tokens.push(scanner.getTokenText())
	return tokens
}

/** The elements `node` names: a literal compared with a tag, a literal passed as a tag, a string-literal type argument. */
function elementOf(node: ts.Node): string[] | undefined {
	if (ts.isBinaryExpression(node) && isEquality(node.operatorToken.kind)) {
		const literal = [node.left, node.right].find(ts.isStringLiteral)
		const other = literal === node.left ? node.right : node.left
		if (literal !== undefined && isTagAccess(other)) return [literal.text]
	}
	if (
		ts.isPropertyAssignment(node) &&
		ts.isIdentifier(node.name) &&
		TAG_PROPERTIES.includes(node.name.text) &&
		ts.isStringLiteral(node.initializer)
	)
		return [node.initializer.text]
	if (
		(ts.isTypeReferenceNode(node) || ts.isCallExpression(node)) &&
		node.typeArguments !== undefined
	)
		return node.typeArguments.flatMap(stringLiteralTypeOf)
	return undefined
}

function isEquality(kind: ts.SyntaxKind): boolean {
	return (
		kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
		kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
		kind === ts.SyntaxKind.EqualsEqualsToken ||
		kind === ts.SyntaxKind.ExclamationEqualsToken
	)
}

/** `x.tagName` or `x.tag`. */
function isTagAccess(node: ts.Node): boolean {
	return ts.isPropertyAccessExpression(node) && TAG_PROPERTIES.includes(node.name.text)
}

/** The text of a string-literal type (`'LNode'`); none for any other type. */
function stringLiteralTypeOf(node: ts.TypeNode): string[] {
	return ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal) ? [node.literal.text] : []
}

/** A call of an attribute reader by name: `readAttribute(…)`, `x.getAttribute(…)`. */
function isAttributeReader(node: ts.CallExpression): boolean {
	const callee = node.expression
	const name = ts.isIdentifier(callee)
		? callee.text
		: ts.isPropertyAccessExpression(callee)
			? callee.name.text
			: undefined
	return name !== undefined && ATTRIBUTE_READERS.includes(name)
}

/** The attribute names an argument of an attribute reader holds: a literal, a `name:` literal, a `names:` list of literals. */
function attributesOfArgument(argument: ts.Expression): string[] {
	if (ts.isStringLiteral(argument)) return [argument.text]
	if (!ts.isObjectLiteralExpression(argument)) return []
	return argument.properties.flatMap(function attributesOfProperty(property) {
		if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) return []
		const value = withoutAssertion(property.initializer)
		if (property.name.text === 'name' && value !== undefined && ts.isStringLiteral(value))
			return [value.text]
		if (property.name.text === 'names' && value !== undefined && ts.isArrayLiteralExpression(value))
			return value.elements.filter(ts.isStringLiteral).map((element) => element.text)
		return []
	})
}

/**
 * The names of the attribute bindings of `node`: identifiers named `attributes`, `attrs` or `…Attributes`, and those
 * declared with a type whose name ends in `Attributes`.
 */
function attributeBindingsOf(node: ts.Node): Set<string> {
	const bindings = new Set<string>()
	function visit(child: ts.Node): void {
		if ((ts.isParameter(child) || ts.isVariableDeclaration(child)) && ts.isIdentifier(child.name)) {
			const typeName =
				child.type !== undefined && ts.isTypeReferenceNode(child.type)
					? child.type.typeName.getText()
					: ''
			if (ATTRIBUTE_BINDING_PATTERN.test(typeName)) bindings.add(child.name.text)
		}
		ts.forEachChild(child, visit)
	}
	visit(node)
	return bindings
}

/** Whether `node` is an attribute binding: by its name, or declared as one. */
function isAttributeBinding(params: { node: ts.Node; bindings: ReadonlySet<string> }): boolean {
	const { node } = params
	if (ts.isIdentifier(node))
		return ATTRIBUTE_BINDING_PATTERN.test(node.text) || params.bindings.has(node.text)
	return ts.isPropertyAccessExpression(node) && ATTRIBUTE_BINDING_PATTERN.test(node.name.text)
}

/** The attributes an access reads: `attributes.x`, `attributes['x']`, `const { x } = attributes`. */
function attributeOfAccess(params: {
	node: ts.Node
	bindings: ReadonlySet<string>
}): string[] | undefined {
	const { node, bindings } = params
	if (
		ts.isPropertyAccessExpression(node) &&
		isAttributeBinding({ node: node.expression, bindings })
	)
		return [node.name.text]
	if (
		ts.isElementAccessExpression(node) &&
		ts.isStringLiteral(node.argumentExpression) &&
		isAttributeBinding({ node: node.expression, bindings })
	)
		return [node.argumentExpression.text]
	if (
		ts.isVariableDeclaration(node) &&
		ts.isObjectBindingPattern(node.name) &&
		node.initializer !== undefined &&
		isAttributeBinding({ node: node.initializer, bindings })
	)
		return node.name.elements.flatMap(function nameOf(element) {
			const key = element.propertyName ?? element.name
			return ts.isIdentifier(key) ? [key.text] : []
		})
	return undefined
}

/** A constant read through as a list of names: the receiver of `.map` and the like, a `for … of` list, a reader's argument. */
function namedSetOf(node: ts.Node): string | undefined {
	if (
		ts.isPropertyAccessExpression(node) &&
		ITERATING_METHODS.includes(node.name.text) &&
		ts.isIdentifier(node.expression) &&
		NAMED_SET_PATTERN.test(node.expression.text)
	)
		return node.expression.text
	if (
		ts.isForOfStatement(node) &&
		ts.isIdentifier(node.expression) &&
		NAMED_SET_PATTERN.test(node.expression.text)
	)
		return node.expression.text
	if (ts.isCallExpression(node) && isAttributeReader(node))
		return node.arguments.find(
			(argument): argument is ts.Identifier =>
				ts.isIdentifier(argument) && NAMED_SET_PATTERN.test(argument.text),
		)?.text
	return undefined
}

/** `x as const` and `x satisfies T` read as `x`. */
function withoutAssertion(node: ts.Expression | undefined): ts.Expression | undefined {
	if (node === undefined) return undefined
	if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
		return withoutAssertion(node.expression)
	return node
}
