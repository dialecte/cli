import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createMcpServer } from './create-mcp-server.ts'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ApiJson } from '../api/api-json.types.ts'

const CLI_ENTRY = fileURLToPath(new URL('../../cli.ts', import.meta.url))

let root: string
let appRoot: string
let client: Client

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

const SCL: ApiJson = {
	package: '@dialecte/scl',
	methods: [
		{
			path: 'doc.query.info.of',
			root: 'q',
			otherRoutes: [],
			signature: '(refOrRecord: AnyRefOrRecord) => Promise<ElementInfo>',
			summary: 'The own title of an SCL element.',
			intents: ['own title or display name of an element'],
			declaredAt: undefined,
			example: 'await doc.query.info.of(bay)',
		},
		{
			path: 'tx.reference.applyUuidRemap',
			root: 'tx',
			otherRoutes: [],
			signature: '(params: { cloneMappings: CloneMapping[] }) => Promise<void>',
			summary: 'Repoint the uuid references of cloned elements onto the copies.',
			intents: ['repoint uuid references after a clone', 'title of a reference'],
			declaredAt: undefined,
			example: undefined,
		},
	],
}

const DIALECTE_ENTRY = `export const widgetConfig = {
	rootElementName: 'Root',
	elements: ['Root', 'Bay', 'Substation'],
	children: {},
	definition: {},
}
`

/** An application, not a dialecte: its types live in its own module, so `members` needs the namespace and the entry. */
function writeApp(): void {
	const files: Record<string, string> = {
		'package.json': JSON.stringify({ name: 'my-app' }),
		'tsconfig.build.json': JSON.stringify({
			compilerOptions: {
				strict: true,
				module: 'esnext',
				moduleResolution: 'bundler',
				target: 'es2022',
				noEmit: true,
			},
		}),
		'src/app.ts': [
			'export declare namespace Acme {',
			'  interface Query {',
			'    /** Reads one record. @intent read a record */',
			'    getRecord(id: string): Promise<string>',
			'  }',
			'  interface Transaction {}',
			'  interface Document { query: Query }',
			'  interface Project {}',
			'}',
			'',
		].join('\n'),
	}
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(appRoot, path)), { recursive: true })
		writeFileSync(join(appRoot, path), content)
	}
}

const READER_NAMES = [
	'resolveDefinition',
	'getAttributeRules',
	'enumeratedValues',
	'valuePatterns',
	'admittedXsiTypes',
	'childOccurrences',
	'orderByConfigSequence',
]

beforeEach(async () => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-mcp-'))
	appRoot = mkdtempSync(join(tmpdir(), 'dialecte-cli-mcp-app-'))
	writeApp()
	write(
		'package.json',
		JSON.stringify({
			dependencies: { '@dialecte/core': '1', '@dialecte/scl': '1', '@acme/widget': '1' },
		}),
	)
	write(
		'node_modules/@dialecte/scl/package.json',
		JSON.stringify({ name: '@dialecte/scl', version: '1.0.0' }),
	)
	write('node_modules/@dialecte/scl/skills/dialecte-scl/SKILL.md', '---\n')
	write('node_modules/@dialecte/scl/skills/dialecte-scl/references/api.json', JSON.stringify(SCL))
	write(
		'node_modules/@dialecte/core/package.json',
		JSON.stringify({
			name: '@dialecte/core',
			type: 'module',
			exports: { './utils': './utils.js' },
		}),
	)
	write(
		'node_modules/@dialecte/core/utils.js',
		READER_NAMES.map((name) => `export function ${name}() {}`).join('\n'),
	)
	write(
		'node_modules/@acme/widget/package.json',
		JSON.stringify({
			name: '@acme/widget',
			type: 'module',
			dependencies: { '@dialecte/core': '1' },
			exports: { '.': './index.js' },
		}),
	)
	write('node_modules/@acme/widget/index.js', DIALECTE_ENTRY)

	const server = await createMcpServer({
		context: { serverCwd: root, cliVersion: '0.2.0', dialecteRoot: undefined },
	})
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	client = new Client({ name: 'test', version: '1.0.0' })
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
})

afterEach(async () => {
	await client.close()
	rmSync(root, { recursive: true, force: true })
	rmSync(appRoot, { recursive: true, force: true })
})

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
	const [first] = result.content as { type: string; text: string }[]
	return first.text
}

