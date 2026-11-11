import { checkCliInvocations } from './cli-invocations.ts'

import { describe, expect, it } from 'vitest'

import type { CheckCliInvocationsParams, CliSurface } from './cli-invocations.types.ts'

const FILE = 'skills/demo/SKILL.md'

const FRONTMATTER = '---\nname: demo\ndescription: Use it.\n---\n'

/** A surface built here, not the real map: the check reads whatever surface it is given. */
const SURFACE: CliSurface = {
	commands: [
		{
			name: 'lot',
			verbs: ['exempt', 'finding', 'decide', 'snapshot', 'delta', 'recap'],
			flags: ['--round', '--severity', '--at', '--worktree', '--json'],
		},
		{ name: 'gate', verbs: [], flags: ['--fast', '--full', '--base', '--hook', '--json'] },
		{ name: 'doctor', verbs: [], flags: ['--brief', '--json'] },
		{ name: 'handover', verbs: ['write', 'show', 'run'], flags: ['--rehearse', '--json'] },
		{ name: 'tdd', verbs: ['red', 'green', 'status'], flags: ['--json'] },
	],
	renamed: [
		{ old: 'record review', new: 'lot finding' },
		{ old: 'record decision', new: 'lot decide' },
		{ old: 'record snapshot', new: 'lot snapshot' },
		{ old: 'record choice', new: 'lot choice' },
		{ old: 'record standard', new: 'lot standard' },
		{ old: 'review delta', new: 'lot delta' },
		{ old: 'recap', new: 'lot recap' },
	],
}

/** The params of one check: the page and the tokens of its ignore directive. */
function pageOf(params: {
	markdown: string
	ignored?: string[]
	surface?: CliSurface
}): CheckCliInvocationsParams {
	return {
		file: FILE,
		markdown: params.markdown,
		surface: params.surface ?? SURFACE,
		ignored: new Set(params.ignored ?? []),
	}
}

