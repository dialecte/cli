/** The lines of a met lot that merged on the host, `{…}` filled (FIX-start-settles-landed, design section 2.1). */
export const MET_LOT_LINES = {
	settled: 'settled {lot}: merged on {base} at {tip} ({how}); it no longer holds its scope',
	wouldSettle:
		'would settle {lot}: merged on {base} at {tip} ({how}); it would no longer hold its scope',
	workSince:
		'{lot} merged on {base} at {tip} but its branch holds {count} commit(s) since: it still holds its scope',
	uncommitted:
		'{lot} merged on {base} at {tip} but its worktree holds uncommitted changes: it still holds its scope',
	notWritten:
		'{lot} merged on {base} at {tip} but its landed fact was not written ({why}): it still holds its scope',
} as const
