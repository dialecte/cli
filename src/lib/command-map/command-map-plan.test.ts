/** The `plan` command in the map and the help (33N section 3): the `Plan` family after `Grow`, its three verbs. */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { DECLARED_FAMILIES } from '../../../test/command-families.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { listedCommands, listedEntryOf, renderGlobalHelp, renderHelpJson } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type { HelpJson } from './command-map.types.ts'

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '../../cli.ts')

const PLAN_USAGE = [
	'dialecte plan next <plan.md> [--json] [--all]',
	'dialecte plan check <plan.md> [--json]',
	'dialecte plan mark <plan.md> <id> done --by <who> [--reason <text>]',
]

/** The cli run as a process in an empty folder of its own. */
function runCli(params: { argv: string[] }) {
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		encoding: 'utf8',
		cwd: temporaryFolder('dialecte-plan-help-'),
		timeout: CLI_SURFACE_CASE_TIMEOUT,
	})
	return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('the command map: plan', () => {
	it('declared in the Plan family with the usage line of each of its three verbs', () => {
		expect({
			family: listedEntryOf('plan')?.family,
			usage: listedEntryOf('plan')?.usage,
		}).toEqual({ family: 'Plan', usage: PLAN_USAGE })
	})

	it('a summary, an example of the command, and the exit codes 1 (no lot) and 2 (usage, no or invalid block)', () => {
		const entry = listedEntryOf('plan')

		expect({
			summary: (entry?.summary ?? '').length > 0,
			example: entry?.example.startsWith('dialecte plan '),
			exitCodes: (entry?.exitCodes ?? []).map((line) => line.slice(0, 3)),
			noLot: /no lot/.test(entry?.exitCodes[0] ?? ''),
			refusals: ['usage', 'block', 'git checkout'].filter(
				(word) => !(entry?.exitCodes[1] ?? '').includes(word),
			),
		}).toEqual({
			summary: true,
			example: true,
			exitCodes: ['1  ', '2  '],
			noLot: true,
			refusals: [],
		})
	})

	it("the map's families equal DECLARED_FAMILIES, Plan right after Grow", () => {
		expect(
			DECLARED_FAMILIES.map(([family]) => [
				family,
				listedCommands()
					.filter((command) => command.entry.family === family)
					.map((command) => command.name),
			]),
		).toEqual(DECLARED_FAMILIES)
		expect(DECLARED_FAMILIES.map(([family]) => family).slice(2, 5)).toEqual([
			'Grow',
			'Plan',
			'Check',
		])
	})

	it('the Plan family of the map lists plan alone, and comes right after Grow', () => {
		const families = listedCommands()
			.map((command) => command.entry.family)
			.filter((family, index, all) => all.indexOf(family) === index)

		expect({
			plan: listedCommands()
				.filter((command) => command.entry.family === 'Plan')
				.map((command) => command.name),
			afterGrow: families[families.indexOf('Grow') + 1],
		}).toEqual({ plan: ['plan'], afterGrow: 'Plan' })
	})

	it('the global help: a Plan line naming plan, on the line after Grow', () => {
		const lines = renderGlobalHelp().split('\n')
		const grow = lines.findIndex((line) => /^Grow\s/u.test(line))

		expect(lines[grow + 1]?.split(/\s+/u)).toEqual(['Plan', 'plan'])
	})

	it('--help --json: the plan command with its three verbs and the flags of its usage lines', () => {
		const plan = (JSON.parse(renderHelpJson()) as HelpJson).commands.find(
			(command) => command.name === 'plan',
		)

		expect(plan).toMatchObject({
			name: 'plan',
			family: 'Plan',
			verbs: expect.arrayContaining(['next', 'check', 'mark']),
			flags: expect.arrayContaining(['--json', '--all', '--by', '--reason']),
		})
	})

	it(
		'dialecte plan --help: the plan section only, the three usage lines and the exit codes, nothing run',
		() => {
			const run = runCli({ argv: ['plan', '--help'] })

			expect({
				status: run.status,
				missing: PLAN_USAGE.filter((line) => !run.stdout.includes(line)),
				exitCodes: run.stdout.includes('exit codes:'),
				global: run.stdout.includes('dialecte <command> --help'),
			}).toEqual({ status: 0, missing: [], exitCodes: true, global: false })
		},
		CLI_SURFACE_CASE_TIMEOUT,
	)
})
