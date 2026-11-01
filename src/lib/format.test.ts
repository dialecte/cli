import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { formatFiles, formatOptsFromArgv } from './format.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** Each case starts a fake oxfmt (a shell script): the bound leaves room on a loaded machine. */
const FAKE_OXFMT_TIMEOUT = 20_000

/** The warning line `formatFiles` prints when oxfmt fails. */
const EXITED_WARNING = /^ {2}⚠ oxfmt exited (\d+|\?) — emitted files may be unformatted$/

/** Twelve files to format: more than the warning names. */
const TWELVE_FILES = Array.from(
	{ length: 12 },
	(_unused, index) => `src/file-${String(index + 1).padStart(2, '0')}.ts`,
)

const made: string[] = []
afterEach(() => {
	vi.restoreAllMocks()
	for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A project root whose `node_modules/.bin/oxfmt` is `script` (executable unless said otherwise). */
function rootWithOxfmt(params: { script: string; executable?: boolean }): {
	root: string
	oxfmt: string
} {
	const root = mkdtempSync(join(tmpdir(), 'dialecte-cli-format-'))
	made.push(root)
	const bin = join(root, 'node_modules/.bin')
	mkdirSync(bin, { recursive: true })
	const oxfmt = join(bin, 'oxfmt')
	writeFileSync(oxfmt, `#!/bin/sh\n${params.script}\n`)
	chmodSync(oxfmt, params.executable === false ? 0o644 : 0o755)
	return { root, oxfmt }
}

/** Every line `console.warn` printed while `run` ran, and what `run` answered. */
function warnedLines(run: () => boolean): { answer: boolean; lines: string[] } {
	const printed: string[] = []
	vi.spyOn(console, 'warn').mockImplementation(function captureWarning(...values: unknown[]) {
		printed.push(values.map(String).join(' '))
	})
	const answer = run()
	return { answer, lines: printed.join('\n').split('\n') }
}

/** The leading spaces of a line. */
function indentOf(line: string): number {
	return line.length - line.trimStart().length
}

describe('formatOptsFromArgv', () => {
	it('reads --format-config and --no-format', () => {
		expect(formatOptsFromArgv(['--format-config', 'x.json'])).toEqual({
			config: 'x.json',
			skip: false,
		})
		expect(formatOptsFromArgv(['--no-format'])).toEqual({ config: undefined, skip: true })
		expect(formatOptsFromArgv([])).toEqual({ config: undefined, skip: false })
	})
})

describe('formatFiles', () => {
	it('is a no-op when skip is set or no files given', () => {
		expect(() =>
			formatFiles({ root: '/nonexistent', files: ['/x.json'], options: { skip: true } }),
		).not.toThrow()
		expect(() => formatFiles({ root: '/nonexistent', files: [] })).not.toThrow()
	})
	it('warns but never throws when oxfmt is absent from the project', () => {
		// /tmp has no node_modules/.bin/oxfmt — must degrade gracefully, never crash a command.
		expect(() => formatFiles({ root: '/tmp', files: ['/x.json'] })).not.toThrow()
	})
})

describe('formatFiles: a failing oxfmt says why', { timeout: FAKE_OXFMT_TIMEOUT }, () => {
	it('oxfmt exits 2 on twelve files, printing on stderr and stdout → false; the warning, then indented under it the first ten files, and 2 more, and its stderr lines; not its stdout', () => {
		const { root } = rootWithOxfmt({
			script: [
				"echo 'Checking formatting...'",
				"echo 'x Unexpected token at src/file-03.ts:4:2' >&2",
				"echo '  help: remove the stray brace' >&2",
				'exit 2',
			].join('\n'),
		})

		const { answer, lines } = warnedLines(() => formatFiles({ root, files: TWELVE_FILES }))

		const [warning, ...under] = lines
		const text = under.join('\n')
		expect(answer).toBe(false)
		expect(warning).toBe('  ⚠ oxfmt exited 2 — emitted files may be unformatted')
		expect(under.length).toBeGreaterThan(0)
		expect(under.filter((line) => indentOf(line) <= indentOf(warning))).toEqual([])
		expect(TWELVE_FILES.slice(0, 10).filter((file) => !text.includes(file))).toEqual([])
		expect(TWELVE_FILES.slice(10).filter((file) => text.includes(file))).toEqual([])
		expect(text).toContain('and 2 more')
		expect(under.map((line) => line.trim())).toEqual(
			expect.arrayContaining([
				'x Unexpected token at src/file-03.ts:4:2',
				'help: remove the stray brace',
			]),
		)
		expect(text).not.toContain('Checking formatting...')
	})

	it('oxfmt exits 1 printing on stdout only, on two absolute files → false; under the warning both files as given, no "more", and its stdout line', () => {
		const { root } = rootWithOxfmt({
			script: ["echo 'src/a.ts (3ms)'", 'exit 1'].join('\n'),
		})
		const files = [join(root, 'src/a.ts'), join(root, 'src/b.ts')]

		const { answer, lines } = warnedLines(() => formatFiles({ root, files }))

		const [warning, ...under] = lines
		const text = under.join('\n')
		expect(answer).toBe(false)
		expect(warning).toMatch(EXITED_WARNING)
		expect(under.filter((line) => indentOf(line) <= indentOf(warning))).toEqual([])
		expect(files.filter((file) => !text.includes(file))).toEqual([])
		expect(text).not.toMatch(/\bmore\b/)
		expect(under.map((line) => line.trim())).toContain('src/a.ts (3ms)')
	})

	it('oxfmt that cannot start (not executable) → false, never throws; the warning names the error message', () => {
		const { root, oxfmt } = rootWithOxfmt({ script: 'exit 0', executable: false })
		const startError = spawnSync(oxfmt, [], { encoding: 'utf8' }).error?.message ?? ''

		const { answer, lines } = warnedLines(() => formatFiles({ root, files: ['src/a.ts'] }))

		expect(startError).not.toBe('')
		expect(answer).toBe(false)
		expect(lines.join('\n')).toContain(startError)
	})
})
