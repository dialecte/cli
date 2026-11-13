import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	AGENTS_CHECK_END,
	AGENTS_CHECK_LINE,
	AGENTS_CHECK_START,
	AGENTS_FILE,
} from './agents-file-check.constants.ts'
import { holdsOnlyTheAgentsCheck, syncAgentsFileCheck } from './agents-file-check.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// the section as written now: a blank line after the start marker and before the end marker
const SECTION_BODY = `${AGENTS_CHECK_START}\n\n${AGENTS_CHECK_LINE}\n\n${AGENTS_CHECK_END}`
const SECTION = `${SECTION_BODY}\n`
const SECTION_CRLF = SECTION.replaceAll('\n', '\r\n')
// the form before: no blank line
const COMPACT_BODY = `${AGENTS_CHECK_START}\n${AGENTS_CHECK_LINE}\n${AGENTS_CHECK_END}`
// what oxfmt leaves of the compact form: a blank line after the start marker only
const HALF_BODY = `${AGENTS_CHECK_START}\n\n${AGENTS_CHECK_LINE}\n${AGENTS_CHECK_END}`
// an older sentence, in the compact form and in the form written now
const OLD_COMPACT_BODY = `${AGENTS_CHECK_START}\nAn older sentence.\n${AGENTS_CHECK_END}`
const OLD_BLANK_BODY = `${AGENTS_CHECK_START}\n\nAn older sentence.\n\n${AGENTS_CHECK_END}`
// what a formatter wrapping prose (proseWrap: always) leaves: the sentence over several lines
const WRAPPED_BODY = `${AGENTS_CHECK_START}\n\n${AGENTS_CHECK_LINE.replace('nothing printed', 'nothing\nprinted').replace('a problem with', 'a\nproblem with')}\n\n${AGENTS_CHECK_END}`
// spaces doubled inside the sentence
const SPACED_BODY = `${AGENTS_CHECK_START}\n\n${AGENTS_CHECK_LINE.replace(' means ', '  means ')}\n\n${AGENTS_CHECK_END}`

const FIXTURES = join(import.meta.dirname, 'fixtures/agents-file')
const REPOSITORY_ROOT = join(import.meta.dirname, '../../..')

let root: string

function write(content: string): void {
	writeFileSync(join(root, AGENTS_FILE), content)
}

function read(): string {
	return readFileSync(join(root, AGENTS_FILE), 'utf8')
}

