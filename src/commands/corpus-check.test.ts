/** `dialecte corpus check` through `runCorpus`: a fetched source against its lock, a licensed entry against its files. */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
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

/** A source `id` of one schema served by `server`. */
function sourceOf(params: { id: string; server: FixtureServer }): ManifestSource {
	return reviewedSource({
		id: params.id,
		fetch: {
			kind: 'files',
			files: {
				'schema.xsd': {
					url: params.server.urlOf(`/${params.id}/schema.xsd`),
					sha256: sha256Of(Buffer.from(SCHEMA)),
				},
			},
		},
		entries: ['schema.xsd'],
	})
}

/** A manifest of `alpha` (one schema) and `beta` (never fetched here), served by a server closed with the case. */
async function fetchedAlpha(workspace: CorpusWorkspace): Promise<CorpusManifest> {
	const server = await serveFiles({
		'/alpha/schema.xsd': Buffer.from(SCHEMA),
		'/beta/schema.xsd': Buffer.from(SCHEMA),
	})
	onTestFinished(() => server.close())
	const manifest: CorpusManifest = {
		sources: [sourceOf({ id: 'alpha', server }), sourceOf({ id: 'beta', server })],
	}
	const fetched = await corpus({ workspace, manifest, argv: ['fetch', 'alpha'] })
	expect(fetched.exitCode).toBe(0)
	return manifest
}

describe('corpus check', () => {
	it('exits 0 on a fetched cache that matches its lock, an unfetched source being no problem', async () => {
		const workspace = createCorpusWorkspace()
		const manifest = await fetchedAlpha(workspace)

		const result = await corpus({ workspace, manifest, argv: ['check'] })

		expect(result.exitCode).toBe(0)
	})

	it('exits 1 naming the source and the file edited in the cache', async () => {
		const workspace = createCorpusWorkspace()
		const manifest = await fetchedAlpha(workspace)
		writeFileSync(join(workspace.cache, 'alpha', 'schema.xsd'), `${SCHEMA}<!-- edited -->\n`)

		const result = await corpus({ workspace, manifest, argv: ['check'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('alpha: schema.xsd does not match its fetched sha256')
	})

	it('reads a lock entry without its per-file hashes (an older writer) as stale, never a crash', async () => {
		const workspace = createCorpusWorkspace()
		const manifest = await fetchedAlpha(workspace)
		writeFileSync(
			join(workspace.cache, 'manifest.lock.json'),
			`${JSON.stringify({ alpha: { files: 1, bytes: SCHEMA.length, verdict: 'full' } })}\n`,
		)

		const checked = corpus({ workspace, manifest, argv: ['check'] })
		const listed = corpus({ workspace, manifest, argv: ['list', '--json'] })

		await expect(checked).resolves.toMatchObject({ exitCode: 1 })
		await expect(listed).resolves.toMatchObject({ exitCode: 0 })
		const checkAnswer = await checked
		const listAnswer = await listed
		expect(checkAnswer.output).toContain('alpha: fetched from another manifest entry')
		expect(JSON.parse(listAnswer.output).corpora[0]).toMatchObject({
			name: 'alpha',
			state: 'stale',
		})
	})

	it('exits 1 naming a link planted in a fetched source as not fetched', async () => {
		const workspace = createCorpusWorkspace()
		const manifest = await fetchedAlpha(workspace)
		symlinkSync(
			join(workspace.cache, 'alpha', 'schema.xsd'),
			join(workspace.cache, 'alpha', 'planted.xsd'),
		)

		const result = await corpus({ workspace, manifest, argv: ['check'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('alpha: planted.xsd was not fetched')
	})

	it('exits 1 naming a licensed entry whose XSD or instances folder is missing', async () => {
		const workspace = createCorpusWorkspace()
		const material = temporaryFolder('dialecte-corpus-licensed-')
		writeFileSync(join(material, 'Here.xsd'), SCHEMA)
		const folder = join(workspace.configHome, 'dialecte')
		mkdirSync(folder, { recursive: true })
		writeFileSync(
			join(folder, 'config.yml'),
			`# personal\nschema: 1\ncorpora:\n  licensed-a: { xsd: ${join(material, 'Here.xsd')}, instances: ${join(material, 'gone')} }\n`,
		)

		const result = await corpus({ workspace, manifest: { sources: [] }, argv: ['check', '--json'] })

		expect(result.exitCode).toBe(1)
		expect(JSON.parse(result.output)).toEqual({
			problems: [
				{ name: 'licensed-a', problem: `licensed-a: ${join(material, 'gone')} is missing` },
			],
		})
	})
})
