/**
 * The map and the help lines S2 adds (33S section 10, G18): the lot usage gains wait, answer, result and stop and
 * `start --simulate`, one note line per verb, the exit codes 3, 4, 5 and 6; `inbox` is a command of the Grow family,
 * listed by `dialecte --help` and printed alone by `dialecte inbox --help`.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { HELP_TITLE } from '../../../test/command-families.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { COMMANDS } from '../../cli.constants.ts'
import { COMMAND_MAP } from './command-map.constants.ts'
import { renderCommandSection, renderGlobalHelp } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type { CommandEntry } from './command-map.types.ts'

const CLI_SOURCE = join(import.meta.dirname, '..', '..', 'cli.ts')

const INBOX_USAGE = 'dialecte inbox [--repository <name>] [--simulated] [--json]'

const LOT_S2_LINES = [
	'dialecte lot wait <id> [--timeout <seconds>] [--json]',
	'dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]',
	'dialecte lot result <id> [--json]',
]

const EXIT_CODE_LINES = [
	'3  wait, result: input-required',
	'4  wait: an agent failed or hit a limit, run again',
	'5  wait --timeout, result: still working',
	'6  status, wait, result: the lot is damaged: a person must look',
]

/** The map's entry of `name` whatever the type says: undefined when the map holds none. */
function entryNamed(name: string): CommandEntry | undefined {
	return Object.entries(COMMAND_MAP).find(([key]) => key === name)?.[1] as CommandEntry | undefined
}

describe('the lot section, S2', () => {
	for (const line of LOT_S2_LINES)
		it(`lists ${line}, in the map and in lot --help`, () => {
			expect([
				COMMAND_MAP.lot.usage.includes(line),
				renderCommandSection({ name: 'lot', entry: COMMAND_MAP.lot }).includes(line),
			]).toEqual([true, true])
		})

	it('lists dialecte lot stop <id> --reason <text> [--json], with its optional --by, in the map and in lot --help', () => {
		const stop = /^dialecte lot stop <id> --reason <text>( \[--by <who>\])? \[--json\]$/

		expect([
			COMMAND_MAP.lot.usage.some((line) => stop.test(line)),
			renderCommandSection({ name: 'lot', entry: COMMAND_MAP.lot })
				.split('\n')
				.some((line) => stop.test(line.trim())),
		]).toEqual([true, true])
	})

	for (const verb of ['wait', 'answer', 'result', 'stop'])
		it(`notes ${verb} with a ${verb} - line`, () => {
			expect((COMMAND_MAP.lot.notes ?? []).filter((note) => note.startsWith(`${verb} - `))).toEqual(
				[expect.stringMatching(/\S/)],
			)
		})

	it('the exit codes are 3, 4, 5 and 6 of the status, wait and result verbs, in the map and in lot --help under exit codes:', () => {
		const section = renderCommandSection({ name: 'lot', entry: COMMAND_MAP.lot })

		expect({
			codes: COMMAND_MAP.lot.exitCodes,
			printed: EXIT_CODE_LINES.map((line) => section.includes(line)),
		}).toEqual({ codes: EXIT_CODE_LINES, printed: [true, true, true, true] })
	})
})

describe('inbox in the map', () => {
	it('is a command the cli registers', () => {
		expect(Object.keys(COMMANDS)).toContain('inbox')
	})

	it(`is a Grow command with the usage ${INBOX_USAGE}, a summary and an example with no placeholder`, () => {
		expect(entryNamed('inbox')).toMatchObject({
			family: 'Grow',
			summary: expect.stringMatching(/\S/),
			usage: [INBOX_USAGE],
			example: expect.not.stringContaining('<'),
		})
	})

	it('is listed by dialecte --help in the Grow family after lot', () => {
		expect(renderGlobalHelp()).toMatch(/^\s*Grow\s+lot\s+inbox\s*$/m)
	})
})

describe('dialecte inbox --help', { timeout: CLI_SURFACE_CASE_TIMEOUT }, () => {
	it('prints the inbox section alone: its usage line, no global help, exit 0', () => {
		const run = spawnSync(process.execPath, [CLI_SOURCE, 'inbox', '--help'], {
			encoding: 'utf8',
			cwd: temporaryFolder('dialecte-inbox-help-'),
		})

		expect({
			status: run.status,
			usage: run.stdout.split('\n').some((line) => line.trim() === INBOX_USAGE),
			global: run.stdout.includes(HELP_TITLE),
		}).toEqual({ status: 0, usage: true, global: false })
	})
})
