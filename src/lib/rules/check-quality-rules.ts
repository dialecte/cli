/**
 * The quality rules of one implementation file, on its syntax tree (no type checker): a function
 * that changes what its caller handed it (`argument-mutation`), a query read once per loop item
 * (`query-in-loop`, in `check-query-in-loop.ts`), a function too long to read at once
 * (`long-function`), and a class that is no public facade nor store (`class`, in `check-class-rules.ts`,
 * with the writes through `this` of such a class).
 */
import { calleeName } from './callee-name.ts'
import { checkClassRules } from './check-class-rules.ts'
import { LONG_FUNCTION_LINES, THIS_ROOT } from './check-quality-rules.constants.ts'
import { checkQueryInLoop } from './check-query-in-loop.ts'
import { isDomainWrite, mutationsAt, pathKeyOf, targetNameOf } from './mutations.ts'
import {
	bindingNamesOf,
	childNodesOf,
	isFunctionNode,
	positionOf,
	unwrapped,
} from './syntax-nodes.ts'

import ts from 'typescript'

import type { FileKind } from './check-code-rules.types.ts'
import type {
	Binding,
	FunctionOwner,
	OwnedMutation,
	QualityFinding,
	Scope,
} from './check-quality-rules.types.ts'

/** Checks the quality rules (argument mutation, queries in loops, long functions, classes) of one implementation file. */
export function checkQualityRules(params: {
	sourceFile: ts.SourceFile
	kind: FileKind
	queryNames?: ReadonlySet<string>
	/** The names of the file's classes a package entry exports; absent, none is. */
	entryClasses?: ReadonlySet<string>
}): QualityFinding[] {
	const { sourceFile, kind, queryNames } = params
	if (kind !== 'implementation') return []
	return [
		...argumentMutationsOf(sourceFile),
		...checkClassRules({ sourceFile, entryClasses: params.entryClasses ?? new Set() }),
		...(queryNames && queryNames.size > 0 ? checkQueryInLoop({ sourceFile, queryNames }) : []),
		...longFunctionsOf(sourceFile),
	]
}

// argument-mutation

/** One finding per function and mutated target, at its first mutation. */
function argumentMutationsOf(sourceFile: ts.SourceFile): QualityFinding[] {
	const owned = mutationsIn({
		node: sourceFile,
		scope: undefined,
		sourceFile,
	}).sort(
		(left, right) =>
			left.mutation.node.getStart(sourceFile) - right.mutation.node.getStart(sourceFile),
	)
	const reported = new Set<string>()
	const findings: QualityFinding[] = []
	for (const { owner, mutation } of owned) {
		const key = `${owner.start}:${pathKeyOf(mutation.path)}`
		if (reported.has(key)) continue
		reported.add(key)
		findings.push({
			...positionOf({ node: mutation.node, sourceFile }),
			rule: 'argument-mutation',
			severity: 'error',
			message: `\`${owner.name}\` changes its argument \`${targetNameOf(mutation.path)}\` (\`${mutation.label}\`): return the new value instead`,
			functionLine: owner.functionLine,
		})
	}
	return findings
}

/**
 * The parameter mutations under `node`, each with the function whose parameter it changes: a mutation
 * inside a nested callback of an outer parameter belongs to the outer function.
 */
function mutationsIn(params: {
	node: ts.Node
	scope: Scope | undefined
	sourceFile: ts.SourceFile
}): OwnedMutation[] {
	const { node, sourceFile } = params
	const scope = scopeAt({ node, scope: params.scope, sourceFile })
	const own = ownedMutationsAt({ node, scope })
	const nested = childNodesOf(node).flatMap((child) =>
		mutationsIn({ node: child, scope, sourceFile }),
	)
	return [...own, ...nested]
}

/** The mutations at `node` that change a parameter outside a domain write (`tx`, `query`). */
function ownedMutationsAt(params: { node: ts.Node; scope: Scope | undefined }): OwnedMutation[] {
	return mutationsAt(params.node).flatMap((mutation): OwnedMutation[] => {
		// a write through `this` is the class rule's to judge (`checkClassRules`), never a parameter's
		if (mutation.path.root === THIS_ROOT || isDomainWrite(mutation.path)) return []
		const owner = bindingOf({ scope: params.scope, name: mutation.path.root })?.owner
		return owner ? [{ owner, mutation }] : []
	})
}

// scopes

