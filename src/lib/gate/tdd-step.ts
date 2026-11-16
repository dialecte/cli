/** The gate's `tdd` step: the receipts of the change's test cases (`checkTddReceipts`) as a step result. */
import { checkTddReceipts } from '../tdd/check-tdd-receipts.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { TddCheck } from '../tdd/tdd.types.ts'
import type { StepResult } from './gate.types.ts'

/**
 * The receipts of the change's test cases, measured from HEAD (the uncommitted lot), else from where HEAD left `ref`,
 * or from the whole branch's base (`wholeBranch`).
 */
export async function runTddStep(params: {
	cwd: string
	packageJson: PackageJson
	ref: string | undefined
	wholeBranch: boolean
}): Promise<StepResult> {
	const check = await checkTddReceipts({
		root: params.cwd,
		packageJson: params.packageJson,
		ref: params.ref,
		wholeBranch: params.wholeBranch,
	})
	return tddStepResultOf(check)
}

/** The step result of a tdd judgement: its whole-branch base line (unless skipped) before its evidence lines. */
export function tddStepResultOf(check: TddCheck): StepResult {
	// the whole-branch base under the step's line (a skipped step measured nothing from it)
	const details = [
		...(check.baseNote && check.status !== 'skipped' ? [check.baseNote] : []),
		...(check.details ?? []),
	]
	return {
		step: TDD_STEP,
		status: check.status,
		counts: {},
		restored: [],
		...(check.reason && { reason: check.reason }),
		...(check.note && { note: check.note }),
		...(check.lines?.length && { tail: check.lines.join('\n') }),
		...(details.length && { details }),
		...(check.cases && { cases: check.cases }),
		...(check.moved?.length && { moved: check.moved }),
		...(check.duplicates?.length && { duplicates: check.duplicates }),
	}
}
