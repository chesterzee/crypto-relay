const BINANCE_API =
  "https://fapi.binance.com/fapi/v1/ticker/price";

const BITGET_API =
  "https://api.bitget.com/api/v2/mix/market/ticker";

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "CryptoRelay/1.0"
    }
  });

  const raw = await response.text();

  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  return {
    http: response.status,
    data
  };
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  // =========================
  // HEALTH
  // =========================

  if (url.pathname === "/health") {
    return Response.json({
      ok: true,
      service: "crypto-relay",
      version: "1.0"
    });
  }

  // =========================
  // BINANCE
  // =========================

  if (url.pathname === "/binance") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    try {
      const started = Date.now();

      const result = await fetchJson(
        `${BINANCE_API}?symbol=${encodeURIComponent(symbol)}`
      );

      return Response.json({
        source: "BINANCE",
        symbol,
        http: result.http,
        latency: Date.now() - started,
        data: result.data
      });
    } catch (error) {
      return Response.json(
        {
          source: "BINANCE",
          symbol,
          http: 0,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        { status: 502 }
      );
    }
  }

  // =========================
  // BITGET
  // =========================

  if (url.pathname === "/bitget") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    try {
      const started = Date.now();

      const result = await fetchJson(
        `${BITGET_API}?productType=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`
      );

      return Response.json({
        source: "BITGET",
        symbol,
        http: result.http,
        latency: Date.now() - started,
        data: result.data
      });
    } catch (error) {
      return Response.json(
        {
          source: "BITGET",
          symbol,
          http: 0,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        { status: 502 }
      );
    }
  }

  // =========================
  // NOT FOUND
  // =========================

  return Response.json(
    {
      ok: false,
      error: "Not Found"
    },
    { status: 404 }
  );
});
