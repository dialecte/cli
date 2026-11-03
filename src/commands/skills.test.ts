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

import { diagnose } from '../lib/doctor/diagnose.ts'
import { chooseVendor, checkPages, generatePages, run, runSync, runSyncCommand } from './skills.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let parent: string
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
	// its own parent folder: the doctor's checkouts scan of the parent never meets other tests' folders
	parent = mkdtempSync(join(tmpdir(), 'dialecte-cli-skills-'))
	root = join(parent, 'project')
	mkdirSync(root)
	vi.spyOn(console, 'log').mockImplementation(() => undefined)
	vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
	vi.restoreAllMocks()
	rmSync(parent, { recursive: true, force: true })
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
		// oxfmt 0.75 (markdown) keeps no blank line before the block's closing comment
		expect(read('skills/demo/SKILL.md')).toContain(`${HOOKS_START}\n\n${NO_HOOKS}\n${END}`)
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

describe('runSync audience', () => {
	const CONTRIBUTOR =
		'---\nname: dialecte-lot\ndescription: Use it.\nmetadata:\n  audience: contributor\n---\n'
	const CONSUMER =
		'---\nname: dialecte\ndescription: Use it.\nmetadata:\n  audience: consumer\n---\n'

	beforeEach(() => {
		write('package.json', JSON.stringify({ dependencies: { '@dialecte/core': '1' } }))
		write(
			'node_modules/@dialecte/core/package.json',
			JSON.stringify({ name: '@dialecte/core', version: '1.0.0' }),
		)
		write('node_modules/@dialecte/core/skills/dialecte/SKILL.md', CONSUMER)
		write('node_modules/@dialecte/core/skills/dialecte-lot/SKILL.md', CONTRIBUTOR)
	})

	it('no flag -> the consumer skill alone, one line naming the contributor skill and --contributing, no station agent', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		expect(manifestOf('.claude/skills').installed).toEqual(['dialecte'])
		expect(existsSync(join(root, '.claude/agents'))).toBe(false)
		const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]))
		expect(
			lines.some((line) => line.includes('dialecte-lot') && line.includes('--contributing')),
		).toBe(true)
	})

	it('--contributing -> both skills, remembered: a later sync without the flag keeps both', () => {
		runSync({ argv: ['--agent', 'agents', '--contributing'], cwd: root })
		runSync({ argv: ['--agent', 'agents'], cwd: root })

		expect(manifestOf('.agents/skills')).toMatchObject({
			installed: ['dialecte', 'dialecte-lot'],
			contributing: true,
		})
	})

	it('--no-contributing after --contributing -> the contributor skill removed, its line says why', () => {
		runSync({ argv: ['--agent', 'agents', '--contributing'], cwd: root })
		vi.mocked(console.log).mockClear()

		runSync({ argv: ['--agent', 'agents', '--no-contributing'], cwd: root })

		expect(manifestOf('.agents/skills').installed).toEqual(['dialecte'])
		expect(existsSync(join(root, '.agents/skills/dialecte-lot'))).toBe(false)
		const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]))
		expect(
			lines.some((line) => line.includes('dialecte-lot') && line.includes('contributor')),
		).toBe(true)
	})

	it('--no-contributing after a contributing sync -> the AGENTS.md section removed, the removal line printed', () => {
		runSync({ argv: ['--agent', 'agents', '--contributing'], cwd: root })
		expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)
		vi.mocked(console.log).mockClear()

		runSync({ argv: ['--agent', 'agents', '--no-contributing'], cwd: root })

		expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
		const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]))
		expect(lines).toContain('🗑  AGENTS.md: session-start check removed')
	})

	it('--contributing then --no-session-check -> the AGENTS.md section removed', () => {
		runSync({ argv: ['--agent', 'agents', '--contributing'], cwd: root })
		expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)

		runSync({ argv: ['--agent', 'agents', '--no-session-check'], cwd: root })

		expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
	})

	it('a consumer sync for Claude Code -> the station agents line says they come with --contributing', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]))
		expect(lines.some((line) => line.includes('no dependency ships'))).toBe(false)
		expect(
			lines.some((line) => line.includes('station agents') && line.includes('--contributing')),
		).toBe(true)
	})

	it('--contributing and --no-contributing together -> rejected before anything is installed', () => {
		expect(() =>
			runSync({ argv: ['--agent', 'agents', '--contributing', '--no-contributing'], cwd: root }),
		).toThrow('--contributing')
		expect(existsSync(join(root, '.agents'))).toBe(false)
	})

	it('both contributing flags with a vendor -> rejected before any manifest is written', async () => {
		runSync({ argv: ['--agent', 'agents'], cwd: root })

		await expect(
			syncCommand([
				'--agent',
				'agents',
				'--vendor',
				'openai',
				'--contributing',
				'--no-contributing',
			]),
		).rejects.toThrow('--contributing')
		expect(manifestOf('.agents/skills').vendor).toBeUndefined()
	})

	it('a consumer sync -> doctor says in sync, never that the contributor skill is missing', () => {
		runSync({ argv: ['--agent', 'agents'], cwd: root })

		const skillLines = diagnose({ cwd: root, dialecteRoot: undefined, cliVersion: '0.2.0' }).filter(
			(line) => line.subject === 'skills',
		)

		expect(skillLines.map((line) => line.status)).toEqual(['ok'])
	})
})

