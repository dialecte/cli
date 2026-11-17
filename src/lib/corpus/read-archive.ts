/**
 * The regular files of a tar, tar.gz or zip archive, as the archive names them: links, devices and folders are never
 * read. Told apart by their bytes (a zip starts with its local header, a gzip with its magic), never by the URL. Names
 * are returned as they are: the caller refuses an absolute one or one that climbs (`..`).
 */
import { gunzipSync, inflateRawSync } from 'node:zlib'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	GZIP_MAGIC,
	PAX_PATH_KEY,
	ARCHIVE_TOO_LARGE,
	MAX_EXTRACTED_BYTES,
	TAR_BASE256_FLAG,
	TAR_BASE256_SIZE,
	TAR_BLOCK,
	TAR_CHECKSUM_SPACE,
	TAR_HEADER,
	TAR_TYPES,
	ZIP_END_COMMENT_MAX,
	ZIP_END_SIZE,
	ZIP_METHODS,
	ZIP_SIGNATURES,
} from './corpus.constants.ts'

import type { ArchiveRead, CorpusFile } from './corpus.types.ts'

export function readArchive(params: { bytes: Uint8Array; maxBytes?: number }): ArchiveRead {
	const maxBytes = params.maxBytes ?? MAX_EXTRACTED_BYTES
	const data = Buffer.from(params.bytes.buffer, params.bytes.byteOffset, params.bytes.byteLength)
	if (data.length >= 4 && data.readUInt32LE(0) === ZIP_SIGNATURES.local)
		return readZip({ data, maxBytes })
	const isGzip = data[0] === GZIP_MAGIC[0] && data[1] === GZIP_MAGIC[1]
	const tar = isGzip ? inflated({ data, maxBytes, inflate: gunzipSync }) : data
	if (tar === 'too large') return tooLarge(maxBytes)
	if (tar === undefined || !isTar(tar)) return { kind: 'unknown' }
	return tarFilesOf(tar)
}

function tooLarge(maxBytes: number): ArchiveRead {
	return {
		kind: 'unsupported',
		reason: fillMessage({ template: ARCHIVE_TOO_LARGE, values: { bytes: String(maxBytes) } }),
	}
}

/** The inflated bytes, `too large` past `maxBytes`, undefined when they do not inflate. */
function inflated(params: {
	data: Buffer
	maxBytes: number
	inflate: (data: Buffer, options: { maxOutputLength: number }) => Buffer
}): Buffer | 'too large' | undefined {
	try {
		return params.inflate(params.data, { maxOutputLength: params.maxBytes })
	} catch (error) {
		return error instanceof RangeError ? 'too large' : undefined
	}
}

/** A ustar archive (its magic), or an old tar whose first header checksum holds. */
function isTar(data: Buffer): boolean {
	if (data.length < TAR_BLOCK) return false
	if (fieldOf({ data, offset: 0, field: TAR_HEADER.magic }).startsWith('ustar')) return true
	const stored = Number.parseInt(fieldOf({ data, offset: 0, field: TAR_HEADER.checksum }).trim(), 8)
	const [checksumStart, checksumLength] = TAR_HEADER.checksum
	let sum = 0
	for (let index = 0; index < TAR_BLOCK; index++)
		sum +=
			index >= checksumStart && index < checksumStart + checksumLength
				? TAR_CHECKSUM_SPACE
				: data[index]
	return stored === sum
}

function fieldOf(params: {
	data: Buffer
	offset: number
	field: readonly [number, number]
}): string {
	const [start, length] = params.field
	const raw = params.data.subarray(params.offset + start, params.offset + start + length)
	const end = raw.indexOf(0)
	return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8')
}

