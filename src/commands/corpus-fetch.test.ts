/** `dialecte corpus fetch` through `runCorpus`, on a scratch cache, the downloads served by a local HTTP server. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import {
	createCorpusWorkspace,
	reviewedSource,
	serveFiles,
	sha256Of,
	tarGzOf,
	zipOf,
} from '../../test/corpus-fixtures.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runCorpus } from './corpus.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { CorpusWorkspace, FixtureServer } from '../../test/corpus-fixtures.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { CorpusManifest, ManifestSource } from '../lib/corpus/corpus.types.ts'

const SCHEMA_A =
	'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:a"/>\n'
const SCHEMA_B =
	'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:b"/>\n'
const SCHEMA_C = '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>\n'

/** The override files of the fixture manifests: `xml.xsd`. */
function overridesFolder(): string {
	const folder = temporaryFolder('dialecte-corpus-overrides-')
	writeFileSync(join(folder, 'xml.xsd'), 'OVERRIDE\n')
	return folder
}

/** `corpus <argv>` in the workspace with the manifest. */
function corpus(params: {
	workspace: CorpusWorkspace
	manifest: CorpusManifest
	argv: string[]
	overrides?: string
}): Promise<CommandResult> {
	const { workspace } = params
	return runCorpus({
		cwd: workspace.root,
		argv: params.argv,
		environment: workspace.environment,
		platform: process.platform,
		home: workspace.home,
		shipped: { manifest: params.manifest, overrides: params.overrides ?? overridesFolder() },
	})
}

/** The server for this case, closed when it ends. */
async function serverOf(routes: Readonly<Record<string, Uint8Array>>): Promise<FixtureServer> {
	const server = await serveFiles(routes)
	onTestFinished(() => server.close())
	return server
}

/** Every file under `folder`, relative path -> text; `{}` when the folder is absent. */
function treeOf(folder: string): Record<string, string> {
	if (!existsSync(folder)) return {}
	const files = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) =>
		entry.isFile(),
	)
	return Object.fromEntries(
		files
			.map((entry) => join(entry.parentPath, entry.name))
			.map(
				(path) =>
					[relative(folder, path).split('\\').join('/'), readFileSync(path, 'utf8')] as const,
			)
			.sort(([left], [right]) => (left < right ? -1 : 1)),
	)
}

function bytesOf(text: string): Uint8Array {
	return Buffer.from(text, 'utf8')
}

/** A `files` source serving `files` (path -> text) from `server` under `/<id>/`. */
function filesSource(params: {
	id: string
	server: FixtureServer
	files: Record<string, string>
	extra?: Partial<ManifestSource>
}): ManifestSource {
	return reviewedSource({
		id: params.id,
		fetch: {
			kind: 'files',
			files: Object.fromEntries(
				Object.entries(params.files).map(([path, text]) => [
					path,
					{ url: params.server.urlOf(`/${params.id}/${path}`), sha256: sha256Of(bytesOf(text)) },
				]),
			),
		},
		...params.extra,
	})
}

/** A copy of a zip whose end record places its central directory past the archive's end. */
function withCentralDirectoryPastEnd(zip: Uint8Array): Uint8Array {
	const copy = Buffer.from(zip)
	copy.writeUInt32LE(copy.length + 100, copy.length - 22 + 16)
	return copy
}

/** The routes serving `files` under `/<id>/`. */
function routesOf(params: {
	id: string
	files: Record<string, string>
}): Record<string, Uint8Array> {
	return Object.fromEntries(
		Object.entries(params.files).map(([path, text]) => [`/${params.id}/${path}`, bytesOf(text)]),
	)
}

