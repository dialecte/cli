"""The cli's pytest plugin: writes what a run saw to the file named by DIALECTE_TDD_REPORT.

Loaded with `-p dialecte_tdd_pytest`. The report is one JSON list, one entry per test file collected: its
collection errors, its cases (name, state, def line, errors, source, skip mark in a collect), the files it
used (conftests, the modules its imports and its conftests' imports resolve to, the files opened while it was collected and while its
cases ran) and its own code (module-level and test-class statements, imports by what they resolve to, never the
test functions), and the own code of its base text when DIALECTE_TDD_BASE_TEXTS names a JSON file of base texts. Imports the standard library and pytest only; Python 3.8 or later, pytest 7 or later.
"""

import ast
import copy
import errno
import fnmatch
import hashlib
import importlib.machinery
import importlib.util
import json
import os
import pathlib
import re
import sys

import pytest

REPORT_VARIABLE = "DIALECTE_TDD_REPORT"
NAMES_VARIABLE = "DIALECTE_TDD_NAMES"
ROOT_VARIABLE = "DIALECTE_TDD_ROOT"
BASE_TEXTS_VARIABLE = "DIALECTE_TDD_BASE_TEXTS"
OWN_CODE_VARIABLE = "DIALECTE_TDD_OWN_CODE"
# a parametrize call's literal values, which each case's row covers
ROWS_PLACEHOLDER = "<rows>"
# between the parts of an own-code identity: its scope, its kind, its target, its names
OWN_CODE_SEPARATOR = "\0"
NAME_SEPARATOR = " > "
ROW_SEPARATOR = "\0"
UNMAPPABLE_NAME_ERROR = "UnmappableCaseName"
UNMAPPABLE_NAME_MESSAGE = (
    "the case name holds ' > ': it cannot be mapped back to a node id; give the parameter an id without it"
)
COLLECTION_ERROR_LINE = re.compile(r"^E\s+([A-Za-z_][\w.]*)(?::\s?(.*))?$")
CACHE_FOLDER = "__pycache__"
# the context managers that assert their body raises or warns
EXPECTING_CALLS = ("raises", "warns")

# what the run saw so far: the test files by path in collection order, the cases by node id, the file
# whose collection or case is running now (the files opened then are its), the parsed sources by path
RUN = {
    "modules": {},
    "cases": {},
    "opening": None,
    "trees": {},
    "conftest_imports": {},
    "audited": False,
    "collect_only": False,
    "root": None,
    "config": None,
}


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    """Turns xdist off (the cases run in this process, so these hooks see them) and starts noting opened files."""
    if getattr(config.option, "numprocesses", None):
        config.option.numprocesses = 0
    if hasattr(config.option, "dist"):
        config.option.dist = "no"
    RUN["collect_only"] = bool(config.getoption("collectonly"))
    RUN["config"] = config
    RUN["root"] = os.path.realpath(os.environ.get(ROOT_VARIABLE) or str(config.rootpath))
    if not RUN["audited"]:
        sys.addaudithook(note_opened_file)
        RUN["audited"] = True


def note_opened_file(event, arguments):
    """Audit hook: a file opened while a test file is collected or one of its cases runs is a file it used."""
    if event != "open" or RUN["opening"] is None:
        return
    try:
        path = arguments[0]
        if isinstance(path, int):
            return
        RUN["modules"][RUN["opening"]]["opened"].add(os.path.abspath(os.fsdecode(path)))
    except Exception:  # noqa: BLE001 - an audit hook never breaks the open it watches
        return


@pytest.hookimpl(hookwrapper=True)
def pytest_make_collect_report(collector):
    """Notes the files a test file opens while it is collected, and the error that stops its collection."""
    if not isinstance(collector, pytest.Module):
        yield
        return
    path = os.path.abspath(str(collector.path))
    module = module_record(path)
    RUN["opening"] = path
    outcome = yield
    RUN["opening"] = None
    report = outcome.get_result()
    if report.failed:
        module["errors"].append(collection_error(report))
        return
    try:
        module["name"] = collector.obj.__name__
    except Exception:  # noqa: BLE001 - a module that did not import has no name to follow
        module["name"] = None


