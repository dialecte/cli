import { checkCliInvocations } from './cli-invocations.ts'

import { describe, expect, it } from 'vitest'

import type { CliSurface } from './cli-invocations.types.ts'

/** A surface built here: the check reads whatever surface it is given. */
const SURFACE: CliSurface = {
	commands: [
		{ name: 'gate', verbs: [], flags: ['--fast', '--full', '--base', '--json'] },
		{ name: 'worktree', verbs: ['add', 'prune'], flags: ['--from', '--root'] },
	],
	renamed: [{ old: 'recap', new: 'lot recap' }],
}

/** The findings of one page. */
function findingsOf(markdown: string): ReturnType<typeof checkCliInvocations> {
	return checkCliInvocations({
		file: 'skills/demo/SKILL.md',
		markdown,
		surface: SURFACE,
		ignored: new Set(),
	})
}

/** A fenced block of no language holding the lines. */
function fenced(...lines: string[]): string {
	return ['```', ...lines, '```', ''].join('\n')
}

describe('checkCliInvocations, round 1 fixes → no finding', () => {
	const testCases: Record<string, string> = {
		'npx -p @dialecte/cli dialecte <command> (R1-1)':
			'Run `npx -p @dialecte/cli dialecte gate --fast`.\n',
		'npx --package @dialecte/cli dialecte <command> (R1-1)':
			'Run `npx --package @dialecte/cli dialecte gate --fast`.\n',
	}

	for (const [title, markdown] of Object.entries(testCases))
		it(`${title} → no finding`, () => {
			expect(findingsOf(markdown)).toEqual([])
		})
})

describe('checkCliInvocations, round 1 fixes → one error, its line and word', () => {
	const testCases: Record<string, { markdown: string; line: number; word: string }> = {
		'npx -p @dialecte/cli dialecte with an unknown command (R1-1)': {
			markdown: 'Run `npx -p @dialecte/cli dialecte gat`.\n',
			line: 1,
			word: '`gat`',
		},
		'a flag right after [ (R1-2)': {
			markdown: 'Run `dialecte gate [--fats]`.\n',
			line: 1,
			word: '--fats',
		},
		'a flag in a ( | ) group after the command (R1-2)': {
			markdown: 'Run `dialecte gate (--fast | --fats)`.\n',
			line: 1,
			word: '--fats',
		},
		'an inline span inside a bare fence (R1-3)': {
			markdown: fenced('brief:', 'Run `dialecte gat` first.'),
			line: 3,
			word: '`gat`',
		},
		'--json alone with no command (R1-5)': {
			markdown: 'Run `dialecte --json`.\n',
			line: 1,
			word: '--json',
		},
		'a flag whose value is quoted (R1-8)': {
			markdown: 'Run `dialecte gate --fats="x"`.\n',
			line: 1,
			word: '--fats',
		},
		'an environment prefix before the invocation (R1-8)': {
			markdown: 'Run `RUNS=5 dialecte gat`.\n',
			line: 1,
			word: '`gat`',
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(`${title} → one error`, () => {
			expect(findingsOf(testCase.markdown)).toMatchObject([
				{
					severity: 'error',
					line: testCase.line,
					message: expect.stringContaining(testCase.word),
				},
			])
		})
})

describe('checkCliInvocations, the renamed message (R1-7)', () => {
	it('an old form → named once, with its new form', () => {
		const [finding] = findingsOf('Run `dialecte recap ../h`.\n')

		expect(finding?.message.split('`dialecte recap`').length).toBe(2)
		expect(finding?.message).toContain('`dialecte lot recap`')
	})
})

describe('checkCliInvocations, --json without the help (R1-11)', () => {
	it('--json on a command lacking it, without --help → an error', () => {
		expect(findingsOf('Run `dialecte worktree prune --json`.\n')).toMatchObject([
			{ severity: 'error', line: 1, message: expect.stringContaining('--json') },
		])
	})

	it('--json on a command lacking it, with --help → no finding', () => {
		expect(findingsOf('Run `dialecte worktree --help --json`.\n')).toEqual([])
	})
})

describe('checkCliInvocations, a ( that is no flag group stays an operator (R1-2 reopened)', () => {
	const WITH_TDD: CliSurface = {
		commands: [
			...SURFACE.commands,
			{ name: 'tdd', verbs: ['red', 'green', 'status'], flags: ['--json'] },
		],
		renamed: SURFACE.renamed,
	}

	/** The findings of one page against the surface holding tdd. */
	function findingsWithTdd(markdown: string): ReturnType<typeof checkCliInvocations> {
		return checkCliInvocations({
			file: 'skills/demo/SKILL.md',
			markdown,
			surface: WITH_TDD,
			ignored: new Set(),
		})
	}

	const errorCases: Record<string, { markdown: string; line: number }> = {
		'a subshell after a $ prompt': { markdown: fenced('$ (dialecte gat)'), line: 2 },
		'a subshell after a $ prompt, the invocation after &&': {
			markdown: fenced('$ (cd core && dialecte gat)'),
			line: 2,
		},
		'a subshell after other words': { markdown: 'Run `echo done (dialecte gat)`.\n', line: 1 },
	}

	for (const [title, testCase] of Object.entries(errorCases))
		it(`${title} → the invocation inside is checked: one error`, () => {
			expect(findingsWithTdd(testCase.markdown)).toMatchObject([
				{ severity: 'error', line: testCase.line, message: expect.stringContaining('`gat`') },
			])
		})

	it('a ( after a command, no flag next → the words inside are not its flags: no finding', () => {
		expect(findingsWithTdd('Run `dialecte tdd red (then dialecte gate --fast)`.\n')).toEqual([])
	})
})
