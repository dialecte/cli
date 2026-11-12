export type Binding =
	| { kind: 'namespace'; name: string; import: string }
	| {
			kind: 'core'
			coreAlias: string
			coreImport: string
			configType: string
			configImport: string
	  }

/** One thing to bench/cover/audit — a dialect version (or the single core test dialect). */
export type Target = {
	version: string
	binding: Binding
	constantsDir: string
	outDir: string
}

/** The fields of a package.json the discovery reads. */
export type Pkg = { name?: string; dialecte?: Record<string, string> }