describe('corpus fetch', () => {
	it('writes each source under <cache>/<id>/, names them in manifest.lock.json and keeps the downloads', async () => {
		const workspace = createCorpusWorkspace()
		const alphaFiles = { 'a.xsd': SCHEMA_A, 'sub/b.xsd': SCHEMA_B }
		const server = await serverOf({
			...routesOf({ id: 'alpha', files: alphaFiles }),
			'/schemas/c.xsd': bytesOf(SCHEMA_C),
		})
		const crawlUrl = server.urlOf('/schemas/c.xsd')
		const manifest: CorpusManifest = {
			sources: [
				filesSource({ id: 'alpha', server, files: alphaFiles }),
				reviewedSource({
					id: 'beta',
					fetch: {
						kind: 'crawl',
						start: [crawlUrl],
						hosts: [new URL(crawlUrl).host],
						files: { [crawlUrl]: sha256Of(bytesOf(SCHEMA_C)) },
					},
				}),
			],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(0)
		expect(treeOf(join(workspace.cache, 'alpha'))).toEqual(alphaFiles)
		expect(treeOf(join(workspace.cache, 'beta'))).toEqual({
			[`${new URL(crawlUrl).host}/schemas/c.xsd`]: SCHEMA_C,
		})
		const lock = JSON.parse(readFileSync(join(workspace.cache, 'manifest.lock.json'), 'utf8'))
		expect(Object.keys(lock).sort()).toEqual(['alpha', 'beta'])
		expect(lock.alpha).toMatchObject({ files: 2, verdict: 'full' })
		expect(lock.alpha.sha256).toEqual({
			'a.xsd': sha256Of(bytesOf(SCHEMA_A)),
			'sub/b.xsd': sha256Of(bytesOf(SCHEMA_B)),
		})
		expect(readdirSync(join(workspace.cache, '_downloads')).sort()).toEqual(
			[server.urlOf('/alpha/a.xsd'), server.urlOf('/alpha/sub/b.xsd'), crawlUrl]
				.map((url) => sha256Of(bytesOf(url)))
				.sort(),
		)
	})

	it('refuses a source whose download has another sha256, naming both, writing nothing for it, fetching the others', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({
			...routesOf({ id: 'alpha', files: { 'a.xsd': SCHEMA_A } }),
			...routesOf({ id: 'beta', files: { 'b.xsd': SCHEMA_B } }),
		})
		const pinned = sha256Of(bytesOf('another text'))
		const manifest: CorpusManifest = {
			sources: [
				reviewedSource({
					id: 'alpha',
					fetch: {
						kind: 'files',
						files: { 'a.xsd': { url: server.urlOf('/alpha/a.xsd'), sha256: pinned } },
					},
				}),
				filesSource({ id: 'beta', server, files: { 'b.xsd': SCHEMA_B } }),
			],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(pinned)
		expect(result.output).toContain(sha256Of(bytesOf(SCHEMA_A)))
		expect(existsSync(join(workspace.cache, 'alpha'))).toBe(false)
		expect(readdirSync(join(workspace.cache, '_downloads'))).not.toContain(
			sha256Of(bytesOf(server.urlOf('/alpha/a.xsd'))),
		)
		expect(treeOf(join(workspace.cache, 'beta'))).toEqual({ 'b.xsd': SCHEMA_B })
		const lock = JSON.parse(readFileSync(join(workspace.cache, 'manifest.lock.json'), 'utf8'))
		expect(Object.keys(lock)).toEqual(['beta'])
	})

	it('rebuilds the same tree from the kept downloads when the network is gone', async () => {
		const workspace = createCorpusWorkspace()
		const files = { 'a.xsd': SCHEMA_A, 'sub/b.xsd': SCHEMA_B }
		const server = await serverOf(routesOf({ id: 'alpha', files }))
		const manifest: CorpusManifest = { sources: [filesSource({ id: 'alpha', server, files })] }
		const first = await corpus({ workspace, manifest, argv: ['fetch'] })
		expect(first.exitCode).toBe(0)
		const lockBefore = readFileSync(join(workspace.cache, 'manifest.lock.json'), 'utf8')
		await server.close()

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(0)
		expect(treeOf(join(workspace.cache, 'alpha'))).toEqual(files)
		expect(readFileSync(join(workspace.cache, 'manifest.lock.json'), 'utf8')).toBe(lockBefore)
	})

	it('checks a kept download against its pin: one changed since, with no network, refuses the source and keeps its tree', async () => {
		const workspace = createCorpusWorkspace()
		const files = { 'a.xsd': SCHEMA_A }
		const server = await serverOf(routesOf({ id: 'alpha', files }))
		const manifest: CorpusManifest = { sources: [filesSource({ id: 'alpha', server, files })] }
		const first = await corpus({ workspace, manifest, argv: ['fetch'] })
		expect(first.exitCode).toBe(0)
		await server.close()
		writeFileSync(
			join(workspace.cache, '_downloads', sha256Of(bytesOf(server.urlOf('/alpha/a.xsd')))),
			'tampered\n',
		)

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('alpha:')
		expect(treeOf(join(workspace.cache, 'alpha'))).toEqual(files)
	})

	it.each([
		{ kind: 'tar.gz', build: tarGzOf, path: '/archives/pkg.tar.gz' },
		{ kind: 'zip', build: zipOf, path: '/archives/pkg.zip' },
	])(
		'writes only the kept paths of a $kind archive, its strip prefix removed',
		async ({ build, path }) => {
			const workspace = createCorpusWorkspace()
			const archive = build([
				{ name: 'pkg-1/schemas/a.xsd', text: SCHEMA_A },
				{ name: 'pkg-1/schemas/deep/b.xsd', text: SCHEMA_B },
				{ name: 'pkg-1/docs/readme.txt', text: 'not kept\n' },
				{ name: 'pkg-1/LICENSE', text: 'MIT\n' },
				{ name: 'other/c.xsd', text: SCHEMA_C },
			])
			const server = await serverOf({ [path]: archive })
			const manifest: CorpusManifest = {
				sources: [
					reviewedSource({
						id: 'packed',
						fetch: {
							kind: 'archive',
							url: server.urlOf(path),
							sha256: sha256Of(archive),
							strip: 'pkg-1/',
							keep: ['schemas/', 'LICENSE'],
						},
					}),
				],
			}

			const result = await corpus({ workspace, manifest, argv: ['fetch'] })

			expect(result.exitCode).toBe(0)
			expect(treeOf(join(workspace.cache, 'packed'))).toEqual({
				LICENSE: 'MIT\n',
				'schemas/a.xsd': SCHEMA_A,
				'schemas/deep/b.xsd': SCHEMA_B,
			})
		},
	)

	it.each([
		{
			kind: 'tar.gz with a ../ member',
			build: tarGzOf,
			path: '/archives/up.tar.gz',
			member: '../escape.xsd',
		},
		{
			kind: 'zip with an absolute member',
			build: zipOf,
			path: '/archives/abs.zip',
			member: '/escape.xsd',
		},
	])('refuses a $kind, writing nothing outside the cache', async ({ build, path, member }) => {
		const workspace = createCorpusWorkspace()
		const archive = build([
			{ name: 'a.xsd', text: SCHEMA_A },
			{ name: member, text: 'escaped\n' },
		])
		const server = await serverOf({ [path]: archive })
		const manifest: CorpusManifest = {
			sources: [
				reviewedSource({
					id: 'hostile',
					fetch: {
						kind: 'archive',
						url: server.urlOf(path),
						sha256: sha256Of(archive),
						strip: '',
						keep: [''],
					},
				}),
			],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(member)
		expect(Object.keys(treeOf(dirname(workspace.cache))).sort()).toEqual(
			[
				`cache/_downloads/${sha256Of(bytesOf(server.urlOf(path)))}`,
				'cache/manifest.lock.json',
			].sort(),
		)
	})

	it('refuses a zip member named with backslashes, writing nothing for its source', async () => {
		const workspace = createCorpusWorkspace()
		const archive = zipOf([
			{ name: 'a.xsd', text: SCHEMA_A },
			{ name: '..\\..\\escape.xsd', text: 'escaped\n' },
		])
		const server = await serverOf({ '/archives/bs.zip': archive })
		const manifest: CorpusManifest = {
			sources: [
				reviewedSource({
					id: 'hostile',
					fetch: {
						kind: 'archive',
						url: server.urlOf('/archives/bs.zip'),
						sha256: sha256Of(archive),
						strip: '',
						keep: [''],
					},
				}),
			],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('hostile: refused path in a downloaded source')
		expect(existsSync(join(workspace.cache, 'hostile'))).toBe(false)
	})

	it('removes the files an exclude glob matches, its * crossing folders', async () => {
		const workspace = createCorpusWorkspace()
		const files = { 'a.xsd': SCHEMA_A, 'top.sch': 'top\n', 'sub/deep/more.sch': 'more\n' }
		const server = await serverOf(routesOf({ id: 'alpha', files }))
		const manifest: CorpusManifest = {
			sources: [filesSource({ id: 'alpha', server, files, extra: { exclude: ['sub/*.sch'] } })],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(0)
		expect(treeOf(join(workspace.cache, 'alpha'))).toEqual({
			'a.xsd': SCHEMA_A,
			'top.sch': 'top\n',
		})
	})

	it('removes a file a marker rule covers whose text holds none of its markers', async () => {
		const workspace = createCorpusWorkspace()
		const files = {
			'marked.xsd': `<!-- Licence A -->\n${SCHEMA_A}`,
			'other-mark.xsd': `<!-- Licence B -->\n${SCHEMA_B}`,
			'unmarked.xsd': SCHEMA_C,
			'excepted.xsd': SCHEMA_C,
			'note.txt': 'not covered\n',
		}
		const server = await serverOf(routesOf({ id: 'alpha', files }))
		const manifest: CorpusManifest = {
			sources: [
				filesSource({
					id: 'alpha',
					server,
					files,
					extra: {
						marker: [{ glob: '*.xsd', text: ['Licence A', 'Licence B'], except: ['excepted.xsd'] }],
					},
				}),
			],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(0)
		expect(Object.keys(treeOf(join(workspace.cache, 'alpha')))).toEqual([
			'excepted.xsd',
			'marked.xsd',
			'note.txt',
			'other-mark.xsd',
		])
	})

	it('places the override file at a substituted path, after the marker rules', async () => {
		const workspace = createCorpusWorkspace()
		const marked = `<!-- Licence A -->\n${SCHEMA_A}`
		const files = { 'a.xsd': marked, 'sub/xml.xsd': 'the W3C document\n' }
		const server = await serverOf(routesOf({ id: 'alpha', files }))
		const manifest: CorpusManifest = {
			sources: [
				filesSource({
					id: 'alpha',
					server,
					files,
					extra: {
						exclude: ['sub/xml.xsd'],
						marker: [{ glob: '*.xsd', text: 'Licence A' }],
						substitute: { 'sub/xml.xsd': 'xml.xsd' },
					},
				}),
			],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(0)
		expect(treeOf(join(workspace.cache, 'alpha'))).toEqual({
			'a.xsd': marked,
			'sub/xml.xsd': 'OVERRIDE\n',
		})
	})

	it('writes a wrapper schema importing the matched documents with their target namespaces', async () => {
		const workspace = createCorpusWorkspace()
		const files = { 'xsd/a.xsd': SCHEMA_A, 'xsd/b.xsd': SCHEMA_B }
		const server = await serverOf(routesOf({ id: 'alpha', files }))
		const manifest: CorpusManifest = {
			sources: [
				filesSource({
					id: 'alpha',
					server,
					files,
					extra: { wrappers: { '_wrappers/all.xsd': ['xsd/*.xsd'] } },
				}),
			],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch'] })

		expect(result.exitCode).toBe(0)
		const wrapper = readFileSync(join(workspace.cache, 'alpha', '_wrappers', 'all.xsd'), 'utf8')
		expect(wrapper).toContain('<xs:import namespace="urn:a" schemaLocation="../xsd/a.xsd"/>')
		expect(wrapper).toContain('<xs:import namespace="urn:b" schemaLocation="../xsd/b.xsd"/>')
		expect(wrapper.indexOf('urn:a')).toBeLessThan(wrapper.indexOf('urn:b'))
	})

	it.each(['license', 'terms', 'verdict'] as const)(
		'refuses a source without %s, naming the field, and downloads nothing for it',
		async (field) => {
			const workspace = createCorpusWorkspace()
			const files = { 'a.xsd': SCHEMA_A }
			const server = await serverOf(routesOf({ id: 'alpha', files }))
			const source: ManifestSource = {
				...filesSource({ id: 'alpha', server, files }),
				[field]: undefined,
			}

			const result = await corpus({ workspace, manifest: { sources: [source] }, argv: ['fetch'] })

			expect(result.exitCode).toBe(1)
			expect(result.output).toContain(`alpha: no ${field}`)
			expect(server.requests).toEqual([])
			expect(existsSync(join(workspace.cache, 'alpha'))).toBe(false)
		},
	)

	it.each([
		{
			case: 'a zip whose central directory lies past its end',
			archive: withCentralDirectoryPastEnd(zipOf([{ name: 'a.xsd', text: SCHEMA_A }])),
			exclude: [],
		},
		{
			case: 'a glob class out of order',
			archive: zipOf([{ name: 'a.xsd', text: SCHEMA_A }]),
			exclude: ['[z-a].xsd'],
		},
	])(
		'refuses a source on $case, naming it, and fetches the others',
		async ({ archive, exclude }) => {
			const workspace = createCorpusWorkspace()
			const server = await serverOf({
				'/archives/broken.zip': archive,
				...routesOf({ id: 'beta', files: { 'b.xsd': SCHEMA_B } }),
			})
			const manifest: CorpusManifest = {
				sources: [
					reviewedSource({
						id: 'broken',
						fetch: {
							kind: 'archive',
							url: server.urlOf('/archives/broken.zip'),
							sha256: sha256Of(archive),
							strip: '',
							keep: [''],
						},
						exclude,
					}),
					filesSource({ id: 'beta', server, files: { 'b.xsd': SCHEMA_B } }),
				],
			}

			const result = corpus({ workspace, manifest, argv: ['fetch'] })

			await expect(result).resolves.toMatchObject({ exitCode: 1 })
			const answer = await result
			expect(answer.output).toContain('✗ broken:')
			expect(existsSync(join(workspace.cache, 'broken'))).toBe(false)
			expect(treeOf(join(workspace.cache, 'beta'))).toEqual({ 'b.xsd': SCHEMA_B })
		},
	)

	it('refuses a source with a download that has no sha256 pin, downloading nothing for it', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf(routesOf({ id: 'alpha', files: { 'a.xsd': SCHEMA_A } }))
		const source = reviewedSource({
			id: 'alpha',
			fetch: { kind: 'files', files: { 'a.xsd': { url: server.urlOf('/alpha/a.xsd') } } },
		})

		const result = await corpus({ workspace, manifest: { sources: [source] }, argv: ['fetch'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`alpha: ${server.urlOf('/alpha/a.xsd')} has no sha256`)
		expect(server.requests).toEqual([])
		expect(existsSync(join(workspace.cache, 'alpha'))).toBe(false)
	})

	it('fetches only the named sources and refuses an unknown one', async () => {
		const workspace = createCorpusWorkspace()
		const server = await serverOf({
			...routesOf({ id: 'alpha', files: { 'a.xsd': SCHEMA_A } }),
			...routesOf({ id: 'beta', files: { 'b.xsd': SCHEMA_B } }),
		})
		const manifest: CorpusManifest = {
			sources: [
				filesSource({ id: 'alpha', server, files: { 'a.xsd': SCHEMA_A } }),
				filesSource({ id: 'beta', server, files: { 'b.xsd': SCHEMA_B } }),
			],
		}

		const named = await corpus({ workspace, manifest, argv: ['fetch', 'beta'] })
		const unknown = await corpus({ workspace, manifest, argv: ['fetch', 'gamma'] })

		expect(named.exitCode).toBe(0)
		expect(existsSync(join(workspace.cache, 'alpha'))).toBe(false)
		expect(treeOf(join(workspace.cache, 'beta'))).toEqual({ 'b.xsd': SCHEMA_B })
		expect(unknown.exitCode).toBe(2)
		expect(unknown.output).toContain('gamma')
	})

	it('answers --json with each source and its outcome', async () => {
		const workspace = createCorpusWorkspace()
		mkdirSync(workspace.cache, { recursive: true })
		const server = await serverOf(routesOf({ id: 'alpha', files: { 'a.xsd': SCHEMA_A } }))
		const manifest: CorpusManifest = {
			sources: [filesSource({ id: 'alpha', server, files: { 'a.xsd': SCHEMA_A } })],
		}

		const result = await corpus({ workspace, manifest, argv: ['fetch', '--json'] })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(result.output)).toEqual({
			cache: workspace.cache,
			sources: [{ id: 'alpha', kind: 'fetched', files: 1, bytes: SCHEMA_A.length }],
		})
	})
})
