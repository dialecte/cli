import { formatFiles, formatOptsFromArgv } from './format.ts'

import { describe, expect, it } from 'vitest'

describe('formatOptsFromArgv', () => {
	it('reads --format-config and --no-format', () => {
		expect(formatOptsFromArgv(['--format-config', 'x.json'])).toEqual({
			config: 'x.json',
			skip: false,
		})
		expect(formatOptsFromArgv(['--no-format'])).toEqual({ config: undefined, skip: true })
		expect(formatOptsFromArgv([])).toEqual({ config: undefined, skip: false })
	})
})

describe('formatFiles', () => {
	it('is a no-op when skip is set or no files given', () => {
		expect(() => formatFiles('/nonexistent', ['/x.json'], { skip: true })).not.toThrow()
		expect(() => formatFiles('/nonexistent', [])).not.toThrow()
	})
	it('warns but never throws when oxfmt is absent from the project', () => {
		// /tmp has no node_modules/.bin/oxfmt — must degrade gracefully, never crash a command.
		expect(() => formatFiles('/tmp', ['/x.json'])).not.toThrow()
	})
})
