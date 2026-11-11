/** The card's `usage` row (33L0 section 8, D7): its own section after the gates, never a gate line, never the verdict. */
import {
	EXACT_USAGE,
	LOT_USAGE,
	PARTLY_TIMED_USAGE,
	READY_CARD,
	STATIC_LOT_NAME,
	UNTIMED_USAGE,
} from '../../../test/handover-usage.constants.ts'
import { usageLineOf } from '../../../test/handover-usage.ts'
import { renderSectionCard } from '../card/render-section-card.ts'
import { handoverCardSections } from './handover-card.ts'

import { describe, expect, it } from 'vitest'

import type { CardSection } from '../card/card.types.ts'

const USAGE_LABEL = 'usage'

/** The columns before the value of the usage row (`usage` and its padding), where a continuation line starts. */
const USAGE_VALUE_COLUMN = 9

/** A card width the usage row cannot fit in: it wraps. */
const NARROW_CARD_WIDTH = 50

/** What a sectioned card names in order: each section by its name, the one holding the usage line as `usage-row`. */
function labelsOf(sections: CardSection[]): (string | undefined)[] {
	return sections.map((section) =>
		section.lines.some((line) => line.text.startsWith(USAGE_LABEL)) ? 'usage-row' : section.name,
	)
}

/** The texts of the lines of the section holding the usage line; empty when there is none. */
function usageTextsOf(sections: CardSection[]): string[] {
	return (
		sections
			.find((section) => section.lines.some((line) => line.text.startsWith(USAGE_LABEL)))
			?.lines.map((line) => line.text) ?? []
	)
}

/** Whether the box has its gates rule, and the usage line under it. */
function boxFactsOf(box: string): { gatesFound: boolean; usageAfterGates: boolean } {
	const lines = box.split('\n')
	const gatesAt = lines.findIndex((line) => line.startsWith('├─ gates'))
	const usageAt = lines.findIndex((line) =>
		line.includes(usageLineOf({ lotName: STATIC_LOT_NAME })),
	)
	return { gatesFound: gatesAt >= 0, usageAfterGates: usageAt > gatesAt }
}

describe('the card of a lot with a usage: sections', () => {
	it('a card holding a usage → the usage line is the only line of the section right after the gates', () => {
		expect({
			labels: labelsOf(handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }).sections),
			lines: usageTextsOf(handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }).sections),
		}).toEqual({
			labels: [undefined, 'commit', 'gates', 'usage-row'],
			lines: [usageLineOf({ lotName: STATIC_LOT_NAME })],
		})
	})

	it('a card without a usage beside the same card with one → only the second has the usage section, the first has the sections of today', () => {
		expect({
			withUsage: labelsOf(handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }).sections),
			withoutUsage: labelsOf(handoverCardSections(READY_CARD).sections),
		}).toEqual({
			withUsage: [undefined, 'commit', 'gates', 'usage-row'],
			withoutUsage: [undefined, 'commit', 'gates'],
		})
	})

	it('a card whose runs all reported their totals, two agents over three runs → no lower bound and no count of runs not exact', () => {
		expect(
			usageTextsOf(handoverCardSections({ ...READY_CARD, usage: EXACT_USAGE }).sections),
		).toEqual([
			`usage    1.2M tokens · 2 agents · 3 runs · 30 m 0 s agent time · dialecte lot report ${STATIC_LOT_NAME}`,
		])
	})

	it('a usage whose runs have no measured or reported time → the row says agent time unknown, never 0', () => {
		expect(
			usageTextsOf(handoverCardSections({ ...READY_CARD, usage: UNTIMED_USAGE }).sections),
		).toEqual([
			`usage    1.2M tokens · 2 agents · 2 runs · agent time unknown · dialecte lot report ${STATIC_LOT_NAME}`,
		])
	})

	it('a usage with one run of four untimed → the row gives a lower bound and how many are unknown', () => {
		expect(
			usageTextsOf(handoverCardSections({ ...READY_CARD, usage: PARTLY_TIMED_USAGE }).sections),
		).toEqual([
			`usage    1.2M tokens · 2 agents · 4 runs · ≥ 30 m 0 s agent time (1 of 4 unknown) · dialecte lot report ${STATIC_LOT_NAME}`,
		])
	})

	it('the usage row never changes the verdict → a READY card stays READY, its verdict line, failed gates and gate lines unchanged', () => {
		expect({
			rowShown: labelsOf(
				handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }).sections,
			).includes('usage-row'),
			verdictLine: handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }).sections[0]?.lines.map(
				(line) => line.text,
			),
			gates: handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }).sections.find(
				(section) => section.name === 'gates',
			)?.lines,
		}).toEqual({
			rowShown: true,
			verdictLine: ['READY  1 lot · 1 file · +3 −1 · all gates green'],
			gates: [
				{ text: '✓ check   10 passed', hang: 10, emphasis: 'passed' },
				{ text: '✓ review  1 of 3 rounds · approved', hang: 10, emphasis: 'passed' },
			],
		})
	})

	it('R4-8: the card drawn narrow → the usage row wraps with its continuation under its value (after the label), never at column 0 of the box', () => {
		const rows = renderSectionCard({
			card: handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }),
			colour: false,
			width: NARROW_CARD_WIDTH,
		}).split('\n')
		const usageAt = rows.findIndex((row) => row.startsWith(`│ ${USAGE_LABEL}`))
		const after = rows.slice(usageAt + 1)
		const ruleAt = after.findIndex((row) => !row.startsWith('│'))
		const continuation = ruleAt < 0 ? after : after.slice(0, ruleAt)

		expect({
			wrapped: continuation.length > 0,
			hangs: continuation.every((row) => row.startsWith(`│ ${' '.repeat(USAGE_VALUE_COLUMN)}`)),
		}).toEqual({ wrapped: true, hangs: true })
	})

	it('the box a person reads → the usage line stands in it, under the gates rule', () => {
		expect(
			boxFactsOf(
				renderSectionCard({
					card: handoverCardSections({ ...READY_CARD, usage: LOT_USAGE }),
					colour: false,
				}),
			),
		).toEqual({ gatesFound: true, usageAfterGates: true })
	})
})
