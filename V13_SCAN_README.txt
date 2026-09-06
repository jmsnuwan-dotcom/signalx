SignalX V13 Multi-Stage Scanner

New scan architecture:

1. Discover the active Binance Futures USDT perpetual universe.
2. Apply the existing $5M minimum 24H quote-volume liquidity filter.
3. Fast-screen the liquid universe using lightweight 15M candle data.
4. Rank fast-screen candidates and keep the strongest 30.
5. Run the existing api/signal.js buildSignal() engine on those 30 only.
6. Return the best 12 final results.

Important:
- api/signal.js was NOT modified by V13 scanner implementation.
- The existing V12 signal scoring and quality gate remain the final BUY/SELL/WAIT decision maker.
- Fast screening is a candidate-ranking layer only; it does not create BUY/SELL signals.
- top-signals.js uses batched requests to avoid firing all requests at once.


V13.1 patch: insufficient candle-history failures are now logged as clean skip messages. Signal engine/strategy unchanged.
