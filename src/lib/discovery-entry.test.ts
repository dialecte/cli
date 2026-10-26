import { discoveryEntry } from './discovery-entry.ts'

import { describe, expect, it } from 'vitest'

import type { Binding } from './config.ts'

const NS: Binding = { kind: 'namespace', name: 'Scl', import: '@/v1' }

describe('discoveryEntry', () => {
	it('declares q/tx/doc/project and exports them for the compiler-API walk', () => {
		const out = discoveryEntry(NS)
		expect(out).toContain("import type { Scl } from '@/v1'")
		expect(out).toContain('declare const q: Scl.Query')
		expect(out).toContain('declare const project: Scl.Project')
		expect(out).toContain('export { q, tx, doc, project }')
	})
})
