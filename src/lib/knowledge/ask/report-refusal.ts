import { fillMessage } from '../standard/fill-message.ts'

import type { CheckedReport, ReportRefusal } from './ask.types.ts'

/** A refused report: the reason and its faults, each a template filled with its values. */
export function reportRefusal(params: {
	refused: ReportRefusal
	templates: string[]
	values: Record<string, string>
}): Extract<CheckedReport, { accepted: false }> {
	return {
		accepted: false,
		refused: params.refused,
		faults: params.templates.map((template) => fillMessage({ template, values: params.values })),
	}
}
