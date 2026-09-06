# SignalX Live Production Pack

This build keeps the existing SignalX signal engine and adds the production delivery/PWA layer.

## Included

- Live Binance Futures market data.
- Existing multi-stage Top 15M scanner.
- Live selected-symbol refresh every 60 seconds.
- Full market scan every 5 minutes without button-click spam.
- Telegram Bot API delivery.
- WhatsApp Cloud API delivery.
- Confirmed BUY/SELL only; WAIT cannot be delivered.
- PWA install support for Android, iOS/iPadOS and desktop browsers.
- Updated service worker so new deployments are picked up without stale API/static loops.
- iOS Apple touch icon and 192/512 PWA icons.
- Optional `SIGNALX_SEND_KEY` protection for `/api/send`.

## Environment variables

Copy `.env.example` values into Vercel Environment Variables.

Telegram:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DEFAULT_CHAT_ID`

WhatsApp Cloud API:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_DEFAULT_TO`
- optional `WHATSAPP_GRAPH_VERSION`
- optional `WHATSAPP_TEMPLATE_NAME`
- optional `WHATSAPP_TEMPLATE_LANGUAGE`

Security:
- `SIGNALX_SEND_KEY`

Do not put production secrets into frontend JavaScript.

## WhatsApp note

WhatsApp Cloud API can send text messages through the Graph API. For outbound messages outside the active customer-service window, configure an approved WhatsApp template using `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE`.

## PWA

Android/Chrome/Edge:
- Open the deployed SignalX URL.
- Use the browser's Install App option.

iPhone/iPad:
- Open in Safari.
- Share -> Add to Home Screen.

The app is designed to run in standalone mode on all three device classes.

## Local test

```powershell
npx vercel dev
```

Open the local URL shown by Vercel.

## Deploy

```powershell
npx vercel --prod
```

Then add the environment variables in the Vercel project before testing Telegram/WhatsApp.

## Important

SignalX is a signal generator only. It does not execute exchange orders.
