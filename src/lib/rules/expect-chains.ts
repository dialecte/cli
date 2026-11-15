/** Readers of `expect(...)` matcher chains the act and expectation rules share. */
import { EXPECT_CALLEES } from './check-act-rules.constants.ts'
import { unwrapped } from './syntax-nodes.ts'
import { pathTextOf } from './test-shape-tables.ts'

import ts from 'typescript'

/** The matcher calls under `node` whose matcher is one of `matchers` and whose chain starts at `expect(...)`. */
export function matcherCallsIn(params: {
	node: ts.Node
	matchers: readonly string[]
}): ts.CallExpression[] {
	const calls: ts.CallExpression[] = []
	function visit(child: ts.Node): void {
		if (
			ts.isCallExpression(child) &&
			expectCallOfMatcher({ call: child, matchers: params.matchers })
		)
			calls.push(child)
		ts.forEachChild(child, visit)
	}
	visit(params.node)
	return calls
}

/** The `expect(...)` call a matcher call is made on (`.not`, `.resolves`, `.rejects` between them), if it is one. */
export function expectCallOfMatcher(params: {
	call: ts.CallExpression
	matchers: readonly string[]
}): ts.CallExpression | undefined {
	const callee = unwrapped(params.call.expression)
	if (!ts.isPropertyAccessExpression(callee) || !params.matchers.includes(callee.name.text))
		return undefined
	return expectCallOf(callee.expression)
}

/** The `expect(...)` call at the root of a matcher chain. */
export function expectCallOf(expression: ts.Expression): ts.CallExpression | undefined {
	const node = unwrapped(expression)
	if (ts.isPropertyAccessExpression(node)) return expectCallOf(node.expression)
	if (!ts.isCallExpression(node)) return undefined
	const path = pathTextOf(unwrapped(node.expression))
	return path !== undefined && EXPECT_CALLEES.includes(path) ? node : undefined
}