/** The scope the children of `node` see: a function, block, loop or catch clause declares its names. */
function scopeAt(params: {
	node: ts.Node
	scope: Scope | undefined
	sourceFile: ts.SourceFile
}): Scope | undefined {
	const { node, scope, sourceFile } = params
	if (isFunctionNode(node)) return functionScopeOf({ node, parent: scope, sourceFile })
	if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node))
		return blockScopeOf({ statements: node.statements, parent: scope })
	if (ts.isCaseBlock(node))
		return blockScopeOf({
			statements: node.clauses.flatMap((clause) => [...clause.statements]),
			parent: scope,
		})
	if (
		(ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
		node.initializer &&
		ts.isVariableDeclarationList(node.initializer)
	)
		return localScopeOf({
			names: node.initializer.declarations.flatMap((declaration) =>
				bindingNamesOf(declaration.name),
			),
			parent: scope,
		})
	if (ts.isCatchClause(node) && node.variableDeclaration)
		return localScopeOf({
			names: bindingNamesOf(node.variableDeclaration.name),
			parent: scope,
		})
	return scope
}

/** The parameters of a function, owned by it; the accumulator of a `.reduce(` callback is a local value. */
function functionScopeOf(params: {
	node: ts.FunctionLikeDeclaration
	parent: Scope | undefined
	sourceFile: ts.SourceFile
}): Scope {
	const { node, sourceFile } = params
	const owner = ownerOf({ node, sourceFile })
	const accumulator = isReduceCallback(node) ? node.parameters[0] : undefined
	const bindings = new Map<string, Binding>()
	if (ts.isFunctionExpression(node) && node.name) bindings.set(node.name.text, { owner: undefined })
	for (const parameter of node.parameters)
		for (const name of bindingNamesOf(parameter.name))
			bindings.set(name, {
				owner: parameter === accumulator ? undefined : owner,
			})
	return { bindings, parent: params.parent }
}

/**
 * The names a list of statements declares, in order: a binding destructured from a parameter name
 * (`const { leaveOut } = params`) belongs to that parameter's function, any other is a local value.
 */
function blockScopeOf(params: {
	statements: readonly ts.Statement[]
	parent: Scope | undefined
}): Scope {
	const bindings = new Map<string, Binding>()
	const scope: Scope = { bindings, parent: params.parent }
	for (const statement of params.statements)
		for (const [name, binding] of declaredBindingsOf({ statement, scope }))
			bindings.set(name, binding)
	return scope
}

function declaredBindingsOf(params: {
	statement: ts.Statement
	scope: Scope
}): [string, Binding][] {
	const { statement, scope } = params
	if (ts.isVariableStatement(statement))
		return statement.declarationList.declarations.flatMap((declaration) => {
			const binding: Binding = {
				owner: destructuredOwnerOf({ declaration, scope }),
			}
			return bindingNamesOf(declaration.name).map((name): [string, Binding] => [name, binding])
		})
	if (
		(ts.isFunctionDeclaration(statement) ||
			ts.isClassDeclaration(statement) ||
			ts.isEnumDeclaration(statement)) &&
		statement.name
	)
		return [[statement.name.text, { owner: undefined }]]
	return []
}

/** The owner of the parameter a pattern is destructured from (`const { a } = params`); undefined otherwise. */
function destructuredOwnerOf(params: {
	declaration: ts.VariableDeclaration
	scope: Scope
}): FunctionOwner | undefined {
	const { declaration, scope } = params
	if (!ts.isObjectBindingPattern(declaration.name) && !ts.isArrayBindingPattern(declaration.name))
		return undefined
	const initializer = declaration.initializer && unwrapped(declaration.initializer)
	if (!initializer || !ts.isIdentifier(initializer)) return undefined
	return bindingOf({ scope, name: initializer.text })?.owner
}

function localScopeOf(params: { names: readonly string[]; parent: Scope | undefined }): Scope {
	const binding: Binding = { owner: undefined }
	return {
		bindings: new Map(params.names.map((name): [string, Binding] => [name, binding])),
		parent: params.parent,
	}
}

/** What `name` refers to from `scope`, the innermost declaration first; undefined for a global. */
function bindingOf(params: { scope: Scope | undefined; name: string }): Binding | undefined {
	for (let current = params.scope; current; current = current.parent) {
		const binding = current.bindings.get(params.name)
		if (binding) return binding
	}
	return undefined
}

/** A function passed directly as the callback of `.reduce(`. */
function isReduceCallback(node: ts.FunctionLikeDeclaration): boolean {
	const call = node.parent
	return (
		ts.isCallExpression(call) &&
		call.arguments[0] === node &&
		ts.isPropertyAccessExpression(call.expression) &&
		call.expression.name.text === 'reduce'
	)
}

// long-function

