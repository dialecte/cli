/**
 * `dialecte fixture` on a real dialecte: the scl build `DIALECTE_SCL_DIR` names (an scl checkout, built),
 * installed in a scratch project on the core the tests run on, its fixtures judged by scl's own validator
 * (`assertValidSclXml`). Without `DIALECTE_SCL_DIR` the case is skipped, by its name.
 */
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { runFixtureCommand } from '../src/commands/fixture.ts'
import { installSclProject } from './run/scl-project.ts'
import { installNodeDomParser } from './run/xml-validation.ts'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Invocation = { exitCode: number; stdout: string; stderr: string }

const sclDirectory = process.env.DIALECTE_SCL_DIR
let project: string
let assertValidSclXml: (xml: string) => void

describe.skipIf(sclDirectory === undefined)(
	'dialecte fixture on scl (needs DIALECTE_SCL_DIR: a built scl checkout)',
	() => {
		beforeAll(async () => {
			project = await installSclProject({ sclDirectory: resolve(sclDirectory ?? '') })
			const installed = join(project, 'node_modules', '@dialecte', 'scl')
			await installNodeDomParser()
			const sclTest = (await import(
				pathToFileURL(join(installed, 'dist', 'v2019C1', 'test.js')).href
			)) as { assertValidSclXml: (xml: string, label?: string) => void }
			assertValidSclXml = function assertFixture(xml: string): void {
				sclTest.assertValidSclXml(xml, 'scl fixture')
			}
		}, 120_000)

		afterAll(() => {
			rmSync(project, { recursive: true, force: true })
		})

		async function invoke(argv: string[]): Promise<Invocation> {
			const stdout: string[] = []
			const stderr: string[] = []
			const exitCode = await runFixtureCommand({
				argv,
				cwd: project,
				output: {
					stdout: (text) => stdout.push(text),
					stderr: (text) => stderr.push(text),
				},
			})
			return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
		}

		it('scl validator: an invalid document still fails through it', () => {
			expect(() =>
				assertValidSclXml(
					'<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" release="4" unknown="1"/>',
				),
			).toThrow(/unknown attribute 'unknown'/)
		})

		it('Bay → the scl dialecte found alone, the chain from SCL, what each element requires, hooks applied, valid SCL', async () => {
			const { exitCode, stdout, stderr } = await invoke(['Bay', '--json'])
			expect(stderr).toBe('')
			expect(exitCode).toBe(0)
			const answer = JSON.parse(stdout)
			expect(answer).toMatchObject({
				ok: true,
				packageName: '@dialecte/scl/v2019C1',
				path: '/SCL/Substation/VoltageLevel/Bay',
			})
			// a required Header, the hooks' uuids, a name for every named element
			expect(answer.xml).toMatch(/<Header [^>]*id="Header"/)
			expect(answer.xml).toMatch(/<Bay name="Bay" uuid="[0-9a-f-]{36}"\/>/)
			assertValidSclXml(answer.xml)
		})

		it('LNode → an enumerated required attribute takes its first value, valid SCL, the same bytes twice', async () => {
			const first = await invoke(['LNode'])
			const second = await invoke(['LNode'])
			expect(first.exitCode).toBe(0)
			expect(first.stdout).toMatch(/<LNode [^>]*lnClass="LLN0"/)
			expect(second.stdout).toBe(first.stdout)
			assertValidSclXml(first.stdout)
		})
	},
)
