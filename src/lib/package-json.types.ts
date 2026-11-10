import type { GateStep } from './gate/gate-config.types.ts'

/** The part of a package.json the contributor commands read. */
export type PackageJson = {
	name?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	optionalDependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
	dialecte?: DialecteField
}

/** `"dialecte"` in a package's package.json: what the contributor commands need to know about it. */
export type DialecteField = {
	/** Extended regular expressions of text never committed in this package (its standard's names). */
	referencePatterns?: string[]
	/**
	 * Labels of generic patterns this package commits on purpose (an app citing its tickets: `ticket number`,
	 * `acceptance criterion`, `plan tag`); a citation of a standard is never allowed.
	 */
	allowReferences?: string[]
	/** Files a docs build rewrites that are restored byte for byte after `gate --full`. */
	generatedDocs?: string[]
	/** The branch work is merged into (`main` when not said): `worktree add` starts from it, `worktree prune` compares with it. */
	baseBranch?: string
	/** `contributor` (a package of the Dialecte family) or `consumer` (an app; the default). */
	profile?: string
	/** The package steps of `dialecte contrib`, replacing the default ones (`docs`, `type-bench`). */
	contrib?: { steps?: GateStep[] }
	/** Steps that replace the default ones of `dialecte gate`. */
	gate?: { fast?: GateStep[]; full?: GateStep[]; release?: GateStep[] }
	/**
	 * `dialecte tdd`: `production` lists folders (`src/test`) whose files are production code although
	 * their name says test (a package's test entry): only the test files, fixtures, snapshots and
	 * `*.script.ts` under them stay test code.
	 */
	tdd?: { production?: string[] }
	/**
	 * Ignored folders, relative to this package root and ending with `/` (`coverage/`), that a build or a run
	 * rebuilds: a worktree removal may delete them. Read from the main checkout's package.json only; an entry of
	 * another shape (absolute, climbing with `..`, without its trailing `/`, not a string) counts for nothing.
	 */
	rebuiltIgnored?: unknown[]
}
