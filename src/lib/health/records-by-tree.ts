import type { GateRecord } from '../gate-records/gate-records.types.ts'

/** The records of each tree; a record with no key names no tree and is left out. */
export function recordsByTreeOf(params: {
	records: readonly GateRecord[]
}): Map<string, GateRecord[]> {
	const byTree = new Map<string, GateRecord[]>()
	for (const record of params.records) {
		const tree = record.key?.tree
		if (tree === undefined) continue
		const ofTree = byTree.get(tree)
		if (ofTree === undefined) byTree.set(tree, [record])
		else ofTree.push(record)
	}
	return byTree
}
