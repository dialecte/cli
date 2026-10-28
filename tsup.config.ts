import { defineConfig } from 'tsup'

import type { Options } from 'tsup'

const SHARED: Options = {
	format: ['esm'],
	target: 'node22',
	platform: 'node',
	outDir: 'dist',
	splitting: false,
	sourcemap: false,
	// The TypeScript compiler API is resolved from the consumer's install (peer dep), so the types
	// `audit` renders come from the same tsc that `bench` spawns. Never bundle it.
	external: ['typescript'],
}

export default defineConfig([
	{
		...SHARED,
		// the `dialecte` bin
		entry: ['src/cli.ts'],
		clean: true,
		banner: {
			js: '#!/usr/bin/env node',
		},
	},
	{
		...SHARED,
		// the library entry `@dialecte/cli/lookups`, with its declaration files
		entry: ['src/lookups.ts'],
		clean: false,
		// tsup's declaration build sets `baseUrl`, which TypeScript 6 deprecates
		dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
	},
])
