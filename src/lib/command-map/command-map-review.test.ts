/**
 * The command map names `handover review` (P3.4): its usage line in the map, in `handover --help` and among the
 * verbs and flags of `--help --json`, all derived from the map; its note names the editor rule, not the list.
 */
import { EDITOR_CANDIDATES, EDITOR_CONFIG_KEY } from '../editor/editor.constants.ts'
import { COMMAND_MAP } from './command-map.constants.ts'
import { commandSurfaceOf } from './command-surface.ts'
import { renderCommandJson, renderCommandSection, renderHelpJson } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type { HelpJson } from './command-map.types.ts'

const REVIEW_PREFIX = 'dialecte handover review '

/** The usage lines of the handover entry that start with the review verb. */
function reviewUsage(): string[] {
	return COMMAND_MAP.handover.usage.filter((line) => line.startsWith(REVIEW_PREFIX))
}

/** The note of the handover entry that starts with `review - `, or an empty text. */
function reviewNote(): string {
	return COMMAND_MAP.handover.notes?.find((note) => note.startsWith('review - ')) ?? ''
}

describe('the command map: handover review', () => {
	it('one usage line takes the hand-over (<name|index|folder>) and the --json and --print flags', () => {
		const [line] = reviewUsage()

		expect({
			lines: reviewUsage().length,
			hand: line?.startsWith(`${REVIEW_PREFIX}<name|index|folder>`),
			flags: ['--json', '--print'].filter((flag) => !line?.includes(flag)),
		}).toEqual({
			lines: 1,
			hand: true,
			flags: [],
		})
	})

	it('the usage line is in handover --help, the same words', () => {
		const help = renderCommandSection({ name: 'handover', entry: COMMAND_MAP.handover })

		expect({
			lines: reviewUsage().length,
			missingFromHelp: reviewUsage().filter((line) => !help.includes(line)),
		}).toEqual({ lines: 1, missingFromHelp: [] })
	})

	it('the derived surface of handover holds the verb review and the flags --print and --json', () => {
		const surface = commandSurfaceOf({ name: 'handover', entry: COMMAND_MAP.handover })

		expect({
			review: surface.verbs.includes('review'),
			flags: ['--print', '--json'].filter((flag) => !surface.flags.includes(flag)),
		}).toEqual({ review: true, flags: [] })
	})

	it('dialecte --help --json lists review among the verbs of handover, as the map derives it', () => {
		const help = JSON.parse(renderHelpJson()) as HelpJson
		const handover = help.commands.find((command) => command.name === 'handover')

		const derived = commandSurfaceOf({ name: 'handover', entry: COMMAND_MAP.handover }).verbs
		expect({ verbs: handover?.verbs, review: derived.includes('review') }).toEqual({
			verbs: derived,
			review: true,
		})
	})

	it('dialecte handover --help --json lists review among the verbs', () => {
		const help = JSON.parse(
			renderCommandJson({ name: 'handover', entry: COMMAND_MAP.handover }),
		) as Omit<HelpJson, 'renamed'>

		expect(help.commands.map((command) => command.verbs.includes('review'))).toEqual([true])
	})

	it('the note of review names the editor rule (the git config key and PATH), not the list of editors', () => {
		const note = reviewNote()

		expect({
			note: note !== '',
			key: note.includes(EDITOR_CONFIG_KEY),
			path: note.includes('PATH'),
			candidates: EDITOR_CANDIDATES.slice(1).filter((candidate) =>
				new RegExp(`\\b${candidate.word}\\b`).test(note),
			),
		}).toEqual({ note: true, key: true, path: true, candidates: [] })
	})
})
