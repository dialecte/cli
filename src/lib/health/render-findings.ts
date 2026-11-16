import { REPORT_TEXTS, RULE_LABELS, SEVERITY_MARKS } from './health.constants.ts'

import type { RenderFindingsParams } from './collect-findings.types.ts'
import type { HealthFinding } from './health.types.ts'

/** The lines of the health report: the header, then each finding with its detail and next command, or the ok line. */
export function renderFindings(params: RenderFindingsParams): string[] {
	const { findings } = params
	const red = findings.filter((finding) => finding.severity === 'red').length
	const header = REPORT_TEXTS.header
		.replace('{since}', () => params.since)
		.replace('{red}', String(red))
		.replace('{amber}', String(findings.length - red))
	if (findings.length === 0)
		return [
			header,
			REPORT_TEXTS.ok.replace(
				'{labels}',
				Object.values(RULE_LABELS).join(REPORT_TEXTS.labelsSeparator),
			),
		]
	return [header, ...findings.flatMap(findingLinesOf)]
}

/**
 * A finding's block: its line, each detail line indented, then its next command when it has one. Values go in through
 * a function, so a `$` they hold is printed as it is.
 */
function findingLinesOf(finding: HealthFinding): string[] {
	const line = REPORT_TEXTS.finding
		.replace('{mark}', SEVERITY_MARKS[finding.severity])
		.replace('{label}', RULE_LABELS[finding.rule])
		.replace('{repository}', () => finding.repository)
		.replace('{lot}', () => (finding.lot === undefined ? '' : ` ${finding.lot}`))
		.replace('{text}', () => finding.text)
	const { next } = finding
	return [
		line,
		...finding.detail.map((detail) => REPORT_TEXTS.detail.replace('{line}', () => detail)),
		...(next === undefined ? [] : [REPORT_TEXTS.next.replace('{next}', () => next)]),
	]
}
