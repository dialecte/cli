/**
 * major.minor.patch, an optional pre-release and an optional build (ignored by the order); a number never starts with 0
 * unless it is 0.
 */
export const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/** A workspace protocol's prefix: `workspace:^1.2.3` admits what `^1.2.3` admits. */
export const WORKSPACE_PREFIX = 'workspace:'

/** An npm alias: `npm:<name>@<range>`; the range is what follows the last `@`. */
export const NPM_ALIAS_PREFIX = 'npm:'

/** The separator of a range's alternatives. */
export const ALTERNATIVES_SEPARATOR = '||'

/** An operator followed by spaces before its version (`>= 1.2.3`): the spaces are dropped. */
export const OPERATOR_SPACES = /(>=|<=|>|<|=|\^|~)\s+/g

/** A hyphen range `a - b`: its lower end. */
export const HYPHEN_RANGE = /^(\S+)\s+-\s+\S+$/

/** A comparator's operator and its version; a `<` or `<=` sets no lower bound. */
export const COMPARATOR = /^(\^|~|>=|>|=|<=|<)?(.*)$/

/** The operators that set an upper bound only. */
export const UPPER_BOUND_OPERATORS: readonly string[] = ['<', '<=']

/** A version or a partial one (x-ranges included), an optional leading `v`, pre-release and build. */
export const PARTIAL_VERSION =
	/^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** The wildcard parts of an x-range. */
export const WILDCARDS: readonly string[] = ['x', 'X', '*']
