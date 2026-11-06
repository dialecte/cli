import { spawnSync } from 'node:child_process'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	DECLARED_FAMILIES,
	HELP_FOOTER_LINES,
	HELP_MAX_LINES,
	HELP_TITLE,
} from '../test/command-families.constants.ts'
import { temporaryFolder } from '../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, 'cli.ts')

const COMMAND_NAMES = DECLARED_FAMILIES.flatMap(([, names]) => names)

/** The cli run as a process in an empty folder of its own. */
function runCli(params: { argv: string[]; cwd?: string }) {
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		encoding: 'utf8',
		cwd: params.cwd ?? temporaryFolder('dialecte-cli-help-'),
	})
	return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** The lines of the global help that open a family: its title, then the commands it lists. */
function familyLines(help: string): Array<[string, string[]]> {
	const lines = help.split('\n')
	const found: Array<[string, string[]]> = []
	for (const [family] of DECLARED_FAMILIES) {
		const line = lines.find((candidate) => new RegExp(`^\\s*${family}\\s+\\S`).test(candidate))
		if (line)
			found.push([
				family,
				line
					.trim()
					.slice(family.length)
					.split(/[\s,]+/)
					.filter(Boolean),
			])
	}
	return found
}

/** The usage lines of a section that open with `dialecte <name>`. */
function usageLinesOf(params: { text: string; name: string }): string[] {
	return params.text
		.split('\n')
		.filter((line) => new RegExp(`^\\s*dialecte ${params.name}\\b`).test(line))
}

