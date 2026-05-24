/** Matches backend UNLIMITED_THRESHOLD / balance_unlimited flag. */
export const UNLIMITED_BALANCE_THRESHOLD = 1_000_000_000_000;

export function isUnlimitedBalance(balance, balanceUnlimited) {
  if (balanceUnlimited === true) return true;
  const n = Number(balance);
  return Number.isFinite(n) && n >= UNLIMITED_BALANCE_THRESHOLD;
}