def pytest_collection_modifyitems(session, config, items):
    """Leaves out the test files a conftest leaves out of discovery, then keeps only the cases DIALECTE_TDD_NAMES
    lists (their full names), when it lists any."""
    ignored = {path for path in RUN["modules"] if is_ignored(session=session, config=config, path=path)}
    for path in ignored:
        del RUN["modules"][path]
    listed = os.environ.get(NAMES_VARIABLE)
    names = set(json.loads(listed)) if listed else None
    kept = [
        item
        for item in items
        if os.path.abspath(str(item.path)) not in ignored and (names is None or case_name(item) in names)
    ]
    kept_items = set(kept)
    left = [item for item in items if item not in kept_items]
    if left:
        config.hook.pytest_deselected(items=left)
    items[:] = kept


def is_ignored(session, config, path):
    """pytest's own ignore hook leaves the file out of discovery (`collect_ignore`, `collect_ignore_glob`, a
    conftest's `pytest_ignore_collect`): pytest 8 and 9 still collect a file named on the command line, which a
    plain run of the package would never collect."""
    collection_path = pathlib.Path(path)
    hook = session.gethookproxy(collection_path)
    return bool(hook.pytest_ignore_collect(collection_path=collection_path, config=config))


def pytest_collection_finish(session):
    """Records each case the run holds, in collection order, under its test file."""
    for item in session.items:
        path = os.path.abspath(str(item.path))
        record = case_record(item)
        RUN["cases"][item.nodeid] = record
        module_record(path)["cases"].append(record)


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_protocol(item, nextitem):
    """Attributes the files opened while a case runs (setup to teardown) to its test file."""
    RUN["opening"] = os.path.abspath(str(item.path))


@pytest.hookimpl(trylast=True)
def pytest_runtest_logfinish(nodeid, location):
    """Ends the attribution of opened files to the case's test file."""
    RUN["opening"] = None


@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_runtest_makereport(item, call):
    """Reads each phase's final report into the case's state and errors (xfail -> skipped, strict xpass -> failed)."""
    outcome = yield
    record = RUN["cases"].get(item.nodeid)
    if record is None or record.get("unmappable"):
        return
    report = outcome.get_result()
    if report.failed:
        record["state"] = "failed"
        record["errors"].append(phase_error(item=item, call=call, report=report))
    elif report.skipped and call.when in ("setup", "call"):
        record["state"] = "skipped"
    elif report.passed and call.when == "call":
        record["state"] = "passed"


def pytest_sessionfinish(session, exitstatus):
    """Writes the report: the test files with their errors, cases and dependencies."""
    path = os.environ.get(REPORT_VARIABLE)
    if not path:
        return
    base_texts = read_base_texts()
    modules = [module_report(file, module, base_texts) for file, module in RUN["modules"].items()]
    with open(path, "w", encoding="utf-8") as report:
        json.dump(modules, report)


def module_record(path):
    """The record of a test file, made on first sight."""
    if path not in RUN["modules"]:
        RUN["modules"][path] = {"errors": [], "cases": [], "opened": set(), "name": None}
    return RUN["modules"][path]


def module_report(path, module, base_texts):
    """A test file as the cli reads it, with the own code of its base text when one was given."""
    text, tree = parsed(path)
    name = module["name"] or module_name_of(path)
    report = {
        "file": path,
        "runner": "pytest",
        "errors": module["errors"],
        "cases": [
            {key: value for key, value in case.items() if key != "unmappable"} for case in module["cases"]
        ],
        "dependencies": sorted(dependencies_of(path=path, module=module)),
    }
    if os.environ.get(OWN_CODE_VARIABLE) != "1":
        return report
    collected = {case["location"]["line"] for case in module["cases"] if "location" in case}
    report["ownCode"] = own_code_of(
        path=path, text=text, tree=tree, module_name=name, is_test=lambda node: node.lineno in collected
    )
    base_text = base_texts.get(os.path.relpath(os.path.realpath(path), RUN["root"] or ""))
    if base_text is not None:
        try:
            base_tree = ast.parse(base_text)
        except (SyntaxError, ValueError):
            base_tree = None
        report["baseOwnCode"] = own_code_of(
            path=path, text=base_text, tree=base_tree, module_name=name, is_test=is_test_by_pattern
        )
    return report


