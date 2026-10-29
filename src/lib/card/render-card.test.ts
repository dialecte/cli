import { renderCard } from './render-card.ts'

import { describe, expect, it } from 'vitest'

const CARD = {
	title: 'demo',
	rows: [
		{ label: 'branch', lines: ['main'] },
		{ label: 'lots', lines: ['1  first', '2  second, longer'] },
	],
}

describe('renderCard', () => {
	it('not a terminal → a plain box, labels in one column, every line as wide', () => {
		expect(renderCard({ card: CARD, colour: false }).split('\n')).toEqual([
			'┌─ demo ────────────────────┐',
			'│ branch  main              │',
			'│ lots    1  first          │',
			'│         2  second, longer │',
			'└───────────────────────────┘',
		])
	})

	it('a terminal → the same box with bold labels', () => {
		const lines = renderCard({ card: CARD, colour: true }).split('\n')

		expect(lines[1]).toBe('│ \u001B[1mbranch\u001B[22m  main              │')
	})
})
