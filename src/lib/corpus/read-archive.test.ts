/** `readArchive` on the tar and zip forms the open sources use: names as the archive stores them, regular files only. */
import { gzipSync } from 'node:zlib'

import { tarOf, zipOf } from '../../../test/corpus-fixtures.ts'
import { readArchive } from './read-archive.ts'

import { describe, expect, it } from 'vitest'

import type { ArchiveRead } from './corpus.types.ts'

/** Each file of a read as path -> text. */
function textsOf(read: ArchiveRead): Record<string, string> | ArchiveRead {
	if (read.kind !== 'files') return read
	return Object.fromEntries(
		read.files.map((file) => [file.path, Buffer.from(file.bytes).toString('utf8')]),
	)
}

/** A pax extended header record naming `path`. */
function paxPath(path: string): string {
	const body = ` path=${path}\n`
	let length = body.length + 1
	while (`${length}${body}`.length !== length) length = `${length}${body}`.length
	return `${length}${body}`
}

describe('readArchive', () => {
	it.each([
		{
			case: 'a pax path naming the next entry',
			bytes: tarOf([
				{ name: 'PaxHeader', type: 'x', text: paxPath(`deep/${'x'.repeat(120)}.xsd`) },
				{ name: 'short.xsd', text: 'long\n' },
			]),
			expected: { [`deep/${'x'.repeat(120)}.xsd`]: 'long\n' },
		},
		{
			case: 'a GNU long name naming the next entry',
			bytes: tarOf([
				{ name: '././@LongLink', type: 'L', text: `gnu/${'y'.repeat(120)}.xsd\0` },
				{ name: 'short.xsd', text: 'gnu\n' },
			]),
			expected: { [`gnu/${'y'.repeat(120)}.xsd`]: 'gnu\n' },
		},
		{
			case: 'a ustar prefix',
			bytes: tarOf([{ name: 'name.xsd', prefix: 'a/prefix', text: 'prefixed\n' }]),
			expected: { 'a/prefix/name.xsd': 'prefixed\n' },
		},
		{
			case: 'an old tar without the ustar magic',
			bytes: tarOf([{ name: 'old.xsd', old: true, text: 'old\n' }]),
			expected: { 'old.xsd': 'old\n' },
		},
		{
			case: 'a link and a folder entry, never read',
			bytes: gzipSync(
				tarOf([
					{ name: 'folder/', type: '5', text: '' },
					{ name: 'link.xsd', type: '2', text: '' },
					{ name: 'folder/file.xsd', text: 'file\n' },
				]),
			),
			expected: { 'folder/file.xsd': 'file\n' },
		},
		{
			case: 'zip entries stored and with a data descriptor',
			bytes: zipOf([
				{ name: 'stored.xsd', stored: true, text: 'stored\n' },
				{ name: 'described.xsd', descriptor: true, text: 'described\n' },
				{ name: 'folder/', stored: true, text: '' },
			]),
			expected: { 'stored.xsd': 'stored\n', 'described.xsd': 'described\n' },
		},
	])('reads $case', ({ bytes, expected }) => {
		expect(textsOf(readArchive({ bytes }))).toEqual(expected)
	})

	it('answers unknown for bytes that are no archive', () => {
		expect(readArchive({ bytes: Buffer.from('<html>not an archive</html>') })).toEqual({
			kind: 'unknown',
		})
	})

	it('reads a contiguous-file entry (type 7) as a file, as tar readers do', () => {
		expect(
			textsOf(readArchive({ bytes: tarOf([{ name: 'c.xsd', type: '7', text: 'contiguous\n' }]) })),
		).toEqual({
			'c.xsd': 'contiguous\n',
		})
	})

	it('answers unsupported, naming it, for a size in GNU base-256 form', () => {
		expect(
			readArchive({ bytes: tarOf([{ name: 'big.xsd', base256Size: true, text: 'b\n' }]) }),
		).toEqual({
			kind: 'unsupported',
			reason: 'big.xsd has its size in base-256 form',
		})
	})

	it.each([
		{ case: 'a gzip', bytes: gzipSync(tarOf([{ name: 'zeros.xsd', text: '0'.repeat(20_000) }])) },
		{
			case: 'a deflated zip entry',
			bytes: zipOf([{ name: 'zeros.xsd', text: '0'.repeat(20_000) }]),
		},
	])('answers unsupported for $case that inflates past maxBytes', ({ bytes }) => {
		expect(readArchive({ bytes, maxBytes: 5_000 })).toEqual({
			kind: 'unsupported',
			reason: 'it inflates past 5000 bytes',
		})
	})

	it('answers unsupported naming the reason zlib gives for a deflated entry that does not inflate', () => {
		const zip = Buffer.from(zipOf([{ name: 'a.xsd', text: 'a'.repeat(200) }]))
		zip.fill(0xff, 35, 36)

		expect(readArchive({ bytes: zip })).toEqual({
			kind: 'unsupported',
			reason: expect.stringMatching(/^a\.xsd could not be read \(.+\)$/u),
		})
	})

	it('reads an empty deflated entry once the limit is reached by the others', () => {
		const bytes = zipOf([
			{ name: 'full.xsd', stored: true, text: '12345' },
			{ name: 'empty.xsd', text: '' },
		])

		expect(textsOf(readArchive({ bytes, maxBytes: 5 }))).toEqual({
			'full.xsd': '12345',
			'empty.xsd': '',
		})
	})
})
