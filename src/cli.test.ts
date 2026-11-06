import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { temporaryFolder } from '../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, 'cli.ts')

/** The forms of the commands renamed in 1.0, as a line would cite them. */
const OLD_FORM_PATTERN = /dialecte (?:record |review delta|recap)/

/** The bare forms and the old message prefixes, as a hint or a message would cite them without `dialecte`. */
const BARE_OLD_FORM_PATTERN =
	/\b(?:record (?:review|decision|snapshot|choice|standard)|review delta)\b|[`'"](?:record|recap): /

/**
 * The one file name that may hold the literal old forms: the table of the renamed commands. A source file
 * whose name matches it is left out of the scan; every other source cites the new forms only.
 */
const RENAMED_TABLE_FILE_PATTERN = /renamed[^/]*$/i

/** A line that only comments. */
const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/?\*)/

/** The files whose JSDoc header names the commands they were: cited nowhere in it now. */
const HEADER_FILES = [
	'commands/record.ts',
	'commands/review.ts',
	'commands/recap.ts',
	'lib/standard/record-standard.ts',
]

describe('the cli', { timeout: 30_000 }, () => {
	it('lock → an unknown command, exit 1, nothing run; the help lists no lock', () => {
		const marker = join(temporaryFolder('dialecte-cli-lock-'), 'ran')

		const run = spawnSync(
			process.execPath,
			[CLI_SOURCE, 'lock', 'run', '--no-wait', '--', 'touch', marker],
			{
				encoding: 'utf8',
				// a cli that still had the machine lock takes it here, never in the user's cache
				env: { ...process.env, DIALECTE_CACHE_DIR: temporaryFolder('dialecte-cli-cache-') },
			},
		)

		expect(run.status).toBe(1)
		expect(run.stderr).toContain('dialecte: unknown command "lock"')
		expect(run.stdout).not.toMatch(/^\s+lock\s/m)
		expect(run.stdout).not.toContain('dialecte lock')
		expect(run.stdout).not.toContain('--no-wait')
		expect(existsSync(marker)).toBe(false)
	})

	it('tdd without a subcommand → its usage names no --no-wait; the README names neither lock run nor --no-wait', () => {
		const usage = spawnSync(process.execPath, [CLI_SOURCE, 'tdd'], {
			encoding: 'utf8',
			cwd: temporaryFolder('dialecte-cli-tdd-'),
		})
		const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8')

		expect(usage.status).toBe(2)
		expect(`${usage.stdout}${usage.stderr}`).toContain('tdd: red | green | status')
		expect(`${usage.stdout}${usage.stderr}`).not.toContain('--no-wait')
		expect(readme).not.toContain('--no-wait')
		expect(readme).not.toContain('lock run')
	})

	it('--help lists contrib in the Check family', () => {
		const help = spawnSync(process.execPath, [CLI_SOURCE, '--help'], {
			encoding: 'utf8',
			cwd: temporaryFolder('dialecte-cli-help-'),
		})

		expect(help.stdout).toMatch(/^\s*Check\s+.*\bcontrib\b/m)
	})

	it('contrib in a folder whose package.json has no profile → exit 2, the consumer refusal', () => {
		const folder = temporaryFolder('dialecte-cli-contrib-')
		writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'app' }))

		const run = spawnSync(process.execPath, [CLI_SOURCE, 'contrib'], {
			encoding: 'utf8',
			cwd: folder,
		})

		expect(run.status).toBe(2)
		expect(run.stdout).toContain('contrib: no contributor checks in the consumer profile')
	})

	it('the README has a Profiles section naming dialecte contrib', () => {
		const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8')

		expect(readme).toContain('## Profiles')
		expect(readme).toContain('dialecte contrib')
	})

	it('no file under src/ (tests and the renamed table excepted) cites dialecte record, review delta or dialecte recap', () => {
		const sources = readdirSync(join(import.meta.dirname), { recursive: true, encoding: 'utf8' })
			.filter(
				(path) =>
					path.endsWith('.ts') &&
					!path.endsWith('.test.ts') &&
					!RENAMED_TABLE_FILE_PATTERN.test(path),
			)
			.map((path) => join(import.meta.dirname, path))

		const citations = sources.flatMap((path) => {
			const lines = readFileSync(path, 'utf8').split('\n')
			const headerEnd = HEADER_FILES.some((file) => path.endsWith(file))
				? lines.findIndex((line) => line.includes('*/'))
				: -1
			return lines
				.map((line, index) => ({
					line,
					index,
					at: `${relative(import.meta.dirname, path)}:${index + 1}`,
				}))
				.filter(
					({ line, index }) =>
						OLD_FORM_PATTERN.test(line) ||
						(BARE_OLD_FORM_PATTERN.test(line) &&
							(!COMMENT_LINE_PATTERN.test(line) || index < headerEnd)),
				)
				.map(({ at }) => at)
		})

		expect(citations).toEqual([])
	})

	it('the README has a "Renamed in 1.0" table and cites the old forms nowhere else', () => {
		const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8')
		const lines = readme.split('\n')
		const heading = lines.findIndex((line) => /^#{1,6} .*Renamed in 1\.0/.test(line))
		const level = heading < 0 ? 0 : (lines[heading].match(/^#+/)?.[0].length ?? 0)
		const next = lines.findIndex(
			(line, index) => index > heading && new RegExp(`^#{1,${Math.max(level, 1)}} `).test(line),
		)
		const section = heading < 0 ? [] : lines.slice(heading, next < 0 ? lines.length : next)
		const outside = lines.filter((line, index) => {
			const inside = heading >= 0 && index >= heading && index < heading + section.length
			return !inside && OLD_FORM_PATTERN.test(line)
		})

		expect(heading).toBeGreaterThanOrEqual(0)
		expect(section.filter((line) => line.startsWith('|')).length).toBeGreaterThanOrEqual(2 + 7)
		for (const renamed of [
			'lot finding',
			'lot decide',
			'lot snapshot',
			'lot choice',
			'lot standard',
			'lot delta',
			'lot recap',
		])
			expect(section.join('\n')).toContain(renamed)
		expect(outside).toEqual([])
	})

	it('the CHANGELOG [Unreleased] has Breaking bullets naming the renames and the per-command help', () => {
		const changelog = readFileSync(join(import.meta.dirname, '..', 'CHANGELOG.md'), 'utf8')
		const start = changelog.indexOf('## [Unreleased]')
		const end = changelog.indexOf('\n## [', start + 1)
		const unreleased = start < 0 ? '' : changelog.slice(start, end < 0 ? undefined : end)
		const breaking = unreleased
			.split('\n')
			.filter((line) => /^- \*\*Breaking:?\*\*/.test(line))
			.join('\n')

		expect(breaking).not.toBe('')
		for (const renamed of [
			'lot finding',
			'lot decide',
			'lot snapshot',
			'lot choice',
			'lot standard',
			'lot delta',
			'lot recap',
		])
			expect(breaking).toContain(renamed)
		expect(breaking).toContain('--help')
	})
})
