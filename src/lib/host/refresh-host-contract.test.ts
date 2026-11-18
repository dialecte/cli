/**
 * `host:refresh` asks the tool again and writes the record and the fixtures together; `host:drift` asks and writes
 * nothing. The suite never runs the real tool: a fake `gh` answers from `test/fixtures/host-contract/github/`, the
 * fixture set the refresh itself writes, one file per describe call, named after the call:
 *
 * | call                                   | file                         | stream, exit        |
 * | -------------------------------------- | ---------------------------- | ------------------- |
 * | `gh <words> --help`                    | `<words>.help.txt`           | stdout, 0           |
 * | `gh <words> --json`                    | `<words>.fields.txt`         | stderr, 1           |
 * | `gh api graphql -f query=…__type(…)`   | `graphql.<Type>.txt`         | stdout, 0           |
 * | `gh --version`, `gh <part> --version`  | `versions.cli.txt`, `versions.<part>.txt` | stdout, 0 |
 *
 * `<words>` are joined by `-` (`pr-view.help.txt`). The refresh runs on a temporary copy that holds only what it
 * reads and writes: the record module, the fixtures folder and the formatter's configuration.
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fakeGhAnswering } from '../../../test/fake-gh-answers.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { HOST_CONTRACTS } from './host-contracts.constants.ts'
import { driftHostContract, refreshHostContract } from './refresh-host-contract.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const RECORD = 'src/lib/host/github/github-contract.constants.ts'
const FIXTURES = 'test/fixtures/host-contract/github'

/**
 * The files the refresh reads and writes, copied into a temporary root: the record module (blanked when `blank`), the
 * formatter's configuration, and the fixtures folder (empty when `blank`, so what the refresh saves is all there is).
 */
function copiedRoot(params: { blank: boolean }): string {
	const root = temporaryFolder('dialecte-host-refresh-')
	mkdirSync(join(root, dirname(RECORD)), { recursive: true })
	cpSync(join(PACKAGE_ROOT, RECORD), join(root, RECORD))
	cpSync(join(PACKAGE_ROOT, '.oxfmtrc.json'), join(root, '.oxfmtrc.json'))
	if (params.blank) {
		mkdirSync(join(root, FIXTURES), { recursive: true })
		writeFileSync(
			join(root, RECORD),
			'export const GITHUB_RECORDED_VERSIONS = {}\nexport const GITHUB_CONTRACT = { commands: {}, graphql: {} }\n',
		)
	} else {
		cpSync(join(PACKAGE_ROOT, FIXTURES), join(root, FIXTURES), { recursive: true })
	}
	return root
}

/** The package's own record and fixtures, which no refresh in a copy and no drift may touch. */
function packageFilesSnapshot(): Record<string, string> {
	return {
		[RECORD]: readFileSync(join(PACKAGE_ROOT, RECORD), 'utf8'),
		...Object.fromEntries(
			Object.entries(snapshotOf(join(PACKAGE_ROOT, FIXTURES))).map(([name, text]) => [
				`${FIXTURES}/${name}`,
				text,
			]),
		),
	}
}

/** Every file under `folder`, by path relative to it, with its bytes. */
function snapshotOf(folder: string): Record<string, string> {
	const files = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) =>
		entry.isFile(),
	)
	return Object.fromEntries(
		files.map((entry) => {
			const path = join(entry.parentPath, entry.name)
			return [relative(folder, path), readFileSync(path, 'utf8')]
		}),
	)
}

/** A folder of answers: a copy of the saved fixtures with `edits` applied to the named files' text. */
function answersWith(edits: Readonly<Record<string, (text: string) => string>>): string {
	const answers = temporaryFolder('dialecte-host-answers-')
	cpSync(join(PACKAGE_ROOT, FIXTURES), answers, { recursive: true })
	for (const [name, edit] of Object.entries(edits)) {
		const file = join(answers, name)
		writeFileSync(file, edit(existsSync(file) ? readFileSync(file, 'utf8') : ''))
	}
	return answers
}

/** The text without the lines that are exactly `field` (a field list prints one per line). */
function withoutField(field: string): (text: string) => string {
	return (text) =>
		text
			.split('\n')
			.filter((line) => line.trim() !== field)
			.join('\n')
}

