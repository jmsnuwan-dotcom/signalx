# SignalX — Binance 15M Signal PWA

## Included
- Mobile-first responsive UI
- Binance 24H USDT top movers
- Select any Binance spot USDT symbol
- 15M signal engine using EMA, RSI, ADX approximation and ATR
- Entry / SL / TP / expected move %
- Telegram / WhatsApp delivery UI + backend integration point
- PWA manifest + service worker
- Android install prompt; iOS Safari Add to Home Screen guidance
- Vercel-ready API routes

## Deploy
1. Put this folder in a Git repository.
2. Import the repository into Vercel.
3. Deploy.
4. Open the HTTPS URL on Android/iOS.

## Telegram / WhatsApp
`/api/send.js` is intentionally a safe integration point. Add real provider credentials and API calls before claiming delivery. Never put private API credentials in frontend JavaScript.

## Important
This is a signal generator, not an order-execution bot. The starter signal engine is a baseline and must be backtested/validated before being presented as accurate or profitable.
