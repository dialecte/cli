/**
 * The files of the scratch python packages of the pytest runner tests: a package of pytest files over a small
 * production module. Each test file is a whole document.
 */

/**
 * The bound of a case that runs pytest over a scratch package once (a scratch git repository, one python process):
 * a guard against a hang, never a measure of speed. A run takes under a second on a quiet machine and several at a
 * load of 30-80 with other suites running; two minutes is far above both.
 */
export const PYTHON_RUN_CASE_TIMEOUT = 120_000

/** The folder and the file of the interpreter a package's own virtual environment holds. */
export const VENV_PYTHON_PATH = '.venv/bin/python'
export const VENV_WINDOWS_PYTHON_PATH = '.venv/Scripts/python.exe'

/** The folders a python run must leave no trace in. */
export const PYTHON_CACHE_FOLDER_NAMES = ['__pycache__', '.pytest_cache'] as const

/** A pytest folder's configurations, as a `pyproject.toml`, `pytest.ini`, `tox.ini` and `setup.cfg` hold them. */
export const TOML_PYTEST_TEXT = '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n'
export const TOML_PLAIN_TEXT = '[project]\nname = "demo"\n'
export const PYTEST_INI_TEXT = '[pytest]\ntestpaths = tests\n'
export const TOX_INI_PYTEST_TEXT = '[tox]\nenvlist = py\n\n[pytest]\ntestpaths = tests\n'
export const TOX_INI_PLAIN_TEXT = '[tox]\nenvlist = py\n'
export const SETUP_CFG_PYTEST_TEXT = '[tool:pytest]\ntestpaths = tests\n'
export const SETUP_CFG_PLAIN_TEXT = '[metadata]\nname = demo\n'

/** A test file whose content does not matter. */
export const TRIVIAL_TEST_TEXT = 'def test_one():\n    assert 1 == 1\n'

/** The package: the repository root is the pytest folder, the production modules sit at the root. */
export const PACKAGE_TOML_TEXT =
	'[tool.pytest.ini_options]\npythonpath = ["."]\ntestpaths = ["tests"]\n'
export const PYTHON_PACKAGE_FILES = {
	'package.json': `${JSON.stringify({ name: 'demo' }, null, '\t')}\n`,
	'pyproject.toml': PACKAGE_TOML_TEXT,
	'.gitignore': '__pycache__\n.pytest_cache\n.venv\n',
}

/** The same configuration asking pytest-xdist for two workers on every run. */
export const XDIST_TOML_TEXT =
	'[tool.pytest.ini_options]\npythonpath = ["."]\ntestpaths = ["tests"]\naddopts = "-n 2"\n'

/** The interpreters a pytest folder's `.venv/bin/python` stands for. */
export const WITHOUT_PYTEST_INTERPRETER_TEXT =
	'#!/bin/sh\necho "No module named pytest" >&2\nexit 1\n'
/** Answers a version or an import probe, then prints a line and hangs on the run itself. */
export const HANGING_INTERPRETER_TEXT = [
	'#!/bin/sh',
	'for argument in "$@"; do',
	'  case "$argument" in -c|--version|--help) exit 0;; esac',
	'done',
	'echo "collecting tests"',
	'echo $$ > "$(dirname "$0")/hanging.pid"',
	'exec sleep 600',
	'',
].join('\n')
/** Where the hanging interpreter writes its process id, next to itself: the test stops it when done. */
export const HANGING_PID_FILE = '.venv/bin/hanging.pid'

/** The bound, in milliseconds, of the wait for the hanging interpreter to print its line and write its pid; and the poll step and the pause for its output to reach the run. */
export const HANGING_START_TIMEOUT = 60_000
export const HANGING_POLL_INTERVAL = 25
export const HANGING_OUTPUT_PAUSE = 300

