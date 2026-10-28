import type { GateStep } from './gate/gate-config.types.ts'

/** The part of a package.json the contributor commands read. */
export type PackageJson = {
	name?: string
	scripts?: Record<string, string>
	dialecte?: DialecteField
}

/** `"dialecte"` in a package's package.json: what the contributor commands need to know about it. */
export type DialecteField = {
	/** Extended regular expressions of text never committed in this package (its standard's names). */
	referencePatterns?: string[]
	/** Files a docs build rewrites that are restored byte for byte after `gate --full`. */
	generatedDocs?: string[]
	/** Steps that replace the default ones of `dialecte gate`. */
	gate?: { fast?: GateStep[]; full?: GateStep[] }
}
