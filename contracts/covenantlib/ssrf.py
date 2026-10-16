"""SSRF-resistant evidence-URL policy.

Every URL that can reach a validator's fetcher is validated here before it is
frozen into a dispute, and the same rules are re-applied by every validator at
fetch time. The policy is deliberately strict: an evidence URL exists to point
at a public, third-party web page, so anything that could aim the fetcher at the
machine it runs on — or at a name that resolves there — is refused outright
rather than resolved and checked.

No genlayer imports: this module is unit-tested under CPython and inlined
verbatim into the deployable.
"""

import ipaddress
import re
from urllib.parse import urlsplit

MAX_URL_CHARS = 512
MAX_EVIDENCE_URLS = 5
MAX_FETCH_CHARS = 4000
MAX_PATTERNS = 32
MAX_PATTERN_CHARS = 128


class CovenantError(Exception):
    """A stable, lowercase, machine-comparable rejection reason."""


def fail(reason):
    raise CovenantError(reason)


_LABEL_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
_TLD_RE = re.compile(r"^[a-z][a-z0-9-]{0,62}$")
_ALL_DIGITS_RE = re.compile(r"^[0-9]+$")
_HEX_IP_RE = re.compile(r"^0x[0-9a-f]+$")
_DOTTED_QUAD_RE = re.compile(r"^[0-9]{1,3}(\.[0-9]{1,3}){3}$")

# Names that resolve to the local host or an internal network rather than to a
# public server. Checked as suffixes so `x.localhost` is caught with `localhost`.
_INTERNAL_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa", ".onion")


def ssrf_reason(url):
    """Return a lowercase reason if `url` is unsafe to fetch, else None.

    Returning a reason rather than a bool keeps the failure legible in tests
    and in an audit; the contract only ever needs to know that it is non-None.
    """
    if not isinstance(url, str):
        return "url must be a string"
    u = url.strip()
    if not u:
        return "url is empty"
    if len(u) > MAX_URL_CHARS:
        return "url too long"
    try:
        parts = urlsplit(u)
    except ValueError:
        return "url is unparseable"

    if parts.scheme.lower() != "https":
        return "scheme must be https"
    if "@" in parts.netloc or parts.username or parts.password:
        return "url must not embed credentials"
    try:
        host = parts.hostname
        port = parts.port
    except ValueError:
        return "host or port is unparseable"
    if not host:
        return "url has no host"
    if port is not None:
        return "port must be the default https port"

    host = host.lower().rstrip(".")
    if not host:
        return "host is empty"
    if len(host) > 253:
        return "host too long"
    if host == "localhost" or host.endswith(_INTERNAL_SUFFIXES):
        return "host is internal or loopback"
    if host == "home.arpa":
        return "host is internal or loopback"

    # Refuse every IP literal, canonical or not: dotted-quad, bare integer,
    # overflow-packed integer, hex, and IPv6 (which still carries colons here).
    if ":" in host or host.startswith("["):
        return "host is an ip literal"
    if _DOTTED_QUAD_RE.match(host) or _ALL_DIGITS_RE.match(host) or _HEX_IP_RE.match(host):
        return "host is an ip literal"
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        return "host is an ip literal"

    labels = host.split(".")
    if len(labels) < 2:
        return "host must be a public domain"
    for label in labels:
        if not _LABEL_RE.match(label):
            return "host has an invalid label"
    if not _TLD_RE.match(labels[-1]):
        return "host must end in an alphabetic tld"
    return None


def validate_url(url):
    """Return the trimmed URL, or raise CovenantError with the reason."""
    reason = ssrf_reason(url)
    if reason:
        fail(reason)
    return url.strip()


def _host_normalized(url):
    try:
        host = urlsplit(url.strip()).hostname or ""
    except ValueError:
        return ""
    return host.lower().rstrip(".")


def normalize_pattern(pattern):
    """Validate and canonicalize one evidence host pattern.

    A pattern is either an exact public domain (`api.example.com`) or a single
    subdomain wildcard (`*.example.com`), which matches that domain and any
    deeper name. Both must end in an alphabetic TLD.
    """
    if not isinstance(pattern, str) or not pattern.strip():
        fail("evidence pattern is empty")
    p = pattern.strip().lower().rstrip(".")
    if len(p) > MAX_PATTERN_CHARS:
        fail("evidence pattern too long")
    domain = p[2:] if p.startswith("*.") else p
    labels = domain.split(".")
    if len(labels) < 2:
        fail("evidence pattern must name a public domain")
    for label in labels:
        if not _LABEL_RE.match(label):
            fail("evidence pattern has an invalid label")
    if not _TLD_RE.match(labels[-1]):
        fail("evidence pattern must end in an alphabetic tld")
    return p


def pattern_matches_host(pattern, host):
    p = pattern.strip().lower().rstrip(".")
    h = (host or "").lower().rstrip(".")
    if not h:
        return False
    if p.startswith("*."):
        suffix = p[2:]
        return h == suffix or h.endswith("." + suffix)
    return h == p


def url_allowed_by_patterns(url, patterns):
    host = _host_normalized(url)
    return any(pattern_matches_host(p, host) for p in patterns)


def normalize_patterns(patterns):
    if not isinstance(patterns, (list, tuple)) or not patterns:
        fail("at least one evidence pattern is required")
    if len(patterns) > MAX_PATTERNS:
        fail("too many evidence patterns")
    out = []
    for p in patterns:
        norm = normalize_pattern(p)
        if norm not in out:
            out.append(norm)
    return out


def normalize_evidence_urls(urls, patterns=None):
    """Validate a bounded list of evidence URLs, each within the allow-list."""
    if not isinstance(urls, (list, tuple)) or not urls:
        fail("at least one evidence url is required")
    if len(urls) > MAX_EVIDENCE_URLS:
        fail("too many evidence urls")
    norm_patterns = normalize_patterns(patterns) if patterns else None
    out = []
    for u in urls:
        v = validate_url(u)
        if norm_patterns is not None and not url_allowed_by_patterns(v, norm_patterns):
            fail("evidence url is not allowed by the covenant patterns")
        if v not in out:
            out.append(v)
    return out


def normalize_optional_url(url, patterns=None):
    """Validate an optional URL, returning "" when it is empty."""
    if url is None or (isinstance(url, str) and not url.strip()):
        return ""
    v = validate_url(url)
    if patterns and not url_allowed_by_patterns(v, normalize_patterns(patterns)):
        fail("telemetry url is not allowed by the covenant patterns")
    return v
