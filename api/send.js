/*
 * SignalX production delivery bridge.
 *
 * Telegram: TELEGRAM_BOT_TOKEN
 * WhatsApp Cloud API:
 *   WHATSAPP_ACCESS_TOKEN
 *   WHATSAPP_PHONE_NUMBER_ID
 *   WHATSAPP_GRAPH_VERSION (optional, defaults to v25.0)
 *
 * Security:
 * If SIGNALX_SEND_KEY is configured, the same key must be sent by the UI.
 * This prevents an open public endpoint from being used as an unrestricted
 * message relay.
 */

function json(res, status, body) {
  res.status(status).json(body);
}

function cleanPhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function formatSignal(signal) {
  const side = String(signal?.side || "").toUpperCase();
  const emoji = side === "BUY" ? "🟢" : "🔴";
  const expected = Number(signal?.expectedMove);

  return [
    `${emoji} SIGNALX — ${side}`,
    "",
    `${signal?.symbol || "UNKNOWN"}`,
    `⏱ ${signal?.timeframe || "15M"}`,
    "",
    `Entry: ${signal?.entry ?? "-"}`,
    `SL: ${signal?.sl ?? "-"}`,
    `TP: ${signal?.tp ?? "-"}`,
    "",
    `Expected Move: ${Number.isFinite(expected) ? `${expected >= 0 ? "+" : ""}${expected.toFixed(2)}%` : "-"}`,
    `Score: ${signal?.score ?? "-"}/100`,
    `Confidence: ${signal?.confidence ?? "-"}/100`,
    "",
    "✅ Confirmed",
    "Signal generator only • No orders are executed."
  ].join("\n");
}

async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured on the server.");

  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data?.description || "Telegram delivery failed.");
  }

  return {messageId: data?.result?.message_id ?? null};
}

async function sendWhatsApp(to, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v25.0";

  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured on the server.");
  }

  const body = {
    messaging_product: "whatsapp",
    to: cleanPhone(to)
  };

  // If an approved template is configured, use it. Otherwise use a text
  // message, which is suitable when the recipient is inside the active
  // WhatsApp customer-service window.
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";

  if (templateName) {
    body.type = "template";
    body.template = {
      name: templateName,
      language: {code: templateLanguage}
    };
  } else {
    body.type = "text";
    body.text = {body: text};
  }

  const response = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || "WhatsApp delivery failed.");
  }

  return {messageId: data?.messages?.[0]?.id ?? null};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return json(res, 405, {ok: false, message: "POST only"});
  }

  const serverKey = process.env.SIGNALX_SEND_KEY;
  if (serverKey && req.headers["x-signalx-key"] !== serverKey) {
    return json(res, 401, {ok: false, message: "Invalid delivery key."});
  }

  const {channel, destination, signal} = req.body || {};

  if (!channel || !signal) {
    return json(res, 400, {ok: false, message: "Missing delivery data."});
  }

  const side = String(signal.side || "").toUpperCase();
  if (side !== "BUY" && side !== "SELL") {
    return json(res, 400, {
      ok: false,
      message: "Only confirmed BUY/SELL signals can be sent."
    });
  }

  const text = formatSignal(signal);

  try {
    if (channel === "telegram") {
      const chatId = destination || process.env.TELEGRAM_DEFAULT_CHAT_ID;
      if (!chatId) {
        return json(res, 400, {
          ok: false,
          message: "Add a Telegram chat ID or TELEGRAM_DEFAULT_CHAT_ID."
        });
      }

      const result = await sendTelegram(chatId, text);
      return json(res, 200, {
        ok: true,
        channel,
        message: "Telegram signal delivered.",
        ...result
      });
    }

    if (channel === "whatsapp") {
      const to = destination || process.env.WHATSAPP_DEFAULT_TO;
      if (!to) {
        return json(res, 400, {
          ok: false,
          message: "Add a WhatsApp number or WHATSAPP_DEFAULT_TO."
        });
      }

      const result = await sendWhatsApp(to, text);
      return json(res, 200, {
        ok: true,
        channel,
        message: "WhatsApp signal delivered.",
        ...result
      });
    }

    return json(res, 400, {ok: false, message: "Unsupported channel."});
  } catch (error) {
    console.error("SignalX delivery error:", error);
    return json(res, 502, {
      ok: false,
      message: error?.message || "Signal delivery failed."
    });
  }
}
