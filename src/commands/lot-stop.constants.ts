/** The flags and the value options `lot stop` takes, without the dashes. */
export const STOP_FLAGS: readonly string[] = ['json']
export const STOP_VALUE_OPTIONS: readonly string[] = ['reason', 'by']

/** What `lot stop` prints: `{name}` is the lot's full name. */
export const STOP_TEXTS = {
	committed: 'lot stop: the lot {name} is committed: nothing to stop',
	stopped: 'lot stop: {name} stopped',
	already: 'lot stop: {name} is canceled already: nothing written',
	movedAside: 'stopped {name}: damaged ({damage}); its folder is now {folder}',
	landingClosed: 'pull request #{number} closed: out of the merge queue, never merged',
	landingNotClosed:
		'lot stop: pull request #{number} could not be closed ({reason}): nothing stopped; close it on the host, then stop again',
	damagedPending:
		'lot stop: {name} is damaged and its hand-over {entry} is pending: nothing moved; first: dialecte handover abandon {entry}',
	// a damaged lot kept on purpose is never moved aside: its worktree would be named by no lot (KEEP 3.7)
	damagedKept: 'lot stop: {name} is damaged and {kept}; first: {next}',
} as const
