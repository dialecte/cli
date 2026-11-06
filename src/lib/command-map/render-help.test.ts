import { renderCommandSection } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type { CommandEntry } from './command-map.types.ts'

const FULL_ENTRY: CommandEntry = {
	family: 'Check',
	summary: 'The package checks with the real counts',
	usage: ['dialecte gate [--fast | --full]', 'dialecte gate --hook'],
	exitCodes: ['1  a check failed', '2  refused: a contributor check in a consumer'],
	example: 'dialecte gate --full',
}

const NOTED_ENTRY: CommandEntry = { ...FULL_ENTRY, notes: ['hook - runs in a commit hook'] }

const DEFAULT_CODES_ENTRY: CommandEntry = { ...FULL_ENTRY, exitCodes: [] }

/** Whether every part is in the section, each after the one before it; else the first part that breaks it. */
function orderOf(params: { section: string; parts: string[] }): string {
	let after = -1
	for (const part of params.parts) {
		const position = params.section.indexOf(part, after + 1)
		if (position < 0) return `missing or out of order: ${part}`
		after = position
	}
	return 'in order'
}

describe('renderCommandSection', () => {
	const testCases: Record<string, { entry: CommandEntry; inOrder: string[]; absent: RegExp[] }> = {
		'every part, in order: summary, usage lines, exit codes, example': {
			entry: FULL_ENTRY,
			inOrder: [
				FULL_ENTRY.summary,
				FULL_ENTRY.usage[0],
				FULL_ENTRY.usage[1],
				FULL_ENTRY.exitCodes[0],
				FULL_ENTRY.exitCodes[1],
				FULL_ENTRY.example,
			],
			absent: [],
		},
		'notes → summary, usage lines, notes, exit codes, example, in that order': {
			entry: NOTED_ENTRY,
			inOrder: [
				NOTED_ENTRY.summary,
				NOTED_ENTRY.usage[0],
				NOTED_ENTRY.usage[1],
				'hook - runs in a commit hook',
				NOTED_ENTRY.exitCodes[0],
				NOTED_ENTRY.example,
			],
			absent: [],
		},
		'no exit code of its own → no exit codes part, the rest in order': {
			entry: DEFAULT_CODES_ENTRY,
			inOrder: [
				DEFAULT_CODES_ENTRY.summary,
				DEFAULT_CODES_ENTRY.usage[0],
				DEFAULT_CODES_ENTRY.usage[1],
				DEFAULT_CODES_ENTRY.example,
			],
			absent: [/exit/i],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(
				orderOf({
					section: renderCommandSection({ name: 'gate', entry: testCase.entry }),
					parts: testCase.inOrder,
				}),
			).toBe('in order')
			for (const pattern of testCase.absent)
				expect(renderCommandSection({ name: 'gate', entry: testCase.entry })).not.toMatch(pattern)
		})
	}
})

describe('renderCommandSection - a note longer than the width', () => {
	/** The most columns a note line takes. */
	const NOTE_WIDTH = 100
	const LONG_TEXT = Array.from({ length: 30 }, (_, index) => `word${index}`).join(' ')
	const ENTRY: CommandEntry = {
		...FULL_ENTRY,
		notes: [`alpha - ${LONG_TEXT}`, 'beta - short'],
	}

	function noteLinesOf(section: string): string[] {
		const lines = section.split('\n')
		const first = lines.findIndex((line) => line.startsWith('  alpha - '))
		const last = lines.findIndex((line) => line.startsWith('  beta - '))
		return first < 0 || last < 0 ? [] : lines.slice(first, last)
	}

	it('wraps within the width, each continuation indented under the note text, the next note flush', () => {
		const noteLines = noteLinesOf(renderCommandSection({ name: 'gate', entry: ENTRY }))

		expect(noteLines.length).toBeGreaterThan(1)
		expect(noteLines.filter((line) => line.length > NOTE_WIDTH)).toEqual([])
		expect(
			noteLines.slice(1).filter((line) => !line.startsWith(`  ${' '.repeat('alpha - '.length)}`)),
		).toEqual([])
		expect(noteLines.map((line) => line.trim()).join(' ')).toBe(`alpha - ${LONG_TEXT}`)
	})
})
