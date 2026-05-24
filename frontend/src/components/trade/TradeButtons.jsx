import { Button } from "../ui/Button.jsx";

export function TradeButtons({
  symbol,
  ownedQty = 0,
  onOpenTrade,
  tradeBusy,
  theme,
  style,
  size = "md",
  onAction
}) {
  const sym = String(symbol || "").toUpperCase();
  if (!sym || !onOpenTrade) return null;

  const busyBuy = tradeBusy === `buy:${sym}`;
  const busySell = tradeBusy === `sell:${sym}`;
  const anyBusy = Boolean(tradeBusy);
  const canSell = Number(ownedQty) > 0;
  const large = size === "lg";

  const pad = large ? "14px 22px" : "8px 10px";
  const fontSize = large ? 15 : 12;
  const radius = large ? 14 : 12;
  const minWidth = large ? 108 : undefined;

  const openBuy = () => {
    onAction?.(`Opening buy order for ${sym}.`);
    onOpenTrade("buy", sym);
  };

  const openSell = () => {
    if (!canSell) return;
    onAction?.(`Opening sell order for ${sym}.`);
    onOpenTrade("sell", sym);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: large ? 12 : 8,
        justifyContent: "flex-end",
        flexWrap: "wrap",
        position: "relative",
        zIndex: 2,
        ...style
      }}
    >
      <Button
        variant="primary"
        theme={theme}
        disabled={anyBusy}
        onClick={openBuy}
        style={{ padding: pad, borderRadius: radius, fontSize, fontWeight: 900, minWidth, opacity: busyBuy ? 0.75 : 1 }}
      >
        {busyBuy ? "Buying…" : "Buy"}
      </Button>
      <Button
        variant="sell"
        theme={theme}
        disabled={anyBusy || !canSell}
        onClick={openSell}
        style={{ padding: pad, borderRadius: radius, fontSize, fontWeight: 900, minWidth, opacity: busySell ? 0.75 : 1 }}
      >
        {busySell ? "Selling…" : "Sell"}
      </Button>
    </div>
  );
}
