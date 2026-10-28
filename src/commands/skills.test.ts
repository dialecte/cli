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
import { PassThrough } from 'node:stream'

import { chooseVendor, checkPages, generatePages, runSync, runSyncCommand } from './skills.ts'

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
const API_START = '<!-- dialecte-skills:generated api -->'
const API_METHOD = {
	path: 'q.bay.name',
	summary: 'Name of a bay.',
	intents: ['name of a bay'],
	signature: '() => string',
	example: undefined,
	definedInPackage: true,
	internal: false,
	declaredAt: 'src/bay.ts:0',
}
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

	it('page holding the api block → api.json written next to it, with the package name', () => {
		write('package.json', JSON.stringify({ name: '@acme/widget' }))
		write('skills/demo/references/api.md', `${FRONTMATTER}${API_START}\nold\n${END}\n`)

		generatePages({ cwd: root, methods: [API_METHOD], formatOptions: { skip: true } })

		expect(JSON.parse(read('skills/demo/references/api.json'))).toEqual({
			package: '@acme/widget',
			methods: [
				{
					path: 'doc.query.bay.name',
					root: 'q',
					otherRoutes: [],
					signature: '() => string',
					summary: 'Name of a bay.',
					intents: ['name of a bay'],
					declaredAt: 'src/bay.ts',
				},
			],
		})
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

describe('checkPages, api.json', () => {
	it('api.json older than the methods next to the api block → error, exit 1; regenerated → exit 0', () => {
		write('package.json', JSON.stringify({ name: '@acme/widget' }))
		write('skills/demo/SKILL.md', `${FRONTMATTER}Index.\n`)
		write('skills/demo/references/api.md', `${API_START}\nold\n${END}\n`)
		generatePages({ cwd: root, methods: [API_METHOD], formatOptions: { skip: true } })
		const renamed = { ...API_METHOD, summary: 'The name of a bay.' }

		expect(checkPages({ cwd: root, methods: [renamed], workspace: undefined })).toBe(1)
		expect(console.error).toHaveBeenCalledWith(
			'❌ skills/demo/references/api.json: missing or stale: run `dialecte skills generate`',
		)
		generatePages({ cwd: root, methods: [renamed], formatOptions: { skip: true } })
		expect(checkPages({ cwd: root, methods: [renamed], workspace: undefined })).toBe(0)
	})
})

describe('checkPages, api.json laid out by a formatter', () => {
	it('api.json reformatted (short arrays on one line) → still fresh, exit 0', () => {
		write('package.json', JSON.stringify({ name: '@acme/widget' }))
		write('skills/demo/SKILL.md', `${FRONTMATTER}Index.\n`)
		write('skills/demo/references/api.md', `${API_START}\nold\n${END}\n`)
		generatePages({ cwd: root, methods: [API_METHOD], formatOptions: { skip: true } })
		write(
			'skills/demo/references/api.json',
			read('skills/demo/references/api.json').replace(
				/"intents": \[\s+"name of a bay"\s+\]/,
				'"intents": ["name of a bay"]',
			),
		)
		expect(read('skills/demo/references/api.json')).toContain('"intents": ["name of a bay"]')

		expect(checkPages({ cwd: root, methods: [API_METHOD], workspace: undefined })).toBe(0)
	})
})

describe('checkPages, JSDoc quoting a sentence', () => {
	it('a method summary quoting a sentence → a warning, exit 0', () => {
		write('package.json', JSON.stringify({ scripts: {} }))
		const method = {
			path: 'q.bay.name',
			summary: 'Returns "the name of the bay" as given.',
			intents: ['name of a bay'],
			signature: '() => string',
			example: undefined,
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

describe('runSync vendor', () => {
	it('--vendor openai -> manifest vendor openai, kept by a later sync without it', () => {
		write('package.json', JSON.stringify({ dependencies: {} }))

		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'openai' })
		runSync({ argv: ['--agent', 'claude'], cwd: root })

		expect(JSON.parse(read('.claude/skills/.dialecte-skills.json')).vendor).toBe('openai')
	})

	it('a manifest without vendor keeps working (read as unknown)', () => {
		write('package.json', JSON.stringify({ dependencies: {} }))
		write('.claude/skills/.dialecte-skills.json', JSON.stringify({ installed: [] }))

		runSync({ argv: ['--agent', 'claude'], cwd: root })

		expect(JSON.parse(read('.claude/skills/.dialecte-skills.json'))).toEqual({ installed: [] })
	})
})

const NO_TERMINAL = { interactive: false, input: new PassThrough(), output: new PassThrough() }

function syncCommand(argv: string[]) {
	return runSyncCommand({ argv, cwd: root, ...NO_TERMINAL })
}

function manifestOf(folder: string): { installed: string[]; vendor?: string } {
	return JSON.parse(read(`${folder}/.dialecte-skills.json`))
}

describe('chooseVendor', () => {
	it('a multi-vendor host on a terminal, answer "2" -> the second vendor, remembered by the sync', async () => {
		write('package.json', JSON.stringify({ dependencies: {} }))
		write('.github/copilot-instructions.md', '')
		const input = new PassThrough()
		input.write('2\n')

		const choice = await chooseVendor({
			argv: ['--agent', 'claude'],
			cwd: root,
			interactive: true,
			input,
			output: new PassThrough(),
		})
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: choice.vendor })

		expect(manifestOf('.claude/skills').vendor).toBe('openai')
	})

	it('a manifest vendor that is no known id -> warned and ignored, detection decides', async () => {
		write('package.json', JSON.stringify({ dependencies: {} }))
		write('.gemini/settings.json', '{}')
		write('.agents/skills/.dialecte-skills.json', JSON.stringify({ installed: [], vendor: 'acme' }))

		const choice = await chooseVendor({ argv: [], cwd: root, ...NO_TERMINAL })

		expect(choice.vendor).toBe('google')
		expect(choice.output).toContain('unknown vendor "acme" ignored')
	})
})

describe('runSyncCommand', () => {
	beforeEach(() => {
		write('package.json', JSON.stringify({ dependencies: {} }))
	})

	it('--vendor given while manifests disagree -> no disagreement warning, the vendor written everywhere', async () => {
		write(
			'.claude/skills/.dialecte-skills.json',
			JSON.stringify({ installed: [], vendor: 'anthropic' }),
		)
		write(
			'.agents/skills/.dialecte-skills.json',
			JSON.stringify({ installed: [], vendor: 'google' }),
		)

		const result = await syncCommand(['--vendor', 'openai'])

		expect(result.output).not.toContain('disagree')
		expect(manifestOf('.claude/skills').vendor).toBe('openai')
		expect(manifestOf('.agents/skills').vendor).toBe('openai')
	})

	it('first sync, no terminal, nothing detected, no manifest -> exit 2 naming --vendor, nothing installed', async () => {
		const result = await syncCommand([])

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('--vendor')
		expect(existsSync(join(root, '.claude'))).toBe(false)
		expect(existsSync(join(root, '.agents'))).toBe(false)
	})

	it('a manifest without vendor (older sync), no terminal -> goes on without a vendor and says how to set it', async () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root })

		const result = await syncCommand(['--agent', 'claude'])

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('--vendor')
		expect(manifestOf('.claude/skills').vendor).toBeUndefined()
	})

	it('a Codex project whose .claude/skills only holds a sync manifest -> no vendor, never anthropic', async () => {
		write('AGENTS.md', '')
		runSync({ argv: ['--agent', 'claude,agents'], cwd: root })

		const result = await syncCommand([])

		expect(result.exitCode).toBe(0)
		expect(manifestOf('.claude/skills').vendor).toBeUndefined()
	})

	it('a project synced only with --agent copilot -> its own .github/skills does not make the next sync exit 2', async () => {
		runSync({ argv: ['--agent', 'copilot'], cwd: root })

		const result = await syncCommand(['--agent', 'copilot'])

		expect(result.exitCode).toBe(0)
		expect(manifestOf('.github/skills').vendor).toBeUndefined()
	})

	it('a vendor set -> written to every manifest of the project, the --agent targets or not', async () => {
		runSync({ argv: ['--agent', 'claude,agents'], cwd: root })

		await syncCommand(['--agent', 'claude', '--vendor', 'openai'])

		expect(manifestOf('.claude/skills').vendor).toBe('openai')
		expect(manifestOf('.agents/skills').vendor).toBe('openai')
	})
})
