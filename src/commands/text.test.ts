import { realpathSync } from 'node:fs'

import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { runText } from './text.ts'

import { describe, expect, it } from 'vitest'

const TEXT_CHECK_USAGE = 'text check: expected <file> [--kind pr|issue|comment|commit]'

/** `count` distinct words: `<stem>1 <stem>2 ...`. */
function words(params: { count: number; stem?: string }): string {
	const stem = params.stem ?? 'word'
	return Array.from({ length: params.count }, (_, index) => `${stem}${index + 1}`).join(' ')
}

/** A folder of the test's own holding `files`; the checks run from it, the file named as given. */
function textFolder(files: Record<string, string>): string {
	const root = realpathSync(temporaryFolder('dialecte-text-'))
	writeFiles({ root, files })
	return root
}

/**
 * A pull request's human part with its three sections, each heading's text then a line of words:
 * headings on lines 1, 4, 7, their text on 2, 5, 8 (and `Watch out` on 10, its text on 11).
 */
function sectionsBody(params: {
	whatChanges: number
	why: number
	howToCheck: number
	watchOut?: number
}): string {
	const sections = [
		`## What changes\n${words({ count: params.whatChanges, stem: 'change' })}\n`,
		`## Why\n${words({ count: params.why, stem: 'reason' })}\n`,
		`## How to check it\n${words({ count: params.howToCheck, stem: 'step' })}\n`,
	]
	if (params.watchOut !== undefined)
		sections.push(`## Watch out\n${words({ count: params.watchOut, stem: 'risk' })}\n`)
	return sections.join('\n')
}

/** `count` lines of ten words each, one after the other, no blank line. */
function tenWordLines(count: number): string[] {
	return Array.from({ length: count }, (_, index) => words({ count: 10, stem: `l${index + 1}w` }))
}

function checkCall(params: { root: string; file?: string; kind?: string }) {
	const file = params.file ?? 'body.md'
	return {
		cwd: params.root,
		argv: ['check', file, ...(params.kind ? ['--kind', params.kind] : [])],
	}
}

