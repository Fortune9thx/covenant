"""Dispute settlement — the arithmetic that decides who is paid what.

`settle` returns the credits for every party role and the exact amount of escrow
that settlement consumes. Only a `BREACH` may settle a covenant: it consumes both
covenant bonds and the filer's dispute bond. Every other verdict consumes only
the dispute bond — the filer is made whole and the covenant stays active with
both covenant bonds still escrowed. A failed or inconclusive claim therefore
cannot close a covenant or move either party's bond.

Roles are positional, not identity-bound: `claimant_role` is whichever party
filed the dispute ("proposer" or "respondent"); the other party is the accused.

No genlayer imports.
"""

BREACH = "BREACH"
NO_BREACH = "NO_BREACH"
INCONCLUSIVE = "INCONCLUSIVE"
CONFLICTING = "CONFLICTING"

ROLES = ("proposer", "respondent", "treasury")


def escrow_for(bond, dispute_bond):
    """Value a breach settlement consumes: both covenant bonds and the bond."""
    return 2 * int(bond) + int(dispute_bond)


def settle(verdict, bond, dispute_bond, fee_bps, bps_denom, claimant_role):
    """Return `(credits, consumed)` for one verdict.

    `consumed` is what leaves escrow. For `BREACH` it is `escrow_for(bond,
    dispute_bond)`; for every other verdict it is only the dispute bond, which
    goes back to the claimant. The caller must assert `conserved(credits,
    consumed)` before moving value.
    """
    bond = int(bond)
    dispute_bond = int(dispute_bond)
    if claimant_role not in ("proposer", "respondent"):
        raise ValueError("claimant role must be proposer or respondent")

    credits = {"proposer": 0, "respondent": 0, "treasury": 0}
    if verdict == BREACH:
        cut = bond * int(fee_bps) // int(bps_denom)
        credits[claimant_role] = (bond - cut) + bond + dispute_bond
        credits["treasury"] = cut
        return credits, escrow_for(bond, dispute_bond)

    credits[claimant_role] = dispute_bond
    return credits, dispute_bond


def conserved(credits, consumed):
    """True when the credits sum to exactly the escrow settlement consumes."""
    return sum(int(v) for v in credits.values()) == int(consumed)
