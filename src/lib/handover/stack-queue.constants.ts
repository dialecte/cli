/** Why `lot approve` cannot queue a stacked lot now; `{…}` placeholders filled. */
export const STACK_QUEUE_LINES = {
	damaged: '{lot} is damaged: its {damage}',
	noParent:
		'{lot} stacks on {parent}, whose records do not read: dialecte lot status {parent} says how',
	noBase: '{lot} stacks on {parent} and the host does not say what #{number} merges into',
	noParentChangeRequest:
		'{lot} stacks on {parent}, whose branch {branch} has no open pull request: lot land {parent} first',
	parentMerged:
		'{lot} stacks on #{number} ({parent}), merged: lot land {lot} again moves it onto the base, then approve it',
	waits:
		'{lot} waits for #{number} ({parent}) to merge: without native stacks a stacked lot queues after its parent; then lot land {lot} again',
	parentNotQueued:
		'{lot} stacks on #{number} ({parent}), not queued yet: approve {parent} first, the stack queues with it',
} as const
