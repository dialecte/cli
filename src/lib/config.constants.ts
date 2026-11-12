import type { Target } from './config.types.ts'

/**
 * Core benches its own engine through a generic *test* dialect (it has no `src/<v>/definition` layout).
 * Hard-coded and matched by package name, so core's package.json needs NO "dialecte" config — identical
 * in shape to every dialect's. CLI flags (--version/--constants-dir/--out) still override.
 */
export const CORE_PACKAGE = '@dialecte/core'
export const CORE_TEST_DIALECT: Target = {
	version: 'core',
	binding: {
		kind: 'core',
		coreAlias: 'Core',
		coreImport: '@/index',
		configType: 'TestDialecteConfig',
		configImport: '@/test/config',
	},
	constantsDir: './src/test/generated',
	outDir: './benchmarks/types/generated',
}
