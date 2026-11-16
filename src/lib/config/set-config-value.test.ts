/** The writer: edits one value of a config file keeping the rest byte for byte, creates a missing file with its header. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readConfigFile } from './read-config-file.ts'
import { setConfigValue } from './set-config-value.ts'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import type { ConfigLayer } from './config.types.ts'

const PROJECT_HEADER = '# Dialecte project settings - shared, committed\nschema: 1\n'
const PERSONAL_HEADER = '# Dialecte personal settings - this machine, never committed\nschema: 1\n'

/** A folder holding `name` with `text` (no file when `text` is undefined); the path of the file. */
function fileOf(params: { name: string; text?: string }): string {
	const folder = temporaryFolder('dialecte-config-writer-')
	if (params.text !== undefined) writeFiles({ root: folder, files: { [params.name]: params.text } })
	return join(folder, params.name)
}

/** The text of a file. */
function textOf(file: string): string {
	return readFileSync(file, 'utf8')
}

/** The value of a top-level key as the file reads back (undefined when the file or the key is missing). */
function entryValueOf(params: { file: string; key: string }): unknown {
	const read = readConfigFile({ file: params.file, layer: 'project' })
	return read.missing ? undefined : read.entries.find((entry) => entry.key === params.key)?.value
}

describe('setConfigValue, exact bytes', { timeout: STORE_CASE_TIMEOUT }, () => {
	const CASES: {
		name: string
		layer: ConfigLayer
		fileName: string
		before?: string
		path: string
		value: unknown
		repo?: string
		after: string
	}[] = [
		{
			name: 'a missing project file → header, schema, the value',
			layer: 'project',
			fileName: '.dialecterc',
			path: 'baseBranch',
			value: 'develop',
			after: `${PROJECT_HEADER}baseBranch: develop\n`,
		},
		{
			name: 'a missing personal file → its own header and a nested value',
			layer: 'personal',
			fileName: 'dialecte/config.yml',
			path: 'load.budget',
			value: 10,
			after: `${PERSONAL_HEADER}load:\n  budget: 10\n`,
		},
		{
			name: 'a missing personal file with a repo → under repos',
			layer: 'personal',
			fileName: 'dialecte/config.yml',
			path: 'editor',
			value: 'zed',
			repo: 'github.com/example/repo',
			after: `${PERSONAL_HEADER}repos:\n  github.com/example/repo:\n    editor: zed\n`,
		},
		{
			name: 'a changed scalar keeps the comments around it and the blank lines',
			layer: 'project',
			fileName: '.dialecterc',
			before: '# top comment\nschema: 1\n\n# the branch\nbaseBranch: main # trailing\n\n# end\n',
			path: 'baseBranch',
			value: 'develop',
			after: '# top comment\nschema: 1\n\n# the branch\nbaseBranch: develop # trailing\n\n# end\n',
		},
		{
			name: 'a new nested key is added at the end, the rest untouched',
			layer: 'project',
			fileName: '.dialecterc',
			before: '# c\nschema: 1\nbaseBranch: main\n',
			path: 'tdd.runner',
			value: 'vitest',
			after: '# c\nschema: 1\nbaseBranch: main\ntdd:\n  runner: vitest\n',
		},
		{
			name: 'a CRLF file keeps its line endings, every untouched line identical (D23)',
			layer: 'project',
			fileName: '.dialecterc',
			before: '# c\r\nschema: 1\r\n\r\nbaseBranch: main # b\r\ngate:\r\n  fast: [check]\r\n',
			path: 'baseBranch',
			value: 'develop',
			after: '# c\r\nschema: 1\r\n\r\nbaseBranch: develop # b\r\ngate:\r\n  fast: [check]\r\n',
		},
		{
			name: 'a new key in a CRLF file is added with CRLF too (D23)',
			layer: 'project',
			fileName: '.dialecterc',
			before: 'schema: 1\r\nbaseBranch: main\r\n',
			path: 'tdd.runner',
			value: 'vitest',
			after: 'schema: 1\r\nbaseBranch: main\r\ntdd:\r\n  runner: vitest\r\n',
		},
		{
			name: 'a repo entry is appended after the other repositories',
			layer: 'personal',
			fileName: 'dialecte/config.yml',
			before: 'schema: 1\neditor: code\nrepos:\n  github.com/example/other:\n    editor: vim\n',
			path: 'editor',
			value: 'zed',
			repo: 'github.com/example/repo',
			after:
				'schema: 1\neditor: code\nrepos:\n  github.com/example/other:\n    editor: vim\n  github.com/example/repo:\n    editor: zed\n',
		},
		{
			name: 'an existing repo entry is changed in place, the top level untouched',
			layer: 'personal',
			fileName: 'dialecte/config.yml',
			before: 'schema: 1\neditor: code\nrepos:\n  github.com/example/repo:\n    editor: vim\n',
			path: 'editor',
			value: 'zed',
			repo: 'github.com/example/repo',
			after: 'schema: 1\neditor: code\nrepos:\n  github.com/example/repo:\n    editor: zed\n',
		},
		{
			name: 'a 4-space file: gate.fast replaced, its sibling kept, written with its own indent',
			layer: 'project',
			fileName: '.dialecterc',
			before: 'schema: 1\ngate:\n    fast: [a]\n    full: [b]\n',
			path: 'gate.fast',
			value: ['c'],
			after: 'schema: 1\ngate:\n    fast: [c]\n    full: [b]\n',
		},
		{
			name: 'a 4-space file: a new nested key joins its parent with 4 spaces',
			layer: 'project',
			fileName: '.dialecterc',
			before: 'schema: 1\ngate:\n    fast: [a]\n',
			path: 'gate.full',
			value: ['b'],
			after: 'schema: 1\ngate:\n    fast: [a]\n    full: [b]\n',
		},
		{
			name: 'a 4-space repos: map: the new entry is appended with 4 and 8 spaces',
			layer: 'personal',
			fileName: 'dialecte/config.yml',
			before: 'schema: 1\nrepos:\n    github.com/example/other:\n        editor: vim\n',
			path: 'editor',
			value: 'zed',
			repo: 'github.com/example/repo',
			after:
				'schema: 1\nrepos:\n    github.com/example/other:\n        editor: vim\n    github.com/example/repo:\n        editor: zed\n',
		},
		{
			name: 'block-scalar content never sets the indent: 2-space file, the note block kept byte for byte',
			layer: 'project',
			fileName: '.dialecterc',
			before: 'schema: 1\nnote: |\n    see: x\ngate:\n  fast: [a]\n',
			path: 'gate.full',
			value: ['b'],
			after: 'schema: 1\nnote: |\n    see: x\ngate:\n  fast: [a]\n  full: [b]\n',
		},
		{
			name: 'an entry spelled as the https remote is the same repository: changed in place, never duplicated',
			layer: 'personal',
			fileName: 'dialecte/config.yml',
			before: 'schema: 1\nrepos:\n  https://github.com/example/repo.git:\n    editor: vim\n',
			path: 'editor',
			value: 'zed',
			repo: 'github.com/example/repo',
			after: 'schema: 1\nrepos:\n  https://github.com/example/repo.git:\n    editor: zed\n',
		},
	]

	it.each(CASES)('$name', ({ layer, fileName, before, path, value, repo, after }) => {
		const file = fileOf({ name: fileName, text: before })

		expect(setConfigValue({ file, layer, path, value, repo })).toBeUndefined()
		expect(textOf(file)).toEqual(after)
	})
})

