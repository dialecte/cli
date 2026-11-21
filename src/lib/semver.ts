/**
 * Semver: parse and order versions, and read the lowest version a dependency range admits.
 */
import {
	ALTERNATIVES_SEPARATOR,
	COMPARATOR,
	HYPHEN_RANGE,
	NPM_ALIAS_PREFIX,
	OPERATOR_SPACES,
	PARTIAL_VERSION,
	SEMVER,
	UPPER_BOUND_OPERATORS,
	WILDCARDS,
	WORKSPACE_PREFIX,
} from './semver.constants.ts'

import type { LowerBound, SemVer } from './semver.types.ts'

/** The parts of a semver version, or undefined when it is not one (leading zeros included). */
export function parseSemVer(version: string): SemVer | undefined {
	const match = SEMVER.exec(version)
	if (match === null) return undefined
	return {
		core: [Number(match[1]), Number(match[2]), Number(match[3])],
		prerelease: match[4] === undefined ? [] : match[4].split('.'),
	}
}

/** Semver precedence: negative when the first is below the second, 0 when equal, positive above. */
export function compareSemVer(first: SemVer, second: SemVer): number {
	const coreOrder = first.core
		.map((part, index) => part - (second.core[index] ?? 0))
		.find((difference) => difference !== 0)
	if (coreOrder !== undefined) return coreOrder
	if (first.prerelease.length === 0 || second.prerelease.length === 0) {
		return second.prerelease.length - first.prerelease.length
	}
	const length = Math.max(first.prerelease.length, second.prerelease.length)
	const order = Array.from({ length }, (_, index) =>
		comparePrereleasePart({ first: first.prerelease[index], second: second.prerelease[index] }),
	).find((difference) => difference !== 0)
	return order ?? 0
}

/** One pre-release identifier against another: absent first, numbers before words, numbers by value. */
export function comparePrereleasePart(params: {
	first: string | undefined
	second: string | undefined
}): number {
	const { first, second } = params
	if (first === undefined || second === undefined) {
		return first === undefined ? (second === undefined ? 0 : -1) : 1
	}
	const firstNumeric = /^\d+$/.test(first)
	const secondNumeric = /^\d+$/.test(second)
	if (firstNumeric && secondNumeric) return Number(first) - Number(second)
	if (firstNumeric !== secondNumeric) return firstNumeric ? -1 : 1
	return first < second ? -1 : first > second ? 1 : 0
}

/**
 * The lowest version the dependency range `spec` admits; undefined for a range with no lower bound and for a
 * spec that is no semver range (a path, a link, a url, a dist-tag).
 */
export function lowestVersionOf(params: { spec: string }): string | undefined {
	const bound = rangeLowerBoundOf(params)
	return bound.kind === 'version' ? bound.version : undefined
}

/**
 * The lower bound of the dependency range `spec`: the lowest version it admits; `none` for a range with no lower
 * bound (`*`, `workspace:*`, `<2.0.0`, an alternative without one); `invalid` for a spec that is no semver range (a
 * path, a link, a url, a dist-tag).
 */
export function rangeLowerBoundOf(params: { spec: string }): LowerBound {
	const range = rangeOf({ spec: params.spec })
	const bounds = range
		.split(ALTERNATIVES_SEPARATOR)
		.map((alternative) => lowerBoundOf({ alternative }))
	if (bounds.some((bound) => bound.kind === 'invalid')) return { kind: 'invalid' }
	const versions = bounds.flatMap((bound) => (bound.kind === 'version' ? [bound.version] : []))
	if (versions.length < bounds.length) return { kind: 'none' }
	return { kind: 'version', version: lowestOf({ versions }) }
}

/** The range a spec holds: a workspace prefix dropped, an npm alias read as its range. */
function rangeOf(params: { spec: string }): string {
	const spec = params.spec.trim()
	if (spec.startsWith(WORKSPACE_PREFIX)) return spec.slice(WORKSPACE_PREFIX.length)
	if (spec.startsWith(NPM_ALIAS_PREFIX)) return spec.slice(spec.lastIndexOf('@') + 1)
	return spec
}

/** The lower bound of one alternative of a range: a version, none (it admits anything below), or no range at all. */
function lowerBoundOf(params: { alternative: string }): LowerBound {
	const alternative = params.alternative.trim().replace(OPERATOR_SPACES, '$1')
	const hyphen = HYPHEN_RANGE.exec(alternative)
	if (hyphen !== null) return comparatorBoundOf({ comparator: hyphen[1] })
	const bounds = alternative
		.split(/\s+/)
		.filter((comparator) => comparator !== '')
		.map((comparator) => comparatorBoundOf({ comparator }))
	if (bounds.some((bound) => bound.kind === 'invalid')) return { kind: 'invalid' }
	const versions = bounds.flatMap((bound) => (bound.kind === 'version' ? [bound.version] : []))
	if (versions.length === 0) return { kind: 'none' }
	return { kind: 'version', version: highestOf({ versions }) }
}

/** The lower bound one comparator sets: `<`/`<=` and a whole wildcard set none. */
function comparatorBoundOf(params: { comparator: string }): LowerBound {
	const match = COMPARATOR.exec(params.comparator)
	const operator = match?.[1] ?? ''
	const partial = PARTIAL_VERSION.exec(match?.[2] ?? '')
	if (partial === null) return { kind: 'invalid' }
	if (UPPER_BOUND_OPERATORS.includes(operator)) return { kind: 'none' }
	const [, major, minor, patch, prerelease] = partial
	if (WILDCARDS.includes(major)) return { kind: 'none' }
	const parts = [major, minor, patch]
	const firstOpen = parts.findIndex((part) => part === undefined || WILDCARDS.includes(part))
	const core = parts.map((part, index) => (firstOpen !== -1 && index >= firstOpen ? '0' : part))
	const version = `${core.join('.')}${firstOpen === -1 && prerelease !== undefined ? `-${prerelease}` : ''}`
	return parseSemVer(version) === undefined ? { kind: 'invalid' } : { kind: 'version', version }
}

/** The highest of semver versions. */
function highestOf(params: { versions: readonly string[] }): string {
	return params.versions.reduce((highest, version) =>
		compareVersionTexts({ first: version, second: highest }) > 0 ? version : highest,
	)
}

/** The lowest of semver versions. */
function lowestOf(params: { versions: readonly string[] }): string {
	return params.versions.reduce((lowest, version) =>
		compareVersionTexts({ first: version, second: lowest }) < 0 ? version : lowest,
	)
}

/** Semver precedence of two version texts known to parse. */
function compareVersionTexts(params: { first: string; second: string }): number {
	const first = parseSemVer(params.first)
	const second = parseSemVer(params.second)
	if (first === undefined || second === undefined) return 0
	return compareSemVer(first, second)
}
