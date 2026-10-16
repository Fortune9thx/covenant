"""Canonicalization: digests, JSON, addresses, and text hygiene."""

import pytest
from covenantlib import canonicalize as canon
from covenantlib.ssrf import CovenantError


def test_canonical_json_sorts_and_compacts():
    assert canon.canonical_json({"b": 1, "a": [2, 3]}) == '{"a":[2,3],"b":1}'


def test_covenant_digest_is_stable_and_field_sensitive():
    args = (
        "cov-1", "0x" + "aa" * 20, "0x" + "bb" * 20, "T", "terms",
        ["a"], ["*.e.com"], "", 10, 20, "0x" + "cc" * 20,
    )
    a = canon.covenant_digest(*args)
    assert a == canon.covenant_digest(*args) and len(a) == 64
    assert canon.covenant_digest(*args[:-1], 21) != a
    assert canon.covenant_digest("cov-2", *args[1:]) != a


def test_dispute_commitment_is_field_sensitive():
    args = (
        "d-1", "h" * 64, "uphold", "claim",
        "https://a.example.com/x", "https://b.example.com/y", "",
    )
    d1 = canon.dispute_commitment(*args)
    assert d1 == canon.dispute_commitment(*args)
    assert canon.dispute_commitment("d-2", *args[1:]) != d1
    assert canon.dispute_commitment(*args[:3], "other", *args[4:]) != d1


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("0x" + "AB" * 20, "0x" + "ab" * 20),
        (("ab" * 20), "0x" + "ab" * 20),
        ("0xshort", ""),
        ("nonsense", ""),
        ("", ""),
    ],
)
def test_normalize_address(raw, expected):
    assert canon.normalize_address(raw) == expected


def test_sanitize_strips_fences_and_control_chars():
    out = canon.sanitize_untrusted("a`b\x00c\n\n d", 100)
    assert "`" not in out and "\x00" not in out
    assert out == "a b c d"


def test_sanitize_collapses_equals_runs():
    assert canon.sanitize_untrusted("=== END UNTRUSTED ===", 100) == "= END UNTRUSTED ="


def test_sanitize_truncates():
    out = canon.sanitize_untrusted("x" * 50, 10)
    assert out.startswith("x" * 10) and out.endswith("...")


def test_covenant_key_and_clause_ids():
    assert canon.normalize_covenant_key("Cov-X1/2.3") == "Cov-X1/2.3"
    with pytest.raises(CovenantError):
        canon.normalize_covenant_key("bad key!")
    assert canon.normalize_clause_ids(["Deliver", "uphold"]) == ["deliver", "uphold"]
    with pytest.raises(CovenantError):
        canon.normalize_clause_ids([])


def test_title_and_terms_bounds():
    assert canon.normalize_title("  hello  ") == "hello"
    with pytest.raises(CovenantError):
        canon.normalize_title("x" * (canon.MAX_TITLE_CHARS + 1))
    with pytest.raises(CovenantError):
        canon.normalize_claim("")
