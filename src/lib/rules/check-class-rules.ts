/**
 * Functional first: a class passes only as a typed public facade a package entry exports, or as a store implementing
 * an interface (`class`); in any other class, a write through `this` outside the constructor changes state a
 * function would hand back (`argument-mutation`). Read on the syntax tree; which classes an entry exports is given.
 */
import {
	ANONYMOUS_CLASS_NAME,
	CLASS_MESSAGE,
	ERROR_BASE_PATTERN,
	THIS_WRITE_MESSAGE,
} from './check-class-rules.constants.ts'
import { THIS_ROOT } from './check-quality-rules.constants.ts'
import { mutationAt } from './mutations.ts'
import { childNodesOf, positionOf, unwrapped } from './syntax-nodes.ts'

import ts from 'typescript'

import type { ClassMember } from './check-class-rules.types.ts'
import type { QualityFinding } from './check-quality-rules.types.ts'

/** The `class` findings of a file and the writes through `this` of the classes it refuses. */
export function checkClassRules(params: {
	sourceFile: ts.SourceFile
	/** The names of the file's classes a package entry exports. */
	entryClasses: ReadonlySet<string>
}): QualityFinding[] {
	const { sourceFile, entryClasses } = params
	const classes = classesIn(sourceFile)
	const errorClasses = dataOnlyErrorClassesOf(classes)
	return classes.flatMap((node) => {
		const name = classNameOf(node)
		if (entryClasses.has(name) || implementsInterface(node) || errorClasses.has(node)) return []
		const functionLine = positionOf({ node: firstTokenOf(node), sourceFile }).line
		return [
			{
				...positionOf({ node: node.name ?? classKeywordOf({ node, sourceFile }), sourceFile }),
				rule: 'class',
				severity: 'error',
				message: CLASS_MESSAGE.replace('{name}', name),
				functionLine,
			},
			...thisWritesOf({ node, name, sourceFile }),
		]
	})
}

function classesIn(node: ts.Node): ts.ClassLikeDeclaration[] {
	const nested = childNodesOf(node).flatMap((child) => classesIn(child))
	return ts.isClassDeclaration(node) || ts.isClassExpression(node) ? [node, ...nested] : nested
}

/** Its own name, the name of the variable holding it (`const Store = class {}`), else `default`. */
export function classNameOf(node: ts.ClassLikeDeclaration): string {
	if (node.name) return node.name.text
	const holder = node.parent
	if (ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)) return holder.name.text
	return ANONYMOUS_CLASS_NAME
}

function implementsInterface(node: ts.ClassLikeDeclaration): boolean {
	return (node.heritageClauses ?? []).some(
		(clause) => clause.token === ts.SyntaxKind.ImplementsKeyword,
	)
}

/** The arrow functions under `node` whose `this` is the class's (the first of each nest: its body holds the rest). */
function arrowsIn(params: { node: ts.Node; root: ts.Node }): ts.ArrowFunction[] {
	const { node, root } = params
	if (ts.isArrowFunction(node)) return [node]
	if (node !== root && ownsThis(node)) return []
	return childNodesOf(node).flatMap((child) => arrowsIn({ node: child, root }))
}

// data-only errors

/**
 * The data-only error classes among a file's classes: each extends `Error`, a base named `*Error`, or another of
 * them, and holds only fields and a constructor that builds them.
 */
function dataOnlyErrorClassesOf(
	classes: readonly ts.ClassLikeDeclaration[],
): ReadonlySet<ts.ClassLikeDeclaration> {
	const dataOnly = classes.filter(isDataOnly)
	const errorNames = new Set<string>()
	const errors = new Set<ts.ClassLikeDeclaration>()
	// a base declared later in the file is known once its own base is: repeat until nothing is added
	for (let added = true; added;) {
		added = false
		for (const node of dataOnly) {
			const base = baseNameOf(node)
			if (errors.has(node) || base === undefined) continue
			if (!ERROR_BASE_PATTERN.test(base) && !errorNames.has(base)) continue
			errors.add(node)
			errorNames.add(classNameOf(node))
			added = true
		}
	}
	return errors
}

/** The name the class extends (`Error`, `errors.Refusal` → `Refusal`); undefined when it extends nothing named. */
function baseNameOf(node: ts.ClassLikeDeclaration): string | undefined {
	const clause = (node.heritageClauses ?? []).find(
		(candidate) => candidate.token === ts.SyntaxKind.ExtendsKeyword,
	)
	const base = clause?.types[0]?.expression
	if (base === undefined) return undefined
	if (ts.isIdentifier(base)) return base.text
	return ts.isPropertyAccessExpression(base) ? base.name.text : undefined
}

/**
 * Only fields (none holding a function), index signatures and a constructor made of `super(…)`, locals and
 * `this.<field> = …` with no function as the value.
 */
function isDataOnly(node: ts.ClassLikeDeclaration): boolean {
	return node.members.every((member) => {
		if (ts.isPropertyDeclaration(member))
			return member.initializer === undefined || !isFunctionValue(member.initializer)
		if (ts.isConstructorDeclaration(member))
			return (member.body?.statements ?? []).every(isBuildingStatement)
		return ts.isIndexSignatureDeclaration(member) || ts.isSemicolonClassElement(member)
	})
}

function isFunctionValue(expression: ts.Expression): boolean {
	const inner = unwrapped(expression)
	return ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)
}

