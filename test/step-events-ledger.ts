/**
 * Reads of the files a step leaves, for the cases that spy on the event writer: kept apart from the lot helpers
 * (which import the step recorder, so the writer a spy replaces).
 */
import { existsSync, readFileSync } from 'node:fs'

import { gitPathOf } from './gate-records.ts'
import { TDD_LEDGER_FILE } from './step-events-tdd.constants.ts'

import type { TddLedger } from '../src/lib/tdd/tdd.types.ts'

/** The kinds of the tdd ledger of the worktree at `root` (none when it does not exist yet). */
export function ledgerKindsOf(root: string): string[] {
	const path = gitPathOf({ root, name: TDD_LEDGER_FILE })
	if (!existsSync(path)) return []
	return (JSON.parse(readFileSync(path, 'utf8')) as TddLedger).entries.map((entry) => entry.kind)
}
