SignalX V13 API Stability Fix

Updated api/top-signals.js only.

Changes:
- Binance Futures market snapshot cache (20s)
- 15M candle cache (45s)
- 8s request timeout
- retry/backoff for transient HTTP/network errors
- fast-screen concurrency reduced to 10
- full-analysis concurrency reduced to 4
- short pause between batches
- clean skip logs for unavailable candle data
- HTTP 503 with explicit BINANCE_FUTURES_UNAVAILABLE on market outage
- never fabricates signals during API outage

Existing api/signal.js strategy is preserved.
