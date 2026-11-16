/** The test files a scratch mixed package holds in its working tree, one per runner (a runner left out has none). */
export type MixedPackageParts = {
	vitest: boolean
	node: boolean
	pytest: boolean
	/** Further files written in the working tree, on top of the stubs and test files. */
	extra?: Record<string, string>
}
