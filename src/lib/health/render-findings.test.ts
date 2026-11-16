import { OK_LINE, RULE_LABELS } from '../../../test/health-verb.constants.ts'
/** `renderFindings`: the header with the counts, one block per finding (detail, next command), or the ok line. */
import { renderFindings } from './render-findings.ts'

import { describe, expect, it } from 'vitest'

import type { HealthFinding } from './health.types.ts'

const SINCE = '2026-11-15T00:00:00.000Z'

const RED_FINDING: HealthFinding = {
	rule: 'duplicate-work',
	severity: 'red',
	repository: 'cli',
	lot: '0105-cli-lot-scope',
	at: '2026-11-15T04:26:50.772Z',
	text: 'tree c7fef5d3019b: hook ran 15 m 42 s although a green hook record existed (2026-11-15T03:33:49.995Z, rehearsal)',
	detail: ['green  hook 2026-11-15T03:33:49.995Z rehearsal', 'differed: install'],
	next: 'dialecte health --repository cli',
}

const AMBER_FINDING: HealthFinding = {
	rule: 'worktrees',
	severity: 'amber',
	repository: 'scl',
	at: '2026-11-15T12:00:00.000Z',
	text: '3 idle worktrees with no open lot (oldest 0002-scl-x, idle 3 d 0 h)',
	detail: ['committed, not closed: 0002-scl-x'],
}

describe('renderFindings', () => {
	it('no finding → the header with zero counts, then the ok line naming the four rules', () => {
		expect(renderFindings({ findings: [], since: SINCE })).toEqual([
			`health  since ${SINCE}  0 red · 0 amber`,
			OK_LINE,
		])
	})

	it('a red and an amber finding → the header counts them, each block starts with its mark, label, repository, lot and text', () => {
		expect(renderFindings({ findings: [RED_FINDING, AMBER_FINDING], since: SINCE })).toEqual([
			`health  since ${SINCE}  1 red · 1 amber`,
			`✗ duplicate work  cli 0105-cli-lot-scope  ${RED_FINDING.text}`,
			'    green  hook 2026-11-15T03:33:49.995Z rehearsal',
			'    differed: install',
			'    next: dialecte health --repository cli',
			`! worktrees  scl  ${AMBER_FINDING.text}`,
			'    committed, not closed: 0002-scl-x',
		])
	})

	it('a finding with no next command → no next line after its detail', () => {
		expect(renderFindings({ findings: [AMBER_FINDING], since: SINCE })).toEqual([
			`health  since ${SINCE}  0 red · 1 amber`,
			`! worktrees  scl  ${AMBER_FINDING.text}`,
			'    committed, not closed: 0002-scl-x',
		])
	})

	it('a finding with no detail → its line, then its next command', () => {
		const bare: HealthFinding = { ...RED_FINDING, detail: [] }

		expect(renderFindings({ findings: [bare], since: SINCE })).toEqual([
			`health  since ${SINCE}  1 red · 0 amber`,
			`✗ duplicate work  cli 0105-cli-lot-scope  ${RED_FINDING.text}`,
			'    next: dialecte health --repository cli',
		])
	})

	for (const { rule, label } of RULE_LABELS)
		it(`${rule} → the label ${label}`, () => {
			const finding: HealthFinding = { ...AMBER_FINDING, rule, detail: [] }

			expect(renderFindings({ findings: [finding], since: SINCE })[1]).toBe(
				`! ${label}  scl  ${AMBER_FINDING.text}`,
			)
		})
})