describe('runSync station agents and the session check', () => {
	const SESSION_COMMAND = 'npx --no-install @dialecte/cli doctor --brief'

	function sessionCommands(): string[] {
		// a settings.json sync created is deleted with its hook
		if (!existsSync(join(root, '.claude/settings.json'))) return []
		const hooks = JSON.parse(read('.claude/settings.json')).hooks
		return (hooks?.SessionStart ?? []).flatMap((group: { hooks: { command: string }[] }) =>
			group.hooks.map((hook) => hook.command),
		)
	}

	beforeEach(() => {
		// core ships the dialecte-lot skill the agents point at
		write('package.json', JSON.stringify({ dependencies: { '@dialecte/core': '1' } }))
		write(
			'node_modules/@dialecte/core/package.json',
			JSON.stringify({ name: '@dialecte/core', version: '1.0.0' }),
		)
		write('node_modules/@dialecte/core/skills/dialecte-lot/SKILL.md', FRONTMATTER)
	})

	it('claude target, anthropic -> the reviewer agent on the strong model and the SessionStart hook', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		expect(read('.claude/agents/dialecte-reviewer.md')).toContain('model: opus')
		expect(sessionCommands()).toEqual([SESSION_COMMAND])
	})

	it('a second sync -> the hook is not duplicated', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })
		runSync({ argv: ['--agent', 'claude'], cwd: root })

		expect(sessionCommands()).toEqual([SESSION_COMMAND])
	})

	it('an existing settings.json -> the hook merged, the other keys unchanged', () => {
		write('.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }))

		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		expect(JSON.parse(read('.claude/settings.json')).permissions).toEqual({ allow: ['Bash(ls)'] })
		expect(sessionCommands()).toEqual([SESSION_COMMAND])
	})

	it('--no-session-check -> the hook a sync added is removed, the agents stay', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		runSync({ argv: ['--agent', 'claude', '--no-session-check'], cwd: root })

		expect(sessionCommands()).toEqual([])
		expect(existsSync(join(root, '.claude/agents/dialecte-reviewer.md'))).toBe(true)
	})

	describe('the AGENTS.md session check', () => {
		const AGENTS_START = '<!-- dialecte-skills:session-check -->'
		const AGENTS_END = '<!-- /dialecte-skills:session-check -->'
		const AGENTS_SECTION = `${AGENTS_START}\nAt the start of a session, run \`${SESSION_COMMAND}\`: nothing printed means the Dialecte skills are in sync; otherwise each line is a problem with its fix.\n${AGENTS_END}\n`

		function agentsText(): string | undefined {
			return existsSync(join(root, 'AGENTS.md')) ? read('AGENTS.md') : undefined
		}

		function logLines(): string[] {
			return vi.mocked(console.log).mock.calls.map((call) => String(call[0]))
		}

		it('a contributing sync with the claude target -> AGENTS.md holds the section, the line is printed, the Claude hook stays', () => {
			runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

			expect(agentsText()).toBe(AGENTS_SECTION)
			expect(logLines()).toContain(`✅ AGENTS.md: session-start check (${SESSION_COMMAND})`)
			expect(sessionCommands()).toEqual([SESSION_COMMAND])
		})

		it('--agent agents only (no claude target) -> AGENTS.md still written, no Claude settings', () => {
			runSync({ argv: ['--agent', 'agents'], cwd: root })

			expect(agentsText()).toBe(AGENTS_SECTION)
			expect(logLines()).toContain(`✅ AGENTS.md: session-start check (${SESSION_COMMAND})`)
			expect(existsSync(join(root, '.claude/settings.json'))).toBe(false)
		})

		it('an AGENTS.md of the user -> the section appended after one blank line', () => {
			write('AGENTS.md', '# Mine\n')

			runSync({ argv: ['--agent', 'agents'], cwd: root })

			expect(agentsText()).toBe(`# Mine\n\n${AGENTS_SECTION}`)
		})

		it('--no-session-check after it was added -> the section removed (a file left empty deleted), the removal line printed', () => {
			runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })
			vi.mocked(console.log).mockClear()

			runSync({ argv: ['--agent', 'claude', '--no-session-check'], cwd: root })

			expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
			expect(logLines()).toContain('🗑  AGENTS.md: session-start check removed')
			expect(sessionCommands()).toEqual([])
		})

		it('--no-session-check on a file with user text -> only the section goes', () => {
			write('AGENTS.md', '# Mine\n')
			runSync({ argv: ['--agent', 'agents'], cwd: root })
			expect(agentsText()).toBe(`# Mine\n\n${AGENTS_SECTION}`)

			runSync({ argv: ['--agent', 'agents', '--no-session-check'], cwd: root })

			expect(read('AGENTS.md')).toBe('# Mine\n')
		})

		it('an older body between the markers -> replaced, the update line printed', () => {
			write('AGENTS.md', `${AGENTS_START}\nAn older sentence.\n${AGENTS_END}\n`)

			runSync({ argv: ['--agent', 'agents'], cwd: root })

			expect(agentsText()).toBe(AGENTS_SECTION)
			expect(logLines()).toContain('✅ AGENTS.md: session-start check updated')
		})

		it('no dependency ships dialecte-lot -> no AGENTS.md written', () => {
			write('package.json', JSON.stringify({ dependencies: {} }))

			runSync({ argv: ['--agent', 'agents'], cwd: root })

			expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
		})

		it('a section with an end marker missing -> file left as it is, one warning says why', () => {
			write('AGENTS.md', `${AGENTS_START}\nold\n`)

			runSync({ argv: ['--agent', 'agents'], cwd: root })

			expect(read('AGENTS.md')).toBe(`${AGENTS_START}\nold\n`)
			expect(vi.mocked(console.warn).mock.calls.flat().join('\n')).toContain(
				'AGENTS.md: the dialecte session-check section is not closed: left as it is',
			)
		})
	})

	it('the claude target removed -> the agents and the hook sync wrote are removed', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		runSync({ argv: ['--agent', 'agents'], cwd: root })

		expect(existsSync(join(root, '.claude/agents/dialecte-reviewer.md'))).toBe(false)
		expect(sessionCommands()).toEqual([])
	})

	it('no dependency ships dialecte-lot -> no agent, no hook', () => {
		write('package.json', JSON.stringify({ dependencies: {} }))

		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		expect(existsSync(join(root, '.claude/agents'))).toBe(false)
		expect(existsSync(join(root, '.claude/settings.json'))).toBe(false)
	})

	it('dialecte-lot no longer installed -> the agents and the hook sync added are removed', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })
		write('package.json', JSON.stringify({ dependencies: {} }))

		runSync({ argv: ['--agent', 'claude'], cwd: root })

		expect(existsSync(join(root, '.claude/agents'))).toBe(false)
		expect(existsSync(join(root, '.claude/settings.json'))).toBe(false)
	})

	it('the claude target dropped -> doctor shows no station agent line', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })
		runSync({ argv: ['--agent', 'agents'], cwd: root })

		const lines = diagnose({ cwd: root, dialecteRoot: undefined, cliVersion: '0.2.0', brief: true })

		expect(lines.filter((line) => line.subject === 'station agents')).toEqual([])
	})

	it('a settings.json whose hooks is not an object -> left as it is, one line says why', () => {
		write('.claude/settings.json', '{"hooks": []}')

		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		expect(read('.claude/settings.json')).toBe('{"hooks": []}')
		expect(vi.mocked(console.warn).mock.calls.flat().join('\n')).toMatch(/hooks/)
	})

	it('another vendor -> no Claude Code agent file, one line saying why', () => {
		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'openai' })

		expect(existsSync(join(root, '.claude/agents'))).toBe(false)
		expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toMatch(/openai/)
	})

	it("a user's own dialecte-reviewer.md -> warned, never overwritten", () => {
		write('.claude/agents/dialecte-reviewer.md', 'mine\n')

		runSync({ argv: ['--agent', 'claude'], cwd: root, vendor: 'anthropic' })

		expect(read('.claude/agents/dialecte-reviewer.md')).toBe('mine\n')
		expect(vi.mocked(console.warn).mock.calls.flat().join('\n')).toMatch(/dialecte-reviewer\.md/)
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

	it('first sync, no terminal, nothing detected, no manifest -> installs without a vendor and says how to set it', async () => {
		const result = await syncCommand([])

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('--vendor')
		expect(manifestOf('.claude/skills').vendor).toBeUndefined()
		expect(manifestOf('.agents/skills').vendor).toBeUndefined()
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

/** Builds a TypeScript program inside the command: wide slack for a loaded shared machine. */
const EXPORTS_COMMAND_TIMEOUT = 120_000

describe('skills check and generate, package exports', { timeout: EXPORTS_COMMAND_TIMEOUT }, () => {
	function writeExportingPackage(): void {
		write(
			'package.json',
			JSON.stringify({
				name: '@acme/widget',
				exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
			}),
		)
		write(
			'tsconfig.json',
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: 'esnext',
					moduleResolution: 'bundler',
					target: 'es2022',
					noEmit: true,
				},
			}),
		)
		write(
			'src/index.ts',
			[
				'export function frobnicate(value: string): string {',
				'\treturn value',
				'}',
				'',
				'/** @internal */',
				'export function plumbing(): void {}',
				'',
			].join('\n'),
		)
		write('skills/demo/SKILL.md', `${FRONTMATTER}${API_START}\nold\n${END}\n`)
	}

	/** Runs the subcommand in `root`; a process.exit becomes a thrown exit code. */
	async function runInRoot(subcommand: string): Promise<number> {
		vi.spyOn(process, 'cwd').mockReturnValue(root)
		vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
			throw new Error(`exit:${code}`)
		}) as never)
		try {
			await run([subcommand, '--no-format'])
			return 0
		} catch (error) {
			const match = /^exit:(\d+)$/.exec((error as Error).message)
			if (!match) throw error
			return Number(match[1])
		}
	}

	it('generate then check, the entry exporting an undocumented function → generate exit 0; check exit 1, its only error names <pkg>.<fn>, the summary counts methods and exports apart', async () => {
		writeExportingPackage()

		const generateExitCode = await runInRoot('generate')
		vi.mocked(console.error).mockClear()
		vi.mocked(console.log).mockClear()
		const checkExitCode = await runInRoot('check')

		expect(generateExitCode).toBe(0)
		expect(checkExitCode).toBe(1)

		expect(vi.mocked(console.error).mock.calls.map((call) => String(call[0]))).toEqual([
			expect.stringContaining('`@acme/widget.frobnicate` has no JSDoc summary'),
			expect.stringContaining('`@acme/widget.frobnicate` has no @intent tag'),
		])
		expect(vi.mocked(console.log).mock.calls.map((call) => String(call[0]))).toContain(
			'❌ 1 skill page(s), 0 method(s) and 1 export(s) checked: 2 error(s), 0 warning(s)',
		)
	})

	it('generate on it → the api block of the page holds the entry section', async () => {
		writeExportingPackage()

		const exitCode = await runInRoot('generate')

		expect(exitCode).toBe(0)
		expect(read('skills/demo/SKILL.md')).toContain(
			'### `@acme/widget`\n\n| Function | What it answers | Reach for it to |',
		)
	})

	it('generate on a package with entries ./zeta then ./alpha → the ### headers follow the order of the exports map', async () => {
		write(
			'package.json',
			JSON.stringify({
				name: '@acme/widget',
				exports: {
					'./zeta': { types: './dist/zeta.d.ts' },
					'./alpha': { types: './dist/alpha.d.ts' },
				},
			}),
		)
		write(
			'tsconfig.json',
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: 'esnext',
					moduleResolution: 'bundler',
					target: 'es2022',
					noEmit: true,
				},
			}),
		)
		write('src/zeta.ts', '/** Zeta. @intent zed */\nexport function zeta(): void {}\n')
		write('src/alpha.ts', '/** Alpha. @intent ay */\nexport function alpha(): void {}\n')
		write('skills/demo/SKILL.md', `${FRONTMATTER}${API_START}\nold\n${END}\n`)

		const exitCode = await runInRoot('generate')

		expect(exitCode).toBe(0)
		expect(
			[...read('skills/demo/SKILL.md').matchAll(/^### `(.+)`$/gm)].map((match) => match[1]),
		).toEqual(['@acme/widget/zeta', '@acme/widget/alpha'])
	})
})