function crlf(text: string): string {
	return text.replaceAll('\n', '\r\n')
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-agents-check-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('syncAgentsFileCheck, enabled', () => {
	it('no AGENTS.md, creating granted -> created holding only the section and one trailing newline', () => {
		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: true })).toBe('created')

		expect(read()).toBe(SECTION)
	})

	it('no AGENTS.md, creating not granted -> missing, nothing written', () => {
		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('missing')

		expect(existsSync(join(root, AGENTS_FILE))).toBe(false)
	})

	const appended = {
		'a file ending with a newline': {
			before: '# Title\n\nSome text.\n',
			section: SECTION,
			sep: '\n',
		},
		'a file without a trailing newline': {
			before: '# Title\n\nSome text.',
			section: SECTION,
			sep: '\n\n',
		},
		'a CRLF file -> the section uses CRLF': {
			before: '# Title\r\n\r\nSome text.\r\n',
			section: SECTION_CRLF,
			sep: '\r\n',
		},
		'an empty file': { before: '', section: SECTION, sep: '' },
		'a file ending with trailing spaces and several blank lines': {
			before: '# Title\n\nSome text.  \n\n\n',
			section: SECTION,
			sep: '\n',
		},
	}
	for (const [title, testCase] of Object.entries(appended))
		for (const create of [true, false])
			it(`${title}, create ${create} -> added after one blank line, every byte before it unchanged`, () => {
				write(testCase.before)

				expect(syncAgentsFileCheck({ cwd: root, enabled: true, create })).toBe('added')

				expect(read()).toBe(`${testCase.before}${testCase.sep}${testCase.section}`)
			})

	// the same sentence, laid out in every form a formatter or an older sync leaves
	const tolerated = {
		'the form written now, alone': SECTION,
		'the form written now, text before and after': `# Title\n\n${SECTION}\nAfter.\n`,
		'the old form without blank lines, alone': `${COMPACT_BODY}\n`,
		'the old form, text before and after': `# Title\n\n${COMPACT_BODY}\n\nAfter.\n`,
		"oxfmt's half form, alone": `${HALF_BODY}\n`,
		"oxfmt's half form, text before and after": `# Title\n\n${HALF_BODY}\n\nAfter.\n`,
		'the form written now, CRLF': SECTION_CRLF,
		'the form written now, CRLF, text before and after': crlf(`# Title\n\n${SECTION}\nAfter.\n`),
		'the old form, CRLF': crlf(`${COMPACT_BODY}\n`),
		'the old form, CRLF, text before and after': crlf(`# Title\n\n${COMPACT_BODY}\n\nAfter.\n`),
		"oxfmt's half form, CRLF": crlf(`${HALF_BODY}\n`),
		"oxfmt's half form, CRLF, text before and after": crlf(`# Title\n\n${HALF_BODY}\n\nAfter.\n`),
		'the sentence wrapped over three lines, text before and after': `# Title\n\n${WRAPPED_BODY}\n\nAfter.\n`,
		'the sentence wrapped over three lines, CRLF': crlf(`${WRAPPED_BODY}\n`),
		'spaces doubled inside the sentence': `${SPACED_BODY}\n`,
	}
	for (const [title, text] of Object.entries(tolerated))
		it(`the current sentence, ${title} -> unchanged, file byte for byte`, () => {
			write(text)

			expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('unchanged')

			expect(read()).toBe(text)
		})

	// an older sentence: only the bytes between the markers change
	const outdated = {
		'the old form': { eol: '\n', body: OLD_COMPACT_BODY },
		'the old form, CRLF': { eol: '\r\n', body: OLD_COMPACT_BODY },
		'the form written now': { eol: '\n', body: OLD_BLANK_BODY },
		'the form written now, CRLF': { eol: '\r\n', body: OLD_BLANK_BODY },
	}
	for (const [title, testCase] of Object.entries(outdated))
		it(`an older sentence, ${title} -> updated, only the bytes between the markers change`, () => {
			const before = `# Title\n\nText.\n\n`.replaceAll('\n', testCase.eol)
			const after = `\n\nAfter.\n`.replaceAll('\n', testCase.eol)
			const old = testCase.body.replaceAll('\n', testCase.eol)
			write(`${before}${old}${after}`)

			expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('updated')

			expect(read()).toBe(`${before}${SECTION_BODY.replaceAll('\n', testCase.eol)}${after}`)
		})

	// the current sentence with more than whitespace around it is not the section written now
	const decorated = {
		'a note after it': `${AGENTS_CHECK_START}\n\n${AGENTS_CHECK_LINE}\n\nMy note.\n\n${AGENTS_CHECK_END}`,
		quoted: `${AGENTS_CHECK_START}\n\n> ${AGENTS_CHECK_LINE}\n\n${AGENTS_CHECK_END}`,
	}
	for (const [title, body] of Object.entries(decorated))
		it(`the current sentence, ${title} -> updated, only the bytes between the markers change`, () => {
			write(`# Title\n\n${body}\n\nAfter.\n`)

			expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('updated')

			expect(read()).toBe(`# Title\n\n${SECTION_BODY}\n\nAfter.\n`)
		})

	it('a second sync after added -> unchanged, the section is not doubled', () => {
		write('# Title\n')
		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('added')
		const first = read()

		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('unchanged')

		expect(read()).toBe(first)
	})
})

describe('syncAgentsFileCheck, disabled', () => {
	// a section the sync would not write is never removed: left in place, byte for byte
	const kept = {
		'the section alone': SECTION,
		'the section alone, CRLF': SECTION_CRLF,
		'the old form alone': `${COMPACT_BODY}\n`,
		'user text before and after': `# Title\n\n${SECTION}\nAfter.\n`,
		'user text before and after, CRLF': crlf(`# Title\n\n${SECTION}\nAfter.\n`),
		'the section last, after user text': `# Mine\n\n${SECTION}`,
		'an older sentence': `# Title\n\n${OLD_COMPACT_BODY}\n\nAfter.\n`,
		'an older sentence, alone': `${OLD_BLANK_BODY}\n`,
	}
	for (const [title, text] of Object.entries(kept))
		it(`${title} -> kept, file byte for byte and still there`, () => {
			write(text)

			expect(syncAgentsFileCheck({ cwd: root, enabled: false, create: false })).toBe('kept')

			expect(read()).toBe(text)
		})

	it('no AGENTS.md -> absent, nothing made', () => {
		expect(syncAgentsFileCheck({ cwd: root, enabled: false, create: true })).toBe('absent')

		expect(existsSync(join(root, AGENTS_FILE))).toBe(false)
	})

	it('a file without a section -> absent, untouched', () => {
		write('# Title\n')

		expect(syncAgentsFileCheck({ cwd: root, enabled: false, create: true })).toBe('absent')

		expect(read()).toBe('# Title\n')
	})
})

