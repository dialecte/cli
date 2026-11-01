/** A sectioned card's lines wrapped at a width: never into a column narrower than the least room. */
import { renderSectionCard } from './render-section-card.ts'

import { describe, expect, it } from 'vitest'

describe('renderSectionCard: the room a wrapped line keeps', () => {
	it('a hanging indent of 30 in a box of 40 (36 columns of text) → the continuation rows start at column 16, keeping 20 columns of text', () => {
		const text = `ENTRY${' '.repeat(25)}alpha beta gamma delta epsilon zeta eta theta iota kappa`

		expect(
			renderSectionCard({
				card: { title: 'wrap', footer: 'end', sections: [{ lines: [{ text, hang: 30 }] }] },
				colour: false,
				width: 40,
			}),
		).toBe(
			[
				'┌─ wrap ───────────────────────────────┐',
				'│ ENTRY                         alpha  │',
				'│                 beta gamma delta     │',
				'│                 epsilon zeta eta     │',
				'│                 theta iota kappa     │',
				'└─ end ────────────────────────────────┘',
			].join('\n'),
		)
	})

	it('a hanging indent of 16 in a box of 40 (room 20) → kept at 16; a hanging indent of 17 → reduced to 16', () => {
		const text = `ENTRY${' '.repeat(25)}alpha beta gamma delta epsilon zeta eta theta iota kappa`
		const expected = [
			'┌─ wrap ───────────────────────────────┐',
			'│ ENTRY                         alpha  │',
			'│                 beta gamma delta     │',
			'│                 epsilon zeta eta     │',
			'│                 theta iota kappa     │',
			'└─ end ────────────────────────────────┘',
		].join('\n')

		expect(
			renderSectionCard({
				card: { title: 'wrap', footer: 'end', sections: [{ lines: [{ text, hang: 16 }] }] },
				colour: false,
				width: 40,
			}),
		).toBe(expected)
		expect(
			renderSectionCard({
				card: { title: 'wrap', footer: 'end', sections: [{ lines: [{ text, hang: 17 }] }] },
				colour: false,
				width: 40,
			}),
		).toBe(expected)
	})

	it('a line starting with its own indent of 30 spaces, hang 30, in a box of 40 → the indent reduced with the hang: every row at column 16', () => {
		expect(
			renderSectionCard({
				card: {
					title: 'wrap',
					footer: 'end',
					sections: [
						{
							lines: [
								{
									text: `${' '.repeat(30)}alpha beta gamma delta epsilon zeta eta theta iota kappa`,
									hang: 30,
								},
							],
						},
					],
				},
				colour: false,
				width: 40,
			}),
		).toBe(
			[
				'┌─ wrap ───────────────────────────────┐',
				'│                 alpha beta gamma     │',
				'│                 delta epsilon zeta   │',
				'│                 eta theta iota kappa │',
				'└─ end ────────────────────────────────┘',
			].join('\n'),
		)
	})

	it('a line marked cut whose cut keeps under 20 columns after its hang (40 wide) → wrapped under its hang, every word kept; at 80 its cut keeps more → cut as before', () => {
		const text =
			'  revised  src/store/engine.test.ts › engine > settles the import before a foreign write'
		function rendered(width: number): string {
			return renderSectionCard({
				card: {
					title: 'wrap',
					footer: 'end',
					sections: [{ lines: [{ text, hang: 11, cut: true }] }],
				},
				colour: false,
				width,
			})
		}

		expect(rendered(40)).toBe(
			[
				'┌─ wrap ───────────────────────────────┐',
				'│   revised  src/store/engine.test.ts  │',
				'│            › engine > settles the    │',
				'│            import before a foreign   │',
				'│            write                     │',
				'└─ end ────────────────────────────────┘',
			].join('\n'),
		)
		expect(rendered(80)).toBe(
			[
				'┌─ wrap ───────────────────────────────────────────────────────────────────────┐',
				'│   revised  src/store/engine.test.ts › engine > settles the import before a … │',
				'└─ end ────────────────────────────────────────────────────────────────────────┘',
			].join('\n'),
		)
	})

	it('a word wider than the room after its hang (a 24-character path, hang 10, 30 columns of text) → a row of its own 2 columns in, whole; the words after it back under the hang', () => {
		expect(
			renderSectionCard({
				card: {
					title: 'wrap',
					footer: 'end',
					sections: [
						{
							lines: [
								{
									text: '  revised  src/store/engine.test.ts › engine > settles the import before a foreign write',
									hang: 11,
									cut: true,
								},
							],
						},
					],
				},
				colour: false,
				width: 34,
			}),
		).toBe(
			[
				'┌─ wrap ─────────────────────────┐',
				'│   revised                      │',
				'│   src/store/engine.test.ts ›   │',
				'│           engine > settles the │',
				'│           import before a      │',
				'│           foreign write        │',
				'└─ end ──────────────────────────┘',
			].join('\n'),
		)
	})

	it('a stacked line whose lead is wider than the room (27 columns: 23 of text) → the lead wrapped between its columns, `+310 −87` kept together 2 columns in, the subject under it 2 columns in', () => {
		const text = 'pending  12 files  +310 −87  feat(read): read answers one'

		expect(
			renderSectionCard({
				card: {
					title: 'wrap',
					footer: 'end',
					sections: [{ lines: [{ text, hang: 29, stack: true }] }],
				},
				colour: false,
				width: 27,
			}),
		).toBe(
			[
				'┌─ wrap ──────────────────┐',
				'│ pending  12 files       │',
				'│   +310 −87              │',
				'│   feat(read): read      │',
				'│   answers one           │',
				'└─ end ───────────────────┘',
			].join('\n'),
		)
	})
})