function tarFilesOf(data: Buffer): ArchiveRead {
	const files: CorpusFile[] = []
	let offset = 0
	let nextName: string | undefined
	while (offset + TAR_BLOCK <= data.length) {
		const header = data.subarray(offset, offset + TAR_BLOCK)
		if (header.every((byte) => byte === 0)) break
		if (data[offset + TAR_HEADER.size[0]] & TAR_BASE256_FLAG)
			return {
				kind: 'unsupported',
				reason: fillMessage({
					template: TAR_BASE256_SIZE,
					values: { name: nextName ?? fieldOf({ data, offset, field: TAR_HEADER.name }) },
				}),
			}
		const size = Number.parseInt(fieldOf({ data, offset, field: TAR_HEADER.size }).trim() || '0', 8)
		const type = fieldOf({ data, offset, field: TAR_HEADER.type })
		const contentStart = offset + TAR_BLOCK
		const content = data.subarray(contentStart, contentStart + size)
		offset = contentStart + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
		if (type === TAR_TYPES.pax) {
			nextName = paxPathOf(content) ?? nextName
			continue
		}
		if (type === TAR_TYPES.longName) {
			const end = content.indexOf(0)
			nextName = content.subarray(0, end === -1 ? content.length : end).toString('utf8')
			continue
		}
		const prefix = fieldOf({ data, offset: contentStart - TAR_BLOCK, field: TAR_HEADER.prefix })
		const name = fieldOf({ data, offset: contentStart - TAR_BLOCK, field: TAR_HEADER.name })
		const path = nextName ?? (prefix ? `${prefix}/${name}` : name)
		nextName = undefined
		if ((TAR_TYPES.file as readonly string[]).includes(type))
			files.push({ path, bytes: new Uint8Array(content) })
	}
	return { kind: 'files', files }
}

/** The `path` record of a pax extended header (`<length> path=<value>\n`). */
function paxPathOf(content: Buffer): string | undefined {
	for (const record of content.toString('utf8').split('\n')) {
		const space = record.indexOf(' ')
		const equals = record.indexOf('=')
		if (space !== -1 && equals > space && record.slice(space + 1, equals) === PAX_PATH_KEY)
			return record.slice(equals + 1)
	}
	return undefined
}

function readZip(params: { data: Buffer; maxBytes: number }): ArchiveRead {
	const { data, maxBytes } = params
	let inflatedBytes = 0
	const end = zipEndOf(data)
	if (end === undefined) return { kind: 'unsupported', reason: 'no end of central directory' }
	const count = data.readUInt16LE(end + 10)
	let offset = data.readUInt32LE(end + 16)
	if (count === 0xffff || offset === 0xffffffff) return { kind: 'unsupported', reason: 'zip64' }
	const files: CorpusFile[] = []
	for (let index = 0; index < count; index++) {
		if (data.readUInt32LE(offset) !== ZIP_SIGNATURES.central)
			return { kind: 'unsupported', reason: 'a broken central directory' }
		const flags = data.readUInt16LE(offset + 8)
		const method = data.readUInt16LE(offset + 10)
		const compressedSize = data.readUInt32LE(offset + 20)
		const nameLength = data.readUInt16LE(offset + 28)
		const extraLength = data.readUInt16LE(offset + 30)
		const commentLength = data.readUInt16LE(offset + 32)
		const localOffset = data.readUInt32LE(offset + 42)
		const path = data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
		offset += 46 + nameLength + extraLength + commentLength
		if (path.endsWith('/')) continue
		if (flags & 1) return { kind: 'unsupported', reason: `${path} is encrypted` }
		if (data.readUInt32LE(localOffset) !== ZIP_SIGNATURES.local)
			return { kind: 'unsupported', reason: `${path} has no local header` }
		const start =
			localOffset + 30 + data.readUInt16LE(localOffset + 26) + data.readUInt16LE(localOffset + 28)
		const stored = data.subarray(start, start + compressedSize)
		const bytes =
			method === ZIP_METHODS.stored
				? stored
				: method === ZIP_METHODS.deflated
					? inflated({ data: stored, maxBytes: maxBytes - inflatedBytes, inflate: inflateRawSync })
					: undefined
		if (bytes === 'too large') return tooLarge(maxBytes)
		if (bytes !== undefined) {
			inflatedBytes += bytes.length
			if (inflatedBytes > maxBytes) return tooLarge(maxBytes)
			files.push({ path, bytes: new Uint8Array(bytes) })
		} else return { kind: 'unsupported', reason: `${path} uses compression method ${method}` }
	}
	return { kind: 'files', files }
}

/** The offset of the end-of-central-directory record, searched back from the end over its comment. */
function zipEndOf(data: Buffer): number | undefined {
	const lowest = Math.max(0, data.length - ZIP_END_SIZE - ZIP_END_COMMENT_MAX)
	for (let offset = data.length - ZIP_END_SIZE; offset >= lowest; offset--)
		if (data.readUInt32LE(offset) === ZIP_SIGNATURES.end) return offset
	return undefined
}