describe('dialecte mcp', () => {
	it('tools/list names the six tools with input schemas', async () => {
		const { tools } = await client.listTools()
		expect(tools.map((tool) => tool.name)).toEqual([
			'api_find',
			'api_show',
			'schema',
			'members',
			'doctor',
			'models',
		])
		for (const tool of tools) expect(tool.inputSchema.type).toBe('object')
		expect(tools[0].inputSchema.required).toEqual(['need'])
	})

	it('api_find over a fixture api.json returns the same ranking as the cli --json', async () => {
		const result = await client.callTool({
			name: 'api_find',
			arguments: { need: 'title of a reference' },
		})
		const expected = spawnSync(
			process.execPath,
			[CLI_ENTRY, 'api', 'find', 'title of a reference', '--json'],
			{ cwd: root, encoding: 'utf8' },
		)
		expect(expected.status).toBe(0)
		expect(result.isError).toBe(false)
		expect(JSON.parse(textOf(result))).toEqual(JSON.parse(expected.stdout))
		expect(JSON.parse(textOf(result)).methods).toHaveLength(2)
	})

	it('api_find passes limit and package through', async () => {
		const result = await client.callTool({
			name: 'api_find',
			arguments: { need: 'title of a reference', limit: 1, package: '@dialecte/scl' },
		})
		expect(JSON.parse(textOf(result)).methods).toHaveLength(1)
	})

	it('an argument the schema refuses returns an error result naming it', async () => {
		const result = await client.callTool({ name: 'api_find', arguments: { need: '--json' } })
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('"need" must not start with "--"')
	})

	it('models with no vendor known returns an error result with the command hint', async () => {
		const result = await client.callTool({ name: 'models', arguments: {} })
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('no vendor known')
	})

	it('models with a vendor returns its tiers as JSON', async () => {
		const result = await client.callTool({ name: 'models', arguments: { vendor: 'anthropic' } })
		expect(result.isError).toBe(false)
		expect(Object.keys(JSON.parse(textOf(result)).tiers)).toEqual([
			'fast',
			'standard',
			'strong',
			'frontier',
		])
	})

	it('a command that throws returns an error result, not a protocol error', async () => {
		write('node_modules/@dialecte/scl/skills/dialecte-scl/references/api.json', '{')
		const result = await client.callTool({ name: 'api_find', arguments: { need: 'title' } })
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('is not a valid api index')
	})

	it('doctor with a warning still answers: JSON, not an error', async () => {
		const result = await client.callTool({ name: 'doctor', arguments: {} })
		expect(result.isError).toBe(false)
		expect(() => JSON.parse(textOf(result))).not.toThrow()
	})

	it('schema of an unknown tag returns an error result with the closest names, not a crash', async () => {
		const result = await client.callTool({ name: 'schema', arguments: { tag: 'Baay' } })
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('closest: Bay')
	})

	it('a call with a cwd that does not exist returns an error result', async () => {
		const missing = join(root, 'absent')
		const result = await client.callTool({ name: 'doctor', arguments: { cwd: missing } })
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain(missing)
	})

	it('an argument that is not a property of the tool, even an inherited name, is refused', async () => {
		const result = await client.callTool({
			name: 'api_find',
			arguments: { need: 'title', toString: '--out' },
		})
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('unknown argument "toString"')
	})

	it('api_show returns the contract of one method as JSON', async () => {
		const result = await client.callTool({
			name: 'api_show',
			arguments: { path: 'doc.query.info.of' },
		})
		expect(result.isError).toBe(false)
		expect(JSON.parse(textOf(result)).methods[0]).toMatchObject({
			package: '@dialecte/scl',
			path: 'doc.query.info.of',
			example: 'await doc.query.info.of(bay)',
		})
	})

	it('api_show of an unknown path returns an error result with the hint', async () => {
		const result = await client.callTool({ name: 'api_show', arguments: { path: 'nope' } })
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('nope')
	})

	it('members in an app with its namespace and entry lists the members of its types', async () => {
		const result = await client.callTool({
			name: 'members',
			arguments: {
				expression: 'doc.query',
				namespace: 'Acme',
				entry: join(appRoot, 'src/app'),
				cwd: appRoot,
			},
		})
		expect(result.isError).toBe(false)
		expect(JSON.parse(textOf(result)).members).toEqual([
			expect.objectContaining({ name: 'getRecord', kind: 'method' }),
		])
	})

	it('members in an app without them returns an error result with the usage', async () => {
		const result = await client.callTool({
			name: 'members',
			arguments: { expression: 'doc.query', cwd: appRoot },
		})
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('--namespace <Name> --entry')
	})

	it('members refuses a namespace that looks like an option', async () => {
		const result = await client.callTool({
			name: 'members',
			arguments: { expression: 'doc.query', namespace: '--out', cwd: appRoot },
		})
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('"namespace" must not start with "--"')
	})

	it('api_find that finds nothing names the packages it searched', async () => {
		const result = await client.callTool({ name: 'api_find', arguments: { need: 'zzzz' } })
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('in @dialecte/scl')
	})

	it('api_find with a package no installed package matches says so', async () => {
		const result = await client.callTool({
			name: 'api_find',
			arguments: { need: 'title', package: '@dialecte/none' },
		})
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('no installed package "@dialecte/none"')
		expect(textOf(result)).toContain('@dialecte/scl')
	})

	it('api_show of an unknown path names the packages it searched', async () => {
		const result = await client.callTool({ name: 'api_show', arguments: { path: 'nope' } })
		expect(textOf(result)).toContain('in @dialecte/scl')
	})

	it('schema with a package no installed dialecte matches says so', async () => {
		const result = await client.callTool({
			name: 'schema',
			arguments: { tag: 'Bay', package: '@acme/none' },
		})
		expect(result.isError).toBe(true)
		expect(textOf(result)).toContain('no installed dialecte package "@acme/none"')
		expect(textOf(result)).toContain('@acme/widget')
	})
})