def read_base_texts():
    """The base texts the cli gave, by path relative to the package root; none when it gave none."""
    path = os.environ.get(BASE_TEXTS_VARIABLE)
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as texts:
            return {os.path.normpath(key): value for key, value in json.load(texts).items()}
    except (OSError, ValueError, AttributeError):
        # an unreadable file loses the base own code only, never the report
        return {}


def is_test_by_pattern(node):
    """A function of a base text is a test when pytest's `python_functions` names it and no fixture decorates it (the
    base text did not run: its collection is not known)."""
    return matches_option(name=node.name, option="python_functions") and not any(
        is_fixture(decorator) for decorator in node.decorator_list
    )


def is_fixture(decorator):
    """`@fixture`, `@pytest.fixture`, called or not."""
    called = decorator.func if isinstance(decorator, ast.Call) else decorator
    name = called.attr if isinstance(called, ast.Attribute) else getattr(called, "id", None)
    return name == "fixture"


def own_code_of(path, text, tree, module_name, is_test):
    """The file's own code: each module-level statement and each statement of a test class body (scoped by its
    class names), a test class's header (its decorators, bases and keywords) in the scope holding it, imports once
    per binding by what they resolve to and their names (an import nested in a statement by its target too), never a
    test function (`is_test`: the functions pytest collected, by their def line) nor a leading docstring; each with its text and the sha256 of its scope and identity (`ast.dump`: formatting and comments
    left out, its output the running Python's: an interpreter changed between the red and the move refuses the move)."""
    if tree is None:
        return []
    is_package = os.path.basename(path) == "__init__.py"
    package = module_name if is_package else module_name.rpartition(".")[0]
    statements = []

    def add(scope, node, identity, shown=None):
        statements.append(
            {
                "text": shown if shown is not None else ast.get_source_segment(text, node) or "",
                "hash": hashlib.sha256(OWN_CODE_SEPARATOR.join([*scope, identity]).encode("utf-8")).hexdigest(),
            }
        )

    def collect(body, scope):
        for position, node in enumerate(body):
            if position == 0 and is_docstring(node):
                continue
            imported = import_identities(node=node, package=package)
            if imported is not None:
                for identity in imported:
                    add(scope, node, identity)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and is_test(node):
                continue
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.decorator_list:
                add(scope, node, ast.dump(resolved_imports(node=node, package=package)), shown=decorated_text(text, node))
            elif isinstance(node, ast.ClassDef) and matches_option(name=node.name, option="python_classes"):
                header = copy.copy(node)
                header.body = []
                add(scope, node, ast.dump(header), shown=class_header_text(text=text, node=node))
                collect(node.body, [*scope, node.name])
            else:
                add(scope, node, ast.dump(resolved_imports(node=node, package=package)))

    collect(tree.body, [])
    return statements


def is_docstring(node):
    """A string standing alone as a statement: a module's or a class's docstring when it comes first."""
    return (
        isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)
    )


def decorated_text(text, node):
    """A decorated definition as written: its decorators, then its own text."""
    decorators = ["@" + (ast.get_source_segment(text, decorator) or "") for decorator in node.decorator_list]
    return "\n".join([*decorators, ast.get_source_segment(text, node) or ""])


def class_header_text(text, node):
    """A class's header as written: its decorators, then its `class` line."""
    decorators = ["@" + (ast.get_source_segment(text, decorator) or "") for decorator in node.decorator_list]
    first = (ast.get_source_segment(text, node) or "").split("\n")[0]
    return "\n".join([*decorators, first])


