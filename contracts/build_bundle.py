"""Inline covenantlib into Covenant.py to produce the single deployable file.

GenVM validates one file, and sibling imports fail validation, so the modules
that exist separately for testing are concatenated here. The Depends line is
re-emitted as byte one of the output with nothing above it.
"""

import ast
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "build" / "Covenant.bundled.py"
DEPENDS = '# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }'

# Order matters: canonicalize and judgment import from ssrf.
MODULES = [
    "covenantlib/ssrf.py",
    "covenantlib/canonicalize.py",
    "covenantlib/accounting.py",
    "covenantlib/judgment.py",
]

BEGIN = "# --- covenantlib (inlined by contracts/build_bundle.py for deployment) -------"
END = "# --- end covenantlib ---------------------------------------------------------"


def strip_module(text):
    """Drop a module's own imports of the other bundled modules.

    Stdlib imports are kept and hoisted; only intra-package imports are
    removed, since after concatenation every name is already in one namespace.
    """
    text = re.sub(r"(?m)^from \.{0,2}covenantlib[\w.]* import \([^)]*\)\n", "", text)
    text = re.sub(r"(?m)^from \.{0,2}covenantlib[\w.]* import .*\n", "", text)
    text = re.sub(r"(?m)^from \.[\w.]* import \([^)]*\)\n", "", text)
    text = re.sub(r"(?m)^from \.[\w.]* import .*\n", "", text)
    return text.strip() + "\n"


def collect_stdlib_imports(texts):
    found = []
    for t in texts:
        for line in t.splitlines():
            s = line.strip()
            if s.startswith(("import ", "from ")) and "covenantlib" not in s:
                if s.startswith(("from .", "import .")):
                    continue
                if s.startswith(("from genlayer", "import genlayer")):
                    continue
                if s not in found:
                    found.append(s)
    return found


def strip_docstrings(source):
    """Remove docstrings from the deployable file only.

    Studio Dev has an empirical deploy-size wall a little above 50KB of encoded
    payload, and COVENANT is documented heavily on purpose. Docstrings are
    stripped from the generated bundle so the source stays readable without
    spending the deploy budget on prose. Comments are left alone: they are
    cheap and a reviewer reads the bundle too.

    Rewriting is done through the AST, so this can never alter a string that is
    actually used — only expression-statement docstrings are dropped.
    """
    tree = ast.parse(source)
    targets = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)
    drop = set()
    for node in ast.walk(tree):
        if not isinstance(node, targets):
            continue
        body = getattr(node, "body", None)
        if not body:
            continue
        first = body[0]
        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            # Never leave a body empty; a lone docstring becomes `pass`.
            drop.add((first.lineno, first.end_lineno, len(body) == 1))

    lines = source.splitlines(keepends=True)
    removed = set()
    for start, end, only in drop:
        for i in range(start, end + 1):
            removed.add(i)
        if only:
            indent = len(lines[start - 1]) - len(lines[start - 1].lstrip())
            lines[start - 1] = " " * indent + "pass\n"
            removed.discard(start)

    out = [ln for i, ln in enumerate(lines, 1) if i not in removed]
    result = "".join(out)
    compile(result, "<stripped>", "exec")
    return result


def main():
    contract = (ROOT / "Covenant.py").read_text(encoding="utf-8")
    if BEGIN not in contract or END not in contract:
        print("error: covenantlib import markers missing from Covenant.py", file=sys.stderr)
        return 1

    module_texts = [(ROOT / m).read_text(encoding="utf-8") for m in MODULES]
    stripped = [strip_module(t) for t in module_texts]

    # Hoist every stdlib import the inlined modules need above the contract, so
    # nothing depends on where in the file its module landed.
    header = collect_stdlib_imports(stripped)

    inlined = (
        "# --- begin inlined covenantlib (generated; edit contracts/covenantlib/*.py) ---\n"
        + "\n".join(header) + "\n\n"
        + "\n\n".join(stripped)
        + "\n# --- end inlined covenantlib ---"
    )

    start = contract.index(BEGIN)
    end = contract.index(END) + len(END)
    bundled = contract[:start] + inlined + contract[end:]

    # The runner directive must be the very first bytes of the file.
    lines = bundled.splitlines()
    lines = [ln for ln in lines if not ln.startswith('# { "Depends"')]
    bundled = DEPENDS + "\n" + "\n".join(lines).lstrip("\n") + "\n"

    bundled = strip_docstrings(bundled)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # newline="" disables platform newline translation. Without it, Windows
    # writes CRLF and the deployable no longer matches what CI built.
    OUT.write_text(bundled, encoding="utf-8", newline="")

    # Every import the contract makes outside the splice region must survive
    # into the deployable. The splice silently swallowed `from genlayer.types
    # import *` once on a sibling project -- isort had sorted it in among the
    # covenantlib imports -- and the fake test runtime supplies those names
    # itself, so every test stayed green while the artifact could not be
    # imported at all. Scanned over the WHOLE source, not just outside the
    # markers, because the import that went missing had drifted INSIDE it.
    for line in contract.splitlines():
        s = line.strip()
        if not s.startswith(("import ", "from ")):
            continue
        if s.startswith(("from covenantlib", "import covenantlib")):
            continue
        assert s in bundled, f"bundler dropped a required import: {s}"

    raw = OUT.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), "BOM in bundled output"
    assert raw.split(b"\n", 1)[0].decode() == DEPENDS, "Depends line is not first"
    compile(bundled, str(OUT), "exec")

    print(f"wrote {OUT} ({len(raw)} bytes, {len(bundled.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
