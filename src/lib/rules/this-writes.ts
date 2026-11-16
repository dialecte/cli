/**
 * The writes through `this` of a class the class rule refuses: each member's body, walked with the names that alias
 * the instance or a field of it (`const self = this`, `const { items } = this`). A method's body is judged whole; the
 * constructor's own statements and a field's initializer build the instance, so only the functions they create, which
 * run later, are judged. `this` inside a function that is no arrow, a method or a class is not the instance's, but an
 * alias reaches into any of them.
 */
import { THIS_WRITE_MESSAGE } from './check-class-rules.constants.ts'
import { THIS_ROOT } from './check-quality-rules.constants.ts'
import { mutationsAt, pathOf } from './mutations.ts'
import {
	bindingNamesOf,
	childNodesOf,
	isFunctionNode,
	positionOf,
	unwrapped,
} from './syntax-nodes.ts'

import ts from 'typescript'

import type { QualityFinding } from './check-quality-rules.types.ts'
import type { ThisWrite, WalkState, WriteRegion } from './this-writes.types.ts'

/** One finding per member and written expression, at its first write. */
export function thisWritesOf(params: {
	node: ts.ClassLikeDeclaration
	name: string
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { name, sourceFile } = params
	return regionsOf({ node: params.node, sourceFile }).flatMap((region) => {
		const aliases = aliasesIn(region)
		const reported = new Set<string>()
		return writesIn({ region, aliases }).flatMap((write): QualityFinding[] => {
			const key = writtenTextOf({ node: write.node, sourceFile })
			if (reported.has(key)) return []
			reported.add(key)
			return [
				{
					...positionOf({ node: write.node, sourceFile }),
					rule: 'argument-mutation',
					severity: 'error',
					message: THIS_WRITE_MESSAGE.replace('{owner}', `${name}.${region.name}`)
						.replace('{target}', key)
						.replace('{label}', write.label),
					functionLine: positionOf({ node: region.member, sourceFile }).line,
				},
			]
		})
	})
}

/** Each member with a body: a method or accessor judged whole, the constructor and a field initializer only inside the functions they create. */
function regionsOf(params: {
	node: ts.ClassLikeDeclaration
	sourceFile: ts.SourceFile
}): WriteRegion[] {
	const { node, sourceFile } = params
	return node.members.flatMap((member): WriteRegion[] => {
		if (ts.isConstructorDeclaration(member) && member.body)
			return [{ name: 'constructor', member, root: member.body, judgedWhole: false }]
		if (!member.name) return []
		const name = member.name.getText(sourceFile)
		if (
			(ts.isMethodDeclaration(member) ||
				ts.isGetAccessorDeclaration(member) ||
				ts.isSetAccessorDeclaration(member)) &&
			member.body
		)
			return [{ name, member, root: member.body, judgedWhole: true }]
		if (ts.isPropertyDeclaration(member) && member.initializer)
			return [{ name, member, root: member.initializer, judgedWhole: false }]
		return []
	})
}

/** The names that alias the instance or a field of it in the region, in source order. */
function aliasesIn(region: WriteRegion): ReadonlySet<string> {
	const aliases = new Set<string>()
	for (const { node, state } of walk(region)) {
		if (!ts.isVariableDeclaration(node) || node.initializer === undefined) continue
		if (reachesInstance({ expression: node.initializer, state, aliases }))
			for (const name of bindingNamesOf(node.name)) aliases.add(name)
	}
	return aliases
}

/** The judged writes of the region whose path starts at the instance: `this` where it is the class's, or an alias. */
function writesIn(params: { region: WriteRegion; aliases: ReadonlySet<string> }): ThisWrite[] {
	const { aliases } = params
	return walk(params.region).flatMap(({ node, state }) =>
		state.judged
			? mutationsAt(node)
					.filter(
						(mutation) =>
							(mutation.path.root === THIS_ROOT && state.thisIsInstance) ||
							aliases.has(mutation.path.root),
					)
					.map((mutation) => ({ node: mutation.node, label: mutation.label }))
			: [],
	)
}

function reachesInstance(params: {
	expression: ts.Expression
	state: WalkState
	aliases: ReadonlySet<string>
}): boolean {
	const path = pathOf(unwrapped(params.expression))
	if (path === undefined) return false
	if (path.root === THIS_ROOT) return params.state.thisIsInstance
	return params.aliases.has(path.root)
}

/** Every node of the region with what holds there: whether a write is judged, whether `this` is the instance. */
function walk(region: WriteRegion): { node: ts.Node; state: WalkState }[] {
	const start: WalkState = {
		judged: region.judgedWhole || isFunctionNode(region.root),
		thisIsInstance: true,
	}
	return walkFrom({ node: region.root, root: region.root, state: start })
}

function walkFrom(params: {
	node: ts.Node
	root: ts.Node
	state: WalkState
}): { node: ts.Node; state: WalkState }[] {
	const { node, root } = params
	const state: WalkState =
		node === root
			? params.state
			: {
					judged: params.state.judged || isFunctionNode(node),
					thisIsInstance: params.state.thisIsInstance && !ownsThis(node),
				}
	return [
		{ node, state },
		...childNodesOf(node).flatMap((child) => walkFrom({ node: child, root, state })),
	]
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