describe('setConfigValue, a splice that cannot hold', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('mixed indents (gate at 2, a sibling map at 4) → the written text parses and reads back as the edited document', () => {
		const file = fileOf({
			name: '.dialecterc',
			text: 'schema: 1\ngate:\n  fast: [a]\ntdd:\n    runner: vitest\n',
		})

		expect(
			setConfigValue({ file, layer: 'project', path: 'tdd.extra', value: ['p'] }),
		).toBeUndefined()

		expect(parse(textOf(file))).toEqual({
			schema: 1,
			gate: { fast: ['a'] },
			tdd: { runner: 'vitest', extra: ['p'] },
		})
	})
})

describe('setConfigValue, a list value', { timeout: STORE_CASE_TIMEOUT }, () => {
	const BEFORE = [
		'# Dialecte project settings - shared, committed',
		'',
		'tdd: { runner: vitest }',
		'schema: 1',
		'# the base',
		'baseBranch: main',
		'',
		'gate:',
		'  # the fast steps',
		'  fast: [check, test]',
		'  full: [check, build] # the full ones',
		'',
		'# the end',
		'',
	]

	it('replaces gate.fast: the lines before and after are identical, the value reads back', () => {
		const file = fileOf({ name: '.dialecterc', text: BEFORE.join('\n') })
		expect(
			setConfigValue({ file, layer: 'project', path: 'gate.fast', value: ['check'] }),
		).toBeUndefined()
		const lines = textOf(file).split('\n')
		const fastLine = lines.findIndex((line) => line.startsWith('  fast:'))
		const fullLine = lines.findIndex((line) => line.startsWith('  full:'))

		expect({
			head: lines.slice(0, fastLine),
			tail: lines.slice(fullLine),
			between: entryValueOf({ file, key: 'gate' }),
		}).toEqual({
			head: BEFORE.slice(0, 9),
			tail: BEFORE.slice(10),
			between: { fast: ['check'], full: ['check', 'build'] },
		})
	})

	it('a new file holding a list reads back as that list', () => {
		const file = fileOf({ name: 'dialecte/config.yml' })
		expect(
			setConfigValue({ file, layer: 'personal', path: 'personProcesses', value: ['zsh', 'node'] }),
		).toBeUndefined()

		expect({
			read: readConfigFile({ file, layer: 'personal' }),
		}).toEqual({
			read: {
				missing: false,
				file,
				entries: [{ key: 'personProcesses', value: ['zsh', 'node'], line: 3 }],
				repos: [],
				findings: [],
			},
		})
	})
})
