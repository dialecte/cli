import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const CLI_ENTRY = fileURLToPath(new URL('../../cli.ts', import.meta.url))
const IMPORT_MESSAGE = 'printed while the dialecte is imported'
const READER_NAMES = [
	'resolveDefinition',
	'getAttributeRules',
	'enumeratedValues',
	'valuePatterns',
	'admittedXsiTypes',
	'childOccurrences',
	'orderByConfigSequence',
]

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-mcp-stdio-'))
	write(
		'package.json',
		JSON.stringify({ dependencies: { '@dialecte/core': '1', '@acme/widget': '1' } }),
	)
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
	write(
		'node_modules/@acme/widget/index.js',
		`console.log(${JSON.stringify(IMPORT_MESSAGE)})
export const widgetConfig = { rootElementName: 'Root', elements: ['Root', 'Bay'], children: {}, definition: {} }
`,
	)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

/** Starts `dialecte mcp` in the fixture, sends the requests, and answers what it wrote to each stream. */
async function serve(requests: object[]): Promise<{ stdout: string; stderr: string }> {
	const child = spawn(process.execPath, [CLI_ENTRY, 'mcp'], { cwd: root })
	let stdout = ''
	let stderr = ''
	child.stdout.on('data', (chunk) => (stdout += chunk))
	child.stderr.on('data', (chunk) => (stderr += chunk))
	for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`)
	await new Promise<void>(function waitForAnswers(resolve) {
		const interval = setInterval(function check() {
			const answered = stdout.split('\n').filter((line) => line.includes('"id":3')).length
			if (answered > 0) {
				clearInterval(interval)
				resolve()
			}
		}, 50)
	})
	child.kill()
	return { stdout, stderr }
}

describe('dialecte mcp over stdio', () => {
	it('a console.log of a dialecte during a call reaches stderr, never stdout', async () => {
		const { stdout, stderr } = await serve([
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2025-03-26',
					capabilities: {},
					clientInfo: { name: 't', version: '1' },
				},
			},
			{ jsonrpc: '2.0', method: 'notifications/initialized' },
			{ jsonrpc: '2.0', id: 2, method: 'tools/list' },
			{
				jsonrpc: '2.0',
				id: 3,
				method: 'tools/call',
				params: { name: 'schema', arguments: { tag: 'Bay' } },
			},
		])
		const lines = stdout.split('\n').filter((line) => line !== '')
		expect(lines.length).toBe(3)
		for (const line of lines) expect(JSON.parse(line).jsonrpc).toBe('2.0')
		expect(stdout).not.toContain(IMPORT_MESSAGE)
		expect(stderr).toContain(IMPORT_MESSAGE)
	})
})
