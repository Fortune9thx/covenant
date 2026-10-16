"""Gates on the generated deployable: first bytes, shape, size, reproducibility."""

import pathlib

import build_bundle

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "contracts" / "build" / "Covenant.bundled.py"
DEPENDS = build_bundle.DEPENDS

# Studio Dev has an empirical deploy-size wall a little above 50KB of encoded
# payload. Docstrings are stripped to stay well under it; this ceiling catches a
# regression long before a deploy would.
SIZE_CEILING = 64 * 1024


def _read():
    return BUNDLE.read_bytes()


def test_bundle_exists_and_depends_is_first_byte():
    raw = _read()
    assert raw, "bundle missing -- run python contracts/build_bundle.py"
    assert raw.split(b"\n", 1)[0].decode() == DEPENDS


def test_bundle_has_no_bom():
    assert not _read().startswith(b"\xef\xbb\xbf")


def test_bundle_has_exactly_one_contract_class():
    text = BUNDLE.read_text(encoding="utf-8")
    assert text.count("(gl.contract.Contract)") == 1
    assert "class Covenant(gl.contract.Contract)" in text


def test_bundle_within_size_ceiling():
    assert BUNDLE.stat().st_size <= SIZE_CEILING


def test_bundle_is_reproducible_from_source():
    before = _read()
    assert build_bundle.main() == 0
    assert _read() == before, "bundle is stale; run python contracts/build_bundle.py"
