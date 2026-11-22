/**
 * The pull request of a lot is its final state rendered from its records through one template: the parts the records
 * hold, "not recorded" for a record missing, never a guess, and never what stays private.
 */
import { composeChangeRequest, keptTextOf, titleVersionFault } from './compose-change-request.ts'

import { describe, expect, it } from 'vitest'

import type { BodyQuality } from '../quality/quality.types.ts'
import type { ChangeRequestSources } from './change-request.types.ts'

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

### Depends on

<!-- dialecte:depends -->

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
const FULL: ChangeRequestSources = {
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
function bodyOf(params: { sources: ChangeRequestSources; kept?: string }): string {
	const text = composeChangeRequest({
		template: TEMPLATE,
		sources: params.sources,
		kept: params.kept,
	})
	if ('refusal' in text) throw new Error(text.refusal)
	return text.body
}

describe('composeChangeRequest renders the lot from its records', () => {
	it('a lot with every record → the whole body from the records, no marker left', () => {
		const text = composeChangeRequest({ template: TEMPLATE, sources: FULL, kept: undefined })

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
- verify: verified

### Risk and effort

risk class medium · effort medium

### Overlaps

- 0007: separate lines in one file

### Depends on

not recorded

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
			sources: { messages: ['feat(x): x'], treeHash: TREE, bumpedTo: '1.1.0', release: false },
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
			[
				'- tdd: 2 cases (1 green, 1 red) on 0123456789ab',
				'- gate: not recorded, CI is the proof',
			].join('\n'),
		)
		expect(partOf({ body, heading: 'Checklist' })).toContain('- [ ] Tests:')
	})

	it('a no-entry note, no finding, a release lot that bumps → its reason, no finding, version ticked', () => {
		const body = bodyOf({
			sources: {
				...FULL,
				changelog: { kind: 'none', reason: 'wording only', file: 'changes/x.none.md' },
				review: { findings: [], verdicts: [] },
				bumpedTo: '1.1.0',
				release: true,
			},
		})

		expect(partOf({ body, heading: 'Changelog' })).toBe('No changelog entry: wording only')
		expect(partOf({ body, heading: 'Review' })).toBe('No finding.')
		expect(partOf({ body, heading: 'Checklist' })).toContain('- [x] Version:')
	})

	it('a lot that is no release and bumps the version → version box left', () => {
		const body = bodyOf({ sources: { ...FULL, bumpedTo: '1.1.0' } })

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
		expect(composeChangeRequest({ template, sources: FULL, kept: undefined })).toEqual({ refusal })
	})

	it('a template missing a marker → refused, the marker named', () => {
		const text = composeChangeRequest({
			template: TEMPLATE.replace('<!-- dialecte:review -->', ''),
			sources: FULL,
			kept: undefined,
		})

		expect(text).toEqual({ refusal: 'missing marker <!-- dialecte:review -->' })
	})
})

describe('composeChangeRequest ticks the tests box only on a gate record', () => {
	it('every case green and no gate record → the box left, saying CI is the proof', () => {
		const tdd = FULL.tests?.tdd
		const body = bodyOf({ sources: { ...FULL, tests: { schema: 1, ...(tdd && { tdd }) } } })

		expect(partOf({ body, heading: 'Checklist' }).split('\n')[0]).toBe(
			'- [ ] Tests: every case of the change answered by tdd on this tree (green, accepted, revised or unchanged), no gate failure recorded on it (gate: not recorded, CI is the proof)',
		)
	})
})

describe('composeChangeRequest names no reviewer', () => {
	it.each([
		['a person', { kind: 'person' as const, name: 'Jane Doe' }, '- person: approve'],
		[
			'the orchestrator',
			{ kind: 'person' as const, name: 'orchestrator' },
			'- orchestrator: approve',
		],
		['a verify by name', { kind: 'verify' as const, name: 'Jane Doe' }, '- verify: approve'],
	])('a verdict by %s → only its kind', (_name, by, line) => {
		const review = {
			findings: [],
			verdicts: [
				{
					schema: 1 as const,
					kind: 'verdict' as const,
					at: '2026-11-17T00:00:00Z',
					by,
					verdict: 'approve',
				},
			],
		}

		const body = bodyOf({ sources: { ...FULL, review } })

		expect(partOf({ body, heading: 'Review' }).split('\n').at(-1)).toBe(line)
	})
})

