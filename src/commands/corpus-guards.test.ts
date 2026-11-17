/** `dialecte corpus` guards: reserved and bad ids, path forms, verdict and pin shapes, redirects, a half-removed tree, the fetch lock. */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	createCorpusWorkspace,
	reviewedSource,
	serveFiles,
	serveRedirect,
	sha256Of,
	zipOf,
} from '../../test/corpus-fixtures.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runCorpus } from './corpus.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { CorpusWorkspace, FixtureServer } from '../../test/corpus-fixtures.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { CorpusManifest, ManifestSource } from '../lib/corpus/corpus.types.ts'

const SCHEMA = '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>\n'

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

/** A source `id` of one schema at `path`, served by `server`. */
function oneFileSource(params: {
	id: string
	server: FixtureServer
	path?: string
	extra?: Partial<ManifestSource>
}): ManifestSource {
	return reviewedSource({
		id: params.id,
		fetch: {
			kind: 'files',
			files: {
				'schema.xsd': {
					url: params.server.urlOf(params.path ?? '/schema.xsd'),
					sha256: sha256Of(Buffer.from(SCHEMA)),
				},
			},
		},
		...params.extra,
	})
}

/** A source of one zip archive holding `members`, served by `server` at `/archive.zip`. */
function zipSource(params: {
	id: string
	server: FixtureServer
	archive: Uint8Array
}): ManifestSource {
	return reviewedSource({
		id: params.id,
		fetch: {
			kind: 'archive',
			url: params.server.urlOf('/archive.zip'),
			sha256: sha256Of(params.archive),
			strip: '',
			keep: [''],
		},
	})
}

