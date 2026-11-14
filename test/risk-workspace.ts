/**
 * The `risk.jsonl` a test writes by hand into a lot folder or a hand-over folder: one JSON line per record, in the
 * order given. Plain files: no code under test.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { RISK_TEST_AT } from './risk-workspace.constants.ts'

import type {
	Effort,
	RiskClass,
	RiskDerivedLine,
	RiskEffortLine,
	RiskReason,
} from '../src/lib/risk/risk.types.ts'

/** Writes `lines` as the whole `risk.jsonl` of `folder`. */
export function writeRiskLines(params: {
	folder: string
	lines: ReadonlyArray<RiskEffortLine | RiskDerivedLine>
}): void {
	const text = params.lines
		.map(function lineText(line) {
			return `${JSON.stringify(line)}\n`
		})
		.join('')
	writeFileSync(join(params.folder, 'risk.jsonl'), text)
}

/** A person's effort line (by `reviewer`). */
export function effortLineOf(params: {
	effort: Effort
	reason?: string
	class?: RiskClass
}): RiskEffortLine {
	return {
		schema: 1,
		kind: 'effort',
		at: RISK_TEST_AT,
		effort: params.effort,
		...(params.class === undefined ? {} : { class: params.class }),
		by: 'reviewer',
		...(params.reason === undefined ? {} : { reason: params.reason }),
	}
}

/** A derivation's line made at a snapshot. */
export function derivedLineOf(params: {
	class: RiskClass
	reasons: RiskReason[]
	from?: RiskDerivedLine['from']
}): RiskDerivedLine {
	return {
		schema: 1,
		kind: 'derived',
		at: RISK_TEST_AT,
		class: params.class,
		reasons: params.reasons,
		from: params.from ?? 'snapshot',
	}
}
