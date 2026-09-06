export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");

  try {
    const [exchangeRes, tickerRes] = await Promise.all([
      fetch("https://api.binance.com/api/v3/exchangeInfo"),
      fetch("https://api.binance.com/api/v3/ticker/24hr")
    ]);

    if (!exchangeRes.ok || !tickerRes.ok) {
      throw new Error("Binance market API unavailable");
    }

    const exchangeInfo = await exchangeRes.json();
    const tickers = await tickerRes.json();

    const tradableSymbols = new Map(
      exchangeInfo.symbols
        .filter(
          (s) =>
            s.status === "TRADING" &&
            s.quoteAsset === "USDT" &&
            s.isSpotTradingAllowed === true
        )
        .map((s) => [s.symbol, s])
    );

    const MIN_QUOTE_VOLUME_USDT = 5_000_000;

    const candidates = tickers
      .filter((t) => {
        const meta = tradableSymbols.get(t.symbol);
        const volume = Number(t.quoteVolume);
        const lastPrice = Number(t.lastPrice);

        return (
          meta &&
          Number.isFinite(volume) &&
          volume >= MIN_QUOTE_VOLUME_USDT &&
          Number.isFinite(lastPrice) &&
          lastPrice > 0
        );
      })
      .map((t) => ({
        symbol: t.symbol,
        change: Number(t.priceChangePercent),
        quoteVolume: Number(t.quoteVolume),
        lastPrice: Number(t.lastPrice)
      }))
      .filter((t) => Number.isFinite(t.change));

    const gainers = [...candidates]
      .sort((a, b) => b.change - a.change)
      .slice(0, 6);

    const losers = [...candidates]
      .sort((a, b) => a.change - b.change)
      .slice(0, 6);

    const movers = [...gainers, ...losers];

    const unique = new Map(movers.map((x) => [x.symbol, x]));

    res.status(200).json(
      [...unique.values()].map((x) => ({
        symbol: x.symbol,
        change: x.change,
        volumeLabel: "Vol " + (x.quoteVolume / 1_000_000).toFixed(1) + "M"
      }))
    );
  } catch (error) {
    console.error("movers:", error);
    res.status(500).json({
      error: "Unable to load Binance top movers."
    });
  }
}
