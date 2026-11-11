/**
 * A legend as printed: per group, each term as `<term>  <meaning>` then `  <look>`, a blank line between
 * groups; every line wrapped to the width, its continuation lines indented, no word lost.
 */
import { wrapText } from '../card/render-section-card.ts'
import { textOf } from '../print/print.ts'
import { LEGEND_INDENT, LEGEND_TERM_SEPARATOR } from './legend.constants.ts'

import type { PrintedText } from '../print/print.types.ts'
import type { LegendGroup } from './legend.types.ts'

export function renderLegend(params: {
	groups: readonly LegendGroup[]
	width: number
}): PrintedText {
	const { width } = params
	return textOf(
		params.groups.flatMap(function groupLines(group, index) {
			return [
				...(index === 0 ? [] : ['']),
				...group.flatMap((entry) => [
					...wrapText({
						text: `${entry.term}${LEGEND_TERM_SEPARATOR}${entry.meaning}`,
						hang: LEGEND_INDENT.length,
						width,
					}),
					...wrapText({
						text: `${LEGEND_INDENT}${entry.look}`,
						hang: LEGEND_INDENT.length * 2,
						width,
					}),
				]),
			]
		}),
	)
}
