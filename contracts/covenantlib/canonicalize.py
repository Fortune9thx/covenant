"""Deterministic canonicalization: digests, canonical JSON, and text hygiene.

The commitment digest is the contract's spine: it is computed when a dispute is
filed, re-derived when it is adjudicated, and any mismatch rejects. That only
means anything if the derivation is byte-for-byte reproducible from the same
inputs, so every piece of it — JSON key order, number encoding, whitespace — is
pinned here.

No genlayer imports.
"""

import hashlib
import json
import re

from .ssrf import fail

MAX_TEXT_CHARS = 4000
MAX_TERMS_CHARS = 4000
MAX_TITLE_CHARS = 200
MAX_CLAIM_CHARS = 2000
MAX_COVENANT_KEY_CHARS = 128
MAX_CLAUSE_ID_CHARS = 64
MAX_CLAUSES = 16

_FENCE_RE = re.compile(r"[`\u0000-\u0008\u000b\u000c\u000e-\u001f]")
_EQ_RUN_RE = re.compile(r"={2,}")
_WS_RE = re.compile(r"\s+")
_ADDR_RE = re.compile(r"^0x[0-9a-f]{40}$")
_COVENANT_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
_CLAUSE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._:-]{0,63}$")


def canonical_json(obj):
    """The one JSON encoding used for every digest and every comparable."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def sha256_hex(text):
    return hashlib.sha256(str(text).encode("utf-8")).hexdigest()


def digest_fields(fields):
    return sha256_hex(canonical_json(fields))


def covenant_digest(
    covenant_id,
    proposer,
    respondent,
    title,
    terms,
    clause_ids,
    evidence_patterns,
    telemetry_url,
    bond_amount,
    expires_at,
    treasury,
):
    """Digest of a covenant's immutable content, frozen at proposal time."""
    return digest_fields({
        "covenant_id": str(covenant_id),
        "proposer": str(proposer),
        "respondent": str(respondent),
        "title": str(title),
        "terms": str(terms),
        "clause_ids": [str(c) for c in clause_ids],
        "evidence_patterns": [str(p) for p in evidence_patterns],
        "telemetry_url": str(telemetry_url),
        "bond_amount": int(bond_amount),
        "expires_at": int(expires_at),
        "treasury": str(treasury),
    })


def dispute_commitment(
    dispute_key,
    covenant_hash,
    clause_id,
    claim,
    evidence_a,
    evidence_b,
    telemetry_url,
):
    """Commitment binding a dispute to the exact declaration it was filed under.

    Frozen at file time and re-derived at adjudication; a mismatch means the
    stored dispute is not the one the claimant filed, so the judgment refuses to
    run rather than deciding over altered inputs.
    """
    return digest_fields({
        "dispute_key": str(dispute_key),
        "covenant_hash": str(covenant_hash),
        "clause_id": str(clause_id),
        "claim": str(claim),
        "evidence_a": str(evidence_a),
        "evidence_b": str(evidence_b),
        "telemetry_url": str(telemetry_url),
    })


def _require_str(value, what, limit):
    if not isinstance(value, str):
        fail(what + " must be a string")
    s = value.strip()
    if not s:
        fail(what + " is required")
    if len(s) > limit:
        fail(what + " is too long")
    return s


def normalize_covenant_key(value):
    s = _require_str(value, "covenant key", MAX_COVENANT_KEY_CHARS)
    if not _COVENANT_KEY_RE.match(s):
        fail("covenant key has an invalid character")
    return s


def normalize_title(value):
    return _require_str(value, "title", MAX_TITLE_CHARS)


def normalize_terms(value):
    return _require_str(value, "terms", MAX_TERMS_CHARS)


def normalize_claim(value):
    return _require_str(value, "claim", MAX_CLAIM_CHARS)


def normalize_clause_id(value):
    s = _require_str(value, "clause id", MAX_CLAUSE_ID_CHARS).lower()
    if not _CLAUSE_ID_RE.match(s):
        fail("clause id must be a lowercase token")
    return s


def normalize_clause_ids(values):
    if not isinstance(values, (list, tuple)) or not values:
        fail("at least one clause id is required")
    if len(values) > MAX_CLAUSES:
        fail("too many clause ids")
    out = []
    for v in values:
        c = normalize_clause_id(v)
        if c not in out:
            out.append(c)
    return sorted(out)


def normalize_address(value):
    """Coerce anything address-shaped into the lowercase 0x-hex form stored here."""
    if isinstance(value, bytes):
        value = value.hex()
    s = str(value).strip().lower()
    if s and not s.startswith("0x"):
        s = "0x" + s
    return s if _ADDR_RE.match(s) else ""


def sanitize_untrusted(raw, limit):
    """Make hostile text safe to embed inside a fenced prompt block.

    Backticks and control characters are removed, then any run of two or more
    `=` is collapsed to one: the fence this text sits inside is a run of `=`,
    so text carrying its own `===` run could otherwise forge a closing marker
    and make whatever follows it read as instruction rather than quoted data.
    Finally the result is bounded, so one oversized page cannot crowd the rules
    out of the prompt.
    """
    if not isinstance(raw, str):
        raw = str(raw)
    t = _FENCE_RE.sub(" ", raw)
    t = _EQ_RUN_RE.sub("=", t)
    t = _WS_RE.sub(" ", t).strip()
    if len(t) > limit:
        t = t[:limit] + " ..."
    return t