describe('host:refresh on a temporary copy, a fake gh answering from the saved fixtures', () => {
	it('the copy’s record and fixtures equal the committed ones: the refresh writes them', () => {
		const root = copiedRoot({ blank: true })
		fakeGhAnswering({ answers: answersWith({}) })

		const outcome = refreshHostContract({ root, records: HOST_CONTRACTS })

		expect({
			outcome: 'changed' in outcome ? { changed: [...outcome.changed].sort() } : outcome,
			record: readFileSync(join(root, RECORD), 'utf8'),
			fixtures: snapshotOf(join(root, FIXTURES)),
		}).toEqual({
			outcome: {
				changed: [
					RECORD,
					...Object.keys(snapshotOf(join(PACKAGE_ROOT, FIXTURES))).map(
						(name) => `${FIXTURES}/${name}`,
					),
				].sort(),
			},
			record: readFileSync(join(PACKAGE_ROOT, RECORD), 'utf8'),
			fixtures: snapshotOf(join(PACKAGE_ROOT, FIXTURES)),
		})
	})

	it('run twice on the same answers → no change the second time', () => {
		const root = copiedRoot({ blank: true })
		fakeGhAnswering({ answers: answersWith({}) })
		refreshHostContract({ root, records: HOST_CONTRACTS })
		const afterFirst = snapshotOf(root)

		const second = refreshHostContract({ root, records: HOST_CONTRACTS })

		expect({ second, tree: snapshotOf(root) }).toEqual({
			second: { changed: [] },
			tree: afterFirst,
		})
	})

	it('gh-stack absent → a refusal naming gh-stack and its recorded version, nothing written', () => {
		const root = copiedRoot({ blank: true })
		const before = snapshotOf(root)
		fakeGhAnswering({ answers: answersWith({}), absent: ['stack'] })

		const outcome = refreshHostContract({ root, records: HOST_CONTRACTS })

		expect(outcome).toEqual({ refusal: expect.stringContaining('install gh-stack v0.3.0 first') })
		expect(snapshotOf(root)).toEqual(before)
	})

	it('oxfmt missing → a refusal saying so, nothing written', () => {
		const root = copiedRoot({ blank: true })
		const before = snapshotOf(root)
		fakeGhAnswering({ answers: answersWith({}) })

		const outcome = refreshHostContract({
			root,
			records: HOST_CONTRACTS,
			resolveFormatter: () => null,
		})

		expect(outcome).toEqual({ refusal: expect.stringContaining('oxfmt not found') })
		expect(snapshotOf(root)).toEqual(before)
	})

	it.each([
		{ name: 'the record module existed → its previous bytes', arrange: () => {} },
		{
			name: 'the record module did not exist → removed',
			arrange: (root: string) => rmSync(join(root, RECORD)),
		},
	])(
		'the format failing after the module was written, $name, the refusal naming it, fixtures untouched',
		(row) => {
			const root = copiedRoot({ blank: true })
			row.arrange(root)
			const before = snapshotOf(root)
			fakeGhAnswering({ answers: answersWith({}) })
			const formatted: string[][] = []

			const outcome = refreshHostContract({
				root,
				records: HOST_CONTRACTS,
				format: ({ files }) => (formatted.push(files), false),
			})

			expect({ outcome, formatted, tree: snapshotOf(root) }).toEqual({
				outcome: { refusal: expect.stringContaining(RECORD) },
				formatted: [[RECORD]],
				tree: before,
			})
		},
	)
})

/** One drift case: the answers' edits, whether gh-stack is absent, and what drift must say. */
type DriftRow = {
	label: string
	edits: Readonly<Record<string, (text: string) => string>>
	absent?: readonly string[]
	exit: 0 | 1
	says: string[]
}

describe('host:drift, a fake gh answering and nothing written', () => {
	it.each<DriftRow>([
		{
			label: 'a field the table uses missing from the answer → exit 1 naming the field',
			edits: { 'pr-view.fields.txt': withoutField('headRefOid') },
			exit: 1,
			says: ['headRefOid'],
		},
		{
			label: 'only a field more in the answer → exit 0',
			edits: { 'pr-view.fields.txt': (text) => `${text.trimEnd()}\n  brandNewField\n` },
			exit: 0,
			says: [],
		},
		{
			label: 'gh-stack absent → its commands not checked, exit 0',
			edits: {},
			absent: ['stack'],
			exit: 0,
			says: ['not checked'],
		},
		{
			label:
				'gh-stack absent and a field missing → exit 1 naming the field: the other commands are checked',
			edits: { 'pr-view.fields.txt': withoutField('headRefOid') },
			absent: ['stack'],
			exit: 1,
			says: ['headRefOid', 'not checked'],
		},
	])('$label', ({ edits, absent, exit, says }) => {
		const root = copiedRoot({ blank: false })
		const copyBefore = snapshotOf(root)
		const packageBefore = packageFilesSnapshot()
		fakeGhAnswering({ answers: answersWith(edits), absent })

		const drift = driftHostContract({ root, records: HOST_CONTRACTS })

		expect(drift.exit).toBe(exit)
		for (const text of says) expect(drift.lines.join('\n')).toContain(text)
		expect({ copy: snapshotOf(root), package: packageFilesSnapshot() }).toEqual({
			copy: copyBefore,
			package: packageBefore,
		})
	})
})
