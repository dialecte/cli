/** `dialecte lot land`: its refusals; `{lot}` the id given. */
export const LOT_LAND_LINES = {
	noWorktree:
		'lot land: {lot} has no worktree to land (a simulated lot, or its identity unreadable)',
	damaged: 'lot land: {lot} is damaged: dialecte lot status {lot} says how',
	notLandable: 'lot land: {lot} is {state}: only a working or ready lot lands, nothing pushed',
	stacked:
		'lot land: {lot} was cut from {from} ({commit}), which {base} does not hold: a stacked lot lands as a stack (not built yet), nothing pushed',
} as const