/** The bound of a probe of an interpreter (`pytest --version`, `import xdist`): a guard against a hang, in milliseconds. */
export const PYTHON_PROBE_TIMEOUT = 60_000
/** `{log}`: a file the script appends a line to each time it runs; then it runs the machine's python3. */
export const LOGGING_INTERPRETER_TEMPLATE = '#!/bin/sh\necho used >> "{log}"\nexec python3 "$@"\n'
/** `{target}`: the interpreter the script runs in its place. */
export const FORWARDING_INTERPRETER_TEMPLATE = '#!/bin/sh\nexec "{target}" "$@"\n'

export const XDIST_SKIP_REASON =
	'no interpreter with pytest-xdist: set DIALECTE_XDIST_PYTHON, or install pytest-xdist for the machine python3'
export const XDIST_PYTHON_VARIABLE = 'DIALECTE_XDIST_PYTHON'

/** The production module `adder`: a stub, its implementation, a wrong one, and one that stops at 3. */
export const ADDER_FILE = 'adder.py'
export const ADDER_STUB_TEXT = 'def add(left, right):\n    raise NotImplementedError\n'
export const ADDER_IMPLEMENTED_TEXT = 'def add(left, right):\n    return left + right\n'
export const ADDER_SUBTRACTING_TEXT = 'def add(left, right):\n    return left - right\n'
export const ADDER_LIMITED_TEXT = [
	'def add(left, right):',
	'    if left > 2:',
	'        raise NotImplementedError',
	'    return left + right',
	'',
].join('\n')

export const ADD_PYTEST_FILE = 'tests/test_add.py'

/** One case, `test_one`, asserting `add(1, 2)`: the stub is called at line 5, inside the assert. */
export const ADD_ONE_PYTEST_TEXT = [
	'from adder import add',
	'',
	'',
	'def test_one():',
	'    assert add(1, 2) == 3',
	'',
].join('\n')

/** The call is made before the assert: a stub thrown at line 5 is thrown outside an assertion. */
export const ADD_OUTSIDE_PYTEST_TEXT = [
	'from adder import add',
	'',
	'',
	'def test_one():',
	'    result = add(1, 2)',
	'    assert result == 3',
	'',
].join('\n')

/** `add` is expected to raise on a negative number. */
export const ADD_RAISES_TEST_TEXT = [
	'import pytest',
	'',
	'from adder import add',
	'',
	'',
	'def test_rejects_negative():',
	'    with pytest.raises(ValueError):',
	'        add(-1, 2)',
	'',
].join('\n')

/** An import of a name `adder` does not have. */
export const ADD_MISSING_EXPORT_PYTEST_TEXT = [
	'from adder import nope',
	'',
	'',
	'def test_one():',
	'    assert nope(1, 2) == 3',
	'',
].join('\n')

/** The two syntax failures a file can hold. */
export const SYNTAX_ERROR_TEST_TEXT = 'def test_one(:\n    assert 1 == 1\n'
export const INDENTATION_ERROR_TEST_TEXT =
	'def test_one():\n    assert 1 == 1\n      assert 2 == 2\n'

/** A fixture failing at setup. */
export const SETUP_ERROR_TEST_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.fixture',
	'def broken():',
	'    raise RuntimeError("boom")',
	'',
	'',
	'def test_uses_broken(broken):',
	'    assert broken',
	'',
].join('\n')

/** Every case skipped, by a mark and by a true condition. */
export const SKIPS_ONLY_PYTEST_FILE = 'tests/test_skips.py'
export const SKIPS_ONLY_PYTEST_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.mark.skip(reason="later")',
	'def test_skipped():',
	'    assert False',
	'',
	'',
	'@pytest.mark.skipif(True, reason="never here")',
	'def test_skipped_by_condition():',
	'    assert False',
	'',
].join('\n')

/** A passing case (line 6), a failing one (10), a skip (15) and an expected failure (20). */
export const STATES_TEST_FILE = 'tests/test_states.py'
export const STATES_TEST_TEXT = [
	'import pytest',
	'',
	'from adder import add',
	'',
	'',
	'def test_passes():',
	'    assert add(1, 1) == 2',
	'',
	'',
	'def test_fails():',
	'    assert add(1, 1) == 3',
	'',
	'',
	'@pytest.mark.skip(reason="later")',
	'def test_skipped():',
	'    assert False',
	'',
	'',
	'@pytest.mark.xfail(reason="known")',
	'def test_expected_failure():',
	'    assert False',
	'',
].join('\n')

