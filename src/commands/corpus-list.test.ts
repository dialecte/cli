/** `dialecte corpus list` through `runCorpus`: the open sources with their cache state, the licensed entries of config.yml. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	createCorpusWorkspace,
	reviewedSource,
	serveFiles,
	sha256Of,
} from '../../test/corpus-fixtures.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runCorpus } from './corpus.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { CorpusWorkspace, FixtureServer } from '../../test/corpus-fixtures.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { CorpusManifest, ManifestSource } from '../lib/corpus/corpus.types.ts'

const SCHEMA = '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>\n'
const INSTANCE = '<root/>\n'

function corpus(params: {
	workspace: CorpusWorkspace
	manifest: CorpusManifest
	argv: string[]
}): Promise<CommandResult> {
	const { workspace } = params
	return runCorpus({
		cwd: workspace.root,
		argv: params.argv,
		environment: workspace.environment,
		platform: process.platform,
		home: workspace.home,
		shipped: {
			manifest: params.manifest,
			overrides: temporaryFolder('dialecte-corpus-overrides-'),
		},
	})
}

async function serverOf(routes: Readonly<Record<string, Uint8Array>>): Promise<FixtureServer> {
	const server = await serveFiles(routes)
	onTestFinished(() => server.close())
	return server
}

/** One file of source `id` served by `server`, with its pin. */
function servedFile(params: { id: string; server: FixtureServer; path: string; text: string }): {
	url: string
	sha256: string
} {
	return {
		url: params.server.urlOf(`/${params.id}/${params.path}`),
		sha256: sha256Of(Buffer.from(params.text)),
	}
}

/** A source `id` of one schema and two instances, served by `server`. */
function sourceOf(params: {
	id: string
	server: FixtureServer
	extra?: Partial<ManifestSource>
}): ManifestSource {
	return reviewedSource({
		id: params.id,
		verdict: 'schemas-only',
		license: 'Apache-2.0',
		fetch: {
			kind: 'files',
			files: {
				'schema.xsd': servedFile({ ...params, path: 'schema.xsd', text: SCHEMA }),
				'samples/one.xml': servedFile({ ...params, path: 'samples/one.xml', text: INSTANCE }),
				'samples/two.xml': servedFile({ ...params, path: 'samples/two.xml', text: INSTANCE }),
			},
		},
		entries: ['schema.xsd'],
		instances: ['samples/*.xml'],
		...params.extra,
	})
}

function routesOf(id: string): Record<string, Uint8Array> {
	return {
		[`/${id}/schema.xsd`]: Buffer.from(SCHEMA),
		[`/${id}/samples/one.xml`]: Buffer.from(INSTANCE),
		[`/${id}/samples/two.xml`]: Buffer.from(INSTANCE),
	}
}

/** Writes the personal config.yml of the workspace with its `corpora:` lines. */
function writePersonalCorpora(params: { workspace: CorpusWorkspace; corpora: string }): void {
	const folder = join(params.workspace.configHome, 'dialecte')
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, 'config.yml'), `# personal\nschema: 1\ncorpora:\n${params.corpora}`)
}

describe('corpus list', () => {
	it('lists every open source with its verdict and state, fetched or missing, and exits 0', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({ ...routesOf('alpha'), ...routesOf('beta') })
		const manifest: CorpusManifest = {
			sources: [sourceOf({ id: 'alpha', server }), sourceOf({ id: 'beta', server })],
		}
		const fetched = await corpus({ workspace, manifest, argv: ['fetch', 'alpha'] })
		expect(fetched.exitCode).toBe(0)

		const result = await corpus({ workspace, manifest, argv: ['list', '--json'] })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(result.output)).toEqual({
			cache: workspace.cache,
			corpora: [
				{
					name: 'alpha',
					source: 'open',
					verdict: 'schemas-only',
					license: 'Apache-2.0',
					state: 'fetched',
					folder: join(workspace.cache, 'alpha'),
					entries: [join(workspace.cache, 'alpha', 'schema.xsd')],
					instances: { folder: join(workspace.cache, 'alpha'), globs: ['samples/*.xml'] },
					instanceCount: 2,
				},
				{
					name: 'beta',
					source: 'open',
					verdict: 'schemas-only',
					license: 'Apache-2.0',
					state: 'missing',
					folder: join(workspace.cache, 'beta'),
					entries: [],
					instances: { folder: join(workspace.cache, 'beta'), globs: ['samples/*.xml'] },
					instanceCount: 0,
				},
			],
		})
	})

	it('reads a source fetched from another manifest entry as stale', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf(routesOf('alpha'))
		const fetched = await corpus({
			workspace,
			manifest: { sources: [sourceOf({ id: 'alpha', server })] },
			argv: ['fetch'],
		})
		expect(fetched.exitCode).toBe(0)
		const changed: CorpusManifest = {
			sources: [sourceOf({ id: 'alpha', server, extra: { exclude: ['*.txt'] } })],
		}

		const result = await corpus({ workspace, manifest: changed, argv: ['list', '--json'] })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(result.output).corpora[0]).toMatchObject({ name: 'alpha', state: 'stale' })
	})

	it('lists a licensed entry of config.yml as licensed, schemas-only, missing when its files are absent', async () => {
		const workspace = createCorpusWorkspace()
		const material = temporaryFolder('dialecte-corpus-licensed-')
		const xsd = join(material, 'Licensed.xsd')
		const instances = join(material, 'files')
		writeFileSync(xsd, SCHEMA)
		mkdirSync(join(instances, 'deeper'), { recursive: true })
		writeFileSync(join(instances, 'one.scd'), INSTANCE)
		writeFileSync(join(instances, 'deeper', 'two.scd'), INSTANCE)
		writePersonalCorpora({
			workspace,
			corpora: `  licensed-a: { xsd: ${xsd}, instances: ${instances} }\n  licensed-b: { xsd: ${join(material, 'Gone.xsd')} }\n`,
		})

		const result = await corpus({ workspace, manifest: { sources: [] }, argv: ['list', '--json'] })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(result.output).corpora).toEqual([
			{
				name: 'licensed-a',
				source: 'licensed',
				verdict: 'schemas-only',
				state: 'present',
				entries: [xsd],
				instances: { folder: instances, globs: ['*'] },
				instanceCount: 2,
			},
			{
				name: 'licensed-b',
				source: 'licensed',
				verdict: 'schemas-only',
				state: 'missing',
				entries: [join(material, 'Gone.xsd')],
				instanceCount: 0,
			},
		])
	})

	it('prints one line per corpus without --json', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf(routesOf('alpha'))
		const manifest: CorpusManifest = { sources: [sourceOf({ id: 'alpha', server })] }

		const result = await corpus({ workspace, manifest, argv: ['list'] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n')).toContain('alpha  open  schemas-only  missing  0 instances')
	})
})