def resolved_imports(node, package):
    """A copy of the statement whose nested imports name what they resolve to (a relative import in a `try` hashed by
    its file, not its spelling); the statement itself when it holds none."""
    if not any(isinstance(inner, (ast.Import, ast.ImportFrom)) for inner in ast.walk(node)):
        return node
    copied = copy.deepcopy(node)
    for inner in ast.walk(copied):
        if isinstance(inner, ast.ImportFrom):
            inner.module = import_target(absolute_module(node=inner, package=package))
            inner.level = 0
        elif isinstance(inner, ast.Import):
            for alias in inner.names:
                alias.asname = alias.asname or alias.name.partition(".")[0]
                alias.name = import_target(alias.name)
    return copied


def absolute_module(node, package):
    """The module a `from ... import` names, a relative one resolved against the package; its dotted spelling when it
    cannot be (such a module fails to import, so its cases never pass)."""
    base = node.module or ""
    if not node.level:
        return base
    try:
        return importlib.util.resolve_name("." * node.level + base, package)
    except (ImportError, ValueError):
        return "." * node.level + base


def import_identities(node, package):
    """One identity per binding of an import: its kind, the file or module it resolves to, its imported and local
    names; None for any other statement."""
    if isinstance(node, ast.Import):
        return [
            OWN_CODE_SEPARATOR.join(
                ["import", import_target(alias.name), "", alias.asname or alias.name.partition(".")[0]]
            )
            for alias in node.names
        ]
    if isinstance(node, ast.ImportFrom):
        target = import_target(absolute_module(node=node, package=package))
        return [
            OWN_CODE_SEPARATOR.join(["import", target, alias.name, alias.asname or alias.name])
            for alias in node.names
        ]
    return None


def import_target(name):
    """The package file a module name resolves to (relative to the package root), else the module name itself. Never
    imports anything: a module the run did not import is found on its parent's path only when that parent is
    imported (or on sys.path for a top-level one)."""
    file = getattr(sys.modules.get(name), "__file__", None)
    if not file:
        parent, _, last = name.rpartition(".")
        search = getattr(sys.modules.get(parent), "__path__", None) if parent else None
        try:
            spec = importlib.machinery.PathFinder.find_spec(last, search) if search or not parent else None
        except Exception:  # noqa: BLE001 - a finder failing names the module by its name, never stops the report
            spec = None
        file = getattr(spec, "origin", None) if spec else None
    if not file or not os.path.isfile(file):
        return name
    real = os.path.realpath(source_path(os.path.abspath(file)))
    if not is_under_root(real):
        return name
    return pathlib.PurePath(os.path.relpath(real, RUN["root"])).as_posix()


def matches_option(name, option):
    """The name is a test function or class by pytest's `python_functions` / `python_classes`: a prefix, or a glob."""
    config = RUN["config"]
    patterns = config.getini(option) if config is not None else []
    return any(
        fnmatch.fnmatch(name, pattern) if any(mark in pattern for mark in "*?[") else name.startswith(pattern)
        for pattern in patterns
    )


def case_name(item):
    """The case's full name: its node id after the file, the parts joined with ' > '."""
    return NAME_SEPARATOR.join(item.nodeid.split("::")[1:])


def case_record(item):
    """A case as collected: its name, its def line, its source, its skip mark in a collect; skipped until it runs."""
    parts = item.nodeid.split("::")[1:]
    path = os.path.abspath(str(item.path))
    node = function_node(path=path, classes=parts[:-1], name=getattr(item, "originalname", None) or item.name)
    record = {"name": NAME_SEPARATOR.join(parts), "state": "skipped", "project": "", "errors": []}
    if node is not None:
        record["location"] = {"line": node.lineno, "column": node.col_offset + 1}
        record["source"] = case_source(path=path, node=node, item=item)
    else:
        record["location"] = {"line": (item.location[1] or 0) + 1, "column": 1}
    if RUN["collect_only"]:
        record["skipMarked"] = is_skip_marked(item)
    if any(NAME_SEPARATOR in part for part in parts):
        record["state"] = "failed"
        record["errors"].append({"name": UNMAPPABLE_NAME_ERROR, "message": UNMAPPABLE_NAME_MESSAGE, "frames": []})
        record["unmappable"] = True
    return record


