/**
 * `dialecte members <expression>`: the IntelliSense walk on demand - what is reachable one step below an
 * expression of the live types (`doc.query`, `doc.query.reference`, `tx.lifecycle`), methods first with their
 * JSDoc summary, then the groups below it with how many methods each holds.
 */
import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'

import type { MethodEntry } from '../discover.types.ts'
import type { Member } from './api-json.types.ts'

export function listMembers(params: {
	entries: readonly MethodEntry[]
	expression: string
}): Member[] {
	const path = discoveryPath(params.expression)
	const exact = params.entries.find((entry) => entry.path === path)
	if (exact) return [methodMember({ entry: exact, name: lastSegment(path) })]

	const methods: Member[] = []
	const methodCountByGroup = new Map<string, number>()
	for (const entry of params.entries) {
		if (!entry.path.startsWith(`${path}.`)) continue
		const [name, ...below] = entry.path.slice(path.length + 1).split('.')
		if (below.length === 0) methods.push(methodMember({ entry, name }))
		else methodCountByGroup.set(name, (methodCountByGroup.get(name) ?? 0) + 1)
	}
	const groups: Member[] = [...methodCountByGroup].map(([name, methodCount]) => ({
		kind: 'group',
		name,
		methodCount,
	}))
	return [...methods.sort(byName), ...groups.sort(byName)]
}

/** The path discover writes: reads hang from `q` (`doc.query.x` → `q.x`). */
export function discoveryPath(expression: string): string {
	return expression.replace(/^(doc\.query|query)(?=\.|$)/, 'q')
}

function methodMember(params: { entry: MethodEntry; name: string }): Member {
	return {
		kind: 'method',
		name: params.name,
		summary: params.entry.summary,
		intents: params.entry.intents,
	}
}

function lastSegment(path: string): string {
	return path.slice(path.lastIndexOf('.') + 1)
}

function byName(left: Member, right: Member): number {
	return TEXT_COLLATOR.compare(left.name, right.name)
}
