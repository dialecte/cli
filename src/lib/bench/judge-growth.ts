/** The verdict of the type bench: each scenario of the head against the base, pure. */
import type { GrowthRow, GrowthVerdict } from './judge-growth.types.ts'
import type { TreeCounts } from './measure-tree.types.ts'

/**
 * Per version and scenario: `over` above base × (1 + threshold), `shrunk` below base × (1 − threshold), `within`
 * between, `new` at head only, `gone` at base only. A base of 0: head 0 is `within`, above it `over`.
 */
export function judgeGrowth(params: {
	base: TreeCounts
	head: TreeCounts
	threshold: number
}): GrowthRow[] {
	const { base, head, threshold } = params
	const versions = [...new Set([...Object.keys(head), ...Object.keys(base)])]
	return versions.flatMap(function rowsOf(version): GrowthRow[] {
		const atHead = head[version] ?? {}
		const atBase = base[version] ?? {}
		const scenarios = [...new Set([...Object.keys(atHead), ...Object.keys(atBase)])]
		return scenarios.map(function rowOf(scenario): GrowthRow {
			const headCount = atHead[scenario]?.Instantiations
			const baseCount = atBase[scenario]?.Instantiations
			if (baseCount === undefined) return { version, scenario, head: headCount, verdict: 'new' }
			if (headCount === undefined) return { version, scenario, base: baseCount, verdict: 'gone' }
			return {
				version,
				scenario,
				base: baseCount,
				head: headCount,
				verdict: verdictOf({ base: baseCount, head: headCount, threshold }),
			}
		})
	})
}

/** How a head count stands against its base count, both present. */
function verdictOf(params: { base: number; head: number; threshold: number }): GrowthVerdict {
	const { base, head, threshold } = params
	if (head > base * (1 + threshold)) return 'over'
	if (head < base * (1 - threshold)) return 'shrunk'
	return 'within'
}
