/** The verb, as the refusal templates and the forbidden-words check name it. */
export const LOT_SCOPE_VERB = 'scope'

/** The one usage line of `lot scope`, for every usage fault. */
export const LOT_SCOPE_USAGE =
	'lot scope: expected <id> [--drop <path>]... [--add <path>]... --by <who> --reason <text>'

/** The options `lot scope` reads: one value each, and the repeatable paths. */
export const LOT_SCOPE_VALUE_OPTIONS: readonly string[] = ['by', 'reason']
export const LOT_SCOPE_PATH_OPTIONS: readonly string[] = ['drop', 'add']

/** The lines `lot scope` prints (FIX-lot-scope D3-D6, D11). */
export const LOT_SCOPE_TEXTS = {
	added: 'lot scope: {name} added {added} by {by} - effective scope: {scope}',
	dropped: 'lot scope: {name} dropped {dropped} by {by} - effective scope: {scope}',
	narrowed: 'lot scope: {name} dropped {dropped}, added {added} by {by} - effective scope: {scope}',
	already: 'lot scope: {name} already holds {paths}: nothing written',
	damaged: 'lot scope: {name} damaged: {reason}',
	terminal: 'lot scope: {name} is {state}: nothing to record',
	simulated: 'lot scope: {name} is simulated: nothing to record',
	lateOverlapNarrowed:
		'lot scope: {name}: the added paths meet the open lot {lot} (changed meanwhile): {met}: the add is undone, the dropped entries put back',
	lateOverlap:
		'lot scope: {name}: the added paths meet the open lot {lot} (changed meanwhile): {met}: the add is undone',
	undoFailure:
		'lot scope: {name}: the added paths {paths} meet the open lot {lot} (changed meanwhile), and their undo could not be written: {message}: both lots hold them until one drops them',
	unreadable: 'lot scope: {name}: {file} holds {count} line(s) that do not read: nothing written',
	fault: 'lot scope: {name}: {path}: {fault}: nothing written',
	overlap: 'lot scope: {name}: the added paths meet the open lot {lot}: {met}: nothing written',
	emptied:
		'lot scope: {name}: the drop leaves the lot no scope: stop it instead (dialecte lot stop {name} --reason <text>): nothing written',
	noEntry: "lot scope: {name}: {path} is no entry of the lot's scope: nothing written",
	insideEntry:
		'lot scope: {name}: {path} lies inside the entry {entry}: drop the entry and add what stays: nothing written',
	changed: "lot scope: {name}: {path} holds {file}, changed in the lot's worktree: nothing written",
	worktreeUnreadable:
		"lot scope: {name}: the lot's worktree {worktree} cannot be read: nothing written",
	overLimit: 'lot scope: {name}: {message}: nothing written',
	takeBackOverLimit:
		'lot scope: {name}: its take-back on a late overlap would not fit: {message}: nothing written',
	writeFailure: 'lot scope: {message}',
	eventFailure: 'lot scope: the event could not be written in {file}: {message}',
} as const

/** What joins the paths and the scope entries in a printed line. */
export const LOT_SCOPE_LIST_SEPARATOR = ', '

/** The kind of the event a change writes (FIX-lot-scope D6). */
export const SCOPE_CHANGED_KIND = 'scope.changed'

/** How a lot with no worktree names it in the unreadable-worktree refusal. */
export const NO_WORKTREE = '(none)'

/** What starts the reason of the add that puts back what a taken-back drop removed (D5, D7). */
export const RESTORED_REASON_PREFIX = 'restored: '