def is_skip_marked(item):
    """A skip mark or a true skipif marks the case (a condition that cannot be read does not)."""
    try:
        from _pytest.skipping import evaluate_skip_marks

        return evaluate_skip_marks(item) is not None
    except Exception:  # noqa: BLE001 - an unreadable condition is decided by the run, not here
        return False


def parsed(path):
    """The text and the syntax tree of a Python file (None for the tree when it does not parse), read once."""
    if path not in RUN["trees"]:
        try:
            with open(path, encoding="utf-8") as source:
                text = source.read()
        except OSError:
            text = ""
        try:
            tree = ast.parse(text)
        except (SyntaxError, ValueError):
            tree = None
        RUN["trees"][path] = (text, tree)
    return RUN["trees"][path]


def function_node(path, classes, name):
    """The definition of the case's function: the last `def <name>` in the classes of its node id."""
    tree = parsed(path)[1]
    if tree is None:
        return None
    body = tree.body
    for class_name in classes:
        found = [node for node in body if isinstance(node, ast.ClassDef) and node.name == class_name]
        if not found:
            return None
        body = found[-1].body
    functions = [
        node for node in body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    ]
    return functions[-1] if functions else None


def is_parametrize(decorator):
    """The decorator is a `...parametrize(...)` call."""
    return (
        isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr == "parametrize"
    )


def case_source(path, node, item):
    """The function's text without its parametrize decorators, and the text of the case's row of each of them."""
    text = parsed(path)[0]
    decorators = [
        "@" + (ast.get_source_segment(text, decorator) or "")
        for decorator in node.decorator_list
        if not is_parametrize(decorator)
    ]
    call = "\n".join(decorators + [ast.get_source_segment(text, node) or ""])
    source = {"call": call}
    # each parametrize call but its literal values (the case's row stands for those): its names, ids, indirect, scope
    settings = [parametrize_settings(decorator) for decorator in node.decorator_list if is_parametrize(decorator)]
    if settings:
        source["parametrize"] = ROW_SEPARATOR.join(settings)
    callspec = getattr(item, "callspec", None)
    if callspec is None:
        return source
    rows = [
        row
        for row in (
            row_text(text=text, decorator=decorator, indices=callspec.indices)
            for decorator in node.decorator_list
            if is_parametrize(decorator)
        )
        if row is not None
    ]
    if rows:
        source["row"] = ROW_SEPARATOR.join(rows)
    return source


def parametrize_settings(decorator):
    """A parametrize call as `ast.dump` reads it, its literal values replaced by one placeholder: a change of names,
    ids, indirect, scope or of a values expression shows, a row added does not."""
    copied = copy.deepcopy(decorator)
    values = argument_of(copied, 1, "argvalues")
    if isinstance(values, (ast.List, ast.Tuple)):
        placeholder = ast.Constant(value=ROWS_PLACEHOLDER)
        if len(copied.args) > 1:
            copied.args[1] = placeholder
        else:
            for given in copied.keywords:
                if given.arg == "argvalues":
                    given.value = placeholder
    return ast.dump(copied)


def argument_of(decorator, position, keyword):
    """A call's argument given by its position or by its keyword."""
    if len(decorator.args) > position:
        return decorator.args[position]
    for given in decorator.keywords:
        if given.arg == keyword:
            return given.value
    return None


