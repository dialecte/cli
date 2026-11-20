import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import { DISCOVERY_CACHE, VERSION } from '../../test/bench-repository.constants.ts'
import { packageFilesOf } from '../../test/bench-repository.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { linesWritten, spyStreams } from '../../test/stream-spies.ts'
import {
	attributeValue,
	deepestPath,
	generateTargetCoverage,
	genApiProbe,
	genCalls,
	genDeepProbe,
	genNarrowing,
	genSurface,
	run as runCoverage,
} from './coverage.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Binding, Target } from '../lib/config.types.ts'
import type { DialecteSchema } from './coverage.types.ts'

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
				details: {
					name: { required: true },
					kind: { type: { builtin: 'token', facets: { enumeration: ['', 'a', 'b'] } } },
				},
			},
		},
	},
}

describe('attributeValue', () => {
	it('prefers fixed, then the first non-empty enum, else "x"', () => {
		expect(attributeValue({ fixed: '1.0' })).toBe('1.0')
		expect(
			attributeValue({ type: { builtin: 'token', facets: { enumeration: ['', 'a', 'b'] } } }),
		).toBe('a')
		// a union's members enumerate it; qualified names are not written as a document holds them
		expect(
			attributeValue({
				type: {
					union: [{ builtin: 'int' }, { builtin: 'token', facets: { enumeration: ['none'] } }],
				},
			}),
		).toBe('none')
		expect(
			attributeValue({ type: { builtin: 'QName', facets: { enumeration: ['{urn:t}x'] } } }),
		).toBe('x')
		expect(attributeValue(undefined)).toBe('x')
		expect(attributeValue({})).toBe('x')
	})
})

describe('genCalls', () => {
	const out = genCalls({ schema: SCHEMA, binding: NS })
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
			expect(genCalls({ schema: SCHEMA, binding: NS })).not.toContain('addChild')
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
		expect(deepestPath({ root: 'A', children })).toEqual(['A', 'B', 'C', 'D'])
	})
	it('stops on a cycle rather than looping forever', () => {
		expect(deepestPath({ root: 'A', children: { A: ['B'], B: ['A'] } })).toEqual(['A', 'B'])
	})
})

describe('genDeepProbe', () => {
	it('builds a nested select/collect following valid edges from the root', () => {
		const out = genDeepProbe({ schema: { ...SCHEMA, root: 'Root' }, binding: NS })
		expect(out).toContain('declare const q: Scl.Query')
		expect(out).toContain("await q.getTree({ tagName: 'Root' }, { select: { Item: true } })")
		expect(out).toContain(
			"await q.findDescendants({ tagName: 'Root' }, { collect: { Item: true } })",
		)
	})
})

describe('genNarrowing', () => {
	const out = genNarrowing({ schema: { ...SCHEMA, root: 'Root' }, binding: NS })
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
		const core = genNarrowing({ schema: SCHEMA, binding: CORE })
		expect(core).toContain('Core.Ref<Cfg, E>')
		expect(core).toContain("Core.ChildrenOf<Cfg, 'Root'>")
	})
})

describe('genApiProbe', () => {
	const paths = ['q.getRecord', 'q.history.getSortedHitems', 'tx.dataModel.extract']
	it('instantiates Parameters + Awaited<ReturnType> of every discovered method (incl. extensions)', () => {
		const out = genApiProbe({ binding: NS, methodPaths: paths })
		expect(out).toContain('declare const q: Scl.Query')
		expect(out).toContain('export type MP_0 = Parameters<typeof q.getRecord>')
		expect(out).toContain('export type MR_0 = Awaited<ReturnType<typeof q.getRecord>>')
		expect(out).toContain('export type MP_1 = Parameters<typeof q.history.getSortedHitems>')
		expect(out).toContain('export type MR_2 = Awaited<ReturnType<typeof tx.dataModel.extract>>')
		expect(out).toContain('export type CoverageApi = [MP_0, MR_0, MP_1, MR_1, MP_2, MR_2]')
	})
	it('uses core-binding container forms', () => {
		const out = genApiProbe({ binding: CORE, methodPaths: ['q.getRecord'] })
		expect(out).toContain('declare const q: Core.Query<Cfg>')
		expect(out).toContain('declare const doc: Core.Document<Cfg>')
	})
})

const DEMO_TARGET: Target = {
	version: VERSION,
	binding: { kind: 'namespace', name: 'Demo', import: `@/${VERSION}` },
	constantsDir: `./src/${VERSION}/definition`,
	outDir: `./benchmarks/types/${VERSION}/generated`,
}
const PROBES = [
	'baseline.ts',
	'coverage.calls.generated.ts',
	'coverage.deep.generated.ts',
	'coverage.surface.generated.ts',
]

describe('generateTargetCoverage: the probes of a package in another folder than the process', () => {
	it('→ the probes land in that package, the api probe with them', async () => {
		const root = temporaryFolder('dialecte-coverage-target-')
		writeFiles({ root, files: packageFilesOf() })

		await expect(
			generateTargetCoverage({ root, target: DEMO_TARGET, tsconfig: 'tsconfig.build.json' }).then(
				function writtenIn(coverage) {
					return {
						written: coverage.written.map((path) => relative(root, path)).sort(),
						discoveryFailure: coverage.discoveryFailure,
					}
				},
			),
		).resolves.toEqual({
			written: [...PROBES, 'coverage.api.generated.ts']
				.sort()
				.map((name) => `benchmarks/types/${VERSION}/generated/${name}`),
			discoveryFailure: undefined,
		})
	})

	it('method discovery fails → the failure is returned, the api probe left out; the coverage command still prints its warning', async () => {
		const root = temporaryFolder('dialecte-coverage-target-')
		writeFiles({ root, files: { ...packageFilesOf(), [DISCOVERY_CACHE]: 'a file\n' } })

		await expect(
			generateTargetCoverage({ root, target: DEMO_TARGET, tsconfig: 'tsconfig.build.json' }).then(
				async function writtenIn(coverage) {
					const streams = spyStreams()
					vi.spyOn(process, 'cwd').mockReturnValue(root)
					await runCoverage(['--no-format'])
					return {
						written: coverage.written.map((path) => relative(root, path)).sort(),
						discoveryFailure: coverage.discoveryFailure,
						warned: linesWritten(streams.stderr).some((line) =>
							line.includes('method-surface discovery failed'),
						),
					}
				},
			),
		).resolves.toEqual({
			written: PROBES.map((name) => `benchmarks/types/${VERSION}/generated/${name}`),
			discoveryFailure: expect.any(String),
			warned: true,
		})
	})

	it('method discovery fails, an api probe left by an earlier run → that probe is removed: no stale probe is measured', async () => {
		const root = temporaryFolder('dialecte-coverage-target-')
		const staleProbe = `benchmarks/types/${VERSION}/generated/coverage.api.generated.ts`
		writeFiles({
			root,
			files: {
				...packageFilesOf(),
				[DISCOVERY_CACHE]: 'a file\n',
				[staleProbe]: 'export type Stale = 1\n',
			},
		})

		await expect(
			generateTargetCoverage({ root, target: DEMO_TARGET, tsconfig: 'tsconfig.build.json' }).then(
				function staleLeft() {
					return existsSync(join(root, staleProbe))
				},
			),
		).resolves.toBe(false)
	})
})

afterEach(() => {
	vi.restoreAllMocks()
})
