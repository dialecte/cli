import { applyAllowComments } from './allow-comments.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding, RuleName } from './check-code-rules.types.ts'

const GRAMMAR = 'dialecte-allow <rule>[, <rule>]: <reason>'
const FILE = 'src/lib/read-things.ts'
const REASON = 'three fixed tags, one query each'

type FoundAt = { rule: RuleName; line: number; functionLine?: number }

type Outcome = {
	findings: { file: string; rule: RuleName; line: number; severity: string }[]
	allowed: Partial<Record<RuleName, number>>
}

type TestCase = {
	lines: string[]
	found: FoundAt[]
	expected: Outcome
	only?: boolean
}

type MessageCase = {
	lines: string[]
	found: FoundAt[]
	/** The rule of the finding whose message is read. */
	messageRule: RuleName
	/** What that message holds. */
	holds: string[]
	/** What it must not name. */
	absent?: string[]
	only?: boolean
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

function findingOf(found: FoundAt): RuleFinding {
	return {
		file: 'src/lib/read-things.ts',
		line: found.line,
		column: 1,
		rule: found.rule,
		severity: 'error',
		message: 'a finding',
		...(found.functionLine !== undefined && { functionLine: found.functionLine }),
	}
}

function outcomeOf(result: { findings: RuleFinding[]; allowed: Outcome['allowed'] }): Outcome {
	return {
		findings: result.findings
			.map((finding) => ({
				file: finding.file,
				rule: finding.rule,
				line: finding.line,
				severity: finding.severity,
			}))
			.sort((first, second) => first.line - second.line || first.rule.localeCompare(second.rule)),
		allowed: result.allowed,
	}
}

/** How many findings of `rule` there are, and which of `holds` their messages all lack. */
function messageCheckOf(params: {
	findings: RuleFinding[]
	rule: RuleName
	holds: string[]
	absent?: string[]
}): {
	count: number
	missing: string[]
	named: string[]
} {
	const messages = params.findings
		.filter((finding) => finding.rule === params.rule)
		.map((finding) => finding.message)
	return {
		count: messages.length,
		missing: params.holds.filter((part) => !messages.every((message) => message.includes(part))),
		named: (params.absent ?? []).filter((part) =>
			messages.some((message) => message.includes(part)),
		),
	}
}

describe('applyAllowComments', () => {
	const testCases: Record<string, TestCase> = {
		'an opt-out on the line before the finding → the finding is gone, counted': {
			lines: [
				`// dialecte-allow query-in-loop: ${REASON}`,
				'for (const tag of TAGS) await read(tag)',
			],
			found: [{ rule: 'query-in-loop', line: 2 }],
			expected: { findings: [], allowed: { 'query-in-loop': 1 } },
		},
		'an opt-out at the end of the finding line → the finding is gone, counted': {
			lines: [`for (const tag of TAGS) await read(tag) // dialecte-allow query-in-loop: ${REASON}`],
			found: [{ rule: 'query-in-loop', line: 1 }],
			expected: { findings: [], allowed: { 'query-in-loop': 1 } },
		},
		'an opt-out two lines above the finding → not covered: the finding stays and the opt-out is unused':
			{
				lines: [
					`// dialecte-allow query-in-loop: ${REASON}`,
					'const tags = TAGS',
					'for (const tag of tags) await read(tag)',
				],
				found: [{ rule: 'query-in-loop', line: 3 }],
				expected: {
					findings: [
						{ file: FILE, rule: 'unused-allow', line: 1, severity: 'warning' },
						{ file: FILE, rule: 'query-in-loop', line: 3, severity: 'error' },
					],
					allowed: {},
				},
			},
		'an opt-out on the line before a function covers a function-wide finding deeper in it': {
			lines: [
				'const before = 1',
				'const between = 2',
				'',
				`// dialecte-allow argument-mutation: the caller hands a scratch list`,
				'export function addItem(params: Params) {',
				'\tconst count = 1',
				'\tparams.items.push(count)',
				'}',
			],
			found: [{ rule: 'argument-mutation', line: 7, functionLine: 5 }],
			expected: { findings: [], allowed: { 'argument-mutation': 1 } },
		},
		'an opt-out on the line before a long function covers its finding': {
			lines: [
				'const before = 1',
				'const between = 2',
				'',
				`// dialecte-allow long-function: one table of steps, split would hide the order`,
				'export function runSteps() {',
				'\tstep(1)',
				'\tstep(2)',
				'}',
			],
			found: [{ rule: 'long-function', line: 7, functionLine: 5 }],
			expected: { findings: [], allowed: { 'long-function': 1 } },
		},
		'an opt-out on the line before the function of a query-in-loop finding → not covered, only its own line or the line before it count':
			{
				lines: [
					'const before = 1',
					'const between = 2',
					'',
					`// dialecte-allow query-in-loop: ${REASON}`,
					'export async function readAll(nodes: Node[], query: Query) {',
					'\tconst count = nodes.length',
					'\tfor (const node of nodes) await query.getRecord(node)',
					'}',
				],
				found: [{ rule: 'query-in-loop', line: 7, functionLine: 5 }],
				expected: {
					findings: [
						{ file: FILE, rule: 'unused-allow', line: 4, severity: 'warning' },
						{ file: FILE, rule: 'query-in-loop', line: 7, severity: 'error' },
					],
					allowed: {},
				},
			},
		'a reason under 15 characters → an invalid-allow error at its line and the finding stays': {
			lines: ['// dialecte-allow query-in-loop: short', 'for (const tag of TAGS) await read(tag)'],
			found: [{ rule: 'query-in-loop', line: 2 }],
			expected: {
				findings: [
					{ file: FILE, rule: 'invalid-allow', line: 1, severity: 'error' },
					{ file: FILE, rule: 'query-in-loop', line: 2, severity: 'error' },
				],
				allowed: {},
			},
		},
		'a reason of 14 characters → an invalid-allow error and the finding stays': {
			lines: [
				'// dialecte-allow query-in-loop: fourteen chars',
				'for (const tag of TAGS) await read(tag)',
			],
			found: [{ rule: 'query-in-loop', line: 2 }],
			expected: {
				findings: [
					{ file: FILE, rule: 'invalid-allow', line: 1, severity: 'error' },
					{ file: FILE, rule: 'query-in-loop', line: 2, severity: 'error' },
				],
				allowed: {},
			},
		},
		'a reason of exactly 15 characters → the finding is gone': {
			lines: [
				'// dialecte-allow query-in-loop: fifteen chars!!',
				'for (const tag of TAGS) await read(tag)',
			],
			found: [{ rule: 'query-in-loop', line: 2 }],
			expected: { findings: [], allowed: { 'query-in-loop': 1 } },
		},
		'an opt-out naming unused-allow → an invalid-allow error: it is not an allowable rule': {
			lines: [`// dialecte-allow unused-allow: ${REASON}`, 'const tags = TAGS'],
			found: [],
			expected: {
				findings: [{ file: FILE, rule: 'invalid-allow', line: 1, severity: 'error' }],
				allowed: {},
			},
		},
		'an opt-out at the end of line 1 with the finding on line 2 → the finding stays and the opt-out is unused':
			{
				lines: [
					`const tags = TAGS // dialecte-allow query-in-loop: ${REASON}`,
					'for (const tag of TAGS) await read(tag)',
				],
				found: [{ rule: 'query-in-loop', line: 2 }],
				expected: {
					findings: [
						{ file: FILE, rule: 'unused-allow', line: 1, severity: 'warning' },
						{ file: FILE, rule: 'query-in-loop', line: 2, severity: 'error' },
					],
					allowed: {},
				},
			},
		'an unknown rule name → an invalid-allow error and the finding stays': {
			lines: [
				`// dialecte-allow made-up-rule: ${REASON}`,
				'for (const tag of TAGS) await read(tag)',
			],
			found: [{ rule: 'query-in-loop', line: 2 }],
			expected: {
				findings: [
					{ file: FILE, rule: 'invalid-allow', line: 1, severity: 'error' },
					{ file: FILE, rule: 'query-in-loop', line: 2, severity: 'error' },
				],
				allowed: {},
			},
		},
		'an existing rule that is not a quality rule → an invalid-allow error and its finding stays': {
			lines: [`// dialecte-allow abbreviation: ${REASON}`, 'const cfg = 1'],
			found: [{ rule: 'abbreviation', line: 2 }],
			expected: {
				findings: [
					{ file: FILE, rule: 'invalid-allow', line: 1, severity: 'error' },
					{ file: FILE, rule: 'abbreviation', line: 2, severity: 'error' },
				],
				allowed: {},
			},
		},
		'no colon and no reason → an invalid-allow error and the finding stays': {
			lines: ['// dialecte-allow query-in-loop', 'for (const tag of TAGS) await read(tag)'],
			found: [{ rule: 'query-in-loop', line: 2 }],
			expected: {
				findings: [
					{ file: FILE, rule: 'invalid-allow', line: 1, severity: 'error' },
					{ file: FILE, rule: 'query-in-loop', line: 2, severity: 'error' },
				],
				allowed: {},
			},
		},
		'an empty rule list → an invalid-allow error and the finding stays': {
			lines: [`// dialecte-allow : ${REASON}`, 'for (const tag of TAGS) await read(tag)'],
			found: [{ rule: 'query-in-loop', line: 2 }],
			expected: {
				findings: [
					{ file: FILE, rule: 'invalid-allow', line: 1, severity: 'error' },
					{ file: FILE, rule: 'query-in-loop', line: 2, severity: 'error' },
				],
				allowed: {},
			},
		},
		'an opt-out over a line with no finding → an unused-allow warning': {
			lines: [`// dialecte-allow query-in-loop: ${REASON}`, 'const tags = TAGS'],
			found: [],
			expected: {
				findings: [{ file: FILE, rule: 'unused-allow', line: 1, severity: 'warning' }],
				allowed: {},
			},
		},
		'an opt-out naming two rules over a line with one of them → that one is silenced and the other is unused':
			{
				lines: [
					`// dialecte-allow query-in-loop, argument-mutation: ${REASON}`,
					'for (const tag of TAGS) await read(tag)',
				],
				found: [{ rule: 'query-in-loop', line: 2 }],
				expected: {
					findings: [{ file: FILE, rule: 'unused-allow', line: 1, severity: 'warning' }],
					allowed: { 'query-in-loop': 1 },
				},
			},
		'one opt-out over two findings of its rule on the same line → both silenced, counted twice': {
			lines: [
				`// dialecte-allow query-in-loop: ${REASON}`,
				'for (const tag of TAGS) await Promise.all([read(tag), read(tag)])',
			],
			found: [
				{ rule: 'query-in-loop', line: 2 },
				{ rule: 'query-in-loop', line: 2 },
			],
			expected: { findings: [], allowed: { 'query-in-loop': 2 } },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(
				outcomeOf(
					applyAllowComments({
						file: 'src/lib/read-things.ts',
						text: moduleOf(testCase.lines),
						findings: testCase.found.map(findingOf),
					}),
				),
			).toEqual(testCase.expected)
		})
})

describe('applyAllowComments messages', () => {
	const messageCases: Record<string, MessageCase> = {
		'a reason that is too short → the message gives the grammar and the minimum length': {
			lines: ['// dialecte-allow query-in-loop: short', 'for (const tag of TAGS) await read(tag)'],
			found: [{ rule: 'query-in-loop', line: 2 }],
			messageRule: 'invalid-allow',
			holds: [GRAMMAR, 'under 15 characters'],
		},
		'an unknown rule → the message gives the grammar and names the rule': {
			lines: [
				`// dialecte-allow made-up-rule: ${REASON}`,
				'for (const tag of TAGS) await read(tag)',
			],
			found: [{ rule: 'query-in-loop', line: 2 }],
			messageRule: 'invalid-allow',
			holds: [GRAMMAR, 'not an allowable rule', 'made-up-rule'],
		},
		'an existing rule that is not a quality rule → the message gives the grammar and names the rule':
			{
				lines: [`// dialecte-allow abbreviation: ${REASON}`, 'const cfg = 1'],
				found: [{ rule: 'abbreviation', line: 2 }],
				messageRule: 'invalid-allow',
				holds: [GRAMMAR, 'not an allowable rule', 'abbreviation'],
			},
		'a missing colon → the message gives the grammar and says what is missing': {
			lines: ['// dialecte-allow query-in-loop', 'for (const tag of TAGS) await read(tag)'],
			found: [{ rule: 'query-in-loop', line: 2 }],
			messageRule: 'invalid-allow',
			holds: [GRAMMAR, 'malformed'],
		},
		'an empty rule list → the message gives the grammar and says no rule is named': {
			lines: [`// dialecte-allow : ${REASON}`, 'for (const tag of TAGS) await read(tag)'],
			found: [{ rule: 'query-in-loop', line: 2 }],
			messageRule: 'invalid-allow',
			holds: [GRAMMAR, 'malformed'],
		},
		'an unused function-wide rule → the message says the opt-out may sit before the function': {
			lines: [
				`// dialecte-allow argument-mutation: ${REASON}`,
				'export function addItem(params: Params) {',
				'\treturn 1',
				'}',
			],
			found: [],
			messageRule: 'unused-allow',
			holds: ['argument-mutation', 'or before the function'],
		},
		'an unused line-wide rule → the message does not mention the function': {
			lines: [`// dialecte-allow query-in-loop: ${REASON}`, 'const tags = TAGS'],
			found: [],
			messageRule: 'unused-allow',
			holds: ['query-in-loop'],
			absent: ['or before the function'],
		},
		'an unused rule of two → the message names that rule': {
			lines: [
				`// dialecte-allow query-in-loop, argument-mutation: ${REASON}`,
				'for (const tag of TAGS) await read(tag)',
			],
			found: [{ rule: 'query-in-loop', line: 2 }],
			messageRule: 'unused-allow',
			holds: ['argument-mutation'],
			absent: ['query-in-loop'],
		},
	}

	for (const [title, messageCase] of Object.entries(messageCases))
		(messageCase.only ? it.only : it)(title, () => {
			expect(
				messageCheckOf({
					findings: applyAllowComments({
						file: 'src/lib/read-things.ts',
						text: moduleOf(messageCase.lines),
						findings: messageCase.found.map(findingOf),
					}).findings,
					rule: messageCase.messageRule,
					holds: messageCase.holds,
					absent: messageCase.absent,
				}),
			).toEqual({ count: 1, missing: [], named: [] })
		})
})

describe('applyAllowComments scope', () => {
	const optOutLines = [`// dialecte-allow query-in-loop: ${REASON}`, 'const tags = TAGS']

	it('a rule that did not run → its opt-out is not unused; the same opt-out of a rule that ran is', () => {
		const text = moduleOf(optOutLines)

		expect({
			notRun: outcomeOf(
				applyAllowComments({
					file: 'src/lib/read-things.ts',
					text,
					findings: [],
					ranRules: new Set<RuleName>(['argument-mutation']),
				}),
			),
			ran: outcomeOf(
				applyAllowComments({
					file: 'src/lib/read-things.ts',
					text,
					findings: [],
					ranRules: new Set<RuleName>(['query-in-loop']),
				}),
			),
		}).toEqual({
			notRun: { findings: [], allowed: {} },
			ran: {
				findings: [{ file: FILE, rule: 'unused-allow', line: 1, severity: 'warning' }],
				allowed: {},
			},
		})
	})

	it('an opt-out inside a string literal → read as no opt-out; the same text in a comment silences', () => {
		const finding = findingOf({ rule: 'query-in-loop', line: 2 })
		const inString = moduleOf([
			`const note = '// dialecte-allow query-in-loop: ${REASON}'`,
			'for (const tag of TAGS) await read(tag)',
		])
		const inComment = moduleOf([
			`// dialecte-allow query-in-loop: ${REASON}`,
			'for (const tag of TAGS) await read(tag)',
		])

		expect({
			inString: outcomeOf(
				applyAllowComments({ file: 'src/lib/read-things.ts', text: inString, findings: [finding] }),
			),
			inComment: outcomeOf(
				applyAllowComments({
					file: 'src/lib/read-things.ts',
					text: inComment,
					findings: [finding],
				}),
			),
		}).toEqual({
			inString: {
				findings: [{ file: FILE, rule: 'query-in-loop', line: 2, severity: 'error' }],
				allowed: {},
			},
			inComment: { findings: [], allowed: { 'query-in-loop': 1 } },
		})
	})
})
