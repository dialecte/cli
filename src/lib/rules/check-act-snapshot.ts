/** The `act-snapshot` rule of an act: a captured state compared with the state after the call. */
import { calleeName } from './callee-name.ts'
import {
	ACT_SNAPSHOT_MESSAGE,
	CLONE_FUNCTION,
	EQUALITY_MATCHERS,
	SNAPSHOT_CALLEES,
} from './check-act-rules.constants.ts'
import { matcherCallsIn } from './expect-chains.ts'
import { awaitedOf, positionOf, unwrapped } from './syntax-nodes.ts'

import ts from 'typescript'

import type { QualityFinding } from './check-quality-rules.types.ts'
import type { NamedVariableDeclaration } from './syntax-nodes.types.ts'

/**
 * `act-snapshot`: one finding per binding of the act (nested callbacks included) holding a captured state (a
 * snapshot, the document info, the staged operations, or a clone of one) that a later equality matcher takes as its
 * expected argument, by its name or as a property of that name (`outcome.stagedBefore`).
 */
export function snapshotsIn(params: {
	act: ts.FunctionLikeDeclaration
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { act, sourceFile } = params
	if (act.body === undefined) return []
	const functionLine = positionOf({ node: act, sourceFile }).line
	const captures = capturedBindingsIn(act.body)
	const expected = expectedNamesIn(act.body)
	return captures
		.filter((capture) =>
			expected.some(
				(name) => name.text === capture.name.text && name.getStart(sourceFile) > capture.end,
			),
		)
		.map((capture) => ({
			...positionOf({ node: capture, sourceFile }),
			functionLine,
			rule: 'act-snapshot' as const,
			severity: 'error' as const,
			message: ACT_SNAPSHOT_MESSAGE,
		}))
}

/** The declarations under `node`, in source order, whose value is a captured state. */
function capturedBindingsIn(node: ts.Node): NamedVariableDeclaration[] {
	const captures: NamedVariableDeclaration[] = []
	function visit(child: ts.Node): void {
		if (
			ts.isVariableDeclaration(child) &&
			ts.isIdentifier(child.name) &&
			child.initializer !== undefined &&
			isCapture({
				value: child.initializer,
				captured: captures.map((capture) => capture.name.text),
			})
		)
			captures.push(child as NamedVariableDeclaration)
		ts.forEachChild(child, visit)
	}
	visit(node)
	return captures
}

/**
 * Is the value a captured state: a call of a snapshot reader, or a clone (`structuredClone(x)`, `[...x]`,
 * `{ ...x }`) of such a call or of a binding already captured.
 */
function isCapture(params: { value: ts.Expression; captured: readonly string[] }): boolean {
	const value = awaitedOf(params.value)
	if (isSnapshotRead(value)) return true
	const source = clonedOf(value)
	if (source === undefined) return false
	const cloned = awaitedOf(source)
	return ts.isIdentifier(cloned) ? params.captured.includes(cloned.text) : isSnapshotRead(cloned)
}

function isSnapshotRead(value: ts.Expression): boolean {
	return (
		ts.isCallExpression(value) && SNAPSHOT_CALLEES.includes(calleeName(unwrapped(value.expression)))
	)
}

/** The value a clone copies: the argument of `structuredClone`, or the one spread of `[...x]` or `{ ...x }`. */
function clonedOf(value: ts.Expression): ts.Expression | undefined {
	if (ts.isCallExpression(value))
		return calleeName(unwrapped(value.expression)) === CLONE_FUNCTION
			? value.arguments.at(0)
			: undefined
	if (ts.isArrayLiteralExpression(value) && value.elements.length === 1) {
		const [element] = value.elements
		return ts.isSpreadElement(element) ? element.expression : undefined
	}
	if (ts.isObjectLiteralExpression(value) && value.properties.length === 1) {
		const [property] = value.properties
		return ts.isSpreadAssignment(property) ? property.expression : undefined
	}
	return undefined
}

/**
 * The names under `node` given as the expected argument of an equality matcher of an `expect` chain: a name
 * (`before`), or the property name of a property read (`stagedBefore` of `outcome.stagedBefore`).
 */
function expectedNamesIn(node: ts.Node): ts.Identifier[] {
	return matcherCallsIn({ node, matchers: EQUALITY_MATCHERS }).flatMap((call) => {
		const [expected] = call.arguments
		const value = expected === undefined ? undefined : unwrapped(expected)
		if (value === undefined) return []
		if (ts.isIdentifier(value)) return [value]
		return ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.name) ? [value.name] : []
	})
}
