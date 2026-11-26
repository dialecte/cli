import { COMMANDS } from '../../cli.constants.ts'
import { COMMAND_MAP } from './command-map.constants.ts'
import { commandSurfaceOf } from './command-surface.ts'
import { renderCommandJson, renderCommandSection, renderGlobalHelp } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type { CommandEntry } from './command-map.types.ts'
import type { HelpJson } from './command-map.types.ts'

const USAGE = 'dialecte orchestrate status [--workspace <path>] [--json]'

function entryNamed(name: string): CommandEntry | undefined {
	return Object.entries(COMMAND_MAP).find(([key]) => key === name)?.[1] as CommandEntry | undefined
}

describe('the command map: orchestrate', () => {
	it('command map and help -> Workspace command, exact status usage, verbs and flags', () => {
		const entry = entryNamed('orchestrate')
		const section = entry === undefined ? '' : renderCommandSection({ name: 'orchestrate', entry })
		const commandJson =
			entry === undefined
				? { commands: [] }
				: (JSON.parse(renderCommandJson({ name: 'orchestrate', entry })) as Omit<
						HelpJson,
						'renamed'
					>)
		const command = commandJson.commands.find((candidate) => candidate.name === 'orchestrate')

		expect({
			registered: Object.keys(COMMANDS).includes('orchestrate'),
			entry: {
				family: entry?.family,
				usage: entry?.usage,
			},
			surface:
				entry === undefined
					? { name: 'orchestrate', verbs: [], flags: [] }
					: commandSurfaceOf({ name: 'orchestrate', entry }),
			helpUsage: section
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.startsWith('dialecte orchestrate')),
			helpJson: command === undefined ? undefined : { verbs: command.verbs, flags: command.flags },
			global: renderGlobalHelp().includes('orchestrate'),
		}).toEqual({
			registered: true,
			entry: { family: 'Workspace', usage: [USAGE] },
			surface: { name: 'orchestrate', verbs: ['status'], flags: ['--workspace', '--json'] },
			helpUsage: [USAGE],
			helpJson: { verbs: ['status'], flags: ['--workspace', '--json'] },
			global: true,
		})
	})
})
