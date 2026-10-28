import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { runApi } from './api.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ApiJson } from '../lib/api/api-json.types.ts'

let root: string

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
			signature: '(refOrRecord: AnyRefOrRecord, options?: InfoOptions) => Promise<ElementInfo>',
			summary: 'The own title of an SCL element.',
			intents: ['own title or display name of an element', 'Labels translations of an element'],
			declaredAt: 'src/v2019C1/extensions/info/query/of.ts:35',
			example: 'await doc.query.info.of(bay)',
		},
		{
			path: 'tx.reference.applyUuidRemap',
			root: 'tx',
			otherRoutes: [],
			signature: '(params: { cloneMappings: CloneMapping[] }) => Promise<void>',
			summary: 'Repoint the uuid references of cloned elements onto the copies.',
			intents: ['repoint uuid references after a clone'],
			declaredAt: undefined,
			example: undefined,
		},
	],
}

const CORE: ApiJson = {
	package: '@dialecte/core',
	methods: [
		{
			path: 'doc.query.getTree',
			root: 'q',
			otherRoutes: ['doc.getTree'],
			signature: '(refOrRecord: RefOrRecord) => Promise<TreeRecord>',
			summary: 'Build a full tree structure from an element down.',
			intents: ['read a subtree of an element in document order'],
			declaredAt: 'src/document/query/main.ts:413',
			example: undefined,
		},
	],
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-api-'))
	write(
		'package.json',
		JSON.stringify({ dependencies: { '@dialecte/core': '1', '@dialecte/scl': '1' } }),
	)
	for (const index of [CORE, SCL]) {
		const skill = `skills/${index.package.replace('@dialecte/', 'dialecte-')}`
		write(`node_modules/${index.package}/${skill}/SKILL.md`, '---\n')
		write(`node_modules/${index.package}/${skill}/references/api.json`, JSON.stringify(index))
	}
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

type TestCase = {
	description: string
	argv: string[]
	expected: { output: string | RegExp; exitCode: number }
}

const testCases: TestCase[] = [
	{
		description: 'find a need → one line per method: route, root, matching intent, package',
		argv: ['find', 'display', 'name', 'of', 'a', 'subtree', 'with', 'references'],
		expected: {
			output: [
				'doc.query.info.of  q  own title or display name of an element  @dialecte/scl',
				'tx.reference.applyUuidRemap  tx  repoint uuid references after a clone  @dialecte/scl',
				'doc.query.getTree  q  read a subtree of an element in document order  @dialecte/core',
				'',
			].join('\n'),
			exitCode: 0,
		},
	},
	{
		description: 'find with --package → that package only',
		argv: ['find', 'subtree', '--package', '@dialecte/core'],
		expected: {
			output:
				'doc.query.getTree  q  read a subtree of an element in document order  @dialecte/core\n',
			exitCode: 0,
		},
	},
	{
		description: 'find with --json → the found methods as JSON',
		argv: ['find', 'subtree', '--json'],
		expected: {
			output: `${JSON.stringify(
				{
					need: 'subtree',
					methods: [
						{
							path: 'doc.query.getTree',
							root: 'q',
							package: '@dialecte/core',
							hits: { intent: 1, summary: 0, name: 0 },
							intent: 'read a subtree of an element in document order',
							summary: 'Build a full tree structure from an element down.',
						},
					],
				},
				null,
				'\t',
			)}\n`,
			exitCode: 0,
		},
	},
	{
		description: 'find a need nothing answers → exit 1, a hint',
		argv: ['find', 'zebra'],
		expected: { output: /^no method found for "zebra"/, exitCode: 1 },
	},
	{
		description: 'find without a need → usage, exit 2',
		argv: ['find', '--limit', '3'],
		expected: { output: /^usage: dialecte api/, exitCode: 2 },
	},
	{
		description: 'show a path → signature, summary, intents, routes, declaration, example',
		argv: ['show', 'info.of'],
		expected: {
			output: [
				'doc.query.info.of  (@dialecte/scl)',
				'(refOrRecord: AnyRefOrRecord, options?: InfoOptions) => Promise<ElementInfo>',
				'The own title of an SCL element.',
				'intents: own title or display name of an element; Labels translations of an element',
				'source (repository): src/v2019C1/extensions/info/query/of.ts:35',
				'example: await doc.query.info.of(bay)',
				'',
			].join('\n'),
			exitCode: 0,
		},
	},
	{
		description: 'show a method reached from several roots → its other routes listed',
		argv: ['show', 'doc.getTree'],
		expected: {
			output: /^doc\.query\.getTree {2}\(@dialecte\/core\)\n[\s\S]*\nalso: doc\.getTree\n/,
			exitCode: 0,
		},
	},
	{
		description: 'show an unknown path → exit 1, a hint',
		argv: ['show', 'info.title'],
		expected: { output: /^no method "info\.title"/, exitCode: 1 },
	},
	{
		description: 'an unknown subcommand → usage, exit 2',
		argv: ['list'],
		expected: { output: /^usage: dialecte api/, exitCode: 2 },
	},
]

describe('runApi', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			const result = runApi({ argv: testCase.argv, cwd: root })
			if (typeof testCase.expected.output === 'string')
				expect(result.output).toBe(testCase.expected.output)
			else expect(result.output).toMatch(testCase.expected.output)
			expect(result.exitCode).toBe(testCase.expected.exitCode)
		})

	it('same input twice → byte-identical output', () => {
		const argv = ['find', 'subtree', 'references', 'name', '--json']
		const first = runApi({ argv, cwd: root }).output
		expect(runApi({ argv, cwd: root }).output).toBe(first)
		expect(JSON.parse(first).methods.length).toBe(3)
	})
})