/** A parametrized method of a class (def at line 6), a tuple table (11) and two stacked decorators (17). */
export const ROWS_TEST_FILE = 'tests/test_rows.py'
export const ROWS_PARAMETRIZED_TEST_TEXT = [
	'import pytest',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
	'',
	'@pytest.mark.parametrize("left, right", [(1, 2), (3, 4)])',
	'def test_pairs(left, right):',
	'    assert left < right',
	'',
	'',
	'@pytest.mark.parametrize("first", [3])',
	'@pytest.mark.parametrize("second", [7])',
	'def test_stacked(first, second):',
	'    assert first < second',
	'',
].join('\n')

/** A parameter id holding the separator of a case's path. */
export const IDS_TEST_FILE = 'tests/test_ids.py'
export const IDS_TEST_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.mark.parametrize("text", ["a > b"])',
	'def test_id(text):',
	'    assert text',
	'',
].join('\n')

/** A file with no test function: pytest exits 5. */
export const NO_TEST_FILE = 'tests/test_none.py'
export const NO_TEST_TEXT = 'def helper():\n    return 1\n'

/** A case using a conftest fixture, a helper module and a data file opened while it runs. */
export const CONFTEST_FILE = 'tests/conftest.py'
export const CONFTEST_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.fixture',
	'def sample():',
	'    return 3',
	'',
].join('\n')
export const HELPERS_FILE = 'tests/helpers.py'
export const HELPERS_TEXT = 'def double(value):\n    return value * 2\n'
export const FIXTURE_FILE = 'tests/fixtures/one.xml'
export const FIXTURE_TEXT = '<Root><A aA="one"/></Root>\n'
export const FIXTURE_EDITED_TEXT = '<Root><A aA="two"/></Root>\n'
export const READS_TEST_FILE = 'tests/test_reads.py'
export const READS_TEST_TEXT = [
	'from pathlib import Path',
	'',
	'from adder import add',
	'from helpers import double',
	'',
	'',
	'def test_reads_everything(sample):',
	'    text = (Path(__file__).parent / "fixtures" / "one.xml").read_text()',
	'    assert text.startswith("<Root>")',
	'    assert add(sample, double(1)) == 5',
	'',
].join('\n')

/** A table of two rows asserting through `add` (which stops at 3), as a base holds it; then a third row; then a rewritten body. */
export const ROWS_BASE_TEST_TEXT = [
	'import pytest',
	'',
	'from adder import add',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert add(value, value) == value * 2',
	'',
].join('\n')
export const ROWS_THREE_TEST_TEXT = [
	'import pytest',
	'',
	'from adder import add',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2, 3])',
	'    def test_row(self, value):',
	'        assert add(value, value) == value * 2',
	'',
].join('\n')
export const ROWS_REWRITTEN_TEST_TEXT = [
	'import pytest',
	'',
	'from adder import add',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert add(value, value) == value + value',
	'',
].join('\n')

/** The same table under a slow mark written above it, as a base holds it; then a third row. */
export const SLOW_ROWS_BASE_TEST_TEXT = [
	'import pytest',
	'',
	'from adder import add',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.slow',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert add(value, value) == value * 2',
	'',
].join('\n')
export const SLOW_ROWS_THREE_TEST_TEXT = [
	'import pytest',
	'',
	'from adder import add',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.slow',
	'    @pytest.mark.parametrize("value", [1, 2, 3])',
	'    def test_row(self, value):',
	'        assert add(value, value) == value * 2',
	'',
].join('\n')

