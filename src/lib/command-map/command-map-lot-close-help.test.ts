/**
 * The `close` note of the lot section: a hand-over already closed answers `already closed`, exit 0; in the map
 * and, wrapped, in `dialecte lot --help`.
 */
import { COMMAND_MAP } from './command-map.constants.ts'
import { renderCommandSection } from './render-help.ts'

import { describe, expect, it } from 'vitest'

/** The `close - ` note of the lot section, undefined when the map holds none. */
function closeNote(): string | undefined {
	return (COMMAND_MAP.lot.notes ?? []).find((note) => note.startsWith('close - '))
}

/** Every run of white space (a wrap's line break and indent included) as one space. */
function collapsed(text: string): string {
	return text.replace(/\s+/g, ' ')
}

describe('the lot close note', () => {
	it('says in the map that a hand-over already closed answers already closed, exit 0', () => {
		expect({
			already: closeNote()?.includes('already closed'),
			exit: closeNote()?.includes('exit 0'),
		}).toEqual({ already: true, exit: true })
	})

	it('is printed whole by lot --help', () => {
		const note = closeNote()
		const printed = collapsed(renderCommandSection({ name: 'lot', entry: COMMAND_MAP.lot }))

		expect({
			held: note !== undefined,
			printed: note !== undefined && printed.includes(collapsed(note)),
			already: printed.includes('already closed'),
		}).toEqual({ held: true, printed: true, already: true })
	})
})
