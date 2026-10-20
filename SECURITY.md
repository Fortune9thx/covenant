# Security

## Reporting

Report suspected vulnerabilities privately to `fortuneemx@gmail.com`. Do not
open a public issue for a live exploit. Please include the contract method, the
inputs, and the observed vs. expected result.

## Threat model

COVENANT is a single GenLayer Intelligent Contract that lets two registered
agents bind themselves to a written covenant and settles a breach by slashing a
bond — but only when validators independently confirm the breach. The assets it
protects are (a) the bonds and collateral it holds and (b) the false-slashing
risk of moving a party's bond on a judgment that is not sound.

The design assumes every off-chain input is hostile:

- **Evidence pages.** Fetched URLs, their bytes, and any text inside them are
  treated as attacker-controlled data, never as instructions. Content is
  HTML-stripped, fence markers are removed, and prompt-injection attempts are
  declared in the prompt as evidence of bad faith.
- **The model.** The LLM runs inside `gl.eq_principle.strict_eq`; its raw prose
  is never trusted. Only a canonical, comparable record — verdict class, sorted
  supporting-source indices, sorted clause ids, and per-source fingerprints — is
  compared across validators.
- **The claimant.** Nothing about a dispute is taken on the claimant's word. The
  two contested documents are frozen at filing time and the
  `dispute_commitment` is re-derived at adjudication; a mismatch rejects before
  any judgment runs.

### Fail-closed invariants

1. Only `BREACH` slashes a bond. `NO_BREACH`, `INCONCLUSIVE`, and `CONFLICTING`
   refund both covenant bonds and the dispute bond in full.
2. A failed or partial evidence fetch can only ever produce `INCONCLUSIVE`. The
   model is not consulted at all when evidence cannot be read.
3. No consensus, a model error, or an unparseable agreed value all resolve to
   `INCONCLUSIVE` — never to a slash.
4. A `BREACH` that cites no source, or none citing a covenant clause, is voided
   to `INCONCLUSIVE`.
5. `claim()` is the only function that moves value out, it zeroes the balance
   before transferring, and it can only ever send an address its own
   already-credited amount. There is no admin path that seizes or force-pays.

### SSRF and resource bounds

Evidence and telemetry URLs are validated before they are ever frozen, and the
frozen value is what every validator fetches; no later caller can substitute a
URL. Only `https` on the default port, no credentials, no IP literals, no
loopback/metadata/private/link-local/`home.arpa` hosts, alphabetic TLDs only,
bounded URL count and length, and a bounded number of characters per fetched
page. The check covers the URL string, not the redirect target the fetcher may
follow, so an allow-list should name hosts that serve evidence directly. See
`contracts/covenantlib/ssrf.py` for the exact rules and `docs/audit.md` for their
rationale.

## Out of scope

- The GenLayer runtime, the SDK, and the LLM backend.
- The correctness of the *covenant text*: COVENANT decides whether evidence
  matches the cited clause as written, not whether the parties meant it.
- Downstream systems that read covenant or dispute state. COVENANT writes the
  record; it does not control what a reader does with it.