/** Matches a message holding every part, in any order. */
function holding(parts: string[]): unknown {
	return expect.stringMatching(
		new RegExp(
			parts.map((part) => `(?=[\\s\\S]*${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join(''),
		),
	)
}

/** One error finding, at the line when given, whose message holds every part. */
function errorHolding(params: { parts: string[]; line?: number }): unknown {
	return {
		severity: 'error',
		...(params.line === undefined ? {} : { line: params.line }),
		message: holding(params.parts),
	}
}

/** A fenced bash block holding the lines. */
function fenced(...lines: string[]): string {
	return ['```bash', ...lines, '```', ''].join('\n')
}

describe('checkCliInvocations, a page citing valid invocations → no finding', () => {
	const testCases: Record<string, string> = {
		'inline code: a command, a verb, flags':
			'Run `dialecte gate --fast` then `dialecte lot finding ../h --round 1`.\n',
		'a flag every command accepts: --help and -h':
			'See `dialecte gate --help` and `dialecte lot -h`.\n',
		'fenced bash with npx': fenced('npx dialecte gate --full --base main'),
		'npx with its own option': 'Run `npx --yes dialecte gate --fast`.\n',
		'npx --no-install @dialecte/cli': 'Run `npx --no-install @dialecte/cli doctor --brief`.\n',
		'after && and ; and |': fenced(
			'cd ../x && dialecte gate --fast',
			'dialecte gate --json | jq .',
			'false; dialecte tdd red',
		),
		'a shell prompt': fenced('$ dialecte tdd status'),
		'a <command> placeholder is not checked': 'Run `dialecte <command> --help`.\n',
		'a <verb> placeholder: its position is not checked, the flags are':
			'Run `dialecte lot <verb> --round 1`.\n',
		'--x=y is the flag --x': 'Run `dialecte gate --base=main`.\n',
		'a double-quoted string is one word, never checked': fenced('dialecte gate "a --nope"'),
		'a single-quoted string is one word, never checked': fenced("dialecte gate 'a --nope'"),
		'single-dash words other than -h are not checked': 'Run `dialecte gate -x`.\n',
		'nothing is checked after a bare --': 'Run `dialecte gate -- --whatever`.\n',
		'a # comment ends the invocation': fenced('dialecte gate --fast # --nope'),
		'a word after the command that is no verb shape (a file name)':
			'Run `dialecte handover lots.json`.\n',
		'the command alone': 'Run `dialecte tdd` or `dialecte`.\n',
		'a line ending in a backslash continues on the next': fenced(
			'dialecte gate \\',
			'  --fast --base main',
		),
		'prose mentioning dialecte is never read':
			'Use a dialecte package, then dialecte gat --nope in prose.\n',
		'npm create dialecte, dialecte-lot and @dialecte/core are no invocation':
			'Run `npm create dialecte`, load `dialecte-lot`, import `@dialecte/core`.\n',
		'a bare global flag as the first word: --help': 'Run `dialecte --help`.\n',
		'a bare global flag as the first word: -h': 'Run `dialecte -h`.\n',
		'a bare global flag as the first word: --help --json': 'Run `dialecte --help --json`.\n',
		'a word after a command without verbs (a path)': 'Run `dialecte gate main`.\n',
		'inline code that does not start with dialecte is no invocation': 'Run `run dialecte gat`.\n',
		'a | inside <...> does not end the invocation': 'Run `dialecte gate <a|b> --fast`.\n',
		'a | inside [...] does not end the invocation': 'Run `dialecte gate [a|b] --fast`.\n',
		'a generated block is not read':
			'<!-- dialecte-skills:generated hooks -->\n`dialecte gat --nope`\n<!-- /dialecte-skills:generated -->\n',
	}

	for (const [title, markdown] of Object.entries(testCases))
		it(`${title} → no finding`, () => {
			expect(checkCliInvocations(pageOf({ markdown }))).toEqual([])
		})
})

describe('checkCliInvocations, an unknown command → error, line, closest command', () => {
	it('a typo → one error with its line and the closest `dialecte gate`', () => {
		expect(
			checkCliInvocations(pageOf({ markdown: 'Intro.\n\nRun `dialecte gat --fast`.\n' })),
		).toMatchObject([errorHolding({ line: 3, parts: ['`dialecte gate`', '`gat`'] })])
	})

	it('a fenced bash line → the page line of that line, the frontmatter counted', () => {
		// 4 frontmatter lines, a blank, the fence on 6, `npm run check` on 7, the invocation on 8
		const markdown = `${FRONTMATTER}\n${fenced('npm run check', 'npx dialecte tdd red && dialecte hadnover write x.json')}`

		expect(checkCliInvocations(pageOf({ markdown }))).toMatchObject([
			errorHolding({ line: 8, parts: ['`dialecte handover`'] }),
		])
	})

	it('after npx @dialecte/cli → checked', () => {
		expect(
			checkCliInvocations(
				pageOf({ markdown: 'Run `npx --no-install @dialecte/cli doctr --brief`.\n' }),
			),
		).toMatchObject([errorHolding({ parts: ['`dialecte doctor`'] })])
	})

	it('two bad invocations → two errors, each on its line', () => {
		expect(
			checkCliInvocations(
				pageOf({ markdown: 'A `dialecte gat`.\nB `dialecte tdd red` and `dialecte hadnover`.\n' }),
			).map((finding) => finding.line),
		).toEqual([1, 2])
	})

	it('no command within the closest distance → an error naming the word, no invented form', () => {
		expect(checkCliInvocations(pageOf({ markdown: 'Run `dialecte frobnicate`.\n' }))).toMatchObject(
			[
				{
					severity: 'error',
					line: 1,
					message: expect.stringMatching(
						/^(?=[\s\S]*`frobnicate`)(?![\s\S]*`dialecte (?!frobnicate)\w)/,
					),
				},
			],
		)
	})

	const moreCases: Record<string, { markdown: string; line: number }> = {
		'after || → checked': { markdown: 'Run `false || dialecte gat`.\n', line: 1 },
		'inside parentheses → checked': { markdown: 'Run `(dialecte gat)`.\n', line: 1 },
		'a bad invocation in a bare ``` fence': {
			markdown: '```\ndialecte gate --fats\n```\n',
			line: 2,
		},
		'a bad invocation in a ```sh fence': { markdown: '```sh\ndialecte gat\n```\n', line: 2 },
		'a bad invocation in a ```shell fence': { markdown: '```shell\ndialecte gat\n```\n', line: 2 },
		'a bad invocation in a fence indented in a list item': {
			markdown: '- step:\n\n  ```bash\n  dialecte gat\n  ```\n',
			line: 4,
		},
		'a | inside <...> does not end it: the flag after is checked': {
			markdown: 'Run `dialecte gate <a|b> --fats`.\n',
			line: 1,
		},
		'a | inside [...] does not end it: the flag after is checked': {
			markdown: 'Run `dialecte gate [a|b] --fats`.\n',
			line: 1,
		},
		'an unknown global flag as the first word': { markdown: 'Run `dialecte --nope`.\n', line: 1 },
		'a flag still checked after a placeholder verb': {
			markdown: 'Run `dialecte lot <verb> --rnd`.\n',
			line: 1,
		},
		'an invocation after a multi-line generated block → its true page line': {
			markdown:
				'<!-- dialecte-skills:generated hooks -->\nline a\nline b\nline c\n<!-- /dialecte-skills:generated -->\nRun `dialecte gat`.\n',
			line: 6,
		},
	}

	for (const [title, testCase] of Object.entries(moreCases))
		it(`${title} → error at its line`, () => {
			expect(checkCliInvocations(pageOf({ markdown: testCase.markdown }))).toMatchObject([
				{ severity: 'error', line: testCase.line },
			])
		})
})

