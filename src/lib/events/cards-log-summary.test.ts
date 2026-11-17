/** `cards.log`: a card whose line passes 64 KiB after the tdd cut is kept as its summary, never lost. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readCardsLog, writeCard } from './cards-log.ts'

import { describe, expect, it } from 'vitest'

import type { CardInput } from './cards-log.types.ts'

/** A committed lot's card line holding `card`. */
function lineWith(card: Record<string, unknown>): CardInput {
	return {
		at: '2026-11-17T10:00:00.000Z',
		lot: '0124-core-qname-values',
		name: 'hand-over-a',
		state: 'committed',
		feature: 'qname-values',
		repository: '/work/repository',
		branch: 'feat/qname-values',
		head: 'a'.repeat(40),
		base: 'b'.repeat(40),
		card,
		usage: null,
		records: null,
		by: 'handover-run',
	}
}

describe('writeCard: a card over the line limit', () => {
	it('a card of 322 declarations past 64 KiB → one summary line: its scalars kept, each list counted, cut and summary set', () => {
		const file = join(temporaryFolder('cards-log-'), 'cards.log')
		const declarations = Array.from(
			{ length: 322 },
			(_, index) => `case ${index} ${'d'.repeat(200)}`,
		)

		expect(() =>
			writeCard({
				file,
				line: lineWith({ verdict: 'DONE', declarations, gates: { fast: 'green' } }),
			}),
		).not.toThrow()
		expect({
			read: readCardsLog({ file }).cards.map((card) => ({
				card: card.card,
				cut: card.cut,
				summary: card.summary,
			})),
			lines: readFileSync(file, 'utf8').split('\n').filter(Boolean).length,
		}).toEqual({
			read: [{ card: { verdict: 'DONE', declarations: 322, gates: 1 }, cut: true, summary: true }],
			lines: 1,
		})
	})
})
