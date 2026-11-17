/**
 * The command reference: one page per listed command under `doc/commands/`, its block generated from the command
 * map (the help the cli prints), the rest of the page written by hand; an index page of every command.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { formatFiles } from '../format.ts'
import { COMMAND_FAMILIES, USAGE_PREFIX } from './command-map.constants.ts'
import {
	BLOCK_END,
	BLOCK_START,
	MARKDOWN_SPECIAL_CHARACTERS,
	PAGE_EXTENSION,
	REFERENCE_FOLDER,
	REFERENCE_FORMAT_CONFIG,
	REFERENCE_INDEX_FILE,
	REFERENCE_INDEX_TITLE,
	RENAMED_HEADING,
	TEMPORARY_FOLDER_PREFIX,
} from './command-reference.constants.ts'
import { commandSurfaceOf } from './command-surface.ts'
import { allRenamedWords, newFormUsageOf } from './renamed-answer.ts'
import { listedCommands, renderCommandSection } from './render-help.ts'

import type { RenamedWords } from './command-map.types.ts'
import type {
	FormattedPages,
	ReferenceCheck,
	ReferenceCommand,
	ReferenceFault,
	ReferencePage,
	ReferenceSource,
} from './command-reference.types.ts'

/** A command's generated block: its summary, its help as `dialecte <command> --help` prints it, verbs and flags. */
export function renderCommandBlock(params: ReferenceCommand): string {
	const section = renderCommandSection(params)
	const fence = fenceFor(section)
	const { verbs, flags } = commandSurfaceOf(params)
	return [
		escapeMarkdown(params.entry.summary),
		'',
		`${fence}text`,
		section,
		fence,
		...(verbs.length ? ['', `Verbs: ${verbs.map(codeSpanOf).join(', ')}`] : []),
		...(flags.length ? ['', `Flags: ${flags.map(codeSpanOf).join(', ')}`] : []),
	].join('\n')
}

/** The index's generated block: per family the commands with their summary, then the renamed forms. */
export function renderIndexBlock(params: ReferenceSource): string {
	const families = COMMAND_FAMILIES.flatMap((family) => {
		const commands = params.commands.filter((command) => command.entry.family === family)
		if (commands.length === 0) return []
		return [
			`## ${family}`,
			'',
			'| Command | What it does |',
			'| --- | --- |',
			...commands.map(
				(command) =>
					`| [\`dialecte ${command.name}\`](${command.name}${PAGE_EXTENSION}) | ${escapeMarkdown(command.entry.summary)} |`,
			),
			'',
		]
	})
	return [
		...families,
		RENAMED_HEADING,
		'',
		'| 1.0 | Before |',
		'| --- | --- |',
		...params.renamed.map(
			(form) =>
				`| ${tableCodeSpanOf(`dialecte ${form.new}`)} | ${tableCodeSpanOf(`dialecte ${form.old}`)} |`,
		),
	].join('\n')
}

/**
 * A page with its generated block put in: the block between the markers replaced, every other line kept; a page
 * without markers gets the block under its title; no page: the title and the block.
 */
export function composePage(params: { title: string; block: string; page?: string }): string {
	const { title, block, page } = params
	const wrapped = `${BLOCK_START}\n${block}\n${BLOCK_END}`
	if (page === undefined) return `# ${title}\n\n${wrapped}\n`
	const start = page.indexOf(BLOCK_START)
	const end = start < 0 ? -1 : page.indexOf(BLOCK_END, start)
	if (end >= 0) return `${page.slice(0, start)}${wrapped}${page.slice(end + BLOCK_END.length)}`
	const [first, ...rest] = page.split('\n')
	if (first.startsWith('# ')) return `${first}\n\n${wrapped}\n\n${rest.join('\n').trimStart()}`
	return `# ${title}\n\n${wrapped}\n\n${page}`
}

/** The renamed forms of the map, each new form as its usage line in the lot section (words after `dialecte`). */
export function renamedRowsOf(): RenamedWords[] {
	return allRenamedWords().map((form) => ({
		old: form.old,
		new: newFormUsageOf(form.new).slice(USAGE_PREFIX.length),
	}))
}

/** Every page the reference holds now: the index first, then one per listed command in help order. */
export function referencePagesOf(params: ReferenceSource): ReferencePage[] {
	return [
		{
			path: `${REFERENCE_FOLDER}/${REFERENCE_INDEX_FILE}`,
			title: REFERENCE_INDEX_TITLE,
			block: renderIndexBlock(params),
		},
		...params.commands.map((command) => ({
			path: `${REFERENCE_FOLDER}/${command.name}${PAGE_EXTENSION}`,
			title: `dialecte ${command.name}`,
			block: renderCommandBlock(command),
		})),
	]
}

