import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const SECTION = `${AGENTS_CHECK_START}\n${AGENTS_CHECK_LINE}\n${AGENTS_CHECK_END}\n`
const SECTION_CRLF = SECTION.replaceAll('\n', '\r\n')
const OLD_SECTION = `${AGENTS_CHECK_START}\nAn older sentence.\n${AGENTS_CHECK_END}\n`

let root: string

function write(content: string): void {
	writeFileSync(join(root, AGENTS_FILE), content)
}

function read(): string {
	return readFileSync(join(root, AGENTS_FILE), 'utf8')
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-agents-check-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('syncAgentsFileCheck, enabled', () => {
	it('no AGENTS.md -> created holding the section and one trailing newline', () => {
		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('added')

		expect(read()).toBe(SECTION)
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
	}
	for (const [title, testCase] of Object.entries(appended))
		it(`${title} -> section appended after one blank line, every byte before it unchanged`, () => {
			write(testCase.before)

			expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('added')

			expect(read()).toBe(`${testCase.before}${testCase.sep}${testCase.section}`)
		})

	it('the same section already there -> unchanged, file untouched', () => {
		const text = `# Title\n\n${SECTION}\nAfter.\n`
		write(text)

		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('unchanged')

		expect(read()).toBe(text)
	})

	it('a second sync -> unchanged, the section is not doubled', () => {
		write('# Title\n')
		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('added')
		const first = read()

		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('unchanged')

		expect(read()).toBe(first)
	})

	it('an older body between the markers -> body replaced, the rest byte for byte', () => {
		write(`# Title\r\n\r\nText.\r\n\r\n${OLD_SECTION.replaceAll('\n', '\r\n')}\r\nAfter.\r\n`)

		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('updated')

		expect(read()).toBe(`# Title\r\n\r\nText.\r\n\r\n${SECTION_CRLF}\r\nAfter.\r\n`)
	})
})

describe('syncAgentsFileCheck, disabled', () => {
	it('a file the user wrote, then added and removed -> the original bytes back, blank lines before included', () => {
		const original = '# Title\n\nText.\n\n\n'
		write(original)
		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('added')

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(read()).toBe(original)
	})

	it('text after the section -> only the section, its line end and the one blank line before it go', () => {
		write(`# Title\n\n${SECTION}\nAfter.\n`)

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(read()).toBe('# Title\n\nAfter.\n')
	})

	it('text after the section, CRLF -> the same, with CRLF line ends', () => {
		write(`# Title\r\n\r\n${SECTION_CRLF}\r\nAfter.\r\n`)

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(read()).toBe('# Title\r\n\r\nAfter.\r\n')
	})

	it('a file without a trailing newline, added then removed -> the text kept, one line end after it (the one sync completed)', () => {
		write('# Title\n\nSome text.')
		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('added')

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(read()).toBe('# Title\n\nSome text.\n')
	})

	// the section without its own line end: the line end belongs to the file around it
	const SEC = SECTION.slice(0, -1)
	const SEC_CRLF = SECTION_CRLF.slice(0, -2)
	const removals = {
		'a user line before, text after': {
			before: `# Mine\n${SEC}\nmore\n`,
			after: '# Mine\nmore\n',
		},
		'a user line before, the section last': { before: `# Mine\n${SEC}\n`, after: '# Mine\n' },
		'the section opens the file: the blank line after it goes': {
			before: `${SEC}\n\n# Title\n`,
			after: '# Title\n',
		},
		'blank lines on both sides: one goes': {
			before: `# A\n\n${SEC}\n\n# B\n`,
			after: '# A\n\n# B\n',
		},
		'a user line before, text after, CRLF': {
			before: `# Mine\r\n${SEC_CRLF}\r\nmore\r\n`,
			after: '# Mine\r\nmore\r\n',
		},
		'the section opens the file, CRLF': {
			before: `${SEC_CRLF}\r\n\r\n# Title\r\n`,
			after: '# Title\r\n',
		},
		'the start marker not at a line start: only the section goes': {
			before: `# Mine ${SEC}\nmore\n`,
			after: '# Mine \nmore\n',
		},
		'the start marker not at a line start, CRLF': {
			before: `# Mine ${SEC_CRLF}\r\nmore\r\n`,
			after: '# Mine \r\nmore\r\n',
		},
		'blank lines on both sides, CRLF': {
			before: `# A\r\n\r\n${SEC_CRLF}\r\n\r\n# B\r\n`,
			after: '# A\r\n\r\n# B\r\n',
		},
	}
	for (const [title, testCase] of Object.entries(removals))
		it(`removal never joins or eats user lines: ${title}`, () => {
			write(testCase.before)

			expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

			expect(read()).toBe(testCase.after)
		})

	it('a CRLF file added and removed -> the original bytes back', () => {
		const original = '# Title\r\n\r\nText.\r\n'
		write(original)
		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('added')

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(read()).toBe(original)
	})

	it('a file that holds only the section -> removed, the file left empty is deleted', () => {
		expect(syncAgentsFileCheck({ cwd: root, enabled: true })).toBe('added')

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(existsSync(join(root, AGENTS_FILE))).toBe(false)
	})

	it('a file left with whitespace only -> deleted', () => {
		write(`\n\n${SECTION}\n`)

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(existsSync(join(root, AGENTS_FILE))).toBe(false)
	})

	it('no section in the file -> unchanged, file untouched', () => {
		write('# Title\n')

		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('unchanged')

		expect(read()).toBe('# Title\n')
	})

	it('no AGENTS.md -> unchanged, nothing created', () => {
		expect(syncAgentsFileCheck({ cwd: root, enabled: false })).toBe('unchanged')

		expect(existsSync(join(root, AGENTS_FILE))).toBe(false)
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

				expect(syncAgentsFileCheck({ cwd: root, enabled })).toBe('unclosed')

				expect(read()).toBe(text)
			})
})

describe('holdsOnlyTheAgentsCheck', () => {
	const cases = {
		'the section alone': { text: SECTION, expected: true },
		'the section with blank lines around': { text: `\n\n${SECTION}\n\n`, expected: true },
		'a CRLF section': { text: SECTION_CRLF, expected: true },
		'an older body between the markers': { text: OLD_SECTION, expected: true },
		'user text before': { text: `# Title\n\n${SECTION}`, expected: false },
		'user text after': { text: `${SECTION}\nMore.\n`, expected: false },
		'no section, user text': { text: '# Title\n', expected: false },
	}
	for (const [title, testCase] of Object.entries(cases))
		it(`${title} -> ${testCase.expected}`, () => {
			expect(holdsOnlyTheAgentsCheck(testCase.text)).toBe(testCase.expected)
		})
})
