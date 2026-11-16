/**
 * The changes of a value the quality rules see on the syntax tree: a mutating method call, an assignment to a
 * property, a `delete`, a `++`/`--` or an `Object.assign`, each as the name path it changes (`params.state.items`,
 * `this.items`).
 */
import { LEADING_POSITIONAL_PARAMETERS } from './check-code-rules.constants.ts'
import { MUTATING_METHODS, THIS_ROOT } from './check-quality-rules.constants.ts'
import { unwrapped } from './syntax-nodes.ts'

import ts from 'typescript'

import type { Mutation, TargetPath } from './check-quality-rules.types.ts'

/** A mutating method call, an assignment to a property, a `delete`, a `++`/`--` or an `Object.assign`. */
export function mutationAt(node: ts.Node): Mutation | undefined {
	if (ts.isCallExpression(node)) return callMutationOf(node)
	if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind))
		return propertyMutationOf({
			node,
			target: node.left,
			label: ts.tokenToString(node.operatorToken.kind) ?? '=',
		})
	if (ts.isDeleteExpression(node))
		return propertyMutationOf({
			node,
			target: node.expression,
			label: 'delete',
		})
	if (
		(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
		(node.operator === ts.SyntaxKind.PlusPlusToken ||
			node.operator === ts.SyntaxKind.MinusMinusToken)
	)
		return propertyMutationOf({
			node,
			target: node.operand,
			label: ts.tokenToString(node.operator) ?? '++',
		})
	return undefined
}

/** `target.method(...)` with a mutating method, or `Object.assign(target, ...)`. */
function callMutationOf(call: ts.CallExpression): Mutation | undefined {
	const callee = unwrapped(call.expression)
	if (!ts.isPropertyAccessExpression(callee)) return undefined
	if (
		ts.isIdentifier(callee.expression) &&
		callee.expression.text === 'Object' &&
		callee.name.text === 'assign'
	) {
		const [first] = call.arguments
		const path = first && pathOf(first)
		return path ? { node: call, path, label: 'Object.assign' } : undefined
	}
	if (!MUTATING_METHODS.includes(callee.name.text)) return undefined
	const path = pathOf(callee.expression)
	return path ? { node: call, path, label: `.${callee.name.text}` } : undefined
}

/** A change of a property of `target` (`target.x`, `target[i]`): the object it is taken from is the mutated path. */
function propertyMutationOf(params: {
	node: ts.Node
	target: ts.Expression
	label: string
}): Mutation | undefined {
	const property = unwrapped(params.target)
	if (!ts.isPropertyAccessExpression(property) && !ts.isElementAccessExpression(property))
		return undefined
	const path = pathOf(property.expression)
	return path ? { node: params.node, path, label: params.label } : undefined
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
	return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

/** A receiver path through a query or transaction (`tx.delete`, `params.tx.delete`): domain writes go through them. */
export function isDomainWrite(path: TargetPath): boolean {
	return [path.root, ...path.segments].some(
		(segment) => segment !== undefined && LEADING_POSITIONAL_PARAMETERS.includes(segment),
	)
}

/**
 * `params.state.items` as a root name and its segments, `this.items` with `this` as its root; undefined for anything
 * that is not a name path.
 */
function pathOf(expression: ts.Expression): TargetPath | undefined {
	const inner = unwrapped(expression)
	if (ts.isIdentifier(inner)) return { root: inner.text, segments: [] }
	if (inner.kind === ts.SyntaxKind.ThisKeyword) return { root: THIS_ROOT, segments: [] }
	if (!ts.isPropertyAccessExpression(inner) && !ts.isElementAccessExpression(inner))
		return undefined
	const base = pathOf(inner.expression)
	if (!base) return undefined
	const segment = ts.isPropertyAccessExpression(inner)
		? inner.name.text
		: ts.isStringLiteralLike(inner.argumentExpression)
			? inner.argumentExpression.text
			: undefined
	return { root: base.root, segments: [...base.segments, segment] }
}

/** The last named segment of the path (`state` for `params.state`), or its root. */
export function targetNameOf(path: TargetPath): string {
	return path.segments.filter((segment) => segment !== undefined).at(-1) ?? path.root
}

export function pathKeyOf(path: TargetPath): string {
	return [path.root, ...path.segments.map((segment) => segment ?? '[]')].join('.')
}
