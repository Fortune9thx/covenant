"""SSRF policy: https-only, public-domain-only evidence URLs."""

import pytest
from covenantlib import ssrf
from covenantlib.ssrf import CovenantError


@pytest.mark.parametrize(
    "url",
    [
        "https://status.example.com/report",
        "https://a.b.example.co.uk/logs?q=1",
        "https://EXAMPLE.com/x",
    ],
)
def test_public_https_urls_are_accepted(url):
    assert ssrf.ssrf_reason(url) is None
    assert ssrf.validate_url(url) == url


@pytest.mark.parametrize(
    "url,reason",
    [
        ("http://example.com/x", "scheme must be https"),
        ("https://127.0.0.1/x", "host is an ip literal"),
        ("https://10.0.0.5/x", "host is an ip literal"),
        ("https://169.254.169.254/latest", "host is an ip literal"),
        ("https://[::1]/x", "host is an ip literal"),
        ("https://2130706433/x", "host is an ip literal"),
        ("https://0x7f000001/x", "host is an ip literal"),
        ("https://localhost/x", "host is internal or loopback"),
        ("https://foo.internal/x", "host is internal or loopback"),
        ("https://metadata.google.internal/x", "host is internal or loopback"),
        ("https://x.localhost/x", "host is internal or loopback"),
        ("https://user:pass@example.com/x", "url must not embed credentials"),
        ("https://example.com:8443/x", "port must be the default https port"),
        ("https://example/x", "host must be a public domain"),
        ("https://example.123/x", "host must end in an alphabetic tld"),
        ("", "url is empty"),
    ],
)
def test_unsafe_urls_are_refused(url, reason):
    assert ssrf.ssrf_reason(url) == reason
    with pytest.raises(CovenantError):
        ssrf.validate_url(url)


def test_url_length_is_bounded():
    long = "https://example.com/" + "a" * ssrf.MAX_URL_CHARS
    assert ssrf.ssrf_reason(long) == "url too long"


def test_pattern_validation_and_matching():
    assert ssrf.normalize_pattern("*.Example.com") == "*.example.com"
    assert ssrf.pattern_matches_host("*.example.com", "api.example.com")
    assert ssrf.pattern_matches_host("*.example.com", "example.com")
    assert not ssrf.pattern_matches_host("*.example.com", "example.org")
    assert ssrf.pattern_matches_host("api.example.com", "api.example.com")
    with pytest.raises(CovenantError):
        ssrf.normalize_pattern("localhost")


def test_evidence_urls_must_match_patterns():
    pats = ssrf.normalize_patterns(["*.example.com"])
    ok = ssrf.normalize_evidence_urls(["https://a.example.com/x"], pats)
    assert ok == ["https://a.example.com/x"]
    with pytest.raises(CovenantError):
        ssrf.normalize_evidence_urls(["https://evil.net/x"], pats)


def test_optional_url_is_blank_when_empty():
    assert ssrf.normalize_optional_url("") == ""
    assert ssrf.normalize_optional_url(None) == ""
    assert ssrf.normalize_optional_url("https://t.example.com/t") == "https://t.example.com/t"