/** Each function whose body holds more than `LONG_FUNCTION_LINES` code lines, judged on its own body. */
function longFunctionsOf(sourceFile: ts.SourceFile): QualityFinding[] {
	return functionsIn(sourceFile).flatMap((node) => {
		if (!node.body || !ts.isBlock(node.body)) return []
		// a body spanning no more lines than the limit holds no more code lines than it: not counted
		if (spannedLineCountOf({ block: node.body, sourceFile }) <= LONG_FUNCTION_LINES) return []
		const count = codeLineCountOf({ block: node.body, sourceFile })
		if (count <= LONG_FUNCTION_LINES) return []
		const owner = ownerOf({ node, sourceFile })
		return [
			{
				...positionOf({
					node: nameNodeOf(node) ?? firstTokenOf({ node, sourceFile }),
					sourceFile,
				}),
				rule: 'long-function',
				severity: 'warning',
				message: `\`${owner.name}\` is ${count} lines (over ${LONG_FUNCTION_LINES}): split it`,
				functionLine: owner.functionLine,
			},
		]
	})
}

function functionsIn(node: ts.Node): ts.FunctionLikeDeclaration[] {
	const nested = childNodesOf(node).flatMap((child) => functionsIn(child))
	return isFunctionNode(node) ? [node, ...nested] : nested
}

/** The lines a block spans, its braces' lines included, whatever they hold: never fewer than its code lines. */
function spannedLineCountOf(params: { block: ts.Block; sourceFile: ts.SourceFile }): number {
	const { block, sourceFile } = params
	const first = sourceFile.getLineAndCharacterOfPosition(block.getStart(sourceFile)).line
	const last = sourceFile.getLineAndCharacterOfPosition(block.getEnd()).line
	return last - first + 1
}

/** The lines between a block's braces that hold a token: blank and comment-only lines do not count. */
function codeLineCountOf(params: { block: ts.Block; sourceFile: ts.SourceFile }): number {
	const { block, sourceFile } = params
	return new Set(
		block.statements.flatMap((statement) => tokenLinesOf({ node: statement, sourceFile })),
	).size
}

/** The 0-based lines the tokens of `node` span (a multi-line string spans all its lines). */
function tokenLinesOf(params: { node: ts.Node; sourceFile: ts.SourceFile }): number[] {
	const { node, sourceFile } = params
	const children = node.getChildren(sourceFile).filter((child) => !isDocumentationNode(child))
	if (children.length > 0)
		return children.flatMap((child) => tokenLinesOf({ node: child, sourceFile }))
	if (node.getWidth(sourceFile) === 0) return []
	const first = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line
	const last = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line
	return Array.from({ length: last - first + 1 }, (_, offset) => first + offset)
}

function isDocumentationNode(node: ts.Node): boolean {
	return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode
}

// functions

function ownerOf(params: {
	node: ts.FunctionLikeDeclaration
	sourceFile: ts.SourceFile
}): FunctionOwner {
	const { node, sourceFile } = params
	return {
		name: functionNameOf({ node, sourceFile }),
		functionLine: positionOf({
			node: firstTokenOf({ node, sourceFile }),
			sourceFile,
		}).line,
		start: node.getStart(sourceFile),
	}
}

/** Its own name, the name of the variable or property holding it, else the call it is a callback of. */
function functionNameOf(params: {
	node: ts.FunctionLikeDeclaration
	sourceFile: ts.SourceFile
}): string {
	const { node, sourceFile } = params
	if (ts.isConstructorDeclaration(node)) return 'constructor'
	const nameNode = nameNodeOf(node)
	if (nameNode) return nameNode.getText(sourceFile)
	const callee = ts.isCallExpression(node.parent) ? calleeName(node.parent.expression) : ''
	return callee ? `${callee} callback` : 'anonymous function'
}

function nameNodeOf(node: ts.FunctionLikeDeclaration): ts.Node | undefined {
	if (node.name) return node.name
	const holder = node.parent
	if (
		(ts.isVariableDeclaration(holder) ||
			ts.isPropertyAssignment(holder) ||
			ts.isPropertyDeclaration(holder)) &&
		holder.initializer === node
	)
		return holder.name
	return undefined
}

/**
 * The function's first token, where an opt-out on the line before it applies: its `function` keyword,
 * its method name, the `const` of the variable holding it, else its start.
 */
function firstTokenOf(params: {
	node: ts.FunctionLikeDeclaration
	sourceFile: ts.SourceFile
}): ts.Node {
	const { node, sourceFile } = params
	if (ts.isFunctionDeclaration(node))
		return (
			node.getChildren(sourceFile).find((child) => child.kind === ts.SyntaxKind.FunctionKeyword) ??
			node
		)
	if (
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node)
	)
		return node.name
	const holder = node.parent
	if (
		ts.isVariableDeclaration(holder) &&
		holder.initializer === node &&
		ts.isVariableDeclarationList(holder.parent)
	)
		return holder.parent
	return node
}
