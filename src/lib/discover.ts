/**
 * Compiler-API discovery of a dialect's public method surface — every method of
 * Query/Transaction/Document/Project, INCLUDING `maxDepth` levels (default one) into the extension/domain
 * groups (history, reference, dataModel, lifecycle.transplant, …). Returns dotted paths like
 * `q.history.getSortedHitems`, with the JSDoc each method carries (followed through the extension
 * binding to the function that declares it). Binding-agnostic: the caller passes a self-contained entry
 * source (`declare const q/tx/doc/project` + imports), so this stays decoupled from `refsOf`.
 *
 * Same walk the `audit` command uses; factored here so the `coverage` api-probe can reuse it to emit a
 * file that instantiates Parameters/ReturnType of every method (a pure mapped-type fan-out does NOT
 * force instantiation — measured +131 only — hence this explicit per-method approach), and so
 * `dialecte skills` can index the surface for agents.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import {
	ENTRY_FOLDER,
	FENCED_CODE_PATTERN,
	PRIMITIVE_LIKE,
	ROOTS,
	SIGNATURE_FORMAT,
	SIGNATURE_PRINTER,
} from './discover.constants.ts'
import { renderJsDocText } from './render-jsdoc-text.ts'

import ts from 'typescript'

import type { DiscoverParams, MethodEntry } from './discover.types.ts'

export function discoverMethodPaths(params: DiscoverParams): string[] {
	return discoverMethods(params).map((entry) => entry.path)
}

export function discoverMethods(params: DiscoverParams): MethodEntry[] {
	const { entrySource, tsconfig, root, maxDepth = 1 } = params
	const entryPath = join(root, ENTRY_FOLDER, `discover-entry-${process.pid}.ts`)
	mkdirSync(dirname(entryPath), { recursive: true })
	writeFileSync(entryPath, entrySource)
	try {
		const parsed = ts.parseJsonConfigFileContent(
			ts.readConfigFile(join(root, tsconfig), ts.sys.readFile).config,
			ts.sys,
			root,
		)
		const program = ts.createProgram([entryPath], {
			...parsed.options,
			noEmit: true,
			rootDir: root,
		})
		const checker = program.getTypeChecker()
		const sourceFile = program.getSourceFile(entryPath)
		if (!sourceFile) return []

		const exportsByName = new Map(
			checker
				.getExportsOfModule(checker.getSymbolAtLocation(sourceFile) as ts.Symbol)
				.map((symbol) => [symbol.getName(), symbol]),
		)
		const entries: MethodEntry[] = []
		for (const rootName of ROOTS) {
			const symbol = exportsByName.get(rootName)
			if (symbol)
				walkMembers({
					checker,
					sourceFile,
					type: checker.getTypeOfSymbolAtLocation(symbol, sourceFile),
					path: rootName,
					depth: 0,
					maxDepth,
					root,
					entries,
				})
		}
		return entries
	} finally {
		rmSync(entryPath, { force: true })
	}
}

function walkMembers(params: {
	checker: ts.TypeChecker
	sourceFile: ts.SourceFile
	type: ts.Type
	path: string
	depth: number
	maxDepth: number
	root: string
	entries: MethodEntry[]
}): void {
	const { checker, sourceFile, type, path, depth, maxDepth } = params
	for (const property of type.getProperties()) {
		if (!isPublic(property)) continue
		const propertyType = checker.getTypeOfSymbolAtLocation(
			property,
			declarationOf(property) ?? sourceFile,
		)
		const propertyPath = `${path}.${property.getName()}`
		if (propertyType.getCallSignatures().length > 0) {
			const { documentation, declaringSymbol } = documentationOf({
				checker,
				symbol: property,
				root: params.root,
			})
			params.entries.push({
				path: propertyPath,
				signature: signatureOf({ checker, boundType: propertyType, declaringSymbol }),
				...documentation,
			})
		} else if (
			depth < maxDepth &&
			!(propertyType.flags & PRIMITIVE_LIKE) &&
			propertyType
				.getProperties()
				.some(
					(member) =>
						isPublic(member) &&
						!isTypeScriptLibrary(member) &&
						checker
							.getTypeOfSymbolAtLocation(member, declarationOf(member) ?? sourceFile)
							.getCallSignatures().length > 0,
				)
		)
			walkMembers({ ...params, type: propertyType, path: propertyPath, depth: depth + 1 })
	}
}

/**
 * The signatures as declared (generic, not instantiated with one dialecte's tag names), one per line, the
 * leading query or transaction left out when the binding took it away: what a caller writes.
 */
function signatureOf(params: {
	checker: ts.TypeChecker
	boundType: ts.Type
	declaringSymbol: ts.Symbol | undefined
}): string {
	const { checker } = params
	const boundSignatures = params.boundType.getCallSignatures()
	const declarations = callableDeclarations(params.declaringSymbol)
	if (declarations.length === 0)
		return boundSignatures
			.map((signature) =>
				checker.signatureToString(signature, undefined, SIGNATURE_FORMAT, ts.SignatureKind.Call),
			)
			.join('\n')
	const boundParameterCount = Math.max(
		...boundSignatures.map((signature) => parameterCount({ checker, signature })),
	)
	return declarations
		.map((declaration) => declaredSignatureText({ checker, declaration, boundParameterCount }))
		.join('\n')
}

