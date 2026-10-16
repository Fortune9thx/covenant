"""Dispute settlement — the arithmetic that decides who is paid what.

`settle` returns a credit for every party role that is owed anything when a
dispute is adjudicated. The contract holds exactly the bonds a dispute locked up
(two covenant bonds plus the filer's dispute bond), so a settlement that did not
conserve value would either strand GEN in the contract or pay out more than it
took in. `conserved` exists so the property is asserted in tests rather than
assumed.

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
    """Value locked while a dispute is open: both covenant bonds and the bond."""
    return 2 * int(bond) + int(dispute_bond)


def settle(verdict, bond, dispute_bond, fee_bps, bps_denom, claimant_role):
    """Split the escrowed bonds for one verdict.

    A `BREACH` finding slashes the accused's covenant bond: a protocol cut goes
    to the treasury and the remainder, plus the claimant's own returned bond and
    the returned dispute bond, goes to the claimant. Every other verdict refunds
    the dispute bond to the claimant and returns each party's covenant bond to
    that party. In both cases the credits sum to exactly `escrow_for`.
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
    else:
        credits["proposer"] = bond
        credits["respondent"] = bond
        credits[claimant_role] += dispute_bond
    return credits


def conserved(credits, escrow):
    """True when the credits sum to the value the dispute locked up."""
    return sum(int(v) for v in credits.values()) == int(escrow)
