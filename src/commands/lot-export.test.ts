/**
 * `dialecte lot export <id> <dir>` (33L0 sections 9.6 and 12; cases 30 (the export half), 37, 38, 39, 40): the lot
 * folder copied to `<dir>/<full name>/` without `asks/`, links kept as links, modes kept, with the lot's `cards.log`
 * lines and its registry entry; refusals write nothing; the copy is made into `.<name>.tmp-<pid>/`, compared with
 * the source (`events.jsonl` as a prefix), copied once more on a difference, and renamed into place. Readings the
 * tests take: `files` counts the files and links of the copy (the two added files included, folders not), `bytes`
 * the size of its regular files; the seam `afterFileCopied` is called after each file's copy, before its comparison.
 */
import {
	appendFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { snapshotOf } from '../../test/handover-store-scenario.ts'
import {
	ABSOLUTE_INSIDE_LINK_FILE,
	APPENDED_EVENT_LINE,
	ASKS_FOLDER,
	COPIED_LOG_NAME,
	COPIED_REGISTRY_NAME,
	ESCAPE_CHARACTER,
	ESCAPED_ESCAPE_CHARACTER,
	EVENTS_FILE,
	FOLDER_LINK_FILE,
	HOP_FILE_LINK,
	HOP_FOLDER_LINK,
	HOP_TARGET_FILE,
	INSIDE_LINK_FILE,
	LEAVING_LINK_FILE,
	LEAVING_LINK_TARGET,
	NOTES_FILE,
	TOOLS_FOLDER,
	TOOLS_FOLDER_MODE,
	OTHER_LOT,
	OTHER_PID,
	OTHER_REMOVAL_ID,
	OUTSIDE_LINK_FILE,
	OUTSIDE_LINK_TARGET,
} from '../../test/lot-export-workspace.constants.ts'
import {
	appendEventWhileCopying,
	createExportLot,
	linesOfFile,
	temporaryNamesIn,
	treeOf,
} from '../../test/lot-export-workspace.ts'
import { ASK_SENTINEL } from '../../test/lot-report-workspace.constants.ts'
import { addWorktreeFolder, createWorkspaceWithLots } from '../../test/lot-stores.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { exportLot, exportTemporaryOf } from '../lib/store/export-lot.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { lotExport } from './lot-export.ts'
import { printsOnStandardError } from './lot-streams.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ExportLot } from '../../test/lot-export-workspace.types.ts'
import type { LotExportJson } from './lot-export.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The folder the lot is copied to. */
function copyOf(fixture: ExportLot): string {
	return join(fixture.dir, fixture.lot.name)
}

/** `lot export <name> <dir>` from the lot's repository, with the words after them. */
function exporting(params: {
	fixture: ExportLot
	after?: string[]
	afterFileCopied?: Parameters<typeof lotExport>[0]['afterFileCopied']
}) {
	const { fixture } = params
	return lotExport({
		cwd: fixture.lot.cwd,
		argv: [fixture.lot.name, fixture.dir, ...(params.after ?? [])],
		afterFileCopied: params.afterFileCopied,
	})
}

/** The text with its first character changed to another of the same length (a rewrite in place, not an append). */
function rewriteInPlace(path: string): void {
	const text = readFileSync(path, 'utf8')
	writeFileSync(path, `${text[0] === 'X' ? 'Y' : 'X'}${text.slice(1)}`)
}

/** The `links` of a `--json` answer, ordered by path (the order is not part of the answer). */
function linksOf(answer: LotExportJson): LotExportJson['links'] {
	return [...answer.links].sort((first, second) => first.path.localeCompare(second.path))
}

/** Everything under a folder of the copy that is a file or a link (relative paths). */
function leavesOf(folder: string): string[] {
	return Object.entries(treeOf(folder))
		.filter(([, entry]) => entry.kind !== 'folder')
		.map(([path]) => path)
}

describe('lot export: the copy', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a committed lot, text answer → exit 0 naming the copy, which stands in <dir> with no temporary folder left beside it', () => {
		const fixture = createExportLot()

		expect(exporting({ fixture })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(copyOf(fixture)),
		})

		expect(readdirSync(fixture.dir)).toEqual([fixture.lot.name])
		expect(temporaryNamesIn(fixture.dir)).toEqual([])
	})

	it('through the verb, --json → the answer names the copy, counts its files and links and its bytes, skips asks/, and holds one entry for the link pointing outside', () => {
		const fixture = createExportLot()

		const result = runLot({
			cwd: fixture.lot.cwd,
			argv: ['export', fixture.lot.name, fixture.dir, '--json'],
		})

		expect(result.exitCode).toBe(0)
		const answer = JSON.parse(result.output) as LotExportJson
		const tree = treeOf(copyOf(fixture))
		const leaves = Object.values(tree).filter((entry) => entry.kind !== 'folder')
		expect({
			exported: answer.exported,
			files: answer.files,
			bytes: answer.bytes,
			skipped: answer.skipped,
		}).toEqual({
			exported: copyOf(fixture),
			files: leaves.length,
			bytes: leaves.reduce((sum, entry) => sum + (entry.kind === 'file' ? entry.size : 0), 0),
			skipped: ['asks/'],
		})
		// the links leaving the lot, absolute or relative, in any order; the ones staying inside are not named
		expect(linksOf(answer)).toEqual([
			{ path: OUTSIDE_LINK_FILE, target: OUTSIDE_LINK_TARGET },
			{ path: LEAVING_LINK_FILE, target: LEAVING_LINK_TARGET },
		])
		expect(JSON.stringify(answer.links)).not.toContain(INSIDE_LINK_FILE)
		expect(JSON.stringify(answer.links)).not.toContain(ABSOLUTE_INSIDE_LINK_FILE)
		expect(JSON.stringify(answer.links)).not.toContain(FOLDER_LINK_FILE)
	})

	it('a lot with no asks/ → skipped is [] in the --json answer and the text does not name asks/', () => {
		const fixture = createExportLot({ asks: false })

		const result = exporting({ fixture, after: ['--json'] })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(result.output)).toMatchObject({ skipped: [] })
		expect(exporting({ fixture: createExportLot({ asks: false }) }).output).not.toContain('asks/')
	})

	it('a lot with no registry entry → no registry.json in the copy, and files is what the copy holds', () => {
		const fixture = createExportLot({ registryEntry: false })

		const result = exporting({ fixture, after: ['--json'] })

		expect(result.exitCode).toBe(0)
		const copy = copyOf(fixture)
		expect({
			registry: existsSync(join(copy, COPIED_REGISTRY_NAME)),
			files: (JSON.parse(result.output) as LotExportJson).files,
		}).toEqual({ registry: false, files: leavesOf(copy).length })
	})

	it('the text answer → names asks/ as skipped', () => {
		const fixture = createExportLot()

		expect(exporting({ fixture })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining('asks/'),
		})
	})

	it('<dir> spelled through a link → exported is the real path of the copy', () => {
		const fixture = createExportLot()
		const through = join(temporaryFolder('dialecte-export-link-'), 'dir-link')
		symlinkSync(fixture.dir, through)

		const result = lotExport({
			cwd: fixture.lot.cwd,
			argv: [fixture.lot.name, through, '--json'],
		})

		expect(result.exitCode).toBe(0)
		expect((JSON.parse(result.output) as LotExportJson).exported).toBe(
			realpathSync(copyOf(fixture)),
		)
	})

	it('every file and folder of the lot except asks/ → in the copy with the same size, sha256 and permission bits; links stay links; the lot folder unchanged', () => {
		const fixture = createExportLot()
		const before = snapshotOf({ paths: [fixture.lot.lotFolder] })
		const source = treeOf(fixture.lot.lotFolder)
		const expected = Object.fromEntries(
			Object.entries(source).filter(
				([path]) => path !== ASKS_FOLDER && !path.startsWith(`${ASKS_FOLDER}/`),
			),
		)

		expect(exporting({ fixture })).toMatchObject({ exitCode: 0 })

		const copied = Object.fromEntries(
			Object.entries(treeOf(copyOf(fixture))).filter(
				([path]) => path !== COPIED_LOG_NAME && path !== COPIED_REGISTRY_NAME,
			),
		)
		expect(copied).toEqual(expected)
		expect(snapshotOf({ paths: [fixture.lot.lotFolder] })).toEqual(before)
	})

	it('cards.log in the copy → the lines of that lot only (its card, its removal and the outcome of its removal), as they were written, none of the other lot', () => {
		const fixture = createExportLot()

		expect(exporting({ fixture })).toMatchObject({ exitCode: 0 })

		const text = readFileSync(join(copyOf(fixture), COPIED_LOG_NAME), 'utf8')
		expect(text).toBe(`${fixture.lotLines.join('\n')}\n`)
		expect(linesOfFile(join(copyOf(fixture), COPIED_LOG_NAME))).toEqual(fixture.lotLines)
		expect(text).not.toContain(OTHER_LOT)
		expect(text).not.toContain(OTHER_REMOVAL_ID)
	})

	it("registry.json in the copy → the lot's registry entry, as the store holds it", () => {
		const fixture = createExportLot()

		expect(exporting({ fixture })).toMatchObject({ exitCode: 0 })

		expect(readFileSync(join(copyOf(fixture), COPIED_REGISTRY_NAME), 'utf8')).toBe(
			readFileSync(fixture.entryFile, 'utf8'),
		)
	})

	it('case 30 (the export half): asks/ holds ZZ-ASK-SENTINEL → no folder asks/ in the copy, and no byte of any copied file nor any name holds it', () => {
		const fixture = createExportLot()

		expect(exporting({ fixture })).toMatchObject({ exitCode: 0 })

		const copy = copyOf(fixture)
		const holding = leavesOf(copy).filter(
			(path) =>
				path.includes(ASK_SENTINEL) ||
				(lstatSync(join(copy, path)).isFile() &&
					readFileSync(join(copy, path), 'utf8').includes(ASK_SENTINEL)),
		)
		expect({ asks: existsSync(join(copy, ASKS_FOLDER)), holding }).toEqual({
			asks: false,
			holding: [],
		})
	})

	it('case 40: round-1/ holds a link to /etc → copied as a link with the same target, named in the answer, never followed (no file of /etc in the copy)', () => {
		const fixture = createExportLot()

		const result = exporting({ fixture })

		expect(result).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(OUTSIDE_LINK_FILE),
		})
		const link = join(copyOf(fixture), OUTSIDE_LINK_FILE)
		expect({
			isLink: lstatSync(link).isSymbolicLink(),
			target: readlinkSync(link),
			followed: Object.keys(treeOf(copyOf(fixture))).filter((path) =>
				path.startsWith(`${OUTSIDE_LINK_FILE}/`),
			),
		}).toEqual({ isLink: true, target: OUTSIDE_LINK_TARGET, followed: [] })
		expect(result.output).not.toContain(INSIDE_LINK_FILE)
	})

	it('a link inside the lot to a folder of it → copied as a link, the folder not copied again under it, not named; folder modes kept', () => {
		const fixture = createExportLot()

		const result = exporting({ fixture, after: ['--json'] })

		expect(result.exitCode).toBe(0)
		const copy = copyOf(fixture)
		const tree = treeOf(copy)
		expect({
			link: tree[FOLDER_LINK_FILE],
			underLink: Object.keys(tree).filter((path) => path.startsWith(`${FOLDER_LINK_FILE}/`)),
			toolsMode: (tree[TOOLS_FOLDER] as { mode?: number } | undefined)?.mode,
			named: result.output.includes(FOLDER_LINK_FILE),
		}).toEqual({
			link: { kind: 'link', target: '../tools' },
			underLink: [],
			toolsMode: TOOLS_FOLDER_MODE,
			named: false,
		})
	})
})

