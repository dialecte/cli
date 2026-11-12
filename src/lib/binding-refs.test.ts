import { refsOf } from './binding-refs.ts'

import { describe, expect, it } from 'vitest'

import type { Binding } from './config.types.ts'

const NS: Binding = { kind: 'namespace', name: 'Scl', import: '@/v1' }
const CORE: Binding = {
	kind: 'core',
	coreAlias: 'Core',
	coreImport: '@/index',
	configType: 'Cfg',
	configImport: '@/cfg',
}

describe('refsOf', () => {
	it('namespace binding renders by namespace name', () => {
		const r = refsOf(NS)
		expect(r.imports).toContain("import type { Scl } from '@/v1'")
		expect(r.elementsOf).toBe('Scl.ElementsOf')
		expect(r.generic('Ref', 'E')).toBe('Scl.Ref<E>')
	})
	it('core binding threads the config type into every generic', () => {
		const r = refsOf(CORE)
		expect(r.elementsOf).toBe('Core.ElementsOf<Cfg>')
		expect(r.generic('Ref', 'E')).toBe('Core.Ref<Cfg, E>')
	})
})
