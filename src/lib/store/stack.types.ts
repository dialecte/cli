/** A stacked lot's record (`stack.json` in its store folder): the open lot it was started on, nothing else. */
export type StackRecord = {
	schema: 1
	/** The parent lot's name (its store folder). */
	parent: string
}

/** The open lot a `--on` names, as a start reads it: its folder, name, branch and that branch's tip. */
export type StackParent = {
	lotFolder: string
	name: string
	branch: string
	head: string
}

/** A `stack.json` that does not read as a stack record: why. */
export type StackDamage = { damage: string }