describe('the cli help', { timeout: 30_000 }, () => {
	it('no argument → exactly the output of --help, exit 0', () => {
		const run = runCli({ argv: [] })

		expect(run.status).toBe(0)
		expect(run.stdout.split('\n')[0]).toBe(HELP_TITLE)
		expect(run.stdout).toBe(runCli({ argv: ['--help'] }).stdout)
	})

	it('--help → every family title in order with its commands, the two footer lines, at most 45 lines', () => {
		const run = runCli({ argv: ['--help'] })

		expect(run.status).toBe(0)
		expect(familyLines(run.stdout)).toEqual(DECLARED_FAMILIES)
		for (const footer of HELP_FOOTER_LINES) expect(run.stdout).toContain(footer)
		expect(run.stdout.trimEnd().split('\n').length).toBeLessThanOrEqual(HELP_MAX_LINES)
	})

	it('--help → each family title comes after the one before it, the footer after the last family', () => {
		const run = runCli({ argv: ['--help'] })
		const lines = run.stdout.split('\n')
		const positions = [
			...DECLARED_FAMILIES.map(([family]) =>
				lines.findIndex((line) => new RegExp(`^\\s*${family}\\s+\\S`).test(line)),
			),
			lines.findIndex((line) => line.includes(HELP_FOOTER_LINES[0])),
			lines.findIndex((line) => line.includes(HELP_FOOTER_LINES[1])),
		]

		expect(positions).toEqual([...positions].sort((left, right) => left - right))
		expect(positions[0]).toBeGreaterThan(0)
	})

	it('gate --help → the gate section: its usage names --fast, --full and --hook, no other command’s usage line, exit 0', () => {
		const run = runCli({ argv: ['gate', '--help'] })

		expect(run.status).toBe(0)
		expect(usageLinesOf({ text: run.stdout, name: 'gate' }).join('\n')).toMatch(
			/--fast[\s\S]*--full[\s\S]*--hook|--full[\s\S]*--hook[\s\S]*--fast/,
		)
		for (const other of COMMAND_NAMES.filter((name) => name !== 'gate'))
			expect(usageLinesOf({ text: run.stdout, name: other })).toEqual([])
		expect(run.stdout).not.toContain(HELP_TITLE)
		for (const footer of HELP_FOOTER_LINES) expect(run.stdout).not.toContain(footer)
	})

	it('skills sync --copy --help → the skills section only, nothing run: no skill folder written', () => {
		const cwd = temporaryFolder('dialecte-cli-help-skills-')
		writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'app' }))

		const run = runCli({ argv: ['skills', 'sync', '--copy', '--help'], cwd })

		expect(run.status).toBe(0)
		expect(usageLinesOf({ text: run.stdout, name: 'skills' }).length).toBeGreaterThan(0)
		expect(usageLinesOf({ text: run.stdout, name: 'gate' })).toEqual([])
		expect(run.stdout).not.toContain(HELP_TITLE)
		for (const footer of HELP_FOOTER_LINES) expect(run.stdout).not.toContain(footer)
		expect(readdirSync(cwd)).toEqual(['package.json'])
	})

	it('schema -h → the schema section, not the global help', () => {
		const run = runCli({ argv: ['schema', '-h'] })

		expect(run.status).toBe(0)
		expect(usageLinesOf({ text: run.stdout, name: 'schema' }).length).toBeGreaterThan(0)
		expect(run.stdout).not.toContain(HELP_FOOTER_LINES[0])
	})

	it('coverage -- -h → coverage runs with -- and -h (no help taken after --); before the --, -h is its help', () => {
		const afterSeparator = runCli({ argv: ['coverage', '--', '-h'] })
		const beforeSeparator = runCli({ argv: ['coverage', '-h', '--', 'x'] })

		expect(afterSeparator.stdout).not.toContain(HELP_FOOTER_LINES[0])
		expect(usageLinesOf({ text: afterSeparator.stdout, name: 'coverage' })).toEqual([])
		expect(beforeSeparator.status).toBe(0)
		expect(usageLinesOf({ text: beforeSeparator.stdout, name: 'coverage' }).length).toBeGreaterThan(
			0,
		)
	})

	it('--help --json → parses; every command once in family order, each with its family, summary, usage, exit codes and example', () => {
		const run = runCli({ argv: ['--help', '--json'] })

		expect(run.status).toBe(0)
		const parsed = JSON.parse(run.stdout || '{}') as {
			commands?: Array<{
				name: string
				family: string
				summary: string
				usage: string[]
				exitCodes: string[]
				example: string
			}>
		}
		const commands = parsed.commands ?? []
		expect(commands.map((command) => [command.family, command.name])).toEqual(
			DECLARED_FAMILIES.flatMap(([family, names]) => names.map((name) => [family, name])),
		)
		expect(
			commands.filter(
				(command) =>
					command.summary.trim() === '' ||
					command.usage.length === 0 ||
					!Array.isArray(command.exitCodes) ||
					command.example.trim() === '',
			),
		).toEqual([])
	})

	it('gate --help --json → that one command in the --help --json shape', () => {
		const run = runCli({ argv: ['gate', '--help', '--json'] })

		expect(run.status).toBe(0)
		const parsed = JSON.parse(run.stdout || '{}') as { commands?: Array<Record<string, unknown>> }
		expect(parsed.commands).toHaveLength(1)
		expect(parsed.commands?.[0]).toMatchObject({
			name: 'gate',
			family: 'Check',
			summary: expect.any(String),
			usage: expect.any(Array),
			exitCodes: expect.any(Array),
			example: expect.any(String),
		})
	})

	it('tdd --help → every note line starts with "<verb> - " or is a continuation indented under one', () => {
		const run = runCli({ argv: ['tdd', '--help'] })

		const lines = run.stdout.split('\n')
		const usageEnd = lines.findIndex((line, index) => index > 1 && line === '')
		const exampleStart = lines.findIndex((line) => line.startsWith('e.g.'))
		const noteLines = lines.slice(usageEnd + 1, exampleStart).filter((line) => line.trim() !== '')
		expect(run.status).toBe(0)
		expect(noteLines.length).toBeGreaterThan(0)
		expect(noteLines.filter((line) => !/^ {2}\S+ - /.test(line) && !/^ {4,}\S/.test(line))).toEqual(
			[],
		)
	})

	it('nope --help → exactly the output of --help, exit 0', () => {
		const run = runCli({ argv: ['nope', '--help'] })

		expect(run.status).toBe(0)
		expect(run.stdout.split('\n')[0]).toBe(HELP_TITLE)
		expect(run.stdout).toBe(runCli({ argv: ['--help'] }).stdout)
	})

	it('nope → stderr names the unknown command, the global help on stdout, exit 1', () => {
		const run = runCli({ argv: ['nope'] })

		expect(run.status).toBe(1)
		expect(run.stderr).toContain('dialecte: unknown command "nope"')
		expect(run.stdout.split('\n')[0]).toBe(HELP_TITLE)
		expect(run.stdout).toBe(runCli({ argv: ['--help'] }).stdout)
	})
})
