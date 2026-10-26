import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { checkPages, generatePages, runSync } from './skills.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

function read(path: string): string {
	return readFileSync(join(root, path), 'utf8')
}

const FRONTMATTER = '---\nname: demo\ndescription: Use it.\n---\n'
const HOOKS_START = '<!-- dialecte-skills:generated hooks -->'
const END = '<!-- /dialecte-skills:generated -->'
/** What the hooks block renders to in a package without hooks. */
const NO_HOOKS = 'This package has no hooks.'

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-skills-'))
	vi.spyOn(console, 'log').mockImplementation(() => undefined)
	vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
	vi.restoreAllMocks()
	rmSync(root, { recursive: true, force: true })
})

describe('runSync', () => {
	it('a dependency not installed → skills installed before are kept (nothing removed)', () => {
		write(
			'package.json',
			JSON.stringify({ dependencies: { '@dialecte/core': '1', '@dialecte/scl': '1' } }),
		)
		write('node_modules/@dialecte/core/skills/dialecte/SKILL.md', FRONTMATTER)
		// installed by an earlier sync, when scl was installed
		write('scl-checkout/skills/dialecte-scl/SKILL.md', FRONTMATTER)
		write('.claude/skills/.dialecte-skills.json', JSON.stringify({ installed: ['dialecte-scl'] }))
		symlinkSync(
			'../../scl-checkout/skills/dialecte-scl',
			join(root, '.claude/skills/dialecte-scl'),
			'dir',
		)

		runSync({ argv: ['--agent', 'claude'], cwd: root })

		expect(lstatSync(join(root, '.claude/skills/dialecte-scl')).isSymbolicLink()).toBe(true)
		expect(lstatSync(join(root, '.claude/skills/dialecte')).isSymbolicLink()).toBe(true)
	})

	it('an unknown --agent → rejected before anything is installed', () => {
		write('package.json', JSON.stringify({ dependencies: {} }))

		expect(() => runSync({ argv: ['--agent', 'claude,emacs'], cwd: root })).toThrow(
			'skills sync: unknown agent emacs',
		)
		expect(existsSync(join(root, '.claude'))).toBe(false)
	})
})

describe('generatePages', () => {
	const UNFORMATTED_TABLE = '|a|b|\n|---|---|\n|1|2|'

	it('stale page → rewritten and formatted; fresh page → not written', () => {
		write(
			'skills/demo/SKILL.md',
			`${FRONTMATTER}${HOOKS_START}\nold\n${END}\n\n${UNFORMATTED_TABLE}\n`,
		)
		const fresh = `${FRONTMATTER}${HOOKS_START}\n${NO_HOOKS}\n${END}\n\n${UNFORMATTED_TABLE}\n`
		write('skills/demo/references/fresh.md', fresh)

		const exitCode = generatePages({ cwd: root, methods: [], formatOptions: {} })

		expect(exitCode).toBe(0)
		expect(read('skills/demo/SKILL.md')).toContain(`${HOOKS_START}\n\n${NO_HOOKS}\n\n${END}`)
		// the formatter padded the table of the page it rewrote
		expect(read('skills/demo/SKILL.md')).toContain('| a   | b   |')
		expect(read('skills/demo/references/fresh.md')).toBe(fresh)
	})

	const failures = {
		'unknown block kind → exit 1': `${FRONTMATTER}<!-- dialecte-skills:generated verbs -->\nx\n${END}\n`,
		'unclosed block → exit 1, page not written': `${FRONTMATTER}${HOOKS_START}\nold\n`,
	}

	for (const [title, markdown] of Object.entries(failures)) {
		it(title, () => {
			write('skills/demo/SKILL.md', markdown)

			expect(generatePages({ cwd: root, methods: [], formatOptions: { skip: true } })).toBe(1)
			expect(read('skills/demo/SKILL.md')).toBe(markdown)
		})
	}
})

describe('checkPages', () => {
	const testCases = {
		'every claim true → exit 0': {
			markdown: `${FRONTMATTER}Run \`npm run check\`.\n`,
			expected: 0,
		},
		'a cited npm script that does not exist → exit 1': {
			markdown: `${FRONTMATTER}Run \`npm run proof\`.\n`,
			expected: 1,
		},
		'only warnings (workspace page, no workspace facts) → exit 0': {
			markdown: `${FRONTMATTER}<!-- dialecte-skills workspace -->\nRun \`npm run proof\`.\n`,
			expected: 0,
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			write('package.json', JSON.stringify({ scripts: { check: 'x' } }))
			write('skills/demo/SKILL.md', testCase.markdown)

			expect(checkPages({ cwd: root, methods: [], workspace: undefined })).toBe(testCase.expected)
		})
	}
})

describe('checkPages, JSDoc quoting a sentence', () => {
	it('a method summary quoting a sentence → a warning, exit 0', () => {
		write('package.json', JSON.stringify({ scripts: {} }))
		const method = {
			path: 'q.bay.name',
			summary: 'Returns "the name of the bay" as given.',
			intents: ['name of a bay'],
			definedInPackage: true,
			internal: false,
			declaredAt: 'src/bay.ts:0',
		}

		expect(checkPages({ cwd: root, methods: [method], workspace: undefined })).toBe(0)
		expect(console.warn).toHaveBeenCalledWith(
			'⚠️  src: `doc.query.bay.name` summary quotes a sentence: rephrase it, generated pages republish JSDoc',
		)
	})
})
