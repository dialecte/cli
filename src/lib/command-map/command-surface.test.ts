import { COMMAND_MAP } from './command-map.constants.ts'
import { commandSurfaceOf } from './command-surface.ts'
import { renderCommandJson, renderHelpJson } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type { CommandEntry, HelpJson } from './command-map.types.ts'

const ZERO_CONFIG_FLAGS = [
	'--namespace',
	'--entry',
	'--constants-dir',
	'--out',
	'--version',
	'--tsconfig',
	'--format-config',
	'--no-format',
]

const LOT_VERBS = [
	'start',
	'status',
	'exempt',
	'accept',
	'revised',
	'gone',
	'mutation',
	'finding',
	'decide',
	'snapshot',
	'choice',
	'standard',
	'delta',
	'recap',
	'close',
]

/** An entry holding only the usage lines the derivation reads. */
function entryOf(usage: string[]): CommandEntry {
	return { family: 'Check', summary: 'x', usage, exitCodes: [], example: 'x' }
}

/** What `dialecte --help --json` prints, parsed. */
function helpJson(): HelpJson {
	return JSON.parse(renderHelpJson())
}

/** The one command of `--help --json` by name. */
function commandOf(name: string): HelpJson['commands'][number] | undefined {
	return helpJson().commands.find((command) => command.name === name)
}

describe('commandSurfaceOf', () => {
	const testCases: Record<string, { usage: string[]; verbs: string[]; flags: string[] }> = {
		'bare words after the command → verbs, in first-seen order, one per usage line': {
			usage: [
				'dialecte demo red [--json]',
				'dialecte demo green',
				'dialecte demo status | demo status --legend',
			],
			verbs: ['red', 'green', 'status'],
			flags: ['--json', '--legend'],
		},
		'the same verb on two lines → listed once': {
			usage: ['dialecte demo run <a>', 'dialecte demo run <b> --keep'],
			verbs: ['run'],
			flags: ['--keep'],
		},
		'a placeholder, an option group, a group, a quote or a flag in the verb place → no verb': {
			usage: [
				'dialecte demo <file>',
				'dialecte demo [<name>]',
				'dialecte demo (a | b)',
				'dialecte demo "x"',
				'dialecte demo --legend',
			],
			verbs: [],
			flags: ['--legend'],
		},
		'a word that is no bare lowercase word (a file name, an upper-case word) → no verb': {
			usage: ['dialecte demo lots.json', 'dialecte demo Tag'],
			verbs: [],
			flags: [],
		},
		'flags anywhere in a usage line, in groups and after values → unique, first-seen order': {
			usage: [
				'dialecte demo [--fast | --full] [--base <ref>] [--declare <path>]... [--json]',
				'dialecte demo --hook [--no-reuse] [--fast]',
			],
			verbs: [],
			flags: ['--fast', '--full', '--base', '--declare', '--json', '--hook', '--no-reuse'],
		},
		'a flag shape with a value list → the flag name only': {
			usage: ['dialecte demo [--mode changed|audit] [--severity <a|b>]'],
			verbs: [],
			flags: ['--mode', '--severity'],
		},
		'[zero-config flags] → expanded to the zero-config flags, after the flags written before it': {
			usage: ['dialecte demo [--check] [zero-config flags]'],
			verbs: [],
			flags: ['--check', ...ZERO_CONFIG_FLAGS],
		},
		'[zero-config flags] and some of them written too → each flag once': {
			usage: ['dialecte demo [zero-config flags] [--format-config <path> | --no-format]'],
			verbs: [],
			flags: ZERO_CONFIG_FLAGS,
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(commandSurfaceOf({ name: 'demo', entry: entryOf(testCase.usage) })).toEqual({
				name: 'demo',
				verbs: testCase.verbs,
				flags: testCase.flags,
			})
		})
	}
})

describe('dialecte --help --json, verbs and flags of the real map', () => {
	it('lot → its 15 verbs, exactly, in the map order (start and status first)', () => {
		expect(commandOf('lot')?.verbs).toEqual(LOT_VERBS)
	})

	it('api → find, show', () => {
		expect(commandOf('api')?.verbs).toEqual(['find', 'show'])
	})

	it('tdd → red, green, status', () => {
		expect(commandOf('tdd')?.verbs).toEqual(['red', 'green', 'status'])
	})

	it('handover → write, show, run, abandon, list', () => {
		expect(commandOf('handover')?.verbs).toEqual(['write', 'show', 'run', 'abandon', 'list'])
	})

	it('gate → no verb, every flag of its usage lines, the global --help and -h left out', () => {
		expect(commandOf('gate')).toMatchObject({
			verbs: [],
			flags: expect.arrayContaining([
				'--fast',
				'--full',
				'--base',
				'--no-reuse',
				'--declare',
				'--json',
				'--hook',
			]),
		})
		expect(commandOf('gate')?.flags).not.toContain('--help')
		expect(commandOf('gate')?.flags).not.toContain('-h')
	})

	it('bench → --check and the zero-config flags', () => {
		expect(commandOf('bench')?.flags).toEqual(
			expect.arrayContaining(['--check', ...ZERO_CONFIG_FLAGS]),
		)
	})

	it('every listed command → carries the surface the derivation gives its map entry', () => {
		const listed = Object.entries(COMMAND_MAP).filter(
			(pair): pair is [string, CommandEntry] => 'family' in pair[1],
		)

		expect(listed.map(([name, entry]) => commandSurfaceOf({ name, entry }))).toEqual(
			helpJson().commands.map((command) => ({
				name: command.name,
				verbs: command.verbs,
				flags: command.flags,
			})),
		)
	})
})

describe('dialecte --help --json, renamed', () => {
	it('every old form with its new one, the words after dialecte, in the table order', () => {
		expect(helpJson().renamed).toEqual([
			{ old: 'record review', new: 'lot finding' },
			{ old: 'record decision', new: 'lot decide' },
			{ old: 'record snapshot', new: 'lot snapshot' },
			{ old: 'record choice', new: 'lot choice' },
			{ old: 'record standard', new: 'lot standard' },
			{ old: 'review delta', new: 'lot delta' },
			{ old: 'recap', new: 'lot recap' },
		])
	})
})

describe('dialecte <command> --help --json', () => {
	it('gate → its one command carries no verb and every flag of its usage lines', () => {
		expect(
			JSON.parse(renderCommandJson({ name: 'gate', entry: COMMAND_MAP.gate })).commands,
		).toMatchObject([
			{
				name: 'gate',
				verbs: [],
				flags: [
					'--fast',
					'--full',
					'--base',
					'--no-reuse',
					'--declare',
					'--json',
					'--hook',
					'--release',
				],
			},
		])
	})

	it('lot → its one command carries its 15 verbs', () => {
		expect(
			JSON.parse(renderCommandJson({ name: 'lot', entry: COMMAND_MAP.lot })).commands[0].verbs,
		).toEqual(LOT_VERBS)
	})
})