describe('composeChangeRequest lists each overlap once', () => {
	it('a lot name with no leading index → shown as another lot, never its words', () => {
		const body = bodyOf({
			sources: {
				...FULL,
				overlaps: [{ lot: 'ci2b-export', reason: 'separate lines in one file' }],
			},
		})

		expect(partOf({ body, heading: 'Overlaps' })).toBe('- another lot: separate lines in one file')
	})

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

/** The base the body's quality was judged against. */
const QUALITY_BASE = { commit: 'c'.repeat(40), source: 'lot' as const }

/** A judged body quality holding nothing: each case adds what it shows. */
const JUDGED_NOTHING: BodyQuality = {
	kind: 'judged',
	base: QUALITY_BASE,
	notes: [],
	duplicates: [],
	sharedExports: [],
	docs: [],
}

/** `sizeOf` re-signed, its page untouched: the docs finding of the body. */
const SIZE_DOCS = {
	route: 'doc.core.sizeOf',
	change: 'signature' as const,
	declaredAt: 'src/core/size.ts:1',
	pages: ['doc/api/core.md'],
}

/** The risk part's first line, then which of `holds` a line of it matches and which of `lacks` none does. */
function riskPartOf(params: { quality: BodyQuality; holds: RegExp[]; lacks: RegExp[] }) {
	const lines = partOf({
		body: bodyOf({ sources: { ...FULL, quality: params.quality } }),
		heading: 'Risk and effort',
	})
		.split('\n')
		.map((line) => line.trim())
	return {
		riskLine: lines[0],
		held: params.holds.filter((pattern) => lines.some((line) => pattern.test(line))),
		lacked: params.lacks.filter((pattern) => !lines.some((line) => pattern.test(line))),
	}
}

describe('composeChangeRequest renders the quality in the risk part', () => {
	const testCases: Record<string, { quality: BodyQuality; holds: RegExp[]; lacks: RegExp[] }> = {
		'a shared export changed → its line under the risk line, as rules words it': {
			quality: {
				...JUDGED_NOTHING,
				sharedExports: [
					{
						file: 'src/core/size.ts',
						line: 1,
						name: 'sizeOf',
						folder: 'src/core',
						importers: ['src/use'],
						changes: ['signature', 'behaviour'],
						allowed: false,
					},
				],
			},
			holds: [/`sizeOf` \(src\/core\) is used by src\/use: signature, behaviour/],
			lacks: [/✗/],
		},
		'a duplicate read → its line, as rules words it': {
			quality: {
				...JUDGED_NOTHING,
				duplicates: [
					{
						file: 'src/read/keys.ts',
						line: 3,
						name: 'keysOfRecord',
						signal: 'reads',
						existing: { file: 'src/read/owner.ts', line: 3, name: 'readOwner' },
						element: 'Widget',
						attributes: ['@NAMING'],
						allowed: false,
					},
				],
			},
			holds: [
				/`keysOfRecord` reads like `readOwner` \(src\/read\/owner\.ts:3\): reuse it or say why/,
			],
			lacks: [/✗/],
		},
		'a public export left without docs → a ✗ line naming it': {
			quality: { ...JUDGED_NOTHING, docs: [{ ...SIZE_DOCS, allowed: false }] },
			holds: [/✗.*doc\.core\.sizeOf/],
			lacks: [],
		},
		'the same docs finding opted out at HEAD → no ✗ line, the opt-out counted': {
			quality: { ...JUDGED_NOTHING, docs: [{ ...SIZE_DOCS, allowed: true }] },
			holds: [/1 allowed/],
			lacks: [/✗/, /doc\.core\.sizeOf/],
		},
		'a public API unknown and aliases changed → the notes rules prints': {
			quality: {
				...JUDGED_NOTHING,
				notes: [
					'! public API unknown (an export source changed while every api.json did not: run dialecte skills generate)',
					"aliases changed: base edges read with the tree's",
				],
			},
			holds: [
				/! public API unknown \(an export source changed while every api\.json did not: run dialecte skills generate\)$/,
				/aliases changed: base edges read with the tree's$/,
			],
			lacks: [],
		},
		'a package without package.json → Quality: not judged, with why': {
			quality: { kind: 'not-judged', why: 'no package.json' },
			holds: [/^Quality: not judged \(no package\.json\)$/],
			lacks: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(riskPartOf(testCase)).toEqual({
				riskLine: 'risk class medium · effort medium',
				held: testCase.holds,
				lacked: testCase.lacks,
			})
		})
})

/** Twelve shared exports changed: the body lists ten, then how many more. */
const TWELVE_SHARED = Array.from({ length: 12 }, (_, index) => ({
	file: 'src/core/many.ts',
	line: index * 4 + 1,
	name: `size${index + 1}Of`,
	folder: 'src/core',
	importers: ['src/use'],
	changes: ['signature' as const],
	allowed: false,
}))

/** The lines of the risk part of a body holding `quality`, trimmed. */
function riskLinesOf(quality: BodyQuality): string[] {
	return partOf({ body: bodyOf({ sources: { ...FULL, quality } }), heading: 'Risk and effort' })
		.split('\n')
		.map((line) => line.trim())
}

describe('composeChangeRequest keeps the quality lines short and the notes apart', () => {
	it('a public entry removed while its page still names it → no ✗ line, its note once', () => {
		const note = 'public API: doc.core.sizeOf removed: still named by doc/api/core.md'

		expect(
			riskLinesOf({
				...JUDGED_NOTHING,
				notes: [note],
				docs: [
					{
						route: 'doc.core.sizeOf',
						change: 'removed',
						pages: ['doc/api/core.md'],
						allowed: false,
					},
				],
			}).filter((line) => line.includes('✗') || line.includes('doc.core.sizeOf')),
		).toEqual([
			expect.stringMatching(
				/public API: doc\.core\.sizeOf removed: still named by doc\/api\/core\.md$/,
			),
		])
	})

	it('twelve shared exports → ten lines, then how many more and the run listing them all', () => {
		const lines = riskLinesOf({ ...JUDGED_NOTHING, sharedExports: TWELVE_SHARED })

		expect({
			listed: lines.filter((line) => /`size\d+Of`/.test(line)).length,
			more: lines.filter((line) => line.includes('more (dialecte rules --base')),
		}).toEqual({
			listed: 10,
			more: [expect.stringMatching(/… 2 more \(dialecte rules --base c+ --json\)$/)],
		})
	})
})

describe('titleVersionFault', () => {
	it.each([
		{ label: 'the stale version', title: 'chore(release): @scope/x 0.8.4' },
		{ label: 'a pre-release of it', title: 'chore(release): @scope/x 0.9.0-rc.1' },
		{ label: 'a longer patch number', title: 'chore(release): @scope/x 0.9.01' },
		{ label: 'a longer major number', title: 'chore(release): @scope/x 10.9.0' },
		{ label: 'its digits with other separators', title: 'chore(release): @scope/x 0x9x0' },
	])('a lot setting 0.9.0 titled with $label → refused naming lot brief', ({ title }) => {
		expect(
			titleVersionFault({ sources: { messages: [title], bumpedTo: '0.9.0' }, lot: '0042-x' }),
		).toBe(
			`the title "${title}" does not name 0.9.0, the version this lot sets: correct lots[0].message with dialecte lot brief 0042-x --from <brief.json> --by <who> --reason <why>`,
		)
	})

	it.each([
		{ label: 'the version set', title: 'chore(release): @scope/x 0.9.0' },
		{ label: 'the version set, v-prefixed', title: 'chore(release): v0.9.0' },
		{ label: 'the version set, ending the sentence', title: 'chore(release): ship 0.9.0.' },
	])('a lot setting 0.9.0 titled with $label → no fault', ({ title }) => {
		expect(
			titleVersionFault({ sources: { messages: [title], bumpedTo: '0.9.0' }, lot: '0042-x' }),
		).toBeUndefined()
	})

	it('a lot that sets no version → no fault whatever its title', () => {
		expect(
			titleVersionFault({
				sources: { messages: ['chore(release): @scope/x 0.8.4'] },
				lot: '0042-x',
			}),
		).toBeUndefined()
	})
})