/**
 * How many parameters a signature takes: a binding that drops the first parameter writes the rest as one
 * rest parameter of a tuple type (`(...args: [ref: string, options?: Options])`), counted element by element.
 */
function parameterCount(params: { checker: ts.TypeChecker; signature: ts.Signature }): number {
	const { checker } = params
	const parameters = params.signature.getParameters()
	const last = parameters.at(-1)
	if (!last) return 0
	const lastType = checker.getTypeOfSymbol(last)
	return checker.isTupleType(lastType)
		? parameters.length - 1 + checker.getTypeArguments(lastType as ts.TypeReference).length
		: parameters.length
}

/** The function-like declarations behind a symbol: its overloads when it has some, else its implementation. */
function callableDeclarations(symbol: ts.Symbol | undefined): ts.SignatureDeclaration[] {
	const declarations = (symbol?.declarations ?? []).flatMap(
		(declaration): ts.SignatureDeclaration[] => {
			if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration))
				return [declaration]
			if (
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				(ts.isArrowFunction(declaration.initializer) ||
					ts.isFunctionExpression(declaration.initializer))
			)
				return [declaration.initializer]
			return []
		},
	)
	const overloads = declarations.filter((declaration) => !hasBody(declaration))
	return overloads.length > 0 ? overloads : declarations
}

function hasBody(declaration: ts.SignatureDeclaration): boolean {
	return 'body' in declaration && declaration.body !== undefined
}

function declaredSignatureText(params: {
	checker: ts.TypeChecker
	declaration: ts.SignatureDeclaration
	boundParameterCount: number
}): string {
	const { checker, declaration } = params
	const sourceFile = declaration.getSourceFile()
	const signature = checker.getSignatureFromDeclaration(declaration)
	const parameters = declaration.parameters
	const skipped = Math.max(0, parameters.length - params.boundParameterCount)
	const typeParameters = declaration.typeParameters?.length
		? `<${declaration.typeParameters.map((typeParameter) => printed({ node: typeParameter, sourceFile })).join(', ')}>`
		: ''
	const parameterTexts = parameters.slice(skipped).map(function parameterText(
		parameter: ts.ParameterDeclaration,
	): string {
		const optional = parameter.questionToken || parameter.initializer ? '?' : ''
		const rest = parameter.dotDotDotToken ? '...' : ''
		// the type as written (an alias stays an alias); inferred only when the source writes none
		const type = parameter.type
			? printed({ node: parameter.type, sourceFile })
			: checker.typeToString(checker.getTypeAtLocation(parameter), declaration, SIGNATURE_FORMAT)
		return `${rest}${printed({ node: parameter.name, sourceFile })}${optional}: ${type}`
	})
	const returnType = declaration.type
		? printed({ node: declaration.type, sourceFile })
		: signature
			? checker.typeToString(signature.getReturnType(), declaration, SIGNATURE_FORMAT)
			: 'unknown'
	return `${typeParameters}(${parameterTexts.join(', ')}) => ${returnType}`
}

/**
 * A node as the compiler prints it, on one line: comments dropped, object members ending with `;` - the
 * layout of the source (line breaks, comments, separators left out) does not reach the signature.
 */
function printed(params: { node: ts.Node; sourceFile: ts.SourceFile }): string {
	return SIGNATURE_PRINTER.printNode(
		ts.EmitHint.Unspecified,
		params.node,
		params.sourceFile,
	).replace(/\s*\n\s*/g, ' ')
}

/**
 * The JSDoc of the function behind a member: a bound extension method is a mapped property whose
 * declaration is a shorthand (`{ of }`), a property, a barrel's re-export or an alias (`import * as`),
 * so follow those to the function. Public compiler API only.
 */
