/**
 * The map and the help lines L0a2 adds (33L0 sections 10 and 12): the lot usage gains report and export, one note
 * line each, `lot close`'s note names the final record kept first and the intent lines, and the exit codes of
 * report and export are listed.
 */
import { COMMAND_MAP } from './command-map.constants.ts'
import { renderCommandSection } from './render-help.ts'

import { describe, expect, it } from 'vitest'

const LOT_L0A2_LINES = [
	'dialecte lot report <id> [--json]',
	'dialecte lot report --feature <name> [--simulated] [--json]',
	'dialecte lot export <id> <dir> [--json]',
]

const EXIT_CODE_PATTERNS = [
	{ title: 'report 1', pattern: /^1 {2}report: .*--feature.*no lot/ },
	{ title: 'report 2', pattern: /^2 {2}report: usage.*unknown or ambiguous id/ },
	{ title: 'export 1', pattern: /^1 {2}export: \S/ },
	{ title: 'export 2', pattern: /^2 {2}export: usage/ },
]

describe('the lot section, L0a2', () => {
	for (const line of LOT_L0A2_LINES)
		it(`lists ${line}, in the map and in lot --help`, () => {
			expect([
				COMMAND_MAP.lot.usage.includes(line),
				renderCommandSection({ name: 'lot', entry: COMMAND_MAP.lot }).includes(line),
			]).toEqual([true, true])
		})

	for (const verb of ['report', 'export'])
		it(`notes ${verb} with a ${verb} - line`, () => {
			expect((COMMAND_MAP.lot.notes ?? []).filter((note) => note.startsWith(`${verb} - `))).toEqual(
				[expect.stringMatching(/\S/)],
			)
		})

	it('the close - note names cards.log as the final record kept first, then the removing and removed lines', () => {
		const note = (COMMAND_MAP.lot.notes ?? []).find((each) => each.startsWith('close - ')) ?? ''

		expect({
			recordFirst: note.includes('cards.log'),
			removing: note.includes('removing'),
			removed: note.includes('removed'),
			order: note.indexOf('cards.log') < note.indexOf('removing'),
		}).toEqual({ recordFirst: true, removing: true, removed: true, order: true })
	})

	it('R4-9: the close - note reads in the order the command acts: the card line, read back, the removing line, the move, the removed line', () => {
		const note = (COMMAND_MAP.lot.notes ?? []).find((each) => each.startsWith('close - ')) ?? ''
		const positions = [
			'cards.log',
			'read back',
			'removing line',
			'moved to .worktrees/_trash/',
			'removed line',
		].map((part) => note.indexOf(part))

		expect({
			allFound: positions.every((position) => position >= 0),
			inOrder: positions.every((position, index) => index === 0 || position > positions[index - 1]),
		}).toEqual({ allFound: true, inOrder: true })
	})

	for (const { title, pattern } of EXIT_CODE_PATTERNS)
		it(`the exit code line of ${title} is in the map and in lot --help under exit codes:`, () => {
			const section = renderCommandSection({ name: 'lot', entry: COMMAND_MAP.lot })

			expect({
				inMap: COMMAND_MAP.lot.exitCodes.filter((line) => pattern.test(line)).length,
				printed: section.split('\n').filter((line) => pattern.test(line.trim())).length,
			}).toEqual({ inMap: 1, printed: 1 })
		})
})
