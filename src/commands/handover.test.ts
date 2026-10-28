import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	createScratchRepository,
	git,
	writeFiles,
	temporaryFolder,
} from '../../test/scratch-repository.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** A repository with two changed files and a lots file covering both. */
function prepare(
	params: {
		lots?: LotsFile['lots']
		files?: Record<string, string>
		overrides?: Partial<LotsFile>
	} = {},
): {
	root: string
	lotsPath: string
	out: string
} {
	const root = createScratchRepository({ 'src/read.ts': 'export function read() {}\n' })
	writeFiles({
		root,
		files: params.files ?? {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'CHANGELOG.md': '# Changelog\n\n- read answers 1\n',
		},
	})
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: headOf(root).slice(0, 7),
		gates: 'npm run check',
		lots: params.lots ?? [
			{ paths: ['src/'], message: 'feat(read): read answers one\n\nThe body.' },
			{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
		],
		...params.overrides,
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	return { root, lotsPath, out }
}

function runScript(out: string): { status: number | null; stderr: string; stdout: string } {
	// run from the hand-over folder: anything the script would wrongly run lands there, not here
	const result = spawnSync('sh', [join(out, 'commit.sh')], { cwd: out, encoding: 'utf8' })
	return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

describe('runHandover', () => {
	it('a changed file in no lot → refused, nothing written', () => {
		const { lotsPath, out } = prepare({
			lots: [{ paths: ['src/'], message: 'feat(read): read answers one' }],
		})

		const result = runHandover({ argv: [lotsPath] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('changed file in no lot: CHANGELOG.md')
		expect(existsSync(join(out, 'commit.sh'))).toBe(false)
	})

	it('a lot message with a ticket tag → refused, nothing written', () => {
		const { lotsPath, out } = prepare({
			lots: [
				{ paths: ['src/'], message: `feat(read): read answers one (${'#'}3102)` },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
			],
		})

		const result = runHandover({ argv: [lotsPath] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`message, line 1: ticket number \`${'#'}3102\``)
		expect(existsSync(join(out, 'commit.sh'))).toBe(false)
	})

	it('a file edited after the snapshot → the script refuses (hash mismatch), nothing committed', () => {
		const { root, lotsPath, out } = prepare()
		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		const head = headOf(root)
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		const result = runScript(out)

		expect(result.status).toBe(1)
		expect(result.stderr).toContain('A file differs from the reviewed snapshot')
		expect(headOf(root)).toBe(head)
	})

	it('run with sh → one commit per lot with its message, the lock released, nothing left', () => {
		const { root, lotsPath, out } = prepare()
		const written = runHandover({ argv: [lotsPath] })
		expect(written.exitCode).toBe(0)
		expect(written.output.split('\n').slice(1, 3)).toEqual([
			expect.stringMatching(
				new RegExp(
					`^  ${'lot'} 1  1 file\\(s\\)  \\+3 -1  [0-9a-f]{12}  feat\\(read\\): read answers one$`,
				),
			),
			expect.stringMatching(
				new RegExp(
					`^  ${'lot'} 2  1 file\\(s\\)  \\+3 -0  [0-9a-f]{12}  docs\\(changelog\\): read$`,
				),
			),
		])
		expect(written.output).toContain(`cd ${JSON.stringify(out)} && bash commit.sh`)
		const lockPath = join(root, '.git', 'dialecte-handover.lock')
		expect(readFileSync(lockPath, 'utf8')).toBe(`${join(out, 'commit.sh')}\n`)

		const result = runScript(out)

		expect(result).toMatchObject({ status: 0, stderr: '' })
		expect(
			git({ root, args: ['log', '--format=%s', '-3'] })
				.trim()
				.split('\n'),
		).toEqual(['docs(changelog): read', 'feat(read): read answers one', 'chore: start'])
		expect(git({ root, args: ['log', '--format=%b', '-1', 'HEAD~1'] }).trim()).toBe('The body.')
		expect(git({ root, args: ['status', '--porcelain'] })).toBe('')
		expect(existsSync(lockPath)).toBe(false)
	})

	it('a plan tag in an eval prompt under skills/ → refused when the script is written', () => {
		const { lotsPath } = prepare({
			files: { 'skills/demo/evals/case/prompt.md': `You implement ${'lot'} T5.\n` },
			lots: [{ paths: ['skills/'], message: 'feat(skills): an eval case' }],
		})

		const result = runHandover({ argv: [lotsPath] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('skills/demo/evals/case/prompt.md:1: plan tag')
	})

	it('another branch, another HEAD and a staged file → each refused', () => {
		const { root, lotsPath } = prepare()
		git({ root, args: ['checkout', '-q', '-b', 'other'] })
		git({ root, args: ['add', 'CHANGELOG.md'] })

		const result = runHandover({ argv: [lotsPath] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('expected branch main, the repository is on other')
		expect(result.output).toContain('something is staged already')
		git({ root, args: ['reset', '-q'] })
		git({ root, args: ['checkout', '-q', 'main'] })
		git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: moved'] })
		expect(runHandover({ argv: [lotsPath] }).output).toContain('expected HEAD')
	})

	it('a file changed outside the lots after the hand-over → the script refuses', () => {
		const { root, lotsPath, out } = prepare()
		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		writeFiles({ root, files: { 'src/other.ts': 'export function other() {}\n' } })

		const result = runScript(out)

		expect(result.status).toBe(1)
		expect(result.stderr).toContain('src/other.ts')
		expect(result.stderr).toContain('Files changed outside the lots')
	})

	it('written already → refused without --rehash; --rehash after an edit → the script runs', () => {
		const { root, lotsPath, out } = prepare()
		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(2)
		expect(runHandover({ argv: [lotsPath, '--rehash'] }).exitCode).toBe(0)
		expect(runScript(out).status).toBe(0)
		expect(git({ root, args: ['show', 'HEAD~1:src/read.ts'] })).toContain('return 2')
	})

	it('the repository held by another hand-over → refused', () => {
		const { lotsPath } = prepare()
		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		const otherOut = temporaryFolder('dialecte-handover-')

		const result = runHandover({ argv: [lotsPath, '--out', otherOut] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('the repository is held by')
	})

	it('a deleted file in a lot → committed as a deletion', () => {
		const { root, lotsPath, out } = prepare({
			files: { 'CHANGELOG.md': '# Changelog\n' },
			lots: [
				{ paths: ['src/read.ts'], message: 'refactor(read): read goes' },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
			],
		})
		rmSync(join(root, 'src/read.ts'))

		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		expect(runScript(out).status).toBe(0)
		expect(git({ root, args: ['ls-files', 'src'] })).toBe('')
	})

	it('a multi-line gates text → kept as comment lines of the header, never run', () => {
		const { lotsPath, out } = prepare({
			overrides: { gates: 'npm run check (219 tests)\ntouch INJECTED\n# and more' },
		})

		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		const header = readFileSync(join(out, 'commit.sh'), 'utf8').split('\n').slice(1, 7)
		expect(runScript(out).status).toBe(0)

		expect(existsSync(join(out, 'INJECTED'))).toBe(false)
		expect(header.every((line) => line.startsWith('#'))).toBe(true)
	})

	it('an empty or too short head, or a branch on two lines → usage error, nothing written', () => {
		for (const overrides of [{ head: '' }, { head: 'abc' }, { branch: 'main\nmain' }]) {
			const { lotsPath, out } = prepare({ overrides })

			const result = runHandover({ argv: [lotsPath] })

			expect({ overrides, exitCode: result.exitCode }).toEqual({ overrides, exitCode: 2 })
			expect(existsSync(join(out, 'commit.sh'))).toBe(false)
		}
	})

	it('a tag added to the second message after the hand-over → the script refuses before the first commit', () => {
		const { root, lotsPath, out } = prepare()
		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		const head = headOf(root)
		writeFileSync(join(out, 'lot2.msg'), `docs(changelog): read (${'#'}3102)\n`)

		const result = runScript(out)

		expect(result.status).toBe(1)
		expect(result.stderr).toContain('A plan tag or a standard citation in')
		expect(headOf(root)).toBe(head)
	})

	it('a lot of several files → its subject line printed after its commit, with every file', () => {
		const { lotsPath, out } = prepare({
			files: {
				'src/a.ts': 'export function a() {}\n',
				'src/b.ts': 'export function b() {}\n',
				'src/c.ts': 'export function c() {}\n',
				'src/d.ts': 'export function d() {}\n',
			},
			lots: [{ paths: ['src/'], message: 'feat(letters): four functions' }],
		})
		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)

		const result = runScript(out)

		expect(result.status).toBe(0)
		expect(result.stdout).toMatch(/^[0-9a-f]{7,} feat\(letters\): four functions$/m)
		expect(result.stdout).toContain('src/a.ts')
	})

	it('a file name with accents → covered by its lot, committed by the script', () => {
		const { root, lotsPath, out } = prepare({
			files: { 'src/été.ts': 'export function summer() {}\n', 'CHANGELOG.md': '# Changelog\n' },
		})

		expect(runHandover({ argv: [lotsPath] }).output).toContain('handover: 2 lot(s), 2 file(s)')
		expect(runScript(out).status).toBe(0)
		expect(git({ root, args: ['-c', 'core.quotePath=false', 'ls-files', 'src'] })).toContain(
			'src/été.ts',
		)
	})

	it('a colour in an svg → not a ticket number, the hand-over goes through', () => {
		const { lotsPath, out } = prepare({
			files: {
				'doc/logo.svg': `<svg><rect fill="${'#'}123456"/></svg>\n`,
				'CHANGELOG.md': '# Changelog\n',
			},
			lots: [
				{ paths: ['doc/'], message: 'docs(logo): a logo' },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): logo' },
			],
		})

		expect(runHandover({ argv: [lotsPath] }).exitCode).toBe(0)
		expect(runScript(out).status).toBe(0)
	})
})
