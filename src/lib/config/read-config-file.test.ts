/** One config file read: entries and lines, the repos: entries, the file findings, CRLF like LF. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readConfigFile } from './read-config-file.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigFileRead, ConfigFinding } from './config.types.ts'

const PERSONAL_TEXT = [
	'# personal settings',
	'schema: 1',
	'editor: zed  # inline comment',
	'load:',
	'  budget: 4',
	'',
	'repos:',
	'  github.com/example/repo:',
	'    editor: code',
	'    personProcesses: [zsh, node]',
	'',
].join('\n')

const PROJECT_TEXT = [
	'# project settings',
	'schema: 1',
	'baseBranch: main',
	'gate:',
	'  fast: [check]',
	'',
].join('\n')

/** Writes `text` to a file of a temporary folder. */
function writeText(text: string): string {
	const file = join(temporaryFolder('dialecte-config-file-'), 'file.yml')
	writeFileSync(file, text)
	return file
}

/** A read without its file path (two files of one text differ by it only). */
function withoutFile(read: ConfigFileRead): ConfigFileRead {
	return { ...read, file: '' }
}

/** A finding on `schema` or at `line`, its wording free. */
function finding(params: { file: string; line: number; key?: string }): ConfigFinding {
	return { ...params, problem: expect.stringMatching(/\S/) as unknown as string }
}

describe('readConfigFile', () => {
	it('a personal file → entries and repos with their lines, comments ignored, schema not an entry', () => {
		const file = writeText(PERSONAL_TEXT)
		const layer = 'personal'

		expect(readConfigFile({ file, layer })).toEqual({
			missing: false,
			file,
			entries: [
				{ key: 'editor', value: 'zed', line: 3 },
				{ key: 'load', value: { budget: 4 }, line: 4 },
			],
			repos: [
				{
					repo: 'github.com/example/repo',
					line: 8,
					entries: [
						{ key: 'editor', value: 'code', line: 9 },
						{ key: 'personProcesses', value: ['zsh', 'node'], line: 10 },
					],
				},
			],
			findings: [],
		})
	})

	it('a project file → entries with their lines, no repos', () => {
		const file = writeText(PROJECT_TEXT)
		const layer = 'project'

		expect(readConfigFile({ file, layer })).toEqual({
			missing: false,
			file,
			entries: [
				{ key: 'baseBranch', value: 'main', line: 3 },
				{ key: 'gate', value: { fast: ['check'] }, line: 4 },
			],
			repos: [],
			findings: [],
		})
	})

	it.each([
		{ layer: 'personal', text: PERSONAL_TEXT },
		{ layer: 'project', text: PROJECT_TEXT },
	] as const)('the same $layer text with CRLF reads like the LF text', ({ layer, text }) => {
		const lf = writeText(text)
		const crlf = writeText(text.replaceAll('\n', '\r\n'))

		expect(withoutFile(readConfigFile({ file: crlf, layer }))).toEqual(
			withoutFile(readConfigFile({ file: lf, layer })),
		)
	})

	it('a missing file → missing', () => {
		const file = join(temporaryFolder('dialecte-config-file-'), 'absent.yml')

		expect(readConfigFile({ file, layer: 'personal' })).toEqual({ missing: true, file })
	})

	it('not YAML → one finding on the line of the error, no entry', () => {
		const file = writeText('schema: 1\neditor: zed\neditor: code\n')
		const layer = 'personal'

		expect(readConfigFile({ file, layer })).toEqual({
			missing: false,
			file,
			entries: [],
			repos: [],
			findings: [finding({ file, line: 3 })],
		})
	})

	it('a list at top level → a finding, no entry', () => {
		const file = writeText('- schema\n- editor\n')
		const layer = 'personal'

		expect(readConfigFile({ file, layer })).toEqual({
			missing: false,
			file,
			entries: [],
			repos: [],
			findings: [finding({ file, line: 1 })],
		})
	})

	it('schema: 2 → a finding naming schema on its line, entries still read', () => {
		const file = writeText('# c\nschema: 2\neditor: zed\n')
		const layer = 'personal'

		expect(readConfigFile({ file, layer })).toEqual({
			missing: false,
			file,
			entries: [{ key: 'editor', value: 'zed', line: 3 }],
			repos: [],
			findings: [finding({ file, line: 2, key: 'schema' })],
		})
	})

	it('schema: "1" (a text) → the value printed as JSON, so it is not mistaken for the number', () => {
		const file = writeText('schema: "1"\neditor: zed\n')
		const layer = 'personal'

		expect(readConfigFile({ file, layer })).toEqual({
			missing: false,
			file,
			entries: [{ key: 'editor', value: 'zed', line: 2 }],
			repos: [],
			findings: [
				{
					file,
					line: 1,
					key: 'schema',
					problem: 'schema "1" is not the version this cli reads (1)',
				},
			],
		})
	})

	it('no schema → a finding naming schema (line 1), entries still read', () => {
		const file = writeText('editor: zed\n')
		const layer = 'personal'

		expect(readConfigFile({ file, layer })).toEqual({
			missing: false,
			file,
			entries: [{ key: 'editor', value: 'zed', line: 1 }],
			repos: [],
			findings: [finding({ file, line: 1, key: 'schema' })],
		})
	})

	it('a syntax error → one finding on the line of the error, no entry', () => {
		const file = writeText('schema: 1\neditor: zed\nload: {budget: 4\n')

		expect(readConfigFile({ file, layer: 'personal' })).toEqual({
			missing: false,
			file,
			entries: [],
			repos: [],
			findings: [finding({ file, line: 4 })],
		})
	})

	it('repos: in a project file → an ordinary entry, no repos', () => {
		const file = writeText('schema: 1\nrepos:\n  a: {}\n')

		expect(readConfigFile({ file, layer: 'project' })).toEqual({
			missing: false,
			file,
			entries: [{ key: 'repos', value: { a: {} }, line: 2 }],
			repos: [],
			findings: [],
		})
	})

	it('a path that is a folder → one finding at line 0, never a throw', () => {
		const file = join(temporaryFolder('dialecte-config-file-'), '.dialecterc')
		mkdirSync(file)

		expect(readConfigFile({ file, layer: 'project' })).toEqual({
			missing: false,
			file,
			entries: [],
			repos: [],
			findings: [finding({ file, line: 0 })],
		})
	})
})
