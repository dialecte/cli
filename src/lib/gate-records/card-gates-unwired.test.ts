/**
 * The card's gate rows of an unwired or an opted-out step: a recorded unwired step reads `not wired (no npm script)`
 * (a failure on a full, release or contrib record, a warning on a fast one), an opted-out step reads its reason as a
 * warning that never blocks; a record written before steps could be unwired is shown as it always was.
 */
import { cardOf, editedPackage } from '../../../test/handover-profile.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { gateLinesOf } from '../../../test/scratch-checks.ts'
import { UNWIRED_NOT_RUN_REASON } from '../gate/gate-config.constants.ts'
import { recordGate } from './gate-records.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { GateMode, StepResult } from '../gate/gate.types.ts'

const CHECK_PASSED: StepResult = {
	step: { name: 'check', run: 'npm run check' },
	status: 'passed',
	counts: {},
	restored: [],
}

/** The failed row of an unwired step on a gate record: the fix beside the fact. A fast record's `!` row keeps the plain text. */
const FAILED_DETAIL = 'not wired (no npm script; or dialecte.gate.skip)'

const SKILLS_STEP: GateStep = { name: 'skills', run: 'npm run skills:check', isDefault: true }

/** A skills step judged unwired before anything ran: `failed` in a full run, `skipped` in a fast one. */
function unwiredSkills(status: 'failed' | 'skipped'): StepResult {
	return {
		step: { ...SKILLS_STEP, unwired: true },
		status,
		counts: {},
		restored: [],
		reason: 'not wired (no npm script "skills:check")',
		unwired: true,
	}
}

/** The docs step as a gate before steps could be unwired recorded it: skipped, the script named, no mark. */
const PRE_RG_DOCS: StepResult = {
	step: { name: 'docs', run: 'npm run doc:build' },
	status: 'skipped',
	counts: {},
	restored: [],
	reason: 'no npm script "doc:build"',
}

/** A skills step the package opted out of. */
const OPTED_OUT_SKILLS: StepResult = {
	step: { ...SKILLS_STEP, optedOut: 'no skills folder' },
	status: 'skipped',
	counts: {},
	restored: [],
	reason: 'opted out: no skills folder',
	optedOut: 'no skills folder',
}

/** The card of a package whose `mode` run was recorded with these results. */
function cardOfRecorded(params: { mode: Exclude<GateMode, 'release'>; results: StepResult[] }) {
	const root = editedPackage({ profile: null })
	recordGate({ root, mode: params.mode, results: params.results })
	return cardOf({ root })
}

/** The rows of the card named `names`, as `--json` prints them. */
function rowsOf(params: {
	card: ReturnType<typeof cardOf>
	names: readonly string[]
}): { name: string; status: string; detail: string }[] {
	return params.card.data.gates
		.filter((line) => params.names.includes(line.name))
		.map(({ name, status, detail }) => ({ name, status, detail }))
}

