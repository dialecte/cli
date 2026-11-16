/** Support of the fixture document and act rule tests: the module builder, the params, the unit context and the expected positions. */
import {
	ACT_RULES,
	FLAG_PATTERN,
	HEADER_LINES,
	NO_UNITS,
	STEP_RULES,
	WIDGET_TEST_FILE,
} from './fixture-rules-cases.constants.ts'

import type { applyAllowComments } from '../src/lib/rules/allow-comments.ts'
import type {
	CheckCodeRulesParams,
	RuleFinding,
	RuleName,
	TestRulesContext,
	UnitContext,
} from '../src/lib/rules/check-code-rules.types.ts'
import type { Expected, FindingsCase } from './fixture-rules-cases.types.ts'

/** The module text of a case: the import header (unless bare), its body lines, a final newline. */
export function moduleOf(params: { body: string[]; bare?: boolean }): string {
	return [...(params.bare ? [] : HEADER_LINES), ...params.body, ''].join('\n')
}

/** The `checkCodeRules` params of a module, with test rules and the units given (none known by default) unless the module is not a Dialecte change. */
export function paramsOf(params: {
	file: string
	text: string
	testRules: boolean
	units?: UnitContext
}): CheckCodeRulesParams {
	const testRules: TestRulesContext = { dialecteChange: true, units: params.units ?? NO_UNITS }
	return {
		file: params.file,
		text: params.text,
		referencePatterns: [],
		...(params.testRules && { testRules }),
	}
}

/** Is the finding one of the fixture document rules. */
export function isStepFinding(finding: RuleFinding): boolean {
	return STEP_RULES.includes(finding.rule)
}

/** Is the finding one of the act rules. */
export function isActFinding(finding: RuleFinding): boolean {
	return ACT_RULES.includes(finding.rule)
}

/** The rule and line of each finding, sorted by line then rule. */
export function positionsOf(findings: readonly Expected[]): Expected[] {
	return findings
		.map(({ rule, line }) => ({ rule, line }))
		.sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule))
}

/** The 1-based line of the first line that holds the text. */
export function lineOfText(params: { text: string; needle: string }): number {
	return params.text.split('\n').findIndex((line) => line.includes(params.needle)) + 1
}

/** The case's module text, its params and the findings it expects (marked lines, then the lines of its needles). */
export function preparedOf(testCase: FindingsCase) {
	const text = moduleOf(testCase)
	const marked = text.split('\n').flatMap((line, index) => {
		const match = FLAG_PATTERN.exec(line)
		return match ? [{ rule: match[1] as RuleName, line: index + 1 }] : []
	})
	const needled = (testCase.found ?? []).map(({ rule, needle }) => ({
		rule,
		line: lineOfText({ text, needle }),
	}))
	return {
		text,
		expected: positionsOf([...marked, ...needled]),
		params: paramsOf({
			file: testCase.file ?? WIDGET_TEST_FILE,
			text,
			testRules: testCase.testRules ?? true,
			...(testCase.units && { units: testCase.units }),
		}),
	}
}

/** What an opt-out run leaves: the step's findings, the opt-out problems, and the counts it silenced. */
export function summarizedAllow(applied: ReturnType<typeof applyAllowComments>) {
	return summarizedAllowOf({ applied, isRelevant: isStepFinding })
}

/** What an opt-out run leaves of the act rules: their findings, the opt-out problems, and the counts it silenced. */
export function summarizedActAllow(applied: ReturnType<typeof applyAllowComments>) {
	return summarizedAllowOf({ applied, isRelevant: isActFinding })
}

function summarizedAllowOf(params: {
	applied: ReturnType<typeof applyAllowComments>
	isRelevant: (finding: RuleFinding) => boolean
}) {
	const { applied, isRelevant } = params
	return {
		allowed: applied.allowed,
		findings: positionsOf(
			applied.findings.filter(
				(finding) =>
					isRelevant(finding) ||
					finding.rule === 'invalid-allow' ||
					finding.rule === 'unused-allow',
			),
		),
	}
}
