import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		// the suite may run inside a commit hook: its git commands must never reach the committed repository
		setupFiles: ['./test/git-environment.setup.ts'],
	},
})
