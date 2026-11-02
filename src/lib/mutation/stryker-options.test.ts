import { buildStrykerOptions } from './stryker-options.ts'

import { describe, expect, it } from 'vitest'

import type { MutationDeclaration, MutationTier } from './mutation.types.ts'

const DECLARATION: MutationDeclaration = {
	scope: ['src/**'],
	exclude: [],
	errorFactories: ['createSclError'],
	fast: { vitestConfig: 'scripts/mutants/vitest.mutation.config.ts' },
	full: { command: 'npx vitest run --project unit --bail=1' },
}
const WORK_DIR = '/work/dir'
const IGNORER_PLUGIN = '/cli/dist/stryker-ignorers.js'
const IGNORERS = ['dialecte-error-text', 'dialecte-exhaustive-default']

function args(params: {
	tier: MutationTier
	declaration?: MutationDeclaration
	concurrency?: number
}) {
	const { tier, declaration = DECLARATION, concurrency } = params
	return {
		declaration,
		tier,
		mutate: ['src/a.ts:1-3'],
		workDir: WORK_DIR,
		ignorerPlugin: IGNORER_PLUGIN,
		...(concurrency === undefined ? {} : { concurrency }),
	}
}

const TIERS = ['fast', 'timeouts', 'full'] as const

describe('buildStrykerOptions', () => {
	it.each(TIERS)('%s: the common options', (tier) => {
		expect(buildStrykerOptions(args({ tier }))).toMatchObject({
			mutate: ['src/a.ts:1-3'],
			jsonReporter: { fileName: expect.stringMatching(/^\/work\/dir\//) },
			tempDirName: expect.stringMatching(/^\/work\/dir\//),
			disableTypeChecks: false,
			ignorers: IGNORERS,
			reporters: ['progress', 'json'],
			ignorePatterns: ['.tmp', 'dist', 'doc', '.vitepress'],
			plugins: expect.arrayContaining([IGNORER_PLUGIN]),
			dialecteMutation: { errorFactories: ['createSclError'] },
		})
	})

	it.each(['fast', 'timeouts'] as const)(
		'%s: related mode is off under the vitest key, not at the top',
		(tier) => {
			const options = buildStrykerOptions(args({ tier }))
			expect(options).not.toHaveProperty('related')
			expect(options.vitest).toEqual({
				configFile: DECLARATION.fast.vitestConfig,
				related: false,
			})
		},
	)

	it('the report file and the temp folder differ per tier', () => {
		expect(
			new Set(TIERS.map((tier) => buildStrykerOptions(args({ tier })).jsonReporter.fileName)).size,
		).toBe(3)
		expect(new Set(TIERS.map((tier) => buildStrykerOptions(args({ tier })).tempDirName)).size).toBe(
			3,
		)
	})

	it('fast: the vitest runner, perTest, incremental, 10 s timeout', () => {
		expect(buildStrykerOptions(args({ tier: 'fast' }))).toMatchObject({
			testRunner: 'vitest',
			vitest: { configFile: DECLARATION.fast.vitestConfig, related: false },
			coverageAnalysis: 'perTest',
			incremental: true,
			// MUT-4, @stryker-mutator/core 10.0.0: the option is `incrementalFile` (dist/src/stryker-cli.js:112,
			// dist/src/fs/project-reader.js:37); Stryker reads it at project-reader.js:272-277 and writes it at
			// dist/src/reporters/mutation-test-report-helper.js:125-128
			incrementalFile: `${WORK_DIR}/incremental.json`,
			plugins: expect.arrayContaining(['@stryker-mutator/vitest-runner']),
			timeoutMS: 10000,
		})
	})

	it('timeouts: as fast, not incremental, one worker whatever is passed, 60 s timeout', () => {
		expect(buildStrykerOptions(args({ tier: 'timeouts', concurrency: 8 }))).toMatchObject({
			testRunner: 'vitest',
			vitest: { configFile: DECLARATION.fast.vitestConfig, related: false },
			coverageAnalysis: 'perTest',
			incremental: false,
			concurrency: 1,
			plugins: expect.arrayContaining(['@stryker-mutator/vitest-runner']),
			timeoutMS: 60000,
		})
	})

	it('timeouts and full: one worker even when no concurrency is passed', () => {
		expect(buildStrykerOptions(args({ tier: 'timeouts' }))).toMatchObject({ concurrency: 1 })
		expect(buildStrykerOptions(args({ tier: 'full' }))).toMatchObject({ concurrency: 1 })
	})

	it.each(['timeouts', 'full'] as const)('%s: incremental false and no incrementalFile', (tier) => {
		const options = buildStrykerOptions(args({ tier }))
		expect(options).toMatchObject({ incremental: false })
		expect(options).not.toHaveProperty('incrementalFile')
	})

	it('full: the command runner, no coverage analysis, one worker whatever is passed, 30 s timeout', () => {
		expect(buildStrykerOptions(args({ tier: 'full', concurrency: 8 }))).toMatchObject({
			testRunner: 'command',
			commandRunner: { command: 'npx vitest run --project unit --bail=1' },
			coverageAnalysis: 'off',
			concurrency: 1,
			timeoutMS: 30000,
		})
	})

	it('full without a declared full → throws, naming the field', () => {
		const { full: _full, ...withoutFull } = DECLARATION
		expect(() => buildStrykerOptions(args({ tier: 'full', declaration: withoutFull }))).toThrow(
			/full\.command|`full`/,
		)
	})

	it('concurrency: absent unless passed', () => {
		expect(buildStrykerOptions(args({ tier: 'fast' }))).not.toHaveProperty('concurrency')
	})

	it('concurrency: passed through when given (fast)', () => {
		expect(buildStrykerOptions(args({ tier: 'fast', concurrency: 4 }))).toMatchObject({
			concurrency: 4,
		})
	})
})
