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

	it('a width narrower than a long value → the value wraps under its label, no line wider than the width, no word lost', () => {
		const card = {
			title: 'demo',
			rows: [
				{ label: 'branch', lines: ['main'] },
				{ label: 'gates', lines: ['npm run type-check && npm run lint:check && npm run test:run'] },
			],
		}

		const lines = renderCard({ card, colour: false, width: 40 }).split('\n')

		expect(lines.map((line) => line.length).filter((length) => length > 40)).toEqual([])
		expect(new Set(lines.map((line) => line.length)).size).toBe(1)
		expect(
			lines
				.slice(1, -1)
				.map((line) => line.slice(2, -2).trim())
				.join(' ')
				.replace(/\s+/g, ' '),
		).toContain('npm run type-check && npm run lint:check && npm run test:run')
		expect(lines.some((line) => line.startsWith('│ gates '))).toBe(true)
	})

	it('a single word wider than the width → split at the width, never a wider line', () => {
		const card = {
			title: 'demo',
			rows: [{ label: 'path', lines: ['/a/very/long/path/'.repeat(5)] }],
		}

		const lines = renderCard({ card, colour: false, width: 30 }).split('\n')

		expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(30)
	})
})
