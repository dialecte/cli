import { COMMAND_MAP } from './command-map.constants.ts'

import { describe, expect, it } from 'vitest'

describe('the command map entry of facts', () => {
	it('has a usage line for each of the three verbs, list, show and forget', () => {
		expect(COMMAND_MAP.facts.usage.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual([
			'dialecte facts list',
			'dialecte facts show',
			'dialecte facts forget',
		])
	})

	it('names the exit codes 1 and 2', () => {
		expect(COMMAND_MAP.facts.exitCodes.map((line) => line.charAt(0))).toEqual(['1', '2'])
	})

	it('shows --state, --about, --reason and --json in its usage', () => {
		const usage = COMMAND_MAP.facts.usage.join('\n')

		expect(
			['--state', '--about', '--reason', '--json'].filter((flag) => !usage.includes(flag)),
		).toEqual([])
	})
})
