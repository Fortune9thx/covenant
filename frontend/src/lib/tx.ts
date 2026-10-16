/**
 * Transaction outcome classification.
 *
 * The single place the app decides whether a write succeeded. Three rules hold
 * everywhere, and each exists because the opposite has caused a real failure:
 *
 *  1. Success is an **allow-list**. A missing or unrecognized field is failure,
 *     never success. A deny-list ("anything but FINISHED_WITH_ERROR") lets an
 *     undefined result through as a pass.
 *  2. Reaching a terminal status is not the same as succeeding. CANCELED and
 *     the timeouts are terminal and are failures.
 *  3. Consensus is checked separately from execution. A write can execute
 *     cleanly and still persist nothing when validators disagree — exactly the
 *     case COVENANT's adjudication turns on, so it must never read as success.
 */

export type TxState =
  | "pending"
  | "confirming"
  | "success"
  | "reverted"
  | "no-consensus"
  | "cancelled"
  | "timeout"
  | "unknown";

export type TxOutcome = {
  state: TxState;
  /** True only for a genuine, committed success. */
  ok: boolean;
  /** True while the transaction may still change state. */
  settled: boolean;
  title: string;
  detail: string;
  exec?: string;
  consensus?: string;
  status?: string;
};

const EXEC_OK = "FINISHED_WITH_RETURN";
const CONSENSUS_OK = new Set(["AGREE", "MAJORITY_AGREE"]);
const NON_TERMINAL = new Set([
  "PENDING",
  "PROPOSED",
  "COMMITTING",
  "REVEALING",
  "ACTIVATED",
  "READY_TO_FINALIZE",
]);
const TERMINAL_OK = new Set(["ACCEPTED", "FINALIZED"]);

function field(receipt: any, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = receipt?.[n] ?? receipt?.consensus_data?.[n];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

export function describeOutcome(receipt: any, requireFinalized = false): TxOutcome {
  const status = field(receipt, "status_name", "statusName", "status");
  const exec = field(receipt, "txExecutionResultName", "tx_execution_result_name");
  const consensus = field(receipt, "resultName", "result_name");
  const base = { exec, consensus, status };

  if (!receipt) {
    return {
      ...base,
      state: "pending",
      ok: false,
      settled: false,
      title: "Waiting for the transaction",
      detail: "No receipt yet.",
    };
  }

  if (consensus === "DISAGREE" || status === "UNDETERMINED") {
    return {
      ...base,
      state: "no-consensus",
      ok: false,
      settled: true,
      title: "Validators did not agree",
      detail:
        "The judgment ran but validators reached different conclusions, so nothing was written and the bonds are untouched. Submitting again is safe.",
    };
  }

  if (status === "CANCELED" || status === "CANCELLED") {
    return {
      ...base,
      state: "cancelled",
      ok: false,
      settled: true,
      title: "Transaction cancelled",
      detail:
        "It expired before a validator picked it up — usually network congestion. Nothing was written.",
    };
  }

  if (exec === "LEADER_TIMEOUT" || exec === "VALIDATORS_TIMEOUT") {
    return {
      ...base,
      state: "timeout",
      ok: false,
      settled: true,
      title: "Consensus timed out",
      detail: "The round did not complete. Nothing was written; try again.",
    };
  }

  if (exec === "FINISHED_WITH_ERROR") {
    return {
      ...base,
      state: "reverted",
      ok: false,
      settled: true,
      title: "Rejected by the contract",
      detail: "The contract refused this call. Nothing was written.",
    };
  }

  if (status && NON_TERMINAL.has(status)) {
    return {
      ...base,
      state: "confirming",
      ok: false,
      settled: false,
      title: "Confirming on GenLayer",
      detail:
        "Validators are judging this now. This can take several minutes — the page updates itself.",
    };
  }

  // Allow-list. Everything below must match explicitly. A missing consensus
  // result must fail this check like any unknown one.
  const execOk = exec === EXEC_OK;
  const consensusOk = consensus !== undefined && CONSENSUS_OK.has(consensus);
  const statusOk = status !== undefined && TERMINAL_OK.has(status);
  const finalOk = !requireFinalized || status === "FINALIZED";

  if (execOk && consensusOk && statusOk && finalOk) {
    return {
      ...base,
      state: "success",
      ok: true,
      settled: true,
      title: requireFinalized ? "Finalized" : "Confirmed",
      detail: requireFinalized ? "Committed and final." : "Committed on chain.",
    };
  }

  if (execOk && consensusOk && statusOk && !finalOk) {
    return {
      ...base,
      state: "confirming",
      ok: false,
      settled: false,
      title: "Waiting for finality",
      detail:
        "Accepted, but not yet final — an accepted transaction can still be appealed. Waiting before reporting this as done.",
    };
  }

  return {
    ...base,
    state: "unknown",
    ok: false,
    settled: false,
    title: "Outcome not confirmed",
    detail: `Could not confirm this succeeded (execution: ${exec ?? "unreported"}, consensus: ${
      consensus ?? "unreported"
    }, status: ${status ?? "unreported"}). Treating it as unconfirmed.`,
  };
}

/** Which writes need permanence before the UI may present them as real. */
export function needsFinality(method: string): boolean {
  // A value transfer only truly executes at FINALIZED, and an adjudication is
  // something else acts on, so both must be permanent first.
  return ["claim", "adjudicate"].includes(method);
}
