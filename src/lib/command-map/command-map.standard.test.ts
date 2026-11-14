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

const STANDARD_USAGE = [
	'dialecte standard index [--standard <id>] [--package <name>] [--rebuild] [--json]',
	'dialecte standard find "<terms>" [--standard <id>] [--package <name>] [--about <Tag>] [--limit <n>] [--json]',
	'dialecte standard show <file id>:<from>-<to> [--json]',
	'dialecte standard eval <gold.jsonl> [--standard <id>] [--package <name>] [--angles] [--json]',
]

/** The cli run as a process in an empty folder of its own, with no standard configured. */
function runCli(params: { argv: string[] }) {
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		encoding: 'utf8',
		cwd: temporaryFolder('dialecte-standard-help-'),
		env: temporaryEnvironment(),
		timeout: CLI_SURFACE_CASE_TIMEOUT,
	})
	return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** The process environment with the home, the cache and the standard pointed at a scratch folder: no standard configured. */
function temporaryEnvironment(): NodeJS.ProcessEnv {
	const base = temporaryFolder('dialecte-standard-env-')
	return {
		...process.env,
		HOME: join(base, 'home'),
		XDG_CACHE_HOME: join(base, 'cache'),
		DIALECTE_STANDARD: '',
	}
}

function standardOfHelpJson(text: string): HelpJson['commands'][number] | undefined {
	return (JSON.parse(text) as HelpJson).commands.find((command) => command.name === 'standard')
}

describe('the command map: standard', () => {
	it('declared in the Discover family with the usage line of each of its four verbs', () => {
		expect({
			family: listedEntryOf('standard')?.family,
			usage: listedEntryOf('standard')?.usage,
		}).toEqual({ family: 'Discover', usage: STANDARD_USAGE })
	})

	it('a summary, notes for the verbs, one example of the command and its exit codes', () => {
		const entry = listedEntryOf('standard')

		expect({
			summary: (entry?.summary ?? '').length > 0,
			notes: (entry?.notes ?? []).length > 0,
			example: entry?.example.startsWith('dialecte standard '),
			exitCodes: (entry?.exitCodes ?? []).length > 0,
		}).toEqual({ summary: true, notes: true, example: true, exitCodes: true })
	})

	it('the Discover family of the map → the commands of the declared family order, standard last', () => {
		expect(
			listedCommands()
				.filter((command) => command.entry.family === 'Discover')
				.map((command) => command.name),
		).toEqual(DECLARED_FAMILIES.find(([family]) => family === 'Discover')?.[1])
	})

	it('the global help → names standard on the Discover line', () => {
		const discover = renderGlobalHelp()
			.split('\n')
			.find((line) => /^\s*Discover\s/u.test(line))

		expect(discover?.split(/\s+/u)).toContain('standard')
	})

	it('--help --json → the standard command with its four verbs and the flags of its usage lines', () => {
		expect(standardOfHelpJson(renderHelpJson())).toMatchObject({
			name: 'standard',
			verbs: ['index', 'find', 'show', 'eval'],
			flags: ['--standard', '--package', '--rebuild', '--json', '--about', '--limit', '--angles'],
		})
	})

	it(
		'dialecte standard --help → the standard section only, the four usage lines, nothing run',
		() => {
			const run = runCli({ argv: ['standard', '--help'] })

			expect(run.status).toBe(0)
			for (const line of STANDARD_USAGE) expect(run.stdout).toContain(line)
		},
		CLI_SURFACE_CASE_TIMEOUT,
	)

	it(
		'dialecte standard --help --json → that command only, with its verbs',
		() => {
			const run = runCli({ argv: ['standard', '--help', '--json'] })

			expect({
				status: run.status,
				names: (JSON.parse(run.stdout || '{"commands":[]}') as HelpJson).commands.map(
					(command) => command.name,
				),
				verbs: standardOfHelpJson(run.stdout || '{"commands":[]}')?.verbs,
			}).toEqual({ status: 0, names: ['standard'], verbs: ['index', 'find', 'show', 'eval'] })
		},
		CLI_SURFACE_CASE_TIMEOUT,
	)

	it(
		'dialecte standard with no standard configured → exit 2 saying how to set DIALECTE_STANDARD, never a stack trace',
		() => {
			const run = runCli({ argv: ['standard', 'index'] })

			expect({
				status: run.status,
				says: `${run.stdout}${run.stderr}`.includes('DIALECTE_STANDARD'),
				stack: `${run.stdout}${run.stderr}`.includes('    at '),
			}).toEqual({ status: 2, says: true, stack: false })
		},
		CLI_SURFACE_CASE_TIMEOUT,
	)
})