describe(
	'lot export: links and paths judged by what they resolve to',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a link a -> b/x where b is a link to a folder outside the lot → a is named among the links leaving the lot, copied as a link', () => {
			const fixture = createExportLot()
			const outside = realpathSync(temporaryFolder('dialecte-export-outside-'))
			writeFileSync(join(outside, HOP_TARGET_FILE), 'outside\n')
			symlinkSync(outside, join(fixture.lot.lotFolder, HOP_FOLDER_LINK))
			symlinkSync(
				`${HOP_FOLDER_LINK}/${HOP_TARGET_FILE}`,
				join(fixture.lot.lotFolder, HOP_FILE_LINK),
			)

			const answer = JSON.parse(exporting({ fixture, after: ['--json'] }).output) as LotExportJson

			expect({
				named: answer.links.map((link) => link.path).includes(HOP_FILE_LINK),
				copiedAsLink: lstatSync(join(copyOf(fixture), HOP_FILE_LINK)).isSymbolicLink(),
			}).toEqual({ named: true, copiedAsLink: true })
		})

		it('a leftover temporary folder whose name holds an escape character → the text answer prints it escaped, no raw escape character', () => {
			const fixture = createExportLot()
			mkdirSync(join(fixture.dir, `.${fixture.lot.name}.tmp-${OTHER_PID}${ESCAPE_CHARACTER}[31m`))

			const output = exporting({ fixture }).output

			expect({
				rawEscape: output.includes(ESCAPE_CHARACTER),
				escaped: output.includes(ESCAPED_ESCAPE_CHARACTER),
			}).toEqual({ rawEscape: false, escaped: true })
		})

		it('a <dir> whose name holds an escape character → the exported line prints the copy path escaped, no raw escape character', () => {
			const fixture = createExportLot()
			const dir = join(fixture.dir, `out${ESCAPE_CHARACTER}`)
			mkdirSync(dir)

			const output = exporting({ fixture: { ...fixture, dir } }).output

			expect({
				rawEscape: output.includes(ESCAPE_CHARACTER),
				escaped: output.includes(ESCAPED_ESCAPE_CHARACTER),
			}).toEqual({ rawEscape: false, escaped: true })
		})
	},
)

