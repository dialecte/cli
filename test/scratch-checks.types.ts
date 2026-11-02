/** Why the lot of a scenario is rehearsed; `undefined` for a reason the brief leaves open (any non-empty one). */
export type RehearsedVariant =
	| 'no gate record'
	| 'a gate of an earlier tree'
	| 'the lot changes package-lock.json'
	| 'the hook stages files'
	| 'node_modules/.package-lock.json changed since the gate'
	| 'a linked dependency changed since the gate'
	| '--full'
