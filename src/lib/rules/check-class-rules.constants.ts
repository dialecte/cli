/** A `class` finding: `{name}` the class. */
export const CLASS_MESSAGE =
	'class `{name}` is no public facade nor store: a class passes when a package entry exports it (`exports` in package.json, re-exports followed), it `implements` an interface, or it is an Error subclass holding only fields and a constructor; else write functions over explicit state, or keep it with `dialecte-allow class: <why>`'

/** A write through `this` in a class the class rule does not admit: `{owner}`, `{target}`, `{label}`. */
export const THIS_WRITE_MESSAGE =
	'`{owner}` changes `{target}` (`{label}`) in a class the class rule does not admit (no entry export, no interface, no data-only error): return the new value from a function over explicit state instead'

/** The name a finding gives a class with none (`export default class {}`). */
export const ANONYMOUS_CLASS_NAME = 'default'

/** Tells a text that may hold a class from one that holds none, before a package's entries are read for it. */
export const CLASS_KEYWORD_PATTERN = /\bclass\b/

/** A base an error class extends: `Error`, `TypeError`, a package's own `ConfigError`. */
export const ERROR_BASE_PATTERN = /Error$/