describe('syncAgentsFileCheck, markers not closed', () => {
	const broken = {
		'a start marker without an end marker': `# T\n\n${AGENTS_CHECK_START}\n${AGENTS_CHECK_LINE}\n`,
		'an end marker without a start marker': `# T\n\n${AGENTS_CHECK_LINE}\n${AGENTS_CHECK_END}\n`,
		'two start markers': `${AGENTS_CHECK_START}\n${AGENTS_CHECK_START}\nx\n${AGENTS_CHECK_END}\n`,
		'two sections': `${SECTION}\n${SECTION}`,
	}
	for (const [title, text] of Object.entries(broken))
		for (const enabled of [true, false])
			it(`${title}, enabled ${enabled} -> unclosed, file left alone`, () => {
				write(text)

				expect(syncAgentsFileCheck({ cwd: root, enabled, create: true })).toBe('unclosed')

				expect(read()).toBe(text)
			})
})

describe('syncAgentsFileCheck, the repository formatter (oxfmt)', () => {
	const OXFMT = join(REPOSITORY_ROOT, 'node_modules/.bin/oxfmt')

	function oxfmt(args: string[]): { status: number | null; stdout: string } {
		const result = spawnSync(OXFMT, args, { cwd: root, encoding: 'utf8' })
		return { status: result.status, stdout: `${result.stdout}${result.stderr}` }
	}

	function install(fixture: string): void {
		copyFileSync(join(REPOSITORY_ROOT, '.oxfmtrc.json'), join(root, '.oxfmtrc.json'))
		copyFileSync(join(FIXTURES, fixture), join(root, AGENTS_FILE))
	}

	it('a file a person wrote -> passes oxfmt --check before and after the sync added the section', () => {
		install('AGENTS.md')
		expect(oxfmt(['--check', AGENTS_FILE]).status).toBe(0)

		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('added')

		expect(oxfmt(['--check', AGENTS_FILE]).status).toBe(0)
	})

	it('after oxfmt fixed the file, a second sync -> unchanged, the bytes oxfmt left', () => {
		install('AGENTS.md')
		expect(oxfmt(['--check', AGENTS_FILE]).status).toBe(0)
		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('added')
		expect(oxfmt([AGENTS_FILE]).status).toBe(0)
		const formatted = read()

		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('unchanged')

		expect(read()).toBe(formatted)
	})

	it('the old compact section, run through oxfmt -> a sync answers unchanged, the bytes oxfmt left', () => {
		// .txt: the repository's own format check must not see a file kept unformatted on purpose
		install('AGENTS.old-section.txt')
		expect(oxfmt(['--check', AGENTS_FILE]).status).toBe(1)
		expect(oxfmt([AGENTS_FILE]).status).toBe(0)
		const formatted = read()

		expect(syncAgentsFileCheck({ cwd: root, enabled: true, create: false })).toBe('unchanged')

		expect(read()).toBe(formatted)
	})
})

describe('holdsOnlyTheAgentsCheck', () => {
	const cases = {
		'the section alone': { text: `${COMPACT_BODY}\n`, expected: true },
		'the form written now alone': { text: SECTION, expected: true },
		'the form written now with blank lines around': { text: `\n\n${SECTION}\n\n`, expected: true },
		'the section with blank lines around': {
			text: `\n\n${COMPACT_BODY}\n\n`,
			expected: true,
		},
		'a CRLF section': { text: crlf(`${COMPACT_BODY}\n`), expected: true },
		'an older body between the markers': { text: `${OLD_COMPACT_BODY}\n`, expected: true },
		'user text before': { text: `# Title\n\n${COMPACT_BODY}\n`, expected: false },
		'user text after': { text: `${COMPACT_BODY}\n\nMore.\n`, expected: false },
		'no section, user text': { text: '# Title\n', expected: false },
	}
	for (const [title, testCase] of Object.entries(cases))
		it(`${title} -> ${testCase.expected}`, () => {
			expect(holdsOnlyTheAgentsCheck(testCase.text)).toBe(testCase.expected)
		})
})
