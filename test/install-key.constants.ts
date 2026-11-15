/** The installed locks the install-key tests write: the same packages told in different ways. */

/** What a lock holds besides its packages. */
export const ROOT_FIELDS_A = { name: 'app', version: '1.0.0', lockfileVersion: 3, requires: true }
export const ROOT_FIELDS_B = {
	name: 'other-app',
	version: '2.4.0',
	lockfileVersion: 3,
	requires: true,
}

/** Two installed packages, `a` then `b`. */
export const PACKAGES = {
	'node_modules/a': { version: '1.0.0', resolved: 'https://registry.test/a-1.0.0.tgz', dev: true },
	'node_modules/b': {
		version: '2.0.0',
		license: 'MIT',
		dependencies: { x: '^1.0.0', y: '^2.0.0' },
	},
}

/** The same two packages, `b` first, and each entry's fields in another order. */
export const PACKAGES_REORDERED = {
	'node_modules/b': {
		license: 'MIT',
		dependencies: { y: '^2.0.0', x: '^1.0.0' },
		version: '2.0.0',
	},
	'node_modules/a': { dev: true, resolved: 'https://registry.test/a-1.0.0.tgz', version: '1.0.0' },
}

/** `PACKAGES` with `c` added, `b` removed, `a` at another version. */
export const PACKAGES_WITH_C = {
	...PACKAGES,
	'node_modules/c': { version: '3.0.0' },
}
export const PACKAGES_WITHOUT_B = { 'node_modules/a': PACKAGES['node_modules/a'] }
export const PACKAGES_A_NEWER = {
	...PACKAGES,
	'node_modules/a': { ...PACKAGES['node_modules/a'], version: '1.0.1' },
}

/** A file that is no JSON, and a JSON with no `packages` object. */
export const NOT_JSON_LOCK = 'lock-1\n'
export const NO_PACKAGES_LOCK = '{"name":"app","version":"1.0.0"}\n'
export const PACKAGES_NOT_AN_OBJECT_LOCK = '{"packages":[1,2]}\n'