/** The committed pages of the package at `root` against the command map, each compared after the package's oxfmt. */
export function checkReferencePages(params: { root: string }): ReferenceCheck {
	const { root } = params
	const pages = currentPages()
	const states = pages.map((page) => ({
		page,
		committed: existsSync(join(root, page.path))
			? readFileSync(join(root, page.path), 'utf8')
			: undefined,
	}))
	const present = states.filter((state) => state.committed !== undefined)
	const formatted = formattedPages({
		root,
		texts: present.map((state) =>
			composePage({ title: state.page.title, block: state.page.block, page: state.committed }),
		),
	})
	const stale = present
		.filter((state, index) => formatted.texts[index] !== state.committed)
		.map((state) => state.page.path)
	const faults: ReferenceFault[] = [
		...states.flatMap((state): ReferenceFault[] => {
			if (state.committed === undefined) return [{ path: state.page.path, kind: 'missing' }]
			return stale.includes(state.page.path) ? [{ path: state.page.path, kind: 'stale' }] : []
		}),
		...extraPagesOf({ root, pages }).map((path): ReferenceFault => ({ path, kind: 'extra' })),
		...unformattedFaultOf({ formatted: formatted.formatted }),
	]
	return { pages: pages.length, faults }
}

/** Writes every page of the package at `root` from the command map, formatted with the package's oxfmt. */
export function writeReferencePages(params: { root: string }): ReferenceCheck {
	const { root } = params
	const pages = currentPages()
	mkdirSync(join(root, REFERENCE_FOLDER), { recursive: true })
	const paths = pages.map((page) => join(root, page.path))
	for (const [index, page] of pages.entries()) {
		const path = paths[index]
		const committed = existsSync(path) ? readFileSync(path, 'utf8') : undefined
		writeFileSync(path, composePage({ title: page.title, block: page.block, page: committed }))
	}
	const formatted = formatFiles({ root, files: paths, options: formatOptionsOf({ root }) })
	const check = checkReferencePages({ root })
	if (formatted || check.faults.some((fault) => fault.kind === 'unformatted')) return check
	return { pages: check.pages, faults: [...check.faults, ...unformattedFaultOf({ formatted })] }
}

/** The pages of the command map as it is now. */
function currentPages(): ReferencePage[] {
	return referencePagesOf({ commands: listedCommands(), renamed: renamedRowsOf() })
}

/** The fault of a folder oxfmt could not format: its pages left as written, never taken as matching. */
function unformattedFaultOf(params: { formatted: boolean }): ReferenceFault[] {
	return params.formatted ? [] : [{ path: REFERENCE_FOLDER, kind: 'unformatted' }]
}

/** The texts as the package's oxfmt formats them, through a folder of their own that is removed after. */
function formattedPages(params: { root: string; texts: string[] }): FormattedPages {
	const folder = mkdtempSync(join(tmpdir(), TEMPORARY_FOLDER_PREFIX))
	try {
		const files = params.texts.map((text, index) => {
			const file = join(folder, `${index}${PAGE_EXTENSION}`)
			writeFileSync(file, text)
			return file
		})
		const formatted = formatFiles({
			root: params.root,
			files,
			options: formatOptionsOf({ root: params.root }),
		})
		return { formatted, texts: files.map((file) => readFileSync(file, 'utf8')) }
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** The package's oxfmt config when it has one. */
function formatOptionsOf(params: { root: string }): { config?: string } {
	const config = join(params.root, REFERENCE_FORMAT_CONFIG)
	return existsSync(config) ? { config } : {}
}

/** The pages of the reference folder that no listed command (nor the index) owns, sorted. */
function extraPagesOf(params: { root: string; pages: ReferencePage[] }): string[] {
	const folder = join(params.root, REFERENCE_FOLDER)
	if (!existsSync(folder)) return []
	return readdirSync(folder)
		.filter((name) => name.endsWith(PAGE_EXTENSION))
		.map((name) => `${REFERENCE_FOLDER}/${name}`)
		.filter((path) => !params.pages.some((page) => page.path === path))
		.sort()
}

/** A code fence one backtick longer than the longest backtick run of the text, at least three. */
function fenceFor(text: string): string {
	const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
	return '`'.repeat(Math.max(3, longest + 1))
}

/** A text as markdown prints it as written: its special characters escaped. */
function escapeMarkdown(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replace(MARKDOWN_SPECIAL_CHARACTERS, (character) => `\\${character}`)
}

/** A text as a code span in a table cell: its pipes escaped, so they do not split the cell. */
function tableCodeSpanOf(text: string): string {
	return codeSpanOf(text.replaceAll('|', '\\|'))
}

/** A word as a code span. */
function codeSpanOf(word: string): string {
	return `\`${word}\``
}