def row_text(text, decorator, indices):
    """The text of the row the case runs, when the decorator's values are a literal list or tuple."""
    names = argument_of(decorator, 0, "argnames")
    values = argument_of(decorator, 1, "argvalues")
    if not isinstance(values, (ast.List, ast.Tuple)):
        return None
    if isinstance(names, ast.Constant) and isinstance(names.value, str):
        first = names.value.split(",")[0].strip()
    elif isinstance(names, (ast.List, ast.Tuple)) and names.elts and isinstance(names.elts[0], ast.Constant):
        first = names.elts[0].value
    else:
        return None
    index = indices.get(first)
    if index is None or index >= len(values.elts):
        return None
    return ast.get_source_segment(text, values.elts[index])


def collection_error(report):
    """The error that stopped a test file's collection: the exception pytest wrapped, else its last `E` line."""
    call = getattr(report, "call", None)
    excinfo = getattr(call, "excinfo", None)
    if excinfo is not None:
        error = excinfo.value
        while type(error).__name__ == "CollectError" and (error.__cause__ or error.__context__):
            error = error.__cause__ or error.__context__
        if type(error).__name__ != "CollectError":
            return {"name": type(error).__name__, "message": str(error), "frames": []}
    text = str(report.longrepr)
    for line in reversed(text.splitlines()):
        match = COLLECTION_ERROR_LINE.match(line)
        if match:
            return {
                "name": match.group(1).split(".")[-1],
                "message": match.group(2) or "",
                "frames": [],
            }
    return {"name": "CollectError", "message": text, "frames": []}


def phase_error(item, call, report):
    """The error of a failed phase: its exception's type, message, frames from the test function inward, and
    whether the innermost frame in the test file lies inside an `assert` statement."""
    test_path = os.path.abspath(str(item.path))
    excinfo = call.excinfo
    if excinfo is None:
        return {"name": "Failed", "message": str(report.longrepr), "frames": [], "inAssertion": False}
    frames = frames_of(excinfo=excinfo, test_path=test_path)
    test_frame = next((frame for frame in frames if frame["file"] == test_path), None)
    error = {
        "name": excinfo.typename,
        "message": str(excinfo.value),
        "frames": frames,
        "inAssertion": test_frame is not None and is_in_assert(path=test_path, line=test_frame["line"]),
    }
    # an OSError's code as node names it (ENOENT): what the error is, never read from its message
    code = errno.errorcode.get(getattr(excinfo.value, "errno", None) or -1)
    if isinstance(excinfo.value, OSError) and code:
        error["code"] = code
    return error


def is_hidden(frame, excinfo):
    """The frame asks to be left out of tracebacks (`__tracebackhide__`, a value or a function of the error)."""
    hide = frame.f_locals.get("__tracebackhide__", frame.f_globals.get("__tracebackhide__", False))
    if callable(hide):
        try:
            return bool(hide(excinfo))
        except Exception:  # noqa: BLE001 - a broken hide function hides nothing
            return False
    return bool(hide)


def frames_of(excinfo, test_path):
    """The traceback's frames innermost first, cut to the test file's first frame and below, hidden ones left out."""
    entries = []
    traceback = excinfo.tb
    while traceback is not None:
        frame = traceback.tb_frame
        entries.append((frame, os.path.abspath(frame.f_code.co_filename), traceback.tb_lineno))
        traceback = traceback.tb_next
    start = next((index for index, entry in enumerate(entries) if entry[1] == test_path), 0)
    kept = [
        {"file": path, "line": line, "column": 1}
        for frame, path, line in entries[start:]
        if not is_hidden(frame, excinfo)
    ]
    return list(reversed(kept))


def is_in_assert(path, line):
    """The line lies inside an assertion of the file: an `assert` statement, or the body of a `with` of
    `pytest.raises(...)` / `pytest.warns(...)`."""
    tree = parsed(path)[1]
    if tree is None:
        return False
    return any(
        (isinstance(node, ast.Assert) and node.lineno <= line <= end_line_of(node))
        or (isinstance(node, (ast.With, ast.AsyncWith)) and is_expecting_body_line(node=node, line=line))
        for node in ast.walk(tree)
    )


def end_line_of(node):
    """The last line of a node (its first one on a Python without end positions)."""
    return getattr(node, "end_lineno", None) or node.lineno


