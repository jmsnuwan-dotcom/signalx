SignalX V14 — Entry Timing Protection + 180s Refresh

Changes:
1. Auto refresh changed from 60s to 180s.
2. Best Setup no longer runs its own independent 60s API polling loop.
   app.js owns scanner refresh and sends the latest result to Best Setup UI.
3. Signal engine still uses CLOSED candles for indicators/scoring/gates.
4. Added LIVE Binance price fetch only for a separate entry-timing protection gate.
5. If a valid BUY/SELL setup has moved outside the allowed entry zone before the user sees it,
   the final signal becomes WAIT with "Entry missed — do not chase".
6. Valid BUY/SELL signals use the current live price as Entry, SL and TP are calculated from it.
7. Response now includes rawSide, entryStatus, livePrice and entryZone.
8. Added Entry Timing diagnostic card.

Existing indicator/scoring/quality gate logic is preserved. The entry protection is a separate gate.
