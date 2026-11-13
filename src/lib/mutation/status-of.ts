/** What a package's mutation runs still owe: what `mutants status` prints. */
import { itemsOf, pendingOf, readLedger } from './ledger.ts'
import { packageNameOf } from './run-store.ts'

import type { KeyedLedgerItem, PackageStatus, StartTimeReader } from './mutation.types.ts'

/** The package at `root`: its running and died runs, its new items by first lot, its scheduled items by follow-up. */
export function statusOf(params: {
	root: string
	isAlive: (pid: number) => boolean
	startTimeOf: StartTimeReader
}): PackageStatus {
	const { root, isAlive, startTimeOf } = params
	const packageName = packageNameOf(root)
	const pending = pendingOf({ root, isAlive, startTimeOf })
	const scheduled = itemsOf({ ledger: readLedger({ root }), packageName }).filter(
		(item) => item.state === 'scheduled',
	)
	return {
		packageName,
		status: {
			running: pending.running,
			died: pending.died,
			new: groupBy({ items: pending.new, by: (item) => item.firstSeen.lot }),
			scheduled: groupBy({ items: scheduled, by: (item) => item.followUp ?? '' }),
		},
	}
}

function groupBy(params: {
	items: readonly KeyedLedgerItem[]
	by: (item: KeyedLedgerItem) => string
}): Record<string, KeyedLedgerItem[]> {
	const groups: Record<string, KeyedLedgerItem[]> = {}
	for (const item of params.items) (groups[params.by(item)] ??= []).push(item)
	return groups
}
