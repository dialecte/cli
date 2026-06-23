import {
	attrValue,
	deepestPath,
	type DialecteSchema,
	discoveryEntry,
	genApiProbe,
	genCalls,
	genDeepProbe,
	genNarrowing,
	genSurface,
	refsOf,
} from './coverage.ts'

import { describe, expect, it } from 'vitest'

import type { Binding } from '../lib/config.ts'

const NS: Binding = { kind: 'namespace', name: 'Scl', import: '@/v1' }
const CORE: Binding = {
	kind: 'core',
	coreAlias: 'Core',
	coreImport: '@/index',
	configType: 'Cfg',
	configImport: '@/cfg',
}

const SCHEMA: DialecteSchema = {
	elements: ['Root', 'Item'],
	children: { Root: ['Item'], Item: [] },
	singletons: ['Root'],
	definition: {
		Root: {},
		Item: {
			attributes: {
				details: { name: { required: true }, kind: { facets: { enumeration: ['', 'a', 'b'] } } },
			},
		},
	},
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

describe('attrValue', () => {
	it('prefers fixed, then the first non-empty enum, else "x"', () => {
		expect(attrValue({ fixed: '1.0' })).toBe('1.0')
		expect(attrValue({ facets: { enumeration: ['', 'a', 'b'] } })).toBe('a')
		expect(attrValue(undefined)).toBe('x')
		expect(attrValue({})).toBe('x')
	})
})

describe('genCalls', () => {
	const out = genCalls(SCHEMA, NS)
	it('uses a bare ref for singletons and an id for the rest', () => {
		expect(out).toContain("q.getRecord({ tagName: 'Root' })")
		expect(out).toContain("q.getRecord({ tagName: 'Item', id: 'x' })")
	})
	it('fills required attributes on addChild', () => {
		expect(out).toContain(
			"tx.addChild({ tagName: 'Root' }, { tagName: 'Item', attributes: { 'name': 'x' } })",
		)
	})
	it('only emits getAttribute for elements that have attributes', () => {
		expect(out).not.toContain("q.getAttribute({ tagName: 'Root' }")
		expect(out).toContain("q.getAttribute({ tagName: 'Item', id: 'x' }, { name: 'name' })")
	})
	it('respects COVERAGE_CHILD_CAP', () => {
		const prev = process.env.COVERAGE_CHILD_CAP
		process.env.COVERAGE_CHILD_CAP = '0'
		try {
			expect(genCalls(SCHEMA, NS)).not.toContain('addChild')
		} finally {
			if (prev === undefined) delete process.env.COVERAGE_CHILD_CAP
			else process.env.COVERAGE_CHILD_CAP = prev
		}
	})
})

describe('genSurface', () => {
	it('fans every element-generic out over the element union', () => {
		const out = genSurface(NS)
		expect(out).toContain('type All_Ref = { [E in Scl.ElementsOf]: Scl.Ref<E> }[Scl.ElementsOf]')
		expect(out).toContain('export type CoverageSurface = [All_Ref,')
	})
})

describe('deepestPath', () => {
	it('follows the highest-fan-out child chain', () => {
		const children = { A: ['B'], B: ['C', 'X'], C: ['D'], D: [], X: [] }
		expect(deepestPath('A', children)).toEqual(['A', 'B', 'C', 'D'])
	})
	it('stops on a cycle rather than looping forever', () => {
		expect(deepestPath('A', { A: ['B'], B: ['A'] })).toEqual(['A', 'B'])
	})
})

describe('genDeepProbe', () => {
	it('builds a nested select/collect following valid edges from the root', () => {
		const out = genDeepProbe({ ...SCHEMA, root: 'Root' }, NS)
		expect(out).toContain('declare const q: Scl.Query')
		expect(out).toContain("await q.getTree({ tagName: 'Root' }, { select: { Item: true } })")
		expect(out).toContain(
			"await q.findDescendants({ tagName: 'Root' }, { collect: { Item: true } })",
		)
	})
})

describe('genNarrowing', () => {
	const out = genNarrowing({ ...SCHEMA, root: 'Root' }, NS)
	it('asserts id-optional true for singletons, false for the rest', () => {
		expect(out).toContain("Expect<Equal<IdOptional<'Root'>, true>>")
		expect(out).toContain("Expect<Equal<IdOptional<'Item'>, false>>")
	})
	it('asserts every child edge and the record tagName', () => {
		expect(out).toContain("Expect<Includes<'Item', Scl.ChildrenOf<'Root'>>>")
		expect(out).toContain("Expect<Equal<Scl.TrackedRecord<'Item'>['tagName'], 'Item'>>")
	})
	it('asserts the element union is not widened to string + the root', () => {
		expect(out).toContain('Expect<Equal<Includes<string, Scl.ElementsOf>, false>>')
		expect(out).toContain("Expect<Equal<Scl.RootElementOf, 'Root'>>")
	})
	it('emits core-binding forms when bound to core', () => {
		const core = genNarrowing(SCHEMA, CORE)
		expect(core).toContain('Core.Ref<Cfg, E>')
		expect(core).toContain("Core.ChildrenOf<Cfg, 'Root'>")
	})
})

describe('discoveryEntry', () => {
	it('declares q/tx/doc/project and exports them for the compiler-API walk', () => {
		const out = discoveryEntry(NS)
		expect(out).toContain("import type { Scl } from '@/v1'")
		expect(out).toContain('declare const q: Scl.Query')
		expect(out).toContain('declare const project: Scl.Project')
		expect(out).toContain('export { q, tx, doc, project }')
	})
})

describe('genApiProbe', () => {
	const paths = ['q.getRecord', 'q.history.getSortedHitems', 'tx.dataModel.extract']
	it('instantiates Parameters + Awaited<ReturnType> of every discovered method (incl. extensions)', () => {
		const out = genApiProbe(NS, paths)
		expect(out).toContain('declare const q: Scl.Query')
		expect(out).toContain('export type MP_0 = Parameters<typeof q.getRecord>')
		expect(out).toContain('export type MR_0 = Awaited<ReturnType<typeof q.getRecord>>')
		expect(out).toContain('export type MP_1 = Parameters<typeof q.history.getSortedHitems>')
		expect(out).toContain('export type MR_2 = Awaited<ReturnType<typeof tx.dataModel.extract>>')
		expect(out).toContain('export type CoverageApi = [MP_0, MR_0, MP_1, MR_1, MP_2, MR_2]')
	})
	it('uses core-binding container forms', () => {
		const out = genApiProbe(CORE, ['q.getRecord'])
		expect(out).toContain('declare const q: Core.Query<Cfg>')
		expect(out).toContain('declare const doc: Core.Document<Cfg>')
	})
})