def is_expecting_body_line(node, line):
    """The line lies in the body of a `with` one of whose items is a `raises(...)` / `warns(...)` call."""
    if not node.body or not any(is_expecting_call(item.context_expr) for item in node.items):
        return False
    return node.body[0].lineno <= line <= end_line_of(node.body[-1])


def is_expecting_call(expression):
    """The expression is a call of `raises` or `warns`, bare or as an attribute (`pytest.raises(...)`)."""
    if not isinstance(expression, ast.Call):
        return False
    function = expression.func
    name = function.attr if isinstance(function, ast.Attribute) else getattr(function, "id", None)
    return name in EXPECTING_CALLS


def source_path(path):
    """A compiled file in `__pycache__` read as the source next to its folder; any other path as it is."""
    folder, name = os.path.split(path)
    if os.path.basename(folder) == CACHE_FOLDER and name.endswith(".pyc"):
        return os.path.join(os.path.dirname(folder), name.split(".")[0] + ".py")
    return path


def is_under_root(path):
    """The path lies under the package root the cli named (the rootdir without it)."""
    root = RUN["root"] or ""
    real = os.path.realpath(path)
    return real == root or real.startswith(root.rstrip(os.sep) + os.sep)


def dependencies_of(path, module):
    """The package files a test file used: conftests up to the rootdir, the imports of the test file and of each
    conftest followed, files opened."""
    found = {source_path(opened) for opened in module["opened"]}
    conftests = conftests_of(path)
    found |= conftests
    for conftest in conftests:
        found |= conftest_imports(conftest)
    if module["name"]:
        found |= imported_files(path=path, module_name=module["name"], seen=set())
    found.discard(path)
    return {file for file in found if is_under_root(file) and os.path.isfile(file)}


def conftest_imports(path):
    """The package files a conftest's imports resolve to, followed through their own imports; read once."""
    if path not in RUN["conftest_imports"]:
        RUN["conftest_imports"][path] = imported_files(path=path, module_name=module_name_of(path), seen=set())
    return RUN["conftest_imports"][path]


def module_name_of(path):
    """The name the file was imported under (`sys.modules`), else its file name without `.py`."""
    for name, imported in list(sys.modules.items()):
        file = getattr(imported, "__file__", None)
        if file and source_path(os.path.abspath(file)) == path:
            return name
    return os.path.splitext(os.path.basename(path))[0]


def conftests_of(path):
    """The conftest.py of the test file's folder and of each parent up to the rootdir (or the package root)."""
    found = set()
    folder = os.path.dirname(path)
    root = RUN["root"] or folder
    while True:
        candidate = os.path.join(folder, "conftest.py")
        if os.path.isfile(candidate):
            found.add(candidate)
        parent = os.path.dirname(folder)
        if folder == root or parent == folder or not is_under_root(parent):
            return found
        folder = parent


def imported_names(tree, module_name, is_package):
    """The module names the file's import statements name (relative ones resolved against its package)."""
    package = module_name if is_package else module_name.rpartition(".")[0]
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                try:
                    base = importlib.util.resolve_name("." * node.level + base, package)
                except (ImportError, ValueError):
                    continue
            if base:
                names.append(base)
            names.extend(base + "." + alias.name if base else alias.name for alias in node.names)
    return names


def imported_files(path, module_name, seen):
    """The package files the file's imports resolve to (`sys.modules`), followed through their own imports."""
    tree = parsed(path)[1]
    if tree is None:
        return set()
    found = set()
    is_package = os.path.basename(path) == "__init__.py"
    for name in imported_names(tree, module_name, is_package):
        file = getattr(sys.modules.get(name), "__file__", None)
        if not file:
            continue
        file = source_path(os.path.abspath(file))
        if file in seen or not is_under_root(file) or not file.endswith(".py"):
            continue
        seen.add(file)
        found.add(file)
        found |= imported_files(path=file, module_name=name, seen=seen)
    return found
