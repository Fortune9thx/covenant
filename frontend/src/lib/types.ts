/** The contract's JSON records, as the views return them. */

export type Verdict = "BREACH" | "NO_BREACH" | "INCONCLUSIVE" | "CONFLICTING";

export type CovenantStatus = "PROPOSED" | "ACTIVE" | "DISPUTED" | "SETTLED" | "EXPIRED";

export type DisputeStatus = "OPEN" | "RESOLVED" | "CANCELLED";

export interface Agent {
  address: string;
  name: string;
  endpoint: string;
  /** Wei, as a decimal string — exact beyond 2**53. */
  collateral: string;
  registered_at: number;
}

export interface Covenant {
  covenant_id: string;
  covenant_key: string;
  proposer: string;
  respondent: string;
  title: string;
  terms: string;
  clause_ids: string[];
  evidence_patterns: string[];
  telemetry_url: string;
  /** Wei, as a decimal string — exact beyond 2**53. */
  bond_amount: string;
  covenant_hash: string;
  status: CovenantStatus;
  created_at: number;
  expires_at: number;
  ratified_at: number;
  dispute_id: string;
  verdict: Verdict | "";
  resolved_at: number;
}

export interface Dispute {
  dispute_id: string;
  dispute_key: string;
  covenant_id: string;
  covenant_hash: string;
  claimant: string;
  accused: string;
  clause_id: string;
  claim: string;
  evidence_a: string;
  evidence_b: string;
  telemetry_url: string;
  commitment: string;
  /** Wei, as a decimal string — exact beyond 2**53. */
  bond: string;
  status: DisputeStatus;
  verdict: Verdict | "";
  code: string;
  supporting_sources: number[];
  clause_ids: string[];
  fingerprints: [number, string][];
  findings_hash: string;
  opened_at: number;
  resolved_at: number;
}

export interface BoardEntry {
  dispute_id: string;
  covenant_id: string;
  clause_id: string;
  status: DisputeStatus;
  verdict: Verdict | "";
  claimant: string;
  accused: string;
  opened_at: number;
}

export interface Config {
  owner: string;
  treasury: string;
  reg_collateral: string;
  default_bond: string;
  default_dispute_bond: string;
  fee_bps: number;
  bps_denom: number;
  assess_delay_seconds: number;
  stale_timeout_seconds: number;
  min_duration_hours: number;
  max_duration_hours: number;
  max_evidence_urls: number;
  next_covenant: number;
  next_dispute: number;
}

export interface Solvency {
  held_total: string;
  claimable_total: string;
  escrow: string;
  deposits_total: string;
  withdrawn_total: string;
  balanced: boolean;
}