describe('the card: unwired and opted-out steps', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a full record holding an unwired step that failed → ✗ skills not wired (no npm script; or dialecte.gate.skip), the card BLOCKED', () => {
		const card = cardOfRecorded({ mode: 'full', results: [CHECK_PASSED, unwiredSkills('failed')] })

		expect({
			rows: rowsOf({ card, names: ['skills'] }),
			printed: gateLinesOf(card.text).filter((line) => line.startsWith('✗ skills')),
			verdict: card.data.verdict,
		}).toEqual({
			rows: [{ name: 'skills', status: 'failed', detail: FAILED_DETAIL }],
			printed: [`✗ skills ${FAILED_DETAIL}`],
			verdict: 'BLOCKED',
		})
	})

	it('R3-4 a full record holding an unwired step that failed → the ✗ skills row names dialecte.gate.skip', () => {
		const card = cardOfRecorded({ mode: 'full', results: [CHECK_PASSED, unwiredSkills('failed')] })

		expect(rowsOf({ card, names: ['skills'] }).map((row) => row.detail)).toEqual([FAILED_DETAIL])
	})

	it('a fast record holding an unwired step that was skipped → ! skills not wired (no npm script), a warning', () => {
		const card = cardOfRecorded({ mode: 'fast', results: [CHECK_PASSED, unwiredSkills('skipped')] })

		expect({
			rows: rowsOf({ card, names: ['skills'] }),
			printed: gateLinesOf(card.text).filter((line) => line.startsWith('! skills')),
			blocked: card.data.verdict === 'BLOCKED',
			failedGates: card.data.failedGates.filter((name) => name.includes('skills')),
		}).toEqual({
			rows: [{ name: 'skills', status: 'warning', detail: 'not wired (no npm script)' }],
			printed: ['! skills not wired (no npm script)'],
			blocked: false,
			failedGates: [],
		})
	})

	it('a full record holding two unwired steps that failed (skills and build) → two ✗ lines, the wired ones not run, BLOCKED', () => {
		const buildUnwired: StepResult = {
			step: { name: 'build', run: 'npm run build', isDefault: true, unwired: true },
			status: 'failed',
			counts: {},
			restored: [],
			reason: 'not wired (no npm script "build")',
			unwired: true,
		}
		function notRunStep(name: string): StepResult {
			return {
				step: { name, run: `npm run ${name}`, isDefault: true },
				status: 'not-run',
				counts: {},
				restored: [],
				reason: 'not run: a step of the list is not wired',
			}
		}
		const card = cardOfRecorded({
			mode: 'full',
			results: [notRunStep('check'), unwiredSkills('failed'), buildUnwired, notRunStep('tests')],
		})

		expect({
			failed: rowsOf({ card, names: ['skills', 'build'] }),
			printed: gateLinesOf(card.text).filter((line) => /^✗ (skills|build)/.test(line)),
			verdict: card.data.verdict,
		}).toEqual({
			failed: [
				{ name: 'skills', status: 'failed', detail: FAILED_DETAIL },
				{ name: 'build', status: 'failed', detail: FAILED_DETAIL },
			],
			printed: [`✗ skills ${FAILED_DETAIL}`, `✗ build ${FAILED_DETAIL}`],
			verdict: 'BLOCKED',
		})
	})

	it('a full record holding steps left not-run by an unwired list → their card lines read the recorded reason, not "an earlier step failed"', () => {
		function notRunStep(name: string): StepResult {
			return {
				step: { name, run: `npm run ${name}`, isDefault: true },
				status: 'not-run',
				counts: {},
				restored: [],
				reason: UNWIRED_NOT_RUN_REASON,
			}
		}
		const card = cardOfRecorded({
			mode: 'full',
			results: [notRunStep('check'), unwiredSkills('failed'), notRunStep('tests')],
		})

		expect({
			rows: rowsOf({ card, names: ['check', 'tests'] }).map((row) => row.detail),
			printed: gateLinesOf(card.text).filter((line) => /^\S+ (check|tests) /.test(line)),
		}).toEqual({
			rows: [UNWIRED_NOT_RUN_REASON, UNWIRED_NOT_RUN_REASON],
			printed: [
				expect.stringContaining(`check ${UNWIRED_NOT_RUN_REASON}`),
				expect.stringContaining(`tests ${UNWIRED_NOT_RUN_REASON}`),
			],
		})
	})

	it('an opted-out step beside a record from before the marks → the opted-out one reads its reason, the old one as it was, no BLOCKED', () => {
		const card = cardOfRecorded({
			mode: 'full',
			results: [CHECK_PASSED, OPTED_OUT_SKILLS, PRE_RG_DOCS],
		})

		expect({
			rows: rowsOf({ card, names: ['skills', 'docs'] }),
			printed: gateLinesOf(card.text).filter((line) => /^! (skills|docs)/.test(line)),
			blocked: card.data.verdict === 'BLOCKED',
		}).toEqual({
			rows: [
				{ name: 'skills', status: 'warning', detail: 'opted out: no skills folder' },
				{ name: 'docs', status: 'warning', detail: 'not run here (no doc:build script)' },
			],
			printed: [
				'! skills opted out: no skills folder',
				'! docs not run here (no doc:build script)',
			],
			blocked: false,
		})
	})

	it('a record from before the marks beside an unwired step that failed → the old step as it was, the new one ✗, BLOCKED', () => {
		const card = cardOfRecorded({
			mode: 'full',
			results: [CHECK_PASSED, PRE_RG_DOCS, unwiredSkills('failed')],
		})

		expect({
			rows: rowsOf({ card, names: ['docs', 'skills'] }),
			verdict: card.data.verdict,
		}).toEqual({
			rows: [
				{ name: 'docs', status: 'warning', detail: 'not run here (no doc:build script)' },
				{ name: 'skills', status: 'failed', detail: FAILED_DETAIL },
			],
			verdict: 'BLOCKED',
		})
	})
})