describe('checkCliInvocations, a fence that is no shell script → never read', () => {
	const testCases: Record<string, string> = {
		'a text fence holding a diagram label (dialecte <unknown command>)':
			'```text\ndialecte package\n```\n',
		'a text fence holding a known command with an unknown flag':
			'```text\ndialecte gate --nope\n```\n',
		'a mermaid fence holding a line starting dialecte': [
			'```mermaid',
			'graph LR',
			'  dialecte package --> gate',
			'```',
			'',
		].join('\n'),
		'a fence tagged diagram holding dialecte <unknown verb>':
			'```diagram\ndialecte lot nope\n```\n',
		'a fence tagged json holding dialecte <unknown command>': '```json\ndialecte nope\n```\n',
		'an untagged fence, a line starting dialecte and an unknown command':
			'```\ndialecte package\n```\n',
	}

	for (const [title, markdown] of Object.entries(testCases))
		it(`${title} → no finding`, () => {
			expect(checkCliInvocations(pageOf({ markdown }))).toEqual([])
		})
})

describe('checkCliInvocations, an unknown verb or flag → error with the closest form', () => {
	const testCases: Record<string, { markdown: string; parts: string[] }> = {
		'an unknown verb → the closest `dialecte lot finding`': {
			markdown: 'Run `dialecte lot findng ../h`.\n',
			parts: ['`dialecte lot finding`'],
		},
		'an unknown verb with no close one → the command valid verbs': {
			markdown: 'Run `dialecte tdd zzzzzzzz`.\n',
			parts: ['red', 'green', 'status'],
		},
		'an unknown flag → the closest `dialecte gate --fast`': {
			markdown: 'Run `dialecte gate --fats`.\n',
			parts: ['`dialecte gate --fast`'],
		},
		'an unknown flag of a verb → the closest form keeps the verb': {
			markdown: 'Run `dialecte lot delta ../h --wortree`.\n',
			parts: ['`dialecte lot delta --worktree`'],
		},
		'an unknown flag read from --x=y → the flag --x is the cited one': {
			markdown: 'Run `dialecte gate --fats=1`.\n',
			parts: ['--fats'],
		},
		'an unknown flag with no close one → the command valid flags': {
			markdown: 'Run `dialecte gate --zzzzzzzz`.\n',
			parts: ['--fast', '--full', '--hook'],
		},
		'a flag of another command → an error: flags are checked against their own command': {
			markdown: 'Run `dialecte gate --round 1`.\n',
			parts: ['--round'],
		},
		'a bad flag after && → the second invocation is checked': {
			markdown: 'Run `dialecte gate --fast && dialecte gate --fats`.\n',
			parts: ['`dialecte gate --fast`'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(checkCliInvocations(pageOf({ markdown: testCase.markdown }))).toMatchObject([
				errorHolding({ line: 1, parts: testCase.parts }),
			])
		})

	it('a flag on the continuation line of a fenced command → the line of the flag', () => {
		// the fence is line 1, the command line 2, the continuation line 3
		expect(
			checkCliInvocations(pageOf({ markdown: fenced('dialecte gate \\', '  --fats') })),
		).toMatchObject([errorHolding({ line: 3, parts: ['--fats'] })])
	})
})

describe('checkCliInvocations, an old renamed form → error naming the new form', () => {
	const testCases: Record<string, { markdown: string; names: string[] }> = {
		'dialecte record review → dialecte lot finding': {
			markdown: 'Run `dialecte record review ../h --round 1`.\n',
			names: ['`dialecte lot finding`'],
		},
		'dialecte record decision → dialecte lot decide': {
			markdown: 'Run `dialecte record decision ../h R1-1 open`.\n',
			names: ['`dialecte lot decide`'],
		},
		'dialecte review delta → dialecte lot delta': {
			markdown: fenced('dialecte review delta ../h --round 2'),
			names: ['`dialecte lot delta`'],
		},
		'dialecte recap → dialecte lot recap': {
			markdown: 'Run `dialecte recap ../h`.\n',
			names: ['`dialecte lot recap`'],
		},
		'npx --no-install @dialecte/cli record snapshot → dialecte lot snapshot': {
			markdown: 'Run `npx --no-install @dialecte/cli record snapshot ../h --round 1`.\n',
			names: ['`dialecte lot snapshot`'],
		},
		'record alone → the lot forms that replaced it': {
			markdown: 'Run `dialecte record`.\n',
			names: ['`dialecte lot finding`', '`dialecte lot decide`', '`dialecte lot standard`'],
		},
		'review alone → the lot form that replaced it': {
			markdown: 'Run `dialecte review`.\n',
			names: ['`dialecte lot delta`'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(`${title}, one error, no second finding for the unknown command`, () => {
			expect(checkCliInvocations(pageOf({ markdown: testCase.markdown }))).toMatchObject([
				errorHolding({ parts: testCase.names }),
			])
		})

	it('the line of an old form in a fenced block → its page line', () => {
		expect(
			checkCliInvocations(pageOf({ markdown: `Intro\n${fenced('dialecte recap ../h')}` })),
		).toMatchObject([errorHolding({ line: 3, parts: ['`dialecte lot recap`'] })])
	})
})

describe('checkCliInvocations, the ignore directive → skips the finding whose word it names', () => {
	const testCases: Record<string, { markdown: string; ignored: string[]; remaining: number }> = {
		'the unknown command → skipped': {
			markdown: 'Run `dialecte frobnicate`.\n',
			ignored: ['frobnicate'],
			remaining: 0,
		},
		'the unknown verb → skipped': {
			markdown: 'Run `dialecte lot findng`.\n',
			ignored: ['findng'],
			remaining: 0,
		},
		'the unknown flag as cited → skipped': {
			markdown: 'Run `dialecte gate --fats`.\n',
			ignored: ['--fats'],
			remaining: 0,
		},
		'the old command word record → skipped': {
			markdown: 'Run `dialecte record review ../h`.\n',
			ignored: ['record'],
			remaining: 0,
		},
		'the old command word recap → skipped': {
			markdown: 'Run `dialecte recap ../h`.\n',
			ignored: ['recap'],
			remaining: 0,
		},
		'a token naming another word → the finding stays': {
			markdown: 'Run `dialecte gate --fats`.\n',
			ignored: ['--fast'],
			remaining: 1,
		},
		'one flag ignored, another not → the other stays': {
			markdown: 'Run `dialecte gate --fats --zzzzzzzz`.\n',
			ignored: ['--fats'],
			remaining: 1,
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(
				checkCliInvocations(pageOf({ markdown: testCase.markdown, ignored: testCase.ignored })),
			).toHaveLength(testCase.remaining)
		})

	it('one flag ignored, another not → the remaining finding holds the other flag, not the ignored', () => {
		expect(
			checkCliInvocations(
				pageOf({ markdown: 'Run `dialecte gate --fats --zzzzzzzz`.\n', ignored: ['--fats'] }),
			),
		).toMatchObject([{ message: expect.stringMatching(/^(?=[\s\S]*--zzzzzzzz)(?![\s\S]*--fats)/) }])
	})
})

describe('checkCliInvocations, the surface decides the renamed forms', () => {
	const OTHER_SURFACE: CliSurface = {
		commands: [{ name: 'lot', verbs: ['finding', 'summary'], flags: [] }],
		renamed: [{ old: 'recap', new: 'lot summary' }],
	}

	it('a renamed row of the given surface → its new form is named', () => {
		expect(
			checkCliInvocations(pageOf({ markdown: 'Run `dialecte recap`.\n', surface: OTHER_SURFACE })),
		).toMatchObject([errorHolding({ parts: ['`dialecte lot summary`'] })])
	})

	it('a surface with no renamed row, citing dialecte recap → an unknown command, the closest by name', () => {
		expect(
			checkCliInvocations(
				pageOf({
					markdown: 'Run `dialecte recap`.\n',
					surface: { commands: [{ name: 'recapture', verbs: [], flags: [] }], renamed: [] },
				}),
			),
		).toMatchObject([errorHolding({ line: 1, parts: ['`recap`', '`dialecte recapture`'] })])
	})
})

describe('checkCliInvocations, findings', () => {
	it('carry the page file', () => {
		expect(
			checkCliInvocations(pageOf({ markdown: 'Run `dialecte gat`.\n' })).map(
				(finding) => finding.file,
			),
		).toEqual([FILE])
	})
})
