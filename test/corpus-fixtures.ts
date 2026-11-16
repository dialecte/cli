/** The corpus tests' fixtures: tar, tar.gz and zip archives built in memory, a local HTTP server, a scratch cache and home. */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { deflateRawSync, gzipSync } from 'node:zlib'

import { TAR_BLOCK } from './corpus-fixtures.constants.ts'
import { createScratchRepository, temporaryFolder } from './scratch-repository.ts'

import type { ManifestSource } from '../src/lib/corpus/corpus.types.ts'
import type { ArchiveMember, CorpusWorkspace, FixtureServer } from './corpus-fixtures.types.ts'
import type { AddressInfo } from 'node:net'

/** The sha256 of bytes, hex. */
export function sha256Of(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/** A ustar archive of the members (names up to 100 characters, written as given: `../x` and `/x` included). */
export function tarOf(members: readonly ArchiveMember[]): Uint8Array {
	const blocks: Buffer[] = []
	for (const member of members) {
		const content = Buffer.from(member.text, 'utf8')
		const header = Buffer.alloc(TAR_BLOCK)
		header.write(member.name, 0, 100, 'utf8')
		header.write('0000644\0', 100, 'ascii')
		header.write('0000000\0', 108, 'ascii')
		header.write('0000000\0', 116, 'ascii')
		header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii')
		header.write('00000000000\0', 136, 'ascii')
		header.write('        ', 148, 'ascii')
		header.write('0', 156, 'ascii')
		header.write('ustar\0', 257, 'ascii')
		header.write('00', 263, 'ascii')
		const checksum = header.reduce((sum, byte) => sum + byte, 0)
		header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii')
		blocks.push(
			header,
			content,
			Buffer.alloc((TAR_BLOCK - (content.length % TAR_BLOCK)) % TAR_BLOCK),
		)
	}
	blocks.push(Buffer.alloc(TAR_BLOCK * 2))
	return Buffer.concat(blocks)
}

/** A gzipped ustar archive of the members. */
export function tarGzOf(members: readonly ArchiveMember[]): Uint8Array {
	return gzipSync(tarOf(members))
}

/** A zip archive of the members, each deflated, with its central directory. */
export function zipOf(members: readonly ArchiveMember[]): Uint8Array {
	const locals: Buffer[] = []
	const centrals: Buffer[] = []
	let offset = 0
	for (const member of members) {
		const name = Buffer.from(member.name, 'utf8')
		const content = Buffer.from(member.text, 'utf8')
		const compressed = deflateRawSync(content)
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt16LE(8, 8)
		local.writeUInt32LE(compressed.length, 18)
		local.writeUInt32LE(content.length, 22)
		local.writeUInt16LE(name.length, 26)
		const central = Buffer.alloc(46)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt16LE(20, 4)
		central.writeUInt16LE(20, 6)
		central.writeUInt16LE(8, 10)
		central.writeUInt32LE(compressed.length, 20)
		central.writeUInt32LE(content.length, 24)
		central.writeUInt16LE(name.length, 28)
		central.writeUInt32LE(offset, 42)
		locals.push(local, name, compressed)
		centrals.push(central, name)
		offset += local.length + name.length + compressed.length
	}
	const directory = Buffer.concat(centrals)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0)
	end.writeUInt16LE(members.length, 8)
	end.writeUInt16LE(members.length, 10)
	end.writeUInt32LE(directory.length, 12)
	end.writeUInt32LE(offset, 16)
	return Buffer.concat([...locals, directory, end])
}

/** A server on 127.0.0.1 answering each path of `routes` with its bytes, 404 otherwise. */
export async function serveFiles(
	routes: Readonly<Record<string, Uint8Array>>,
): Promise<FixtureServer> {
	const requests: string[] = []
	const server = createServer(function answer(request, response) {
		const path = request.url ?? ''
		requests.push(path)
		const bytes = routes[path]
		if (bytes === undefined) {
			response.writeHead(404)
			response.end()
			return
		}
		response.writeHead(200, { 'content-length': bytes.length })
		response.end(bytes)
	})
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const { port } = server.address() as AddressInfo
	return {
		urlOf: (path) => `http://127.0.0.1:${port}${path}`,
		requests,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections()
				server.close(() => resolve())
			}),
	}
}

/** A scratch repository to run from, an empty cache, a home and a personal config folder of their own. */
export function createCorpusWorkspace(): CorpusWorkspace {
	const root = createScratchRepository()
	const cache = join(temporaryFolder('dialecte-corpora-'), 'cache')
	const home = temporaryFolder('dialecte-corpus-home-')
	const configHome = temporaryFolder('dialecte-corpus-config-')
	return {
		root,
		cache,
		home,
		configHome,
		environment: { DIALECTE_CORPORA_DIR: cache, XDG_CONFIG_HOME: configHome, HOME: home },
	}
}

/** A reviewed source: licence, terms and verdict filled, the rest from `source`. */
export function reviewedSource(
	source: Pick<ManifestSource, 'id' | 'fetch'> & Partial<ManifestSource>,
): ManifestSource {
	return {
		family: 'fixture',
		license: 'MIT',
		terms: 'https://example.org/terms',
		verdict: 'full',
		note: 'a fixture source',
		...source,
	}
}
