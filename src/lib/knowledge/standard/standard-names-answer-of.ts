import type { StandardNamed, StandardNamesAnswer } from './standard-input.types.ts'

/** The named entries in id order, or the first two names (in name order) whose ids collide. */
export function namesAnswerOf(params: { named: StandardNamed[] }): StandardNamesAnswer {
	const byId = new Map<string, string>()
	for (const named of [...params.named].sort(compareNames)) {
		const known = byId.get(named.id)
		if (known !== undefined) return { kind: 'collision', names: [known, named.name] }
		byId.set(named.id, named.name)
	}
	return {
		kind: 'kept',
		kept: [...params.named].sort((left, right) => compareText(left.id, right.id)),
	}
}

function compareNames(left: StandardNamed, right: StandardNamed): number {
	return compareText(left.name, right.name)
}

function compareText(left: string, right: string): number {
	if (left === right) return 0
	return left < right ? -1 : 1
}