function documentationOf(params: { checker: ts.TypeChecker; symbol: ts.Symbol; root: string }): {
	documentation: Omit<MethodEntry, 'path' | 'signature'>
	declaringSymbol: ts.Symbol | undefined
} {
	const { checker } = params
	const visited = new Set<ts.Symbol>()
	const queue: (ts.Symbol | undefined)[] = [params.symbol]
	let declaringSymbol: ts.Symbol | undefined
	while (queue.length) {
		const symbol = queue.shift()
		if (!symbol || visited.has(symbol)) continue
		visited.add(symbol)
		if (symbol.flags & ts.SymbolFlags.Alias) {
			queue.push(checker.getAliasedSymbol(symbol))
			continue
		}
		declaringSymbol ??= symbol
		const comment = renderJsDocText(symbol.getDocumentationComment(checker))
		if (comment) {
			const tags = symbol.getJsDocTags(checker)
			return {
				documentation: {
					summary: firstParagraph(comment),
					intents: intentsOf(tags),
					example: exampleOf(tags),
					definedInPackage: isDeclaredInPackage({ symbol, root: params.root }),
					internal: tags.some((tag) => tag.name === 'internal'),
					declaredAt: declarationKey({ symbol, root: params.root }),
				},
				declaringSymbol: symbol,
			}
		}
		for (const declaration of symbol.declarations ?? []) {
			if (ts.isShorthandPropertyAssignment(declaration))
				queue.push(checker.getShorthandAssignmentValueSymbol(declaration))
			// `{ of }` written out: `{ of: of }` or `{ of: labels.of }`
			else if (ts.isPropertyAssignment(declaration))
				queue.push(assignedSymbol({ checker, initializer: declaration.initializer }))
			// a verb re-exported by a barrel (`export { of } from './of'`): follow it to the function
			else if (ts.isExportSpecifier(declaration))
				queue.push(checker.getExportSpecifierLocalTargetSymbol(declaration))
		}
	}
	const declaringFunction = lastDeclared(visited) ?? declaringSymbol
	return {
		documentation: {
			summary: undefined,
			intents: [],
			example: undefined,
			internal: false,
			definedInPackage: isDeclaredInPackage({ symbol: declaringFunction, root: params.root }),
			declaredAt: declarationKey({ symbol: declaringFunction, root: params.root }),
		},
		declaringSymbol: declaringFunction,
	}
}

function firstParagraph(comment: string): string {
	return comment
		.split(/\n\s*\n/)[0]
		.replace(/\s+/g, ' ')
		.trim()
}

function intentsOf(tags: readonly ts.JSDocTagInfo[]): string[] {
	return tags
		.filter((tag) => tag.name === 'intent')
		.flatMap((tag) => parseIntentText(renderJsDocText(tag.text)))
}

/** The first `@example` of the JSDoc, without its code fence. */
function exampleOf(tags: readonly ts.JSDocTagInfo[]): string | undefined {
	const tag = tags.find((candidate) => candidate.name === 'example')
	if (!tag) return undefined
	// the tag's text runs to the next tag: a fenced block is the code, what follows it is prose
	const text = renderJsDocText(tag.text)
	const fenced = text.match(FENCED_CODE_PATTERN)
	const code = (fenced ? fenced[1] : text).trim()
	return code || undefined
}

/**
 * A tag's text runs to the next tag: the intents are its first paragraph, separated by the commas that
 * are not inside parentheses (`state of a signal (locked, mapped)` is one intent).
 */
export function parseIntentText(text: string): string[] {
	const intents: string[] = []
	let depth = 0
	let current = ''
	for (const character of text.split(/\n\s*\n/)[0]) {
		if (character === '(') depth++
		else if (character === ')') depth = Math.max(0, depth - 1)
		if (character === ',' && depth === 0) {
			intents.push(current)
			current = ''
		} else current += character
	}
	intents.push(current)
	return intents.map((intent) => intent.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** The symbol a property's value names: `of` or `labels.of`; anything else is not followed. */
function assignedSymbol(params: {
	checker: ts.TypeChecker
	initializer: ts.Expression
}): ts.Symbol | undefined {
	const { checker, initializer } = params
	if (ts.isIdentifier(initializer)) return checker.getSymbolAtLocation(initializer)
	if (ts.isPropertyAccessExpression(initializer))
		return checker.getSymbolAtLocation(initializer.name)
	return undefined
}

/** The deepest symbol reached that declares a function (`function`, method, or a const arrow / function expression). */
function lastDeclared(symbols: Set<ts.Symbol>): ts.Symbol | undefined {
	return [...symbols].reverse().find((symbol) => (symbol.declarations ?? []).some(declaresFunction))
}

function declaresFunction(declaration: ts.Declaration): boolean {
	if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) return true
	if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return false
	return (
		ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)
	)
}

/** `relative/file.ts:position` of the symbol's first declaration: one key per method, whatever the route. */
function declarationKey(params: {
	symbol: ts.Symbol | undefined
	root: string
}): string | undefined {
	const declaration = params.symbol?.declarations?.[0]
	if (!declaration) return undefined
	return `${relative(params.root, declaration.getSourceFile().fileName)}:${declaration.getStart()}`
}

function isDeclaredInPackage(params: { symbol: ts.Symbol | undefined; root: string }): boolean {
	const fileName = params.symbol?.declarations?.[0]?.getSourceFile().fileName
	if (!fileName) return false
	const path = relative(params.root, fileName)
	return !path.startsWith('..') && !path.split(/[\\/]/).includes('node_modules')
}

function declarationOf(symbol: ts.Symbol): ts.Declaration | undefined {
	return symbol.valueDeclaration ?? symbol.declarations?.[0]
}

function isPublic(symbol: ts.Symbol): boolean {
	const declaration = declarationOf(symbol)
	return (
		!declaration ||
		!(
			ts.getCombinedModifierFlags(declaration) &
			(ts.ModifierFlags.Private | ts.ModifierFlags.Protected)
		)
	)
}

function isTypeScriptLibrary(symbol: ts.Symbol): boolean {
	return (declarationOf(symbol)?.getSourceFile()?.fileName ?? '').includes(
		'/node_modules/typescript/',
	)
}
