/** `dialecte corpus add` through `runCorpus`: the personal `corpora:` entry written, the file's comments kept. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createCorpusWorkspace } from '../../test/corpus-fixtures.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runCorpus } from './corpus.ts'

import { describe, expect, it } from 'vitest'

import type { CorpusWorkspace } from '../../test/corpus-fixtures.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

function corpus(params: {
	workspace: CorpusWorkspace
	argv: string[]
	cwd?: string
}): Promise<CommandResult> {
	const { workspace } = params
	return runCorpus({
		cwd: params.cwd ?? workspace.root,
		argv: params.argv,
		environment: workspace.environment,
		platform: process.platform,
		home: workspace.home,
		shipped: {
			manifest: { sources: [] },
			overrides: temporaryFolder('dialecte-corpus-overrides-'),
		},
	})
}

function personalFile(workspace: CorpusWorkspace): string {
	return join(workspace.configHome, 'dialecte', 'config.yml')
}

describe('corpus add', () => {
	it('writes the entry with absolute paths into config.yml, keeping its comments, and lists it', async () => {
		const workspace = createCorpusWorkspace()
		const material = temporaryFolder('dialecte-corpus-licensed-')
		writeFileSync(
			join(material, 'Licensed.xsd'),
			'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>\n',
		)
		mkdirSync(join(material, 'files'))
		mkdirSync(join(workspace.configHome, 'dialecte'), { recursive: true })
		writeFileSync(personalFile(workspace), '# my settings\nschema: 1\neditor: zed # the editor\n')

		const added = await corpus({
			workspace,
			cwd: material,
			argv: ['add', 'licensed-a', '--xsd', 'Licensed.xsd', '--instances', 'files'],
		})
		const listed = await corpus({ workspace, argv: ['list', '--json'] })

		expect(added.exitCode).toBe(0)
		const text = readFileSync(personalFile(workspace), 'utf8')
		expect(text).toContain('# my settings')
		expect(text).toContain('editor: zed # the editor')
		expect(JSON.parse(listed.output).corpora).toEqual([
			expect.objectContaining({
				name: 'licensed-a',
				source: 'licensed',
				state: 'present',
				entries: [join(material, 'Licensed.xsd')],
				instances: { folder: join(material, 'files'), globs: ['*'] },
			}),
		])
	})

	it.each([
		{
			case: 'an XSD that does not exist',
			argv: ['add', 'licensed-a', '--xsd', '/nowhere/Gone.xsd'],
			reason: 'no file /nowhere/Gone.xsd',
		},
		{ case: 'no --xsd', argv: ['add', 'licensed-a'], reason: 'needs --xsd' },
		{
			case: 'a name holding a dot',
			argv: ['add', 'licensed.a', '--xsd', '/nowhere/Gone.xsd'],
			reason: "name 'licensed.a'",
		},
	])('refuses $case with exit 2 and its reason, writing nothing', async ({ argv, reason }) => {
		const workspace = createCorpusWorkspace()

		const result = await corpus({ workspace, argv })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain(reason)
		expect(() => readFileSync(personalFile(workspace), 'utf8')).toThrow()
	})
})
