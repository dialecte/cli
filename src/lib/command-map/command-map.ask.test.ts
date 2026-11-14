import { COMMAND_MAP } from './command-map.constants.ts'
import { renderCommandSection, renderHelpJson } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type { HelpJson } from './command-map.types.ts'

const ASK_FLAGS = [
	'--about',
	'--code',
	'--method',
	'--kind',
	'--decision',
	'--package',
	'--effort',
	'--lot',
	'--no-facts',
	'--no-standard',
	'--person-only',
	'--json',
]

function askOfHelpJson(): HelpJson['commands'][number] | undefined {
	return (JSON.parse(renderHelpJson()) as HelpJson).commands.find(
		(command) => command.name === 'ask',
	)
}

describe('the command map entry of ask (D20)', () => {
	it('is declared in the Discover family with a summary, notes, an example of its own', () => {
		const entry = COMMAND_MAP.ask

		expect({
			family: entry.family,
			summary: entry.summary.length > 0,
			notes: (entry.notes ?? []).length > 0,
			example: entry.example.startsWith('dialecte ask '),
		}).toEqual({ family: 'Discover', summary: true, notes: true, example: true })
	})

	it('has a usage line that starts with the question and names every flag it takes', () => {
		const usage = COMMAND_MAP.ask.usage.join('\n')

		expect({
			first: COMMAND_MAP.ask.usage[0]?.startsWith('dialecte ask "<question>"'),
			missing: ASK_FLAGS.filter((flag) => !usage.includes(flag)),
		}).toEqual({ first: true, missing: [] })
	})

	it('names the exit codes 1, 2 and 3', () => {
		expect(COMMAND_MAP.ask.exitCodes.map((line) => line.charAt(0))).toEqual(['1', '2', '3'])
	})

	it('says where an ask lives: the state folder, the lot folder and the asks folder in its notes', () => {
		const notes = (COMMAND_MAP.ask.notes ?? []).join('\n')

		expect(['XDG_STATE_HOME', 'asks', '--lot'].filter((word) => !notes.includes(word))).toEqual([])
	})

	it('--help --json -> the ask command with the flags of its usage line', () => {
		expect(askOfHelpJson()).toMatchObject({
			name: 'ask',
			flags: expect.arrayContaining(ASK_FLAGS),
		})
	})

	it('dialecte ask --help -> the ask section names its usage lines and the exit code 3', () => {
		const section = renderCommandSection({ name: 'ask', entry: COMMAND_MAP.ask })

		expect({
			usage:
				COMMAND_MAP.ask.usage.length > 0 &&
				COMMAND_MAP.ask.usage.every((line) => section.includes(line)),
			exit3: /^\s*3\s/mu.test(section),
		}).toEqual({ usage: true, exit3: true })
	})

	it('dialecte standard eval -> the usage line names --angles', () => {
		expect(COMMAND_MAP.standard.usage.find((line) => line.includes(' standard eval '))).toContain(
			'--angles',
		)
	})
})
