"""The judgment pipeline in isolation: coercion, force-consistency, digests."""

import json

from covenantlib import judgment as J


def ev(*digests, ok=True):
    return [
        {"url": f"https://x{i}.example.com", "status": 200, "ok": ok, "text": "t", "digest": d}
        for i, d in enumerate(digests)
    ]


def answer(verdict, sources=None, clauses=None):
    obj = {"verdict": verdict}
    if sources is not None:
        obj["supporting_sources"] = sources
    if clauses is not None:
        obj["clause_ids"] = clauses
    return obj


def test_canon_verdict_maps_synonyms_and_fails_closed():
    assert J.canon_verdict("breached") == J.BREACH
    assert J.canon_verdict("No Breach") == J.NO_BREACH
    assert J.canon_verdict("CONFLICT") == J.CONFLICTING
    assert J.canon_verdict("unclear") == J.INCONCLUSIVE
    assert J.canon_verdict("banana") == J.INCONCLUSIVE
    assert J.canon_verdict(None) == J.INCONCLUSIVE


def test_breach_without_sources_is_downgraded():
    out = J.build_comparable(answer("BREACH", clauses=["uphold"]), ev("a", "b"), ["uphold"])
    assert out["verdict"] == J.INCONCLUSIVE
    assert out["code"] == "no_supporting_sources"


def test_breach_without_a_clause_is_downgraded():
    out = J.build_comparable(answer("BREACH", sources=[0]), ev("a", "b"), ["uphold"])
    assert out["verdict"] == J.INCONCLUSIVE
    assert out["code"] == "no_clause_cited"


def test_breach_with_source_and_clause_stands():
    out = J.build_comparable(
        answer("BREACH", sources=[0], clauses=["uphold"]), ev("a", "b"), ["uphold"]
    )
    assert out["verdict"] == J.BREACH
    assert out["supporting_sources"] == [0]
    assert out["clause_ids"] == ["uphold"]


def test_conflicting_with_identical_bytes_is_downgraded():
    out = J.build_comparable(answer("CONFLICTING"), ev("same", "same"), None)
    assert out["verdict"] == J.INCONCLUSIVE
    assert out["code"] == "no_conflict_detected"


def test_conflicting_with_divergent_bytes_stands():
    out = J.build_comparable(answer("CONFLICTING"), ev("a", "b"), None)
    assert out["verdict"] == J.CONFLICTING


def test_clause_ids_are_intersected_with_the_covenant():
    out = J.build_comparable(
        answer("BREACH", sources=[0], clauses=["uphold", "invented"]),
        ev("a", "b"),
        ["uphold"],
    )
    assert out["clause_ids"] == ["uphold"]


def test_fingerprints_are_sorted_and_bound_into_the_hash():
    out = J.build_comparable(answer("NO_BREACH"), ev("a", "b", "c"), None)
    assert out["fingerprints"] == [[0, "a"], [1, "b"], [2, "c"]]
    other = J.build_comparable(answer("NO_BREACH"), ev("a", "b", "z"), None)
    assert out["findings_hash"] != other["findings_hash"]


def test_coerce_int_list_bounds_dedups_and_sorts():
    assert J.coerce_int_list([2, 0, 2, 9, -1, "x"], 3) == [0, 2]


def test_strip_html_drops_scripts():
    assert "alert" not in J.strip_html("<p>ok</p><script>alert(1)</script>")


def test_digest_covers_content_past_the_excerpt_cap():
    cap = J.MAX_FETCH_CHARS if hasattr(J, "MAX_FETCH_CHARS") else 4000
    from covenantlib.ssrf import MAX_FETCH_CHARS

    cap = MAX_FETCH_CHARS
    a = J.normalize_evidence("https://a.example.com", 200, "A" * cap + "X")
    b = J.normalize_evidence("https://b.example.com", 200, "A" * cap + "Y")
    assert a["text"] == b["text"]  # the excerpt the model sees is identical
    assert a["digest"] != b["digest"]  # but the fingerprints differ past the cut


def test_build_prompt_fences_untrusted_data_and_states_the_hostile_note():
    prompt = J.build_prompt("t", "terms", "uphold", "claim", ev("a", "b"))
    assert "=== BEGIN UNTRUSTED COVENANT TERMS ===" in prompt
    assert "=== BEGIN UNTRUSTED FETCHED EVIDENCE ===" in prompt
    assert "untrusted data" in prompt
    assert J.BREACH in prompt and J.INCONCLUSIVE in prompt


def test_comparable_json_is_canonical():
    out = J.build_comparable(answer("NO_BREACH"), ev("a"), None)
    assert J.comparable_json(out) == json.dumps(out, sort_keys=True, separators=(",", ":"))
