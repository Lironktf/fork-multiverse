import { requiredSubsidy } from "./generated/lmsr";

type Integer = { toString(): string };
export function liquidityMetrics(
  m: {
    b: Integer;
    offsetYes: Integer;
    offsetNo: Integer;
    lpDeposits: Integer;
    principal: Integer;
    cash: Integer;
    yes: Integer;
    no: Integer;
    lpPool: Integer;
    feesAccrued: Integer;
    started: boolean;
  },
  lp: { deposited: Integer; paid: Integer; claimed: boolean } | null,
  status: string,
) {
  const n = (value: Integer) => BigInt(value.toString());
  const total = n(m.lpDeposits),
    contribution = lp ? n(lp.deposited) : 0n;
  const share = (pool: bigint) =>
    total > 0n ? (pool * contribution) / total : 0n;
  const required = requiredSubsidy({
    b: n(m.b),
    offsetYes: n(m.offsetYes),
    offsetNo: n(m.offsetNo),
  });
  const terminal = ["void", "settledYes", "settledNo"].includes(status);
  const assets = total + n(m.principal);
  const yesEquity = share(assets - n(m.cash) - n(m.yes));
  const noEquity = share(assets - n(m.cash) - n(m.no));
  const payout = status === "void" ? contribution : share(n(m.lpPool));
  return {
    required,
    shortfall: total < required ? required - total : 0n,
    contribution,
    ownershipBps: total > 0n ? Number((contribution * 10_000n) / total) : 0,
    conditionalFees: status === "void" ? 0n : share(n(m.feesAccrued)),
    yesEquity,
    noEquity,
    maxLoss: contribution,
    paid: lp ? n(lp.paid) : 0n,
    canFund: status === "funding" && !m.started,
    canWithdraw: !!lp && !lp.claimed && (terminal || !m.started),
    withdrawable:
      !lp || lp.claimed
        ? 0n
        : terminal
          ? payout
          : !m.started
            ? contribution
            : 0n,
    terminal,
  };
}
