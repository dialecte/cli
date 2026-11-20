/** A base found for a change: the commit (or, handed, the revision) it is measured from, and where it came from. */
export type ChangeBase = {
	/** A full commit id for `flag` and `order`; for `handed`, the value as given (it may be a revision). */
	id: string
	source: 'flag' | 'handed' | 'order'
	/** The order's line (`base <sha> (<where>)`, without a caller's prefix); none for `flag` and `handed`. */
	line?: string
}

/** What `resolveChangeBase` answers: a base, the `--base` ref refused, the order's base unreadable, or no base. */
export type ChangeBaseAnswer =
	| ChangeBase
	| { refusal: string }
	| { unreadable: string }
	| { noBase: string }
