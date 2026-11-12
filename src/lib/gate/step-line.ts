/** A gate step's line as `dialecte gate` and `dialecte contrib` print it: its mark, its name, then what it said. */
import { NOT_RUN_STEP_DETAIL, STEP_LINE_MARKS } from './gate-config.constants.ts'
import { renderStepCounts } from './step-counts.ts'

import type { StepRerun, StepResult } from './gate.types.ts'

/** `ok    tests  exit 0  tests 3 passed / 3`, `skip  docs  no npm script "doc:build"`, `FAIL  check  exit 1`. */
export function renderStepLine(result: StepResult): string {
	return [STEP_LINE_MARKS[result.status], result.step.name, renderStepDetail(result)]
		.filter(Boolean)
		.join('  ')
}

/** What a step's line says after its name: the exit code, the counts, the rerun, why it failed, its note, what was restored. */
export function renderStepDetail(result: StepResult): string {
	// a step left unrun says why when its run says it (a step of the list unwired), else an earlier step failed
	if (result.status === 'not-run') return result.reason ?? NOT_RUN_STEP_DETAIL
	if (result.status === 'skipped') return result.reason ?? ''
	const restored = result.restored.length ? `restored ${result.restored.join(', ')}` : ''
	const failure = result.reason && result.reason !== `exit ${result.exitCode}` ? result.reason : ''
	return [
		result.exitCode === undefined ? '' : `exit ${result.exitCode}`,
		renderStepCounts(result.counts),
		result.rerun ? renderRerun(result.rerun) : '',
		failure,
		result.note ?? '',
		restored,
	]
		.filter(Boolean)
		.join('  ')
}

/** `serial rerun of 3 file(s): exit 0, tests 3 passed / 3` - the second run of a failed vitest test step. */
function renderRerun(rerun: StepRerun): string {
	const what = rerun.files.length ? `${rerun.files.length} file(s)` : 'the step'
	return [`serial rerun of ${what}: exit ${rerun.exitCode}`, renderStepCounts(rerun.counts)]
		.filter(Boolean)
		.join(', ')
}
