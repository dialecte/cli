/** A stacked lot's record (`stack.json` in its store folder): the open lot it was started on, and that lot's tip it holds. */
export type StackRecord = {
	schema: 1
	/** The parent lot's name (its store folder). */
	parent: string
	/** The parent branch's commit the lot's own commits sit on: what a rebase off the parent drops. */
	parentHead: string
	at: string
	/** How its pull request stacks, decided at its first landing: a native stack, or based on the parent's branch. */
	route?: StackRoute
}

/** How a stacked pull request stacks: linked by the host (`native`), or based on the parent's branch (`branch`). */
export type StackRoute = 'native' | 'branch'

/** The open lot a `--on` names, as a start reads it: its folder, name, branch and that branch's tip. */
export type StackParent = {
	lotFolder: string
	name: string
	branch: string
	head: string
}