function isBuildingStatement(statement: ts.Statement): boolean {
	if (ts.isVariableStatement(statement)) return true
	if (!ts.isExpressionStatement(statement)) return false
	const expression = statement.expression
	if (ts.isCallExpression(expression))
		return expression.expression.kind === ts.SyntaxKind.SuperKeyword
	return (
		ts.isBinaryExpression(expression) &&
		expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		ts.isPropertyAccessExpression(expression.left) &&
		expression.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
		!isFunctionValue(expression.right)
	)
}

/**
 * Where an opt-out on the line before applies: the declaration's first token (its `export`, after any doc comment),
 * the `const` of the variable holding a class expression.
 */
function firstTokenOf(node: ts.ClassLikeDeclaration): ts.Node {
	const holder = node.parent
	if (ts.isVariableDeclaration(holder) && ts.isVariableDeclarationList(holder.parent))
		return holder.parent
	return node
}

function classKeywordOf(params: {
	node: ts.ClassLikeDeclaration
	sourceFile: ts.SourceFile
}): ts.Node {
	const { node, sourceFile } = params
	return (
		node.getChildren(sourceFile).find((child) => child.kind === ts.SyntaxKind.ClassKeyword) ?? node
	)
}

// writes through `this`

/** One finding per member and written path, at its first write; the constructor and static blocks build, not write. */
function thisWritesOf(params: {
	node: ts.ClassLikeDeclaration
	name: string
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { name, sourceFile } = params
	return membersOf({ node: params.node, sourceFile }).flatMap((member) => {
		const reported = new Set<string>()
		return writesIn({ node: member.body, root: member.body }).flatMap((write): QualityFinding[] => {
			const mutation = mutationAt(write)
			if (!mutation || mutation.path.root !== THIS_ROOT) return []
			const key = writtenTextOf({ node: write, sourceFile })
			if (reported.has(key)) return []
			reported.add(key)
			return [
				{
					...positionOf({ node: write, sourceFile }),
					rule: 'argument-mutation',
					severity: 'error',
					message: THIS_WRITE_MESSAGE.replace('{owner}', `${name}.${member.name}`)
						.replace('{target}', key)
						.replace('{label}', mutation.label),
					functionLine: positionOf({ node: member.member, sourceFile }).line,
				},
			]
		})
	})
}

/**
 * The methods and accessors of a class, each with the body `this` is the instance in; the constructor's own statements
 * and a field's initializer build the instance, but an arrow either creates runs later, so each arrow is a body of
 * that member's.
 */
function membersOf(params: {
	node: ts.ClassLikeDeclaration
	sourceFile: ts.SourceFile
}): ClassMember[] {
	const { node, sourceFile } = params
	return node.members.flatMap((member): ClassMember[] => {
		if (ts.isConstructorDeclaration(member) && member.body)
			return arrowBodiesOf({ name: 'constructor', member, node: member.body })
		if (!member.name) return []
		const name = member.name.getText(sourceFile)
		if (
			(ts.isMethodDeclaration(member) ||
				ts.isGetAccessorDeclaration(member) ||
				ts.isSetAccessorDeclaration(member)) &&
			member.body
		)
			return [{ name, member, body: member.body }]
		if (ts.isPropertyDeclaration(member) && member.initializer)
			return arrowBodiesOf({ name, member, node: member.initializer })
		return []
	})
}

/** Each arrow `node` creates (itself included) as a body of `member`. */
function arrowBodiesOf(params: {
	name: string
	member: ts.ClassElement
	node: ts.Node
}): ClassMember[] {
	const { name, member, node } = params
	return arrowsIn({ node, root: node }).map((arrow) => ({ name, member, body: arrow.body }))
}

/**
 * The nodes under `node` that may write through the class's `this`: a nested function that is no arrow, an object
 * literal's method or accessor, and a nested class have a `this` of their own.
 */
function writesIn(params: { node: ts.Node; root: ts.Node }): ts.Node[] {
	const { node, root } = params
	if (node !== root && ownsThis(node)) return []
	return [node, ...childNodesOf(node).flatMap((child) => writesIn({ node: child, root }))]
}

/** What a write changes, as written: `this.count` of `this.count++`, `this.items` of `this.items.push(…)`. */
function writtenTextOf(params: { node: ts.Node; sourceFile: ts.SourceFile }): string {
	const written = writtenOf(params.node)
	return (written ? unwrapped(written) : params.node).getText(params.sourceFile)
}

function writtenOf(node: ts.Node): ts.Expression | undefined {
	if (ts.isBinaryExpression(node)) return node.left
	if (ts.isDeleteExpression(node)) return node.expression
	if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) return node.operand
	if (ts.isCallExpression(node)) return calledOnOf(node)
	return undefined
}

/** The value a mutating call changes: the first argument of `Object.assign`, else what the method is called on. */
function calledOnOf(call: ts.CallExpression): ts.Expression | undefined {
	const callee = unwrapped(call.expression)
	if (!ts.isPropertyAccessExpression(callee)) return undefined
	if (callee.name.text === 'assign') return call.arguments[0]
	return callee.expression
}

/** A node with a `this` of its own: a function that is no arrow, a method or accessor, a class. */
function ownsThis(node: ts.Node): boolean {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node) ||
		ts.isClassDeclaration(node) ||
		ts.isClassExpression(node)
	)
}