describe(
	'lot export: a temporary folder this run did not make',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the temporary folder of this run appears between the check and the copy → the export fails, and that folder and its file are left untouched', () => {
			const fixture = createExportLot()
			const appeared = exportTemporaryOf({ dir: fixture.dir, name: fixture.lot.name })
			mkdirSync(appeared)
			writeFileSync(join(appeared, 'not-ours.txt'), 'another run wrote this\n')
			const before = snapshotOf({ paths: [appeared] })

			const outcome = exportLot({
				lotFolder: realpathSync(fixture.lot.lotFolder),
				dir: fixture.dir,
			})

			expect({
				failed: 'failed' in outcome,
				untouched: snapshotOf({ paths: [appeared] }),
				copyMade: existsSync(copyOf(fixture)),
			}).toEqual({ failed: true, untouched: before, copyMade: false })
		})
	},
)

describe('lot export: what is refused', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('case 37: exporting twice → the second exits 2 (the copy exists), the first copy unchanged', () => {
		const fixture = createExportLot()
		expect(exporting({ fixture })).toMatchObject({ exitCode: 0 })
		const first = snapshotOf({ paths: [copyOf(fixture)] })

		expect(exporting({ fixture })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(fixture.lot.name),
		})

		expect(snapshotOf({ paths: [copyOf(fixture)] })).toEqual(first)
		expect(temporaryNamesIn(fixture.dir)).toEqual([])
	})

	it('case 38: <dir> inside a git work tree → exit 2, nothing written there, the lot untouched', () => {
		const fixture = createExportLot()
		const inside = join(fixture.lot.workspace.repository, 'exports')
		mkdirSync(inside)
		const before = snapshotOf({ paths: [inside, fixture.lot.lotFolder] })

		expect(lotExport({ cwd: fixture.lot.cwd, argv: [fixture.lot.name, inside] })).toMatchObject({
			exitCode: 2,
		})

		expect(snapshotOf({ paths: [inside, fixture.lot.lotFolder] })).toEqual(before)
		expect(readdirSync(inside)).toEqual([])
	})

	it('case 38: <dir> inside a git folder → exit 2, nothing written there', () => {
		const fixture = createExportLot()
		const inside = join(fixture.lot.workspace.repository, '.git', 'exports')
		mkdirSync(inside)

		expect(lotExport({ cwd: fixture.lot.cwd, argv: [fixture.lot.name, inside] })).toMatchObject({
			exitCode: 2,
		})

		expect(readdirSync(inside)).toEqual([])
	})

	it('case 38: <dir> inside a linked worktree (its .git a file) → exit 2, nothing written there', () => {
		const fixture = createExportLot()
		const worktree = addWorktreeFolder({
			workspace: fixture.lot.workspace,
			folderName: '0003-repo-exports',
		})
		const inside = join(worktree, 'exports')
		mkdirSync(inside)

		expect(lotExport({ cwd: fixture.lot.cwd, argv: [fixture.lot.name, inside] })).toMatchObject({
			exitCode: 2,
		})

		expect(readdirSync(inside)).toEqual([])
	})

	it('<dir> that is a file → exit 2, the file as it was', () => {
		const fixture = createExportLot()
		const file = join(fixture.dir, 'a-file')
		writeFileSync(file, 'not a folder\n')

		expect(lotExport({ cwd: fixture.lot.cwd, argv: [fixture.lot.name, file] })).toMatchObject({
			exitCode: 2,
		})

		expect({ entries: readdirSync(fixture.dir), text: readFileSync(file, 'utf8') }).toEqual({
			entries: ['a-file'],
			text: 'not a folder\n',
		})
	})

	it('<dir> that does not exist → exit 2, nothing created', () => {
		const fixture = createExportLot()
		const missing = join(fixture.dir, 'not-there')

		expect(lotExport({ cwd: fixture.lot.cwd, argv: [fixture.lot.name, missing] })).toMatchObject({
			exitCode: 2,
		})

		expect(existsSync(missing)).toBe(false)
		expect(readdirSync(fixture.dir)).toEqual([])
	})

	it('an unknown id → exit 2, nothing written in <dir>', () => {
		const fixture = createExportLot()

		expect(
			lotExport({ cwd: fixture.lot.cwd, argv: ['9999-repo-unknown', fixture.dir] }),
		).toMatchObject({ exitCode: 2 })

		expect(readdirSync(fixture.dir)).toEqual([])
	})

	it('an index that names two lots → exit 2 listing them, nothing written in <dir>', () => {
		const { workspace } = createWorkspaceWithLots({ names: ['0001-repo-a', '0001-repo-b'] })
		const dir = temporaryFolder('dialecte-export-dir-')

		expect(lotExport({ cwd: workspace.repository, argv: ['0001', dir] })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/0001-repo-a[\s\S]*0001-repo-b/),
		})

		expect(readdirSync(dir)).toEqual([])
	})

	it('a folder that is no lot folder → exit 2, nothing written in <dir>', () => {
		const fixture = createExportLot()
		const plain = temporaryFolder('dialecte-not-a-lot-')
		writeFileSync(join(plain, 'a.txt'), 'a\n')

		expect(lotExport({ cwd: fixture.lot.cwd, argv: [plain, fixture.dir] })).toMatchObject({
			exitCode: 2,
		})

		expect(readdirSync(fixture.dir)).toEqual([])
	})

	it('no <dir> → exit 2, usage; with --json { error, usage, next: null }', () => {
		const fixture = createExportLot()

		expect(lotExport({ cwd: fixture.lot.cwd, argv: [fixture.lot.name] })).toMatchObject({
			exitCode: 2,
		})
		const json = lotExport({ cwd: fixture.lot.cwd, argv: [fixture.lot.name, '--json'] })
		expect({ exitCode: json.exitCode, shape: Object.keys(JSON.parse(json.output)).sort() }).toEqual(
			{ exitCode: 2, shape: ['error', 'next', 'usage'] },
		)
		expect(JSON.parse(json.output).next).toBeNull()
	})
})

