/** A hook's output read for the record `gate --hook` answered from: the full line as today (A23), the release line. */
import {
	WRITTEN_REUSE_AT,
	WRITTEN_REUSE_HEAD,
	WRITTEN_REUSE_TREE,
} from '../../../test/gate-hook.constants.ts'
import { hookSummarySteps, readHookSteps } from './hook-output.ts'

import { describe, expect, it } from 'vitest'

const HEADER = ['', '> demo@1.0.0 test:hook', '> node src/cli.ts gate --hook']
const BASE_LINE = `gate --hook: base ${'a'.repeat(40)} (base-branch), reused`

/** The summary of a hook whose `test:hook` step printed `lines` and passed. */
function summaryOf(lines: string[]) {
	return hookSummarySteps({ steps: readHookSteps([...HEADER, ...lines].join('\n')), passed: true })
}

describe('a hook that reused a record: the line is read into the step', () => {
	it.each([
		{
			label: 'A23: today’s line of a green gate --full',
			line: `gate --hook: tests reused from gate --full green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`,
		},
		{
			label: 'the line of a green gate --release',
			line: `gate --hook: tests reused from gate --release green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`,
		},
	])('$label, then the base line → test:hook reused with its time and short HEAD', ({ line }) => {
		expect(summaryOf([line, BASE_LINE])).toEqual([
			expect.objectContaining({
				name: 'test:hook',
				failed: false,
				reused: { at: WRITTEN_REUSE_AT, head: WRITTEN_REUSE_HEAD },
			}),
		])
	})

	it('a base line of two ids (selected T0, T4), then the reuse line → the step is still reused with its time and short HEAD', () => {
		expect(
			summaryOf([
				`gate --hook: base ${'a'.repeat(40)} (handover), selected T0, T4`,
				`gate --hook: tests reused from gate --release green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`,
			]),
		).toEqual([
			expect.objectContaining({
				name: 'test:hook',
				reused: { at: WRITTEN_REUSE_AT, head: WRITTEN_REUSE_HEAD },
			}),
		])
	})

	it('a base line and no reuse line (the tests ran) → test:hook is not marked reused', () => {
		const [step] = summaryOf([
			`gate --hook: base ${'a'.repeat(40)} (base-branch), selected T0`,
			'      Tests  4 passed (4)',
		])

		expect(step).toMatchObject({ name: 'test:hook', counts: { tests: { passed: 4, total: 4 } } })
		expect(step).not.toHaveProperty('reused')
	})
})