/** A conftest whose fixture comes from a support module only the conftest imports, and a case using the fixture. */
export const IMPORTING_CONFTEST_TEXT = [
	'import pytest',
	'',
	'from support import base_value',
	'',
	'',
	'@pytest.fixture',
	'def sample():',
	'    return base_value()',
	'',
].join('\n')
export const SUPPORT_FILE = 'tests/support.py'
export const SUPPORT_TEXT = 'def base_value():\n    return 3\n'
export const SAMPLE_TEST_FILE = 'tests/test_sample.py'
export const SAMPLE_TEST_TEXT = [
	'from adder import add',
	'',
	'',
	'def test_uses_sample(sample):',
	'    assert add(sample, 2) == 5',
	'',
].join('\n')

/** The helper edited: test code that is no test file. */
export const HELPERS_EDITED_TEXT = 'def double(value):\n    return value + value\n'

/** Two cases in one file, then the first moved to another file. */
export const FIRST_TEST_FILE = 'tests/test_first.py'
export const SECOND_TEST_FILE = 'tests/test_second.py'
export const FIRST_AND_STAY_TEST_TEXT = [
	'from adder import add',
	'',
	'',
	'def test_one():',
	'    assert add(1, 2) == 3',
	'',
	'',
	'def test_stay():',
	'    assert add(2, 2) == 4',
	'',
].join('\n')
export const STAY_ONLY_TEST_TEXT = [
	'from adder import add',
	'',
	'',
	'def test_stay():',
	'    assert add(2, 2) == 4',
	'',
].join('\n')

/** Two pytest folders in one package, each with its own configuration. */
export const FOLDER_A_TOML_TEXT = '[tool.pytest.ini_options]\npython_functions = ["check_*"]\n'
export const FOLDER_B_INI_TEXT = '[pytest]\n'
export const FOLDER_A_TEST_FILE = 'a/test_first.py'
export const FOLDER_A_TEST_TEXT =
	'def check_one():\n    assert 1 == 1\n\n\ndef test_ignored():\n    assert 1 == 1\n'
export const FOLDER_B_TEST_FILE = 'b/test_second.py'
export const FOLDER_B_TEST_TEXT =
	'def test_two():\n    assert 1 == 1\n\n\ndef check_ignored():\n    assert 1 == 1\n'

/** The package's configuration, its discovery never entering a `fixtures` folder. */
export const NORECURSE_FIXTURES_TOML_TEXT =
	'[tool.pytest.ini_options]\npythonpath = ["."]\ntestpaths = ["tests"]\nnorecursedirs = ["fixtures"]\n'
/** A fixture named as a test module, in a folder pytest's discovery does not enter. */
export const FIXTURE_MODULE_FILE = 'tests/fixtures/test_x.py'
export const FIXTURE_MODULE_TEXT = 'def test_shape():\n    assert True\n'
/** A script named as a test module, outside the package's testpaths (`tests`). */
export const TOOL_SCRIPT_FILE = 'scripts/test_tool.py'
export const TOOL_SCRIPT_TEXT = 'def test_tool():\n    assert True\n'

/** A conftest leaving out of collection one file by `collect_ignore`, one by `collect_ignore_glob`, one by its hook. */
export const IGNORING_CONFTEST_TEXT = [
	'collect_ignore = ["test_ignored.py"]',
	'collect_ignore_glob = ["test_glob*.py"]',
	'',
	'',
	'def pytest_ignore_collect(collection_path, config):',
	'    if collection_path.name == "test_hooked.py":',
	'        return True',
	'    return None',
	'',
].join('\n')
export const IGNORED_TEST_FILE = 'tests/test_ignored.py'
export const GLOB_IGNORED_TEST_FILE = 'tests/test_globbed.py'
export const HOOK_IGNORED_TEST_FILE = 'tests/test_hooked.py'
/** The outside line of a file a conftest leaves out of collection: no refusal, nothing frozen. */
export const PYTEST_IGNORED_OUTSIDE_LINE =
	"not a test file pytest collects (a conftest's collect_ignore, collect_ignore_glob or pytest_ignore_collect leaves it out)"
