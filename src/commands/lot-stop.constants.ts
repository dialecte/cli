/** The flags and the value options `lot stop` takes, without the dashes. */
export const STOP_FLAGS: readonly string[] = ['json']
export const STOP_VALUE_OPTIONS: readonly string[] = ['reason', 'by']

/** What `lot stop` prints: `{name}` is the lot's full name. */
export const STOP_TEXTS = {
	committed: 'lot stop: the lot {name} is committed: nothing to stop',
	stopped: 'lot stop: {name} stopped',
	already: 'lot stop: {name} is canceled already: nothing written',
	movedAside: 'stopped {name}: damaged ({damage}); its folder is now {folder}',
	damagedPending:
		'lot stop: {name} is damaged and its hand-over {entry} is pending: nothing moved; first: dialecte handover abandon {entry}',
} as const
