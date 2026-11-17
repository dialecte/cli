/**
 * The pull request of a lot is its final state rendered from its records through one template: the parts the records
 * hold, "not recorded" for a record missing, never a guess, and never what stays private.
 */
import { composePullRequest, keptTextOf } from './compose-pull-request.ts'

import { describe, expect, it } from 'vitest'

import type { PullRequestSources } from './pull-request.types.ts'

const TEMPLATE = `<!-- dialecte: rendered from the lot's records -->
### Summary

<!-- dialecte:summary -->

### Behaviours

<!-- dialecte:behaviours -->

### Changelog

<!-- dialecte:changelog -->

### Tests

<!-- dialecte:tests -->

### Review

<!-- dialecte:review -->

### Risk and effort

<!-- dialecte:risk -->

### Overlaps

<!-- dialecte:overlaps -->

### Issue

<!-- dialecte:issue -->

### Checklist

<!-- dialecte:checklist -->

<!-- dialecte:kept -->
### For the reviewer

- [ ] The code is reviewed
`

const TREE = 'a'.repeat(64)
const OTHER_TREE = 'b'.repeat(64)
const HEAD = '0123456789abcdef'

/** A lot with every record, on the tree it lands. */
const FULL: PullRequestSources = {
	messages: ['feat(x): x lands', 'test(x): x keeps its cases'],
	summary: 'X lands through one template.',
	steps: [
		{
			title: 'the template',
			behaviours: ['a lot -> its body', 'a missing record -> not recorded'],
		},
		{ title: 'the check', behaviours: ['a forbidden word -> refused'] },
	],
	issue: 12,
	changelog: {
		kind: 'entries',
		entries: [
			{ section: 'Added', text: '- `lot pr` renders the body.', file: 'changes/x.md' },
			{ section: 'Changed', text: '- `lot land` uses it.', file: 'changes/x.md' },
		],
	},
	tests: {
		schema: 1,
		tdd: {
			at: '2026-11-17T00:00:00Z',
			head: HEAD,
			stateHash: TREE,
			cases: [
				{ file: 'src/x.test.ts', name: 'a', status: 'green' },
				{ file: 'src/x.test.ts', name: 'b', status: 'green' },
				{ file: 'src/x.test.ts', name: 'c', status: 'accepted' },
			],
			counts: { green: 2, accepted: 1 },
		},
		gate: {
			mode: 'full',
			at: '2026-11-17T00:00:00Z',
			head: HEAD,
			stateHash: TREE,
			tests: { passed: 40, failed: 0, skipped: 2, total: 42 },
			testFiles: { passed: 5, failed: 0, total: 5 },
		},
	},
	treeHash: TREE,
	review: {
		findings: [
			{
				schema: 1,
				kind: 'finding',
				id: 'R1-1',
				round: 1,
				severity: 'blocking',
				file: 'src/x.ts',
				state: 'fixed',
				closedBy: { round: 2 },
			},
			{ schema: 1, kind: 'finding', id: 'R1-2', round: 1, severity: 'nit', state: 'accepted' },
		],
		verdicts: [
			{
				schema: 1,
				kind: 'verdict',
				at: '2026-11-17T01:00:00Z',
				by: { kind: 'station', station: 'reviewer', round: 2 },
				vendor: 'anthropic',
				model: 'claude-opus-5-5',
				verdict: 'approve',
			},
			{
				schema: 1,
				kind: 'verdict',
				at: '2026-11-17T02:00:00Z',
				by: { kind: 'verify', name: 'orchestrator' },
				verdict: 'verified',
			},
		],
	},
	riskClass: 'medium',
	overlaps: [{ lot: '0007-repo-other', reason: 'separate lines in one file' }],
	effort: 'medium',
	docsPassed: true,
	versionBumped: false,
	release: false,
}

/** The text of the part under `heading` in a rendered body, up to the next heading. */
function partOf(params: { body: string; heading: string }): string {
	const lines = params.body.split('\n')
	const start = lines.indexOf(`### ${params.heading}`)
	const end = lines.findIndex((line, index) => index > start && line.startsWith('### '))
	return lines
		.slice(start + 1, end === -1 ? undefined : end)
		.join('\n')
		.trim()
}

