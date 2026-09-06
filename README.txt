SignalX V10 — Synchronized Signal Engine + Diagnostics

FILES
-----
1. api/signal.js
   Replace your existing:
   SignalX_PWA_Starter/api/signal.js

2. diagnostic-ui.js
   This is an optional helper.
   Use it only if your current diagnostics UI needs the synchronized API
   object. Do NOT delete an existing diagnostic-ui.js blindly.

MAIN FIX
--------
The final signal gate and diagnostics now use the SAME calculated values.

The API returns one diagnostics object containing:
1H Trend
15M Trend
RSI
MACD
ADX
Volume
Structure
Candle
Pullback
Extension

The displayed Extension percentage is the SAME move4h value used by the
quality gate. Therefore the UI cannot show "Extension FAIL / Move 0%"
while the gate is using another number.

QUALITY GATE
------------
BUY/SELL approval remains strict:
- 1H and 15M trend alignment
- MACD direction agreement
- ADX >= 30
- score >= 72
- confidence >= 70
- volume >= 1.00x
- RSI <= 70 for BUY
- RSI >= 30 for SELL
- structure confirmation
- candle or pullback confirmation
- no choppy market
- no extended move

WAIT remains the default when the gate is not satisfied.

INSTALL
-------
1. Replace api/signal.js.
2. Save all files.
3. Restart:
   Ctrl+C
   npx vercel dev
4. Browser:
   Ctrl+Shift+R

IMPORTANT
---------
This is a signal generator, not an order executor and not a profit
guarantee. Validate signals with historical/live-paper testing before
using them for real trading.
