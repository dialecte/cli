import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TEST_DIALECTE_PACKAGE, testProjectDirectory } from '../../test/run/run-environment.ts'
import { loadTestDialecteValidator } from '../../test/run/xml-validation.ts'
import { runFixtureCommand } from './fixture.ts'

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type Invocation = { exitCode: number; stdout: string; stderr: string }

let scratch: string
let assertValidTestXml: (xml: string) => void

beforeAll(async () => {
	assertValidTestXml = await loadTestDialecteValidator()
})

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'dialecte-cli-fixture-'))
})

afterEach(() => {
	rmSync(scratch, { recursive: true, force: true })
})

async function invoke(argv: string[]): Promise<Invocation> {
	const stdout: string[] = []
	const stderr: string[] = []
	const exitCode = await runFixtureCommand({
		argv: [...argv, '--package', TEST_DIALECTE_PACKAGE],
		cwd: testProjectDirectory(),
		output: {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		},
	})
	return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
}

/** The document with LF line ends, the way the expectations are written. */
function lines(xml: string): string {
	return xml.replaceAll('\r\n', '\n')
}

describe('test XML validator', () => {
	it('an invalid document still fails through it', () => {
		expect(() =>
			assertValidTestXml(
				'<Root xmlns="http://dialecte.dev/XML/DEFAULT"><AA_1 aAA_1="x"><AAA_1 aAAA_1="abc"><AAAA_1 aAAAA_1="x"/></AAA_1></AA_1></Root>',
			),
		).toThrow(/AA_1/)
	})
})

describe('dialecte fixture', () => {
	type TestCase = {
		argv: () => string[]
		expected: (invocation: Invocation) => void | Promise<void>
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'AAA_1 → the smallest valid document holding AAA_1, built down the shortest chain': {
			argv: () => ['AAA_1'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(lines(stdout)).toBe(
					[
						'<?xml version="1.0" encoding="UTF-8"?>',
						'<Root xmlns="http://dialecte.dev/XML/DEFAULT">',
						'    <A aA="A">',
						'        <AA_1 aAA_1="AA_1">',
						'            <AAA_1 aAAA_1="aaa">',
						'                <AAAA_1 aAAAA_1="AAAA_1"/>',
						'            </AAA_1>',
						'        </AA_1>',
						'    </A>',
						'</Root>',
					].join('\n'),
				)
				assertValidTestXml(stdout)
			},
		},
		'a required child on the way is added, with what it requires in turn': {
			argv: () => ['AA_2'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(lines(stdout)).toContain(
					[
						'    <A aA="A">',
						'        <AA_1 aAA_1="AA_1">',
						'            <AAA_1 aAAA_1="aaa">',
						'                <AAAA_1 aAAAA_1="AAAA_1"/>',
						'            </AAA_1>',
						'        </AA_1>',
						'        <AA_2 aAA_2="0">',
					].join('\n'),
				)
				assertValidTestXml(stdout)
			},
		},
		'a fixed attribute takes its fixed value': {
			argv: () => ['CC_1'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout).toContain('<CC_1 aCC_1="fixed_val">')
				assertValidTestXml(stdout)
			},
		},
		'required text an empty value does not satisfy → a value its type takes': {
			argv: () => ['BBBB_1'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout).toContain('<BBBB_1 aBBBB_1="BBBB_1">a</BBBB_1>')
				assertValidTestXml(stdout)
			},
		},
		'an attribute of a fixed length → a value of that length': {
			argv: () => ['AAAA_3'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout).toContain('ext:aAAAA_3="AAAA_3aa"')
				assertValidTestXml(stdout)
			},
		},
		'an element of an abstract type names its first variant, and holds what that variant requires':
			{
				argv: () => ['DD_1'],
				expected({ exitCode, stdout }) {
					expect(exitCode).toBe(0)
					expect(stdout).toMatch(/<DD_1 [^>]*xsi:type="tDD_1A"/)
					assertValidTestXml(stdout)
				},
			},
		'--under → the chain goes through the named parents (the root may be named), every sampled value new':
			{
				argv: () => ['AAA_1', '--under', 'Root/A/AA_2'],
				expected({ exitCode, stdout }) {
					expect(exitCode).toBe(0)
					expect(lines(stdout)).toContain(
						[
							'        <AA_2 aAA_2="0">',
							'            <AAA_1 aAAA_1="aab">',
							'                <AAAA_1 aAAAA_1="AAAA_11"/>',
							'            </AAA_1>',
							'        </AA_2>',
						].join('\n'),
					)
					assertValidTestXml(stdout)
				},
			},
		'--under with a step its parent does not hold → exit 1, the step and the closest children named':
			{
				argv: () => ['AAA_1', '--under', 'A/AA_9'],
				expected({ exitCode, stdout }) {
					expect(exitCode).toBe(1)
					expect(stdout).toBe(
						'fixture: --under A/AA_9: A holds no AA_9 - closest: AA_1, AA_2, AA_3',
					)
				},
			},
		'--under ending on an element that does not hold the tag → exit 1': {
			argv: () => ['AAA_1', '--under', 'B'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(1)
				expect(stdout).toBe('fixture: --under B: B holds no AAA_1 - closest: none')
			},
		},
		'unknown tag → exit 1 with the closest tags': {
			argv: () => ['AA_9'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(1)
				expect(stdout).toBe(
					`fixture: no element "AA_9" in ${TEST_DIALECTE_PACKAGE} - closest: AA_1, AA_2, AA_3, AAA_1, AAA_2`,
				)
			},
		},
		'--out → the document written to the file, one line said': {
			argv: () => ['AAA_1', '--out', join(scratch, 'fixture.xml')],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				const written = readFileSync(join(scratch, 'fixture.xml'), 'utf8')
				assertValidTestXml(written)
				expect(stdout).toBe(
					`fixture: /Root/A/AA_1/AAA_1 - ${Buffer.byteLength(written)} bytes written to ${join(scratch, 'fixture.xml')}`,
				)
			},
		},
		'--json → the fixture as data: package, tag, path, bytes, the XML': {
			argv: () => ['AAA_1', '--json'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				const answer = JSON.parse(stdout)
				expect(answer).toMatchObject({
					ok: true,
					packageName: TEST_DIALECTE_PACKAGE,
					tag: 'AAA_1',
					path: '/Root/A/AA_1/AAA_1',
				})
				expect(answer.bytes).toBe(Buffer.byteLength(answer.xml))
				assertValidTestXml(answer.xml)
			},
		},
		'no tag → exit 2 with the usage': {
			argv: () => [],
			expected({ exitCode, stderr }) {
				expect(exitCode).toBe(2)
				expect(stderr).toContain('fixture: name one tag')
				expect(stderr).toContain('usage: dialecte fixture <Tag>')
			},
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, async () => {
			const invocation = await invoke(testCase.argv())
			await testCase.expected(invocation)
		})

	it('same command twice → byte-identical XML', async () => {
		const first = await invoke(['AA_2'])
		const second = await invoke(['AA_2'])
		expect(first.exitCode).toBe(0)
		expect(second.stdout).toBe(first.stdout)
	})
})
