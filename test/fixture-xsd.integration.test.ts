/**
 * Every fixture is valid against the schema it comes from, judged by xmllint on the real XSD: the fixture of
 * EVERY element of core's test dialecte (the `test.xsd` core ships, `@dialecte/core/test/xsd/test.xsd` of the
 * core the tests run on), and with `DIALECTE_SCL_DIR` every element of scl (its entry XSD named by
 * `DIALECTE_SCL_XSD`, a path on the machine running the tests: the schema ships with no package; skipped
 * without both). A tag the fixture refuses (exit 1, the reason named) is listed by the test, never an
 * invalid document. Without xmllint the test fails.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { runFixtureCommand } from '../src/commands/fixture.ts'
import { coreEntries, coreTestSchema } from './real-core.ts'
import { TEST_DIALECTE_PACKAGE } from './run/run-environment.constants.ts'
import { testProjectDirectory } from './run/run-environment.ts'
import { installSclProject } from './run/scl-project.ts'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Judged = { invalid: string[]; refused: string[]; valid: number }

let scratch: string

beforeAll(() => {
	const xmllint = spawnSync('xmllint', ['--version'])
	if (xmllint.error)
		throw new Error(
			'fixture validity: xmllint is not installed (libxml2) - the fixtures cannot be judged',
		)
	scratch = mkdtempSync(join(tmpdir(), 'dialecte-cli-fixture-xsd-'))
})

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true })
})

/** The fixture of every tag, each document judged by xmllint against the schema. */
async function judgeEveryTag(params: {
	cwd: string
	packageName?: string
	tags: readonly string[]
	schema: string
	folder: string
}): Promise<Judged> {
	const { cwd, packageName, tags, schema, folder } = params
	const judged: Judged = { invalid: [], refused: [], valid: 0 }
	const files = new Map<string, string>()
	for (const tag of tags) {
		const stdout: string[] = []
		const exitCode = await runFixtureCommand({
			argv: [tag, '--json', ...(packageName ? ['--package', packageName] : [])],
			cwd,
			output: { stdout: (text) => stdout.push(text), stderr: (text) => stdout.push(text) },
		})
		const answer = JSON.parse(stdout.join('\n')) as { ok: boolean; xml?: string; problem?: string }
		if (exitCode !== 0 || !answer.xml) {
			judged.refused.push(`${tag}: ${answer.problem ?? 'the engine refused'}`)
			continue
		}
		const file = join(folder, `${tag}.xml`)
		writeFileSync(file, answer.xml)
		files.set(file, tag)
	}
	const run = spawnSync('xmllint', ['--noout', '--schema', schema, ...files.keys()], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
	const report = `${run.stdout}${run.stderr}`
	for (const [file, tag] of files) {
		if (report.includes(`${file} validates`)) judged.valid++
		else
			judged.invalid.push(
				`${tag}: ${report
					.split('\n')
					.filter((line) => line.startsWith(`${file}:`))
					.slice(0, 2)
					.join(' | ')}`,
			)
	}
	return judged
}

describe('every fixture of core test dialecte is valid against its XSD (xmllint)', () => {
	it('every tag', async () => {
		const schema = coreTestSchema()
		const testModule = (await import(pathToFileURL(coreEntries().testEntry).href)) as {
			TEST_DIALECTE_CONFIG: { elements: string[] }
		}
		const judged = await judgeEveryTag({
			cwd: testProjectDirectory(),
			packageName: TEST_DIALECTE_PACKAGE,
			tags: testModule.TEST_DIALECTE_CONFIG.elements,
			schema,
			folder: mkdtempSync(join(scratch, 'core-')),
		})
		expect(judged.invalid).toEqual([])
		expect(judged.refused).toEqual([])
		expect(judged.valid).toBe(testModule.TEST_DIALECTE_CONFIG.elements.length)
	}, 120_000)
})

const sclDirectory = process.env.DIALECTE_SCL_DIR
const sclSchema = process.env.DIALECTE_SCL_XSD

describe.skipIf(sclDirectory === undefined || sclSchema === undefined)(
	'every fixture of scl is valid against its XSD (xmllint; needs DIALECTE_SCL_DIR and DIALECTE_SCL_XSD)',
	() => {
		let project: string

		beforeAll(async () => {
			project = await installSclProject({ sclDirectory: resolve(sclDirectory ?? '') })
		}, 120_000)

		afterAll(() => {
			rmSync(project, { recursive: true, force: true })
		})

		it('every tag', async () => {
			const schema = sclSchema ?? ''
			expect(existsSync(schema), `DIALECTE_SCL_XSD names no file: ${schema}`).toBe(true)
			const configModule = (await import(
				pathToFileURL(
					join(project, 'node_modules', '@dialecte', 'scl', 'dist', 'v2019C1', 'index.js'),
				).href
			)) as { SCL_DIALECTE_CONFIG: { elements: string[] } }
			const tags = configModule.SCL_DIALECTE_CONFIG.elements
			const judged = await judgeEveryTag({
				cwd: project,
				tags,
				schema,
				folder: mkdtempSync(join(scratch, 'scl-')),
			})
			expect(judged.invalid).toEqual([])
			expect(judged.refused).toEqual([])
			expect(judged.valid).toBe(tags.length)
		}, 600_000)
	},
)
