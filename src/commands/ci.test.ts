/** `dialecte ci sync | check | publish-decision` on scratch packages: what is written, printed and exited. */
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	OWN_TEST_PATH,
	PLAIN_PACKAGE_JSON,
	PLAIN_PACKAGE_PATHS,
} from '../../test/ci-package.constants.ts'
import { ciPackage, snapshotOf } from '../../test/ci-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, temporaryFolder } from '../../test/scratch-repository.ts'
import { runCi, runCiPublishDecision } from './ci.ts'

import { describe, expect, it } from 'vitest'

const CREATED = PLAIN_PACKAGE_PATHS.map((path) => `ci: created ${path}`)
const OWN_LINE = `ci: own ${OWN_TEST_PATH}`
const CI_YML = '.github/workflows/ci.yml'

describe('dialecte ci sync', () => {
	it('into a package with none of the files → every file created, exit 0', () => {
		const root = ciPackage()

		const result = runCi({ cwd: root, argv: ['sync'] })

		expect({
			result,
			written: PLAIN_PACKAGE_PATHS.filter((path) => existsSync(join(root, path))),
		}).toEqual({
			result: { exitCode: 0, output: [...CREATED, OWN_LINE].join('\n') },
			written: [...PLAIN_PACKAGE_PATHS],
		})
	})

	it('twice → the second run is in step and rewrites nothing', () => {
		const root = ciPackage()
		runCi({ cwd: root, argv: ['sync'] })
		const before = snapshotOf({ root, paths: PLAIN_PACKAGE_PATHS })

		const result = runCi({ cwd: root, argv: ['sync'] })

		expect({ result, after: snapshotOf({ root, paths: PLAIN_PACKAGE_PATHS }) }).toEqual({
			result: { exitCode: 0, output: ['ci: in step with the template', OWN_LINE].join('\n') },
			after: before,
		})
	})

	it('over a hand-edited ci.yml → updated, with the diff, the file back to the template', () => {
		const root = ciPackage()
		runCi({ cwd: root, argv: ['sync'] })
		const synced = readFileSync(join(root, CI_YML), 'utf8')
		appendFileSync(join(root, CI_YML), '# hand edit\n')

		const result = runCi({ cwd: root, argv: ['sync'] })
		const lines = result.output.split('\n')

		expect({
			exitCode: result.exitCode,
			first: lines[0],
			removed: lines.includes('-# hand edit'),
			last: lines.at(-1),
			file: readFileSync(join(root, CI_YML), 'utf8'),
		}).toEqual({
			exitCode: 0,
			first: `ci: updated ${CI_YML}`,
			removed: true,
			last: OWN_LINE,
			file: synced,
		})
	})

	it('retired pr.yml and _lint.yml and an unselected _type-perf.yml → deleted', () => {
		const retired = [
			'.github/workflows/_lint.yml',
			'.github/workflows/_type-perf.yml',
			'.github/workflows/pr.yml',
		]
		const root = ciPackage({
			files: Object.fromEntries(retired.map((path) => [path, 'name: old\n'])),
		})

		const result = runCi({ cwd: root, argv: ['sync'] })

		expect({
			exitCode: result.exitCode,
			deleted: result.output.split('\n').filter((line) => line.startsWith('ci: deleted')),
			left: retired.filter((path) => existsSync(join(root, path))),
		}).toEqual({
			exitCode: 0,
			deleted: retired.map((path) => `ci: deleted ${path}`),
			left: [],
		})
	})

	it('an unknown workflow file and another .github file → untouched, the workflow listed as own', () => {
		const own = {
			'.github/workflows/deploy-docs.yml': 'name: Deploy Documentation\n',
			'.github/copilot-instructions.md': '# notes\n',
		}
		const root = ciPackage({ files: own })

		const result = runCi({ cwd: root, argv: ['sync'] })

		expect({
			exitCode: result.exitCode,
			last: result.output.split('\n').at(-1),
			kept: Object.keys(own).map((path) => readFileSync(join(root, path), 'utf8')),
		}).toEqual({
			exitCode: 0,
			last: `ci: own ${OWN_TEST_PATH}, .github/workflows/deploy-docs.yml`,
			kept: Object.values(own),
		})
	})

	it('no _test.yml → the managed files written, exit 1 naming the missing file', () => {
		const root = ciPackage({ files: { [OWN_TEST_PATH]: null } })

		const result = runCi({ cwd: root, argv: ['sync'] })

		expect({
			result,
			written: PLAIN_PACKAGE_PATHS.filter((path) => existsSync(join(root, path))),
		}).toEqual({
			result: {
				exitCode: 1,
				output: [
					...CREATED,
					`ci: ${OWN_TEST_PATH} is missing: the repository owns its tests, ci.yml calls it`,
				].join('\n'),
			},
			written: [...PLAIN_PACKAGE_PATHS],
		})
	})

	it('--dry-run → the same lines and a last one saying nothing was written; no file written', () => {
		const root = ciPackage()

		const result = runCi({ cwd: root, argv: ['sync', '--dry-run'] })

		expect({
			result,
			written: PLAIN_PACKAGE_PATHS.filter((path) => existsSync(join(root, path))),
		}).toEqual({
			result: {
				exitCode: 0,
				output: [...CREATED, OWN_LINE, 'ci: --dry-run, nothing written'].join('\n'),
			},
			written: [],
		})
	})
})

