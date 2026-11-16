import type ts from 'typescript'

/**
 * A member's body walked for writes through `this`: a method or accessor judged whole, the constructor or a field
 * initializer judged only inside the functions it creates.
 */
export type WriteRegion = {
	/** The member's name as written (`add`, `#items`, `[key]`), `constructor` for the constructor. */
	name: string
	/** The member: its first token, decorators included, is where an opt-out before it applies. */
	member: ts.ClassElement
	root: ts.Node
	judgedWhole: boolean
}

/** What holds at a node of a region: a write there is judged; `this` there is the instance. */
export type WalkState = {
	judged: boolean
	thisIsInstance: boolean
}

/** A write through the instance: the node that writes and how (`=`, `.push`). */
export type ThisWrite = {
	node: ts.Node
	label: string
}
