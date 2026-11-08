/** The look-alike folders made in the store, by what is wrong with them. */
export const TEMPORARY_NAME = '.0002-repo-branch.tmp-4242'
export const OTHER_NAME = '0003-repo-other'
export const BARE_NAME = '0005-repo-bare'
export const BROKEN_NAME = '0006-repo-broken'
export const NAMELESS_NAME = '0007-repo-nameless'

/** The titles of the folder cases, by key. */
export const CASE_NAMES = {
	real: 'the lot folder, by its real path',
	linked: 'the lot folder through .dialecte/lot (case 33)',
	otherLink: 'the lot folder through a link of another name',
	store: 'the dialecte-lots folder itself',
	round: 'round-1 inside the lot (case 33)',
	roundThroughLink: 'round-1 inside the lot, through the link',
	noRound: 'a folder of the lot that is no round',
	roundNotMade: 'a round not made yet inside the lot',
	temporary: 'a .tmp- folder whose identity names it',
	otherName: 'a folder whose identity names another folder',
	noIdentity: 'a folder with no identity',
	brokenIdentity: 'a folder whose identity does not parse',
	nameless: 'a folder whose identity has no name',
	notMade: 'a name of the store with nothing made yet',
	worktreeGit:
		'a lot-shaped folder below the dialecte-lots folder of a linked worktree git folder (HEAD, no objects or refs)',
	git: 'the .git folder',
	gitInner: 'another folder of .git',
	registry: 'the registry folder of .git',
	loose: 'a lot-shaped folder below a dialecte-lots folder that is no git common folder',
	repository: 'the repository itself',
	missing: 'a folder that does not exist',
} as const

/** The names of the cases, known at collection time. */
export const FOLDER_CASE_NAMES: string[] = Object.values(CASE_NAMES)
