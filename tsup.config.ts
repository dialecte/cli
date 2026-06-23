import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src/cli.ts'],
	format: ['esm'],
	target: 'node20',
	platform: 'node',
	outDir: 'dist',
	clean: true,
	splitting: false,
	sourcemap: false,
	// The TypeScript compiler API is resolved from the consumer's install (peer dep), so the types
	// `audit` renders come from the same tsc that `bench` spawns. Never bundle it.
	external: ['typescript'],
	banner: {
		js: '#!/usr/bin/env node',
	},
})