/** The body of `sources` over the test template, a person's text kept when given. */
function bodyOf(params: { sources: PullRequestSources; kept?: string }): string {
	const text = composePullRequest({
		template: TEMPLATE,
		sources: params.sources,
		kept: params.kept,
	})
	if ('refusal' in text) throw new Error(text.refusal)
	return text.body
}

describe('composePullRequest renders the lot from its records', () => {
	it('a lot with every record → the whole body from the records, no marker left', () => {
		const text = composePullRequest({ template: TEMPLATE, sources: FULL, kept: undefined })

		expect(text).toEqual({
			title: 'feat(x): x lands',
			body: `### Summary

X lands through one template.

Also in this commit:
- test(x): x keeps its cases

### Behaviours

**the template**

- a lot -> its body
- a missing record -> not recorded

**the check**

- a forbidden word -> refused

### Changelog

#### Added

- \`lot pr\` renders the body.

#### Changed

- \`lot land\` uses it.

### Tests

- tdd: 3 cases (2 green, 1 accepted) on 0123456789ab
- gate (full): 40 of 42 tests passed, 0 failed, 2 skipped, in 5 files on 0123456789ab

### Review

| Finding | Round | Severity | File | State |
| --- | --- | --- | --- | --- |
| R1-1 | 1 | blocking | \`src/x.ts\` | fixed in round 2 |
| R1-2 | 1 | nit | - | accepted |

Verdicts:
- reviewer round 2 (anthropic claude-opus-5-5): approve
- verify by orchestrator: verified

### Risk and effort

risk class medium · effort medium

### Overlaps

- 0007: separate lines in one file

### Issue

Closes #12

### Checklist

- [x] Tests: every case of the change answered by tdd on this tree (green, accepted, revised or unchanged), no gate failure recorded on it
- [x] Changelog: a fragment, or a no-entry note with its reason
- [x] Documentation: the gate's docs step passed
- [x] Version: bumped only by a release lot

### For the reviewer

- [ ] The code is reviewed`,
		})
	})

	it('a lot with no record but its message → every part reads not recorded, no issue named, boxes left', () => {
		const body = bodyOf({
			sources: { messages: ['feat(x): x'], treeHash: TREE, versionBumped: true, release: false },
		})

		expect(
			[
				'Summary',
				'Behaviours',
				'Changelog',
				'Tests',
				'Review',
				'Risk and effort',
				'Overlaps',
				'Issue',
			].map((heading) => partOf({ body, heading })),
		).toEqual([
			'not recorded',
			'not recorded',
			'not recorded',
			'not recorded',
			'not recorded',
			'risk class not recorded · effort not recorded',
			'none',
			'none named',
		])
		expect(partOf({ body, heading: 'Checklist' })).not.toContain('[x]')
	})

	it('tests.json parts taken on another tree → both read stale, never their counts, tests box left', () => {
		const body = bodyOf({ sources: { ...FULL, treeHash: OTHER_TREE } })

		expect(partOf({ body, heading: 'Tests' })).toBe(
			[
				'- tdd: stale, taken on 0123456789ab, not the tree this pull request lands',
				'- gate (full): stale, taken on 0123456789ab, not the tree this pull request lands',
			].join('\n'),
		)
		expect(partOf({ body, heading: 'Checklist' })).toContain('- [ ] Tests:')
	})

	it('a tdd part with a case still red and no gate part → the gate reads not recorded, tests box left', () => {
		const body = bodyOf({
			sources: {
				...FULL,
				tests: {
					schema: 1,
					tdd: {
						at: '2026-11-17T00:00:00Z',
						head: HEAD,
						stateHash: TREE,
						cases: [
							{ file: 'src/x.test.ts', name: 'a', status: 'green' },
							{ file: 'src/x.test.ts', name: 'b', status: 'red' },
						],
						counts: { green: 1, red: 1 },
					},
				},
			},
		})

		expect(partOf({ body, heading: 'Tests' })).toBe(
			['- tdd: 2 cases (1 green, 1 red) on 0123456789ab', '- gate: not recorded'].join('\n'),
		)
		expect(partOf({ body, heading: 'Checklist' })).toContain('- [ ] Tests:')
	})

	it('a no-entry note, no finding, a release lot that bumps → its reason, no finding, version ticked', () => {
		const body = bodyOf({
			sources: {
				...FULL,
				changelog: { kind: 'none', reason: 'wording only', file: 'changes/x.none.md' },
				review: { findings: [], verdicts: [] },
				versionBumped: true,
				release: true,
			},
		})

		expect(partOf({ body, heading: 'Changelog' })).toBe('No changelog entry: wording only')
		expect(partOf({ body, heading: 'Review' })).toBe('No finding.')
		expect(partOf({ body, heading: 'Checklist' })).toContain('- [x] Version:')
	})

	it('a lot that is no release and bumps the version → version box left', () => {
		const body = bodyOf({ sources: { ...FULL, versionBumped: true } })

		expect(partOf({ body, heading: 'Checklist' })).toContain('- [ ] Version:')
	})

	it("a person's text after the kept marker → it replaces the template's kept part", () => {
		const kept = '### For the reviewer\n\n- [x] The code is reviewed\n\nLooks right.'

		const body = bodyOf({ sources: FULL, kept })

		expect(
			body.endsWith(`### Checklist\n\n${partOf({ body, heading: 'Checklist' })}\n\n${kept}`),
		).toBe(true)
	})

	it.each([
		[
			'marking a part twice',
			`${TEMPLATE.replace('### Issue', '<!-- dialecte:review -->\n\n### Issue')}`,
			'marker review twice',
		],
		[
			'marking a filled part after the kept marker',
			TEMPLATE.replace('<!-- dialecte:checklist -->', '').concat('\n<!-- dialecte:checklist -->\n'),
			'marker checklist after kept',
		],
	])('a template %s → refused, the marker named', (_name, template, refusal) => {
		expect(composePullRequest({ template, sources: FULL, kept: undefined })).toEqual({ refusal })
	})

	it('a template missing a marker → refused, the marker named', () => {
		const text = composePullRequest({
			template: TEMPLATE.replace('<!-- dialecte:review -->', ''),
			sources: FULL,
			kept: undefined,
		})

		expect(text).toEqual({ refusal: 'missing marker review' })
	})
})