describe('corpus guards', () => {
	it.each(['a/b', '..', 'manifest.lock.json', 'alpha.staging', 'alpha.old', 'fetch.lock'])(
		'refuses the source id %j, downloading nothing for it',
		async (id) => {
			const workspace = createCorpusWorkspace()
			const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
			const manifest: CorpusManifest = { sources: [oneFileSource({ id, server })] }

			const result = corpus({ workspace, manifest, argv: ['fetch'] })

			await expect(result).resolves.toMatchObject({ exitCode: 1 })
			const answer = await result
			expect(answer.output).toContain(`${JSON.stringify(id)}: a source id`)
			expect(server.requests).toEqual([])
		},
	)

	it.each(['Fetch.lock', 'MANIFEST.LOCK.JSON', 'alpha.Staging'])(
		'refuses the source id %j, a cache entry in another case',
		async (id) => {
			const workspace = createCorpusWorkspace()
			const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
			const manifest: CorpusManifest = { sources: [oneFileSource({ id, server })] }

			const result = corpus({ workspace, manifest, argv: ['fetch'] })

			await expect(result).resolves.toMatchObject({ exitCode: 1 })
			const answer = await result
			expect(answer.output).toContain(`${JSON.stringify(id)}: a source id`)
			expect(server.requests).toEqual([])
		},
	)

	it('refuses to fetch while the fetch lock holds no process id, naming it', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
		const manifest: CorpusManifest = { sources: [oneFileSource({ id: 'alpha', server })] }
		const prepared = await corpus({ workspace, manifest: { sources: [] }, argv: ['fetch'] })
		expect(prepared.exitCode).toBe(0)
		writeFileSync(join(workspace.cache, 'fetch.lock'), '')

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('fetch.lock holds no process id')
		expect(server.requests).toEqual([])
	})

	it.each(['C:/x.xsd', 'a\u0000b.xsd', '.'])(
		'refuses an archive member named %j, writing nothing for its source',
		async (member) => {
			const workspace = createCorpusWorkspace()
			const archive = zipOf([
				{ name: 'a.xsd', text: SCHEMA },
				{ name: member, text: 'escaped\n' },
			])
			const server = await serverOf({ '/archive.zip': archive })

			const result = await corpus({
				workspace,
				manifest: { sources: [zipSource({ id: 'hostile', server, archive })] },
				argv: ['fetch'],
			})

			expect(result.exitCode).toBe(1)
			expect(result.output).toContain('hostile: refused path in a downloaded source')
			expect(existsSync(join(workspace.cache, 'hostile'))).toBe(false)
		},
	)

	it('writes a member named with ./ and doubled slashes at its plain path, and check finds it matching', async () => {
		const workspace = createCorpusWorkspace()
		const archive = zipOf([{ name: './sub//a.xsd', text: SCHEMA }])
		const server = await serverOf({ '/archive.zip': archive })
		const manifest: CorpusManifest = { sources: [zipSource({ id: 'loose', server, archive })] }

		const fetched = await corpus({ workspace, manifest, argv: ['fetch'] })
		const checked = await corpus({ workspace, manifest, argv: ['check'] })

		expect(fetched.exitCode).toBe(0)
		const lock = JSON.parse(readFileSync(join(workspace.cache, 'manifest.lock.json'), 'utf8'))
		expect(Object.keys(lock.loose.sha256)).toEqual(['sub/a.xsd'])
		expect(checked.exitCode).toBe(0)
	})

	it('refuses a source whose verdict is neither full nor schemas-only, downloading nothing', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
		const source = { ...oneFileSource({ id: 'alpha', server }), verdict: 'mutable' }

		const result = await corpus({
			workspace,
			manifest: { sources: [source as ManifestSource] },
			argv: ['fetch'],
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('alpha: verdict "mutable"')
		expect(server.requests).toEqual([])
	})

	it('refuses a source whose pin is no sha256, downloading nothing', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
		const source = reviewedSource({
			id: 'alpha',
			fetch: {
				kind: 'files',
				files: { 'schema.xsd': { url: server.urlOf('/schema.xsd'), sha256: 'abc' } },
			},
		})

		const result = await corpus({ workspace, manifest: { sources: [source] }, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`alpha: ${server.urlOf('/schema.xsd')} has the pin "abc"`)
		expect(server.requests).toEqual([])
	})

	it('refuses a download that answers with a redirect, writing nothing for its source', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serveRedirect({
			from: '/moved.xsd',
			to: '/schema.xsd',
			bytes: Buffer.from(SCHEMA),
		})
		onTestFinished(() => server.close())
		const manifest: CorpusManifest = {
			sources: [oneFileSource({ id: 'alpha', server, path: '/moved.xsd' })],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('alpha:')
		expect(result.output).toContain('redirect')
		expect(existsSync(join(workspace.cache, 'alpha'))).toBe(false)
	})

	it('reads a fetched source with a file removed since as stale', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
		const manifest: CorpusManifest = { sources: [oneFileSource({ id: 'alpha', server })] }
		const fetched = await corpus({ workspace, manifest, argv: ['fetch'] })
		expect(fetched.exitCode).toBe(0)
		rmSync(join(workspace.cache, 'alpha', 'schema.xsd'))

		const listed = await corpus({ workspace, manifest, argv: ['list', '--json'] })

		expect(JSON.parse(listed.output).corpora[0]).toMatchObject({ name: 'alpha', state: 'stale' })
	})

	it('answers list --json with its version', async () => {
		const workspace = createCorpusWorkspace()

		const listed = await corpus({ workspace, manifest: { sources: [] }, argv: ['list', '--json'] })

		expect(JSON.parse(listed.output)).toMatchObject({ version: 1 })
	})

	it('refuses to fetch while another running fetch holds the cache, naming it', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
		const manifest: CorpusManifest = { sources: [oneFileSource({ id: 'alpha', server })] }
		const prepared = await corpus({ workspace, manifest: { sources: [] }, argv: ['fetch'] })
		expect(prepared.exitCode).toBe(0)
		writeFileSync(join(workspace.cache, 'fetch.lock'), `${process.pid}\n`)

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`fetch.lock`)
		expect(result.output).toContain(String(process.pid))
		expect(server.requests).toEqual([])
	})

	it('takes over a fetch lock whose process is gone', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({ '/schema.xsd': Buffer.from(SCHEMA) })
		const manifest: CorpusManifest = { sources: [oneFileSource({ id: 'alpha', server })] }
		const prepared = await corpus({ workspace, manifest: { sources: [] }, argv: ['fetch'] })
		expect(prepared.exitCode).toBe(0)
		writeFileSync(join(workspace.cache, 'fetch.lock'), '2147483646\n')

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(workspace.cache, 'fetch.lock'))).toBe(false)
	})
})