describe('checkPages, the dialecte-lot station definitions', () => {
	const LOT_PAGE = `---\nname: dialecte-lot\ndescription: Use it.\n---\n`
	const STATION_PINS: [string, string, string][] = [
		['test-writer', 'standard', 'edit'],
		['test-reviewer', 'strong', 'review'],
		['implementer', 'standard', 'edit'],
		['implementer-strong', 'strong', 'edit'],
		['reviewer', 'strong', 'review'],
		['fixer', 'standard', 'edit'],
		['eval-runner', 'standard', 'edit'],
		['grader', 'strong', 'read'],
		['standard-reader', 'standard', 'read'],
		['searcher', 'fast', 'read'],
	]
	const STATIONS_MD = `# Stations\n\n${STATION_PINS.map(
		([name, tier, access]) =>
			`### ${name}\n\n- Tier: ${tier}\n- Access: ${access}\n\nWhat it does.\n`,
	).join('\n')}`

	beforeEach(() => {
		write('package.json', JSON.stringify({ name: '@acme/lot' }))
		write('skills/dialecte-lot/SKILL.md', LOT_PAGE)
	})

	it('references/stations.md with every station, tier and access as the cli has them -> exit 0', () => {
		write('skills/dialecte-lot/references/stations.md', STATIONS_MD)

		expect(checkPages({ cwd: root, methods: [], workspace: undefined })).toBe(0)
	})

	it('references/stations.md missing -> exit 1', () => {
		expect(checkPages({ cwd: root, methods: [], workspace: undefined })).toBe(1)
	})

	it('a wrong Access line -> exit 1, the error names the station, expected and found', () => {
		const wrong = STATIONS_MD.replace(
			'### grader\n\n- Tier: strong\n- Access: read',
			'### grader\n\n- Tier: strong\n- Access: edit',
		)
		expect(wrong).not.toBe(STATIONS_MD)
		write('skills/dialecte-lot/references/stations.md', wrong)

		expect(checkPages({ cwd: root, methods: [], workspace: undefined })).toBe(1)
		const errors = vi.mocked(console.error).mock.calls.flat().join('\n')
		expect(errors).toContain('grader')
		expect(errors).toContain('read')
		expect(errors).toContain('edit')
	})
})

describe('checkPages, a package that does not ship dialecte-lot', () => {
	it('no references/stations.md needed -> exit 0', () => {
		write('package.json', JSON.stringify({ name: '@acme/other' }))
		write('skills/demo/SKILL.md', FRONTMATTER)

		expect(checkPages({ cwd: root, methods: [], workspace: undefined })).toBe(0)
	})
})