describe('composePullRequest lists each overlap once', () => {
	it('two records of one lot with one reason → one line', () => {
		const overlap = { lot: '0007-repo-other', reason: 'separate lines in one file' }

		const body = bodyOf({ sources: { ...FULL, overlaps: [overlap, overlap] } })

		expect(partOf({ body, heading: 'Overlaps' })).toBe('- 0007: separate lines in one file')
	})
})

describe("keptTextOf reads a person's part of the current body", () => {
	it('a body holding the kept heading → from that heading on', () => {
		const body = 'rendered\n\n### For the reviewer\n\n- [x] The code is reviewed\n'

		expect(keptTextOf({ template: TEMPLATE, body })).toBe(
			'### For the reviewer\n\n- [x] The code is reviewed',
		)
	})

	it('a body holding the kept heading inside its rendered part too → from the last one on', () => {
		const body = [
			'### For the reviewer',
			'',
			'- [ ] a stale copy rendered by a behaviour holding a line break',
			'',
			'### For the reviewer',
			'',
			'- [x] The code is reviewed',
		].join('\n')

		expect(keptTextOf({ template: TEMPLATE, body })).toBe(
			'### For the reviewer\n\n- [x] The code is reviewed',
		)
	})

	it('a body with Windows line ends → read as the same text', () => {
		const body = 'rendered\r\n\r\n### For the reviewer\r\n\r\n- [x] The code is reviewed\r\n'

		expect(keptTextOf({ template: TEMPLATE, body })).toBe(
			'### For the reviewer\n\n- [x] The code is reviewed',
		)
	})

	it('a body without it (opened by hand) → nothing kept', () => {
		expect(keptTextOf({ template: TEMPLATE, body: 'a body written by hand' })).toBeUndefined()
	})
})