describe('dialecte text check - the word cap', () => {
	it.each([
		{ kind: 'pr', cap: 150, body: sectionsBody({ whatChanges: 50, why: 50, howToCheck: 50 }) },
		{ kind: 'issue', cap: 200, body: sectionsBody({ whatChanges: 70, why: 70, howToCheck: 60 }) },
	])(
		'$kind at its cap of $cap (heading words not counted) → exit 0, the count and headings ok',
		({ kind, cap, body }) => {
			const root = textFolder({ 'body.md': body })

			expect(runText(checkCall({ root, kind }))).toEqual({
				exitCode: 0,
				output: `text check: body.md - ${kind}, ${cap} of ${cap} words, headings ok`,
			})
		},
	)

	it('no --kind → pr', () => {
		const root = textFolder({ 'body.md': sectionsBody({ whatChanges: 3, why: 4, howToCheck: 5 }) })

		expect(runText(checkCall({ root }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - pr, 12 of 150 words, headings ok',
		})
	})

	it('comment at its cap of 80 → exit 0, the count, no headings part', () => {
		const root = textFolder({ 'body.md': `${tenWordLines(8).join('\n')}\n` })

		expect(runText(checkCall({ root, kind: 'comment' }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - comment, 80 of 80 words',
		})
	})

	it('commit: the body at its cap of 100, the subject not counted → exit 0', () => {
		const root = textFolder({
			'message.txt': `feat: a subject of seven words here\n\n${tenWordLines(10).join('\n')}\n`,
		})

		expect(runText(checkCall({ root, file: 'message.txt', kind: 'commit' }))).toEqual({
			exitCode: 0,
			output: 'text check: message.txt - commit, 100 of 100 words',
		})
	})

	it('commit: a subject alone → 0 words', () => {
		const root = textFolder({ 'message.txt': 'fix: one line only\n' })

		expect(runText(checkCall({ root, file: 'message.txt', kind: 'commit' }))).toEqual({
			exitCode: 0,
			output: 'text check: message.txt - commit, 0 of 100 words',
		})
	})

	it('a word holds a letter or a digit: lone dashes, stars, pipes not counted; "x." and "é" and "42" counted', () => {
		const root = textFolder({
			'body.md': `${words({ count: 77 })}\n- * | -- — ** x. é 42\n`,
		})

		expect(runText(checkCall({ root, kind: 'comment' }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - comment, 80 of 80 words',
		})
	})

	it('fenced code blocks (``` with a language, ~~~) not counted, their fence lines neither', () => {
		const root = textFolder({
			'body.md': [
				...tenWordLines(7),
				'```bash',
				words({ count: 30, stem: 'command' }),
				'```',
				'~~~',
				words({ count: 20, stem: 'output' }),
				'~~~',
				words({ count: 10, stem: 'after' }),
				'',
			].join('\n'),
		})

		expect(runText(checkCall({ root, kind: 'comment' }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - comment, 80 of 80 words',
		})
	})

	it.each([
		{ opening: '<details>', label: 'a <details> line' },
		{ opening: '  <details open>', label: 'an indented <details open> line' },
	])(
		'$label → it and every line after it are the recap: neither counted nor heading-checked',
		({ opening }) => {
			const root = textFolder({
				'body.md': [
					sectionsBody({ whatChanges: 50, why: 50, howToCheck: 50 }),
					opening,
					'<summary>How this change was made</summary>',
					'',
					'### Commits',
					`- ${words({ count: 200, stem: 'recap' })}`,
					'',
					'</details>',
					'',
				].join('\n'),
			})

			expect(runText(checkCall({ root }))).toEqual({
				exitCode: 0,
				output: 'text check: body.md - pr, 150 of 150 words, headings ok',
			})
		},
	)

	it.each([
		{
			kind: 'pr',
			cap: 150,
			body: sectionsBody({ whatChanges: 50, why: 50, howToCheck: 51 }),
			line: 8,
			text: words({ count: 51, stem: 'step' }),
		},
		{
			kind: 'issue',
			cap: 200,
			body: sectionsBody({ whatChanges: 70, why: 70, howToCheck: 61 }),
			line: 8,
			text: words({ count: 61, stem: 'step' }),
		},
		{
			kind: 'comment',
			cap: 80,
			body: `${tenWordLines(8).join('\n')}\nextra\n`,
			line: 9,
			text: 'extra',
		},
		{
			kind: 'commit',
			cap: 100,
			body: `fix: the subject\n\n${tenWordLines(10).join('\n')}\nextra\n`,
			line: 13,
			text: 'extra',
		},
	])(
		'$kind one word past its cap of $cap → exit 1, the count, the cap, the cut of 1, the line that passed it',
		({ kind, cap, body, line, text }) => {
			const root = textFolder({ 'body.md': body })

			expect(runText(checkCall({ root, kind }))).toEqual({
				exitCode: 1,
				output: [
					`text check: body.md - ${kind}: 1 problem`,
					`body.md: ${cap + 1} words, the cap is ${cap} (cut 1)`,
					`body.md:${line}: past the cap - ${text}`,
				].join('\n'),
			})
		},
	)

	it('past the cap → every line from the one that passed it to the last line holding a word, each with its number; the line that reached the cap exactly and a trailing line with no word left out', () => {
		const lines = tenWordLines(8)
		const root = textFolder({
			'body.md': [...lines, 'extra words here', 'tail end', '- -', ''].join('\n'),
		})

		expect(runText(checkCall({ root, kind: 'comment' }))).toEqual({
			exitCode: 1,
			output: [
				'text check: body.md - comment: 1 problem',
				'body.md: 85 words, the cap is 80 (cut 5)',
				'body.md:9: past the cap - extra words here',
				'body.md:10: past the cap - tail end',
			].join('\n'),
		})
	})
})

describe('dialecte text check - what is a heading, where the recap starts', () => {
	it('`#abc was the cause` (no space after #) and `####### seven` (seven #) are no headings: counted as text, exit 0', () => {
		const root = textFolder({ 'body.md': '#abc was the cause\n####### seven\n' })

		expect(runText(checkCall({ root, kind: 'comment' }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - comment, 5 of 80 words',
		})
	})

	it('a line `see the <details> below` in the human part → still counted: the cut is only at a line starting with <details', () => {
		const root = textFolder({
			'body.md': [
				'## What changes',
				'see the <details> below',
				'',
				'## Why',
				'It was slow.',
				'',
				'## How to check it',
				'Run it.',
				'',
				'<details>',
				`${words({ count: 300, stem: 'recap' })}`,
				'</details>',
				'',
			].join('\n'),
		})

		expect(runText(checkCall({ root }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - pr, 9 of 150 words, headings ok',
		})
	})
})

describe('dialecte text check - the headings of a pr or an issue', () => {
	it('the three headings in order, any level, any case, trailing #s dropped, Watch out with text → headings ok', () => {
		const root = textFolder({
			'body.md': [
				'# what changes ##',
				'It reads the file once.',
				'',
				'#### WHY',
				'It was slow.',
				'',
				'## How To Check It   ',
				'Run it.',
				'',
				'### Watch out',
				'The cache is new.',
				'',
			].join('\n'),
		})

		expect(runText(checkCall({ root, kind: 'issue' }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - issue, 14 of 200 words, headings ok',
		})
	})

	it('a heading missing → refused without a line number: missing heading "Why"', () => {
		const root = textFolder({
			'body.md': '## What changes\nIt reads.\n\n## How to check it\nRun it.\n',
		})

		expect(runText(checkCall({ root }))).toEqual({
			exitCode: 1,
			output: ['text check: body.md - pr: 1 problem', 'body.md: missing heading "Why"'].join('\n'),
		})
	})

	it.each([
		{
			rule: 'any other heading',
			lines: ['## What changes', 'a', '## Notes', 'b', '## Why', 'c', '## How to check it', 'd'],
			line: 3,
		},
		{
			rule: 'a heading twice',
			lines: ['## What changes', 'a', '## Why', 'b', '## How to check it', 'c', '## Why', 'd'],
			line: 7,
		},
		{
			rule: 'a heading out of order (after a heading that comes later)',
			lines: ['## What changes', 'a', '## How to check it', 'b', '## Why', 'c'],
			line: 5,
		},
		{
			rule: 'a section with no text under it (blank lines only)',
			lines: ['## What changes', 'a', '## Why', '', '', '## How to check it', 'c'],
			line: 3,
		},
		{
			rule: 'a non-blank line before the first heading',
			lines: ['', 'Hello there', '## What changes', 'a', '## Why', 'b', '## How to check it', 'c'],
			line: 2,
		},
	])('$rule → refused with its line number and text', ({ lines, line }) => {
		const root = textFolder({ 'body.md': `${lines.join('\n')}\n` })
		const text = lines[line - 1]

		expect(runText(checkCall({ root }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				new RegExp(
					`^text check: body\\.md - pr: 1 problem\\nbody\\.md:${line}: \\S[^\\n]* - ${escapeRegExp(text)}$`,
				),
			),
		})
	})

	it('Watch out with no text → refused at its line, saying to leave it out when empty', () => {
		const root = textFolder({
			'body.md': `${sectionsBody({ whatChanges: 2, why: 2, howToCheck: 2 })}\n## Watch out\n\n`,
		})

		expect(runText(checkCall({ root, kind: 'issue' }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				/^text check: body\.md - issue: 1 problem\nbody\.md:10: [^\n]*leave it out when empty[^\n]* - ## Watch out$/,
			),
		})
	})

	it('a ```bash block holding `# install` under How to check it → no heading there, its lines not counted, headings ok', () => {
		const root = textFolder({
			'body.md': [
				'## What changes',
				'It reads.',
				'',
				'## Why',
				'It was slow.',
				'',
				'## How to check it',
				'Run these.',
				'```bash',
				'# install',
				'npm ci',
				'```',
				'',
			].join('\n'),
		})

		expect(runText(checkCall({ root }))).toEqual({
			exitCode: 0,
			output: 'text check: body.md - pr, 7 of 150 words, headings ok',
		})
	})

	it('a heading problem, a missing heading and the cap passed → the line problems, then the missing headings, then the over-cap block last', () => {
		const lines = [
			'## What changes',
			words({ count: 50, stem: 'change' }),
			'',
			'## Notes',
			'note',
			'',
			'## How to check it',
			words({ count: 100, stem: 'step' }),
		]
		const root = textFolder({ 'body.md': `${lines.join('\n')}\n` })

		expect(runText(checkCall({ root }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				new RegExp(
					[
						'^text check: body\\.md - pr: 3 problems',
						'body\\.md:4: \\S[^\\n]* - ## Notes',
						'body\\.md: missing heading "Why"',
						'body\\.md: 151 words, the cap is 150 \\(cut 1\\)',
						`body\\.md:8: past the cap - ${lines[7]}$`,
					].join('\\n'),
				),
			),
		})
	})

	it('several problems → one line each in line order, the missing headings last', () => {
		const lines = ['Hello there', '## Notes', 'a', '## What changes', 'b', '## Why', '']
		const root = textFolder({ 'body.md': `${lines.join('\n')}\n` })

		expect(runText(checkCall({ root }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				new RegExp(
					[
						'^text check: body\\.md - pr: 4 problems',
						'body\\.md:1: \\S[^\\n]* - Hello there',
						'body\\.md:2: \\S[^\\n]* - ## Notes',
						'body\\.md:6: \\S[^\\n]* - ## Why',
						'body\\.md: missing heading "How to check it"$',
					].join('\\n'),
				),
			),
		})
	})
})

describe('dialecte text check - a comment or a commit holds no heading', () => {
	it('comment: each heading line refused with its line', () => {
		const root = textFolder({
			'body.md': 'Thanks, fixed.\n### Details\nIt was the cache.\n# Done\n',
		})

		expect(runText(checkCall({ root, kind: 'comment' }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				/^text check: body\.md - comment: 2 problems\nbody\.md:2: \S[^\n]* - ### Details\nbody\.md:4: \S[^\n]* - # Done$/,
			),
		})
	})

	it('commit: a heading in the body refused with its line', () => {
		const root = textFolder({ 'body.md': 'fix: the subject\n\n## Why\nIt was slow.\n' })

		expect(runText(checkCall({ root, kind: 'commit' }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				/^text check: body\.md - commit: 1 problem\nbody\.md:3: \S[^\n]* - ## Why$/,
			),
		})
	})

	it.each([
		{ length: 72, exitCode: 0 },
		{ length: 73, exitCode: 1 },
	])('commit: a subject of $length characters → exit $exitCode', ({ length, exitCode }) => {
		const subject = `fix: ${'a'.repeat(length - 5)}`
		const root = textFolder({ 'body.md': `${subject}\n\nIt was slow.\n` })

		expect(runText(checkCall({ root, kind: 'commit' }))).toEqual({
			exitCode,
			output:
				exitCode === 0
					? 'text check: body.md - commit, 3 of 100 words'
					: expect.stringMatching(
							new RegExp(
								`^text check: body\\.md - commit: 1 problem\\nbody\\.md:1: \\S[^\\n]* - ${subject}$`,
							),
						),
		})
	})

	it('commit: a body right under the subject (line 2 not blank) → refused at line 2', () => {
		const root = textFolder({ 'body.md': 'fix: the subject\nIt was slow.\n' })

		expect(runText(checkCall({ root, kind: 'commit' }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				/^text check: body\.md - commit: 1 problem\nbody\.md:2: \S[^\n]* - It was slow\.$/,
			),
		})
	})

	it('commit: line 2 not blank → the problem says line 2 must be blank between the subject and the body', () => {
		const root = textFolder({ 'body.md': 'fix: the subject\nIt was slow.\n' })

		expect(runText(checkCall({ root, kind: 'commit' }))).toEqual({
			exitCode: 1,
			output:
				'text check: body.md - commit: 1 problem\nbody.md:2: line 2 must be blank between the subject and the body - It was slow.',
		})
	})

	it.each([
		{ label: 'a body under it', body: '\n\nIt was slow.\n' },
		{ label: 'nothing else', body: '\n' },
	])('commit: an empty line 1 (no subject), $label → refused at line 1 only', ({ body }) => {
		const root = textFolder({ 'body.md': body })

		expect(runText(checkCall({ root, kind: 'commit' }))).toEqual({
			exitCode: 1,
			output:
				'text check: body.md - commit: 1 problem\nbody.md:1: line 1 is empty: a commit starts with its subject',
		})
	})

	it('commit: an empty line 1 right above a body (line 2 not blank) → only the empty subject refused, at line 1', () => {
		const root = textFolder({ 'body.md': '\nIt was slow.\n' })

		expect(runText(checkCall({ root, kind: 'commit' }))).toEqual({
			exitCode: 1,
			output:
				'text check: body.md - commit: 1 problem\nbody.md:1: line 1 is empty: a commit starts with its subject',
		})
	})
})

describe('dialecte text - usage', () => {
	it.each([
		{ label: 'no file', argv: ['check'] },
		{ label: 'an unknown kind', argv: ['check', 'body.md', '--kind', 'tweet'] },
		{ label: 'an unknown option', argv: ['check', 'body.md', '--strict'] },
		{ label: '--kind without its value', argv: ['check', 'body.md', '--kind'] },
	])('$label → the check usage, exit 2', ({ argv }) => {
		const root = textFolder({ 'body.md': 'Thanks.\n' })

		expect(runText({ cwd: root, argv })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(new RegExp(`^${escapeRegExp(TEXT_CHECK_USAGE)}`)),
		})
	})

	it.each([
		{ label: 'another subcommand', argv: ['lint', 'body.md'] },
		{ label: 'no subcommand', argv: [] },
	])('$label → the text usage, exit 2', ({ argv }) => {
		const root = textFolder({ 'body.md': 'Thanks.\n' })

		expect(runText({ cwd: root, argv })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^text: check <file> \[--kind /),
		})
	})

	it('a missing file → exit 1, no file <path>', () => {
		const root = textFolder({})

		expect(runText(checkCall({ root, file: 'missing.md' }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^text check: no file (\/.*\/)?missing\.md$/),
		})
	})
})

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