describe('lot export: the check of the copy (case 39)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a file changed during its first copy → copied once more and compared: exit 0, the copy holds the new bytes, no temporary folder left', () => {
		const fixture = createExportLot()
		const source = join(fixture.lot.lotFolder, NOTES_FILE)
		const attempts: number[] = []

		expect(
			exporting({
				fixture,
				afterFileCopied: function changeOnce({ path, attempt }) {
					if (path !== NOTES_FILE) return
					attempts.push(attempt)
					if (attempt === 1) appendFileSync(source, 'changed meanwhile\n')
				},
			}),
		).toMatchObject({ exitCode: 0 })

		expect(readFileSync(join(copyOf(fixture), NOTES_FILE), 'utf8')).toBe(
			readFileSync(source, 'utf8'),
		)
		expect(attempts).toEqual([1, 2])
		expect(temporaryNamesIn(fixture.dir)).toEqual([])
	})

	it('during the copy, <dir> holds .<name>.tmp-<pid> and not <name>: the copy is made apart and renamed into place', () => {
		const fixture = createExportLot()
		const seen: string[][] = []

		expect(
			exporting({
				fixture,
				afterFileCopied: function listDirectory({ path, attempt }) {
					if (path === NOTES_FILE && attempt === 1) seen.push(readdirSync(fixture.dir))
				},
			}),
		).toMatchObject({ exitCode: 0 })

		expect(seen).toEqual([[`.${fixture.lot.name}.tmp-${process.pid}`]])
		expect(readdirSync(fixture.dir)).toEqual([fixture.lot.name])
	})

	it('a change that keeps the size (bytes overwritten in place) during the copy → caught by the hash: copied once more, exit 0, the copy holds the new bytes', () => {
		const fixture = createExportLot()
		const source = join(fixture.lot.lotFolder, NOTES_FILE)
		const attempts: number[] = []

		expect(
			exporting({
				fixture,
				afterFileCopied: function overwriteOnce({ path, attempt }) {
					if (path !== NOTES_FILE) return
					attempts.push(attempt)
					if (attempt === 1) rewriteInPlace(source)
				},
			}),
		).toMatchObject({ exitCode: 0 })

		expect(attempts).toEqual([1, 2])
		expect(readFileSync(join(copyOf(fixture), NOTES_FILE), 'utf8')).toBe(
			readFileSync(source, 'utf8'),
		)
	})

	it('events.jsonl rewritten (a byte changed, not appended) once during the copy → copied once more, then accepted: exit 0, attempts [1, 2]', () => {
		const fixture = createExportLot()
		const attempts: number[] = []

		expect(
			exporting({
				fixture,
				afterFileCopied: function rewriteEventsOnce({ path, attempt }) {
					if (path !== EVENTS_FILE) return
					attempts.push(attempt)
					if (attempt === 1) rewriteInPlace(join(fixture.lot.lotFolder, EVENTS_FILE))
				},
			}),
		).toMatchObject({ exitCode: 0 })

		expect(attempts).toEqual([1, 2])
		expect(readFileSync(join(copyOf(fixture), EVENTS_FILE), 'utf8')).toBe(
			readFileSync(join(fixture.lot.lotFolder, EVENTS_FILE), 'utf8'),
		)
	})

	it('events.jsonl rewritten during both copies → exit 1 naming events.jsonl, nothing at <dir>/<name>, no temporary folder', () => {
		const fixture = createExportLot()
		const attempts: number[] = []

		expect(
			exporting({
				fixture,
				afterFileCopied: function rewriteEventsEveryTime({ path, attempt }) {
					if (path !== EVENTS_FILE) return
					attempts.push(attempt)
					rewriteInPlace(join(fixture.lot.lotFolder, EVENTS_FILE))
				},
			}),
		).toMatchObject({ exitCode: 1, output: expect.stringContaining(EVENTS_FILE) })

		expect(attempts).toEqual([1, 2])
		expect(readdirSync(fixture.dir)).toEqual([])
	})

	it("a file changed again during the second copy → exit 1 naming the file, no <dir>/<name>, this run's temporary folder gone, the lot untouched (but for the writes of the test)", () => {
		const fixture = createExportLot()
		const source = join(fixture.lot.lotFolder, NOTES_FILE)
		const others = snapshotOf({ paths: [fixture.lot.lotFolder], skip: [NOTES_FILE] })
		const attempts: number[] = []

		expect(
			exporting({
				fixture,
				afterFileCopied: function changeEveryTime({ path, attempt }) {
					if (path !== NOTES_FILE) return
					attempts.push(attempt)
					appendFileSync(source, 'changed again\n')
				},
			}),
		).toMatchObject({ exitCode: 1, output: expect.stringContaining(NOTES_FILE) })

		// one retry per file, no more
		expect(attempts).toEqual([1, 2])
		expect(readdirSync(fixture.dir)).toEqual([])
		expect(snapshotOf({ paths: [fixture.lot.lotFolder], skip: [NOTES_FILE] })).toEqual(others)
		expect(readFileSync(source, 'utf8')).toContain('changed again')
	})

	it('events.jsonl appended during the copy → accepted as a prefix: exit 0, copied once, the copy a proper prefix of the source', () => {
		const fixture = createExportLot()
		const copies: number[] = []

		expect(
			exporting({
				fixture,
				afterFileCopied: function appendToEvents({ path, attempt }) {
					if (path !== EVENTS_FILE) return
					copies.push(attempt)
					if (attempt === 1) appendEventWhileCopying(fixture.lot.lotFolder)
				},
			}),
		).toMatchObject({ exitCode: 0 })

		const source = readFileSync(join(fixture.lot.lotFolder, EVENTS_FILE), 'utf8')
		const copied = readFileSync(join(copyOf(fixture), EVENTS_FILE), 'utf8')
		expect({
			copies,
			prefix: source.startsWith(copied),
			shorter: copied.length < source.length,
		}).toEqual({
			copies: [1],
			prefix: true,
			shorter: true,
		})
		expect(source.endsWith(APPENDED_EVENT_LINE)).toBe(true)
	})

	it('a leftover .<name>.tmp-<other pid>/ in <dir> → named in the answer, untouched, and the export still succeeds', () => {
		const fixture = createExportLot()
		const leftover = join(fixture.dir, `.${fixture.lot.name}.tmp-${OTHER_PID}`)
		mkdirSync(leftover)
		writeFileSync(join(leftover, 'half.txt'), 'half a copy\n')
		const before = snapshotOf({ paths: [leftover] })

		expect(exporting({ fixture })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(`.${fixture.lot.name}.tmp-${OTHER_PID}`),
		})

		expect(snapshotOf({ paths: [leftover] })).toEqual(before)
		expect(temporaryNamesIn(fixture.dir)).toEqual([`.${fixture.lot.name}.tmp-${OTHER_PID}`])
	})
})

describe(
	'lot export: where it prints and what it reserves',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('exits 1 and 2 of export go to standard error, exit 0 to standard output (HOST_VERB_ERROR_EXITS export; a guard: any unlisted verb prints its errors there)', () => {
			expect(
				[0, 1, 2].map((exitCode) => printsOnStandardError({ verb: 'export', exitCode })),
			).toEqual([false, true, true])
		})

		it('case 30: the store reserves cards.log and registry.json (no store or hand-over file takes them)', () => {
			expect(Object.values(STORE_FILES)).toEqual(
				expect.arrayContaining([COPIED_LOG_NAME, COPIED_REGISTRY_NAME]),
			)
		})
	},
)