describe('dialecte ci check', () => {
	it('an in-step package → exit 0', () => {
		const root = ciPackage()
		runCi({ cwd: root, argv: ['sync'] })

		expect(runCi({ cwd: root, argv: ['check'] })).toEqual({
			exitCode: 0,
			output: ['ci: in step with the template', OWN_LINE].join('\n'),
		})
	})

	it('a hand-edited ci.yml → exit 1 with the diff and the fix line, nothing written', () => {
		const root = ciPackage()
		runCi({ cwd: root, argv: ['sync'] })
		appendFileSync(join(root, CI_YML), '# hand edit\n')
		const edited = readFileSync(join(root, CI_YML), 'utf8')

		const result = runCi({ cwd: root, argv: ['check'] })
		const lines = result.output.split('\n')

		expect({
			exitCode: result.exitCode,
			first: lines[0],
			removed: lines.includes('-# hand edit'),
			tail: lines.slice(-2),
			file: readFileSync(join(root, CI_YML), 'utf8'),
		}).toEqual({
			exitCode: 1,
			first: `ci: ${CI_YML} differs from the template`,
			removed: true,
			tail: ['ci: run dialecte ci sync', OWN_LINE],
			file: edited,
		})
	})

	it('a missing file and a retired one → exit 1 naming each', () => {
		const root = ciPackage()
		runCi({ cwd: root, argv: ['sync'] })
		const lint = '.github/workflows/_lint.yml'
		appendFileSync(join(root, lint), 'name: old\n')
		rmSync(join(root, '.nvmrc'))

		expect(runCi({ cwd: root, argv: ['check'] })).toEqual({
			exitCode: 1,
			output: [
				`ci: ${lint} should be deleted: retired, or no job of this package calls it`,
				'ci: .nvmrc is missing',
				'ci: run dialecte ci sync',
				OWN_LINE,
			].join('\n'),
		})
	})

	it('no _test.yml → exit 1 naming it', () => {
		const root = ciPackage({ files: { [OWN_TEST_PATH]: null } })
		runCi({ cwd: root, argv: ['sync'] })

		expect(runCi({ cwd: root, argv: ['check'] })).toEqual({
			exitCode: 1,
			output: [
				'ci: in step with the template',
				`ci: ${OWN_TEST_PATH} is missing: the repository owns its tests, ci.yml calls it`,
			].join('\n'),
		})
	})
})

describe('dialecte ci refusals', () => {
	it.each([
		{
			name: 'no package.json',
			files: { 'package.json': null },
			argv: ['sync'],
			output: 'ci: no package.json here: run it in a package root',
		},
		{
			name: 'a package.json with no name',
			files: { 'package.json': JSON.stringify({ scripts: { build: 'tsup' } }) },
			argv: ['check'],
			output: 'ci: package.json has no name',
		},
		{
			name: 'a package.json with no build script',
			files: { 'package.json': JSON.stringify({ name: '@scratch/pkg', scripts: {} }) },
			argv: ['sync'],
			output: 'ci: package.json has no build script: publish.yml builds the package',
		},
		{
			name: 'an unknown verb',
			files: {},
			argv: ['push'],
			output: 'usage: dialecte ci sync [--dry-run] | ci check | ci publish-decision',
		},
	])('$name → exit 2, nothing written', ({ files, argv, output }) => {
		const root = ciPackage({ files })

		expect({
			result: runCi({ cwd: root, argv }),
			written: PLAIN_PACKAGE_PATHS.filter((path) => existsSync(join(root, path))),
		}).toEqual({ result: { exitCode: 2, output }, written: [] })
	})
})

describe('dialecte ci publish-decision', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('an unchanged version → skip printed on stdout, the outputs written, exit 0', () => {
		const root = createScratchRepository({ 'package.json': PLAIN_PACKAGE_JSON })
		const outputs = join(temporaryFolder('dialecte-ci-outputs-'), 'outputs')
		appendFileSync(outputs, '')
		const before = git({ root, args: ['rev-parse', 'HEAD'] }).trim()

		const result = runCiPublishDecision({
			cwd: root,
			environment: { BEFORE: before, GITHUB_OUTPUT: outputs },
		})

		expect({ result, outputs: readFileSync(outputs, 'utf8') }).toEqual({
			result: {
				exitCode: 0,
				lines: [
					{
						stream: 'stdout',
						line: '@scratch/pkg 1.0.0 -> 1.0.0: skip (version unchanged (1.0.0))',
					},
				],
			},
			outputs: 'publish=false\ntag=false\n',
		})
	})

	it('no BEFORE → exit 1 with the reason on stderr', () => {
		const root = ciPackage()

		expect(runCiPublishDecision({ cwd: root, environment: {} })).toEqual({
			exitCode: 1,
			lines: [{ stream: 'stderr', line: 'BEFORE and GITHUB_OUTPUT must be set' }],
		})
	})
})
