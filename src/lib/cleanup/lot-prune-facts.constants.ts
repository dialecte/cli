/** The step a review throwaway's creation is recorded under, in the lot's `events.jsonl`. */
export const THROWAWAY_ADD_STEP = 'throwaway-add'

/** A review throwaway's branch, `<lot branch>-round-<n>`: `<n>` first. */
export const THROWAWAY_ROUND_PATTERN = /-round-([1-9]\d*)$/

/** Why `lot prune` keeps a throwaway or cannot read a lot, beyond the plan's reasons; `{...}` filled. */
export const PRUNE_FACT_TEXTS = {
	noRecords: 'no lot records that read',
	simulated: 'simulated: never removed',
	notRound: 'not on its lot branch -round-<n> with that round snapshot',
	locked: 'locked (git worktree lock)',
	runFrom: 'lot prune runs from inside it: run it from another folder',
	process: 'a process works in it: pid {pid}',
	link: 'the link {link} points to it',
	handoverRunning: 'a hand-over runs in it',
	openHandover: 'hand-over {name} {state} names it',
	statusUnread: 'git cannot read its status',
	leftInTrash: 'a removal left it in the trash',
} as const
