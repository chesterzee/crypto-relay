const BINANCE_API = "https://fapi.binance.com/fapi/v1/ticker/price";
const BINANCE_KLINES_API = "https://fapi.binance.com/fapi/v1/klines";
const BITGET_API = "https://api.bitget.com/api/v2/mix/market/ticker";

const FETCH_TIMEOUT = 10000;

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 CryptoRelay/2.0"
      },
      signal: controller.signal
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
  } finally {
    clearTimeout(timer);
  }
}

function validSymbol(symbol: string) {
  return /^[A-Z0-9]{5,30}$/.test(symbol);
}

function validInterval(interval: string) {
  return [
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "8h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M"
  ].includes(interval);
}

function validLimit(limit: number) {
  return Number.isInteger(limit) && limit >= 1 && limit <= 1500;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  // =========================
  // CORS
  // =========================

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // =========================
  // HEALTH
  // =========================

  if (url.pathname === "/health") {
    return Response.json(
      {
        ok: true,
        service: "crypto-relay",
        version: "2.0",
        endpoints: [
          "/health",
          "/binance",
          "/binance-candles",
          "/bitget"
        ]
      },
      { headers: corsHeaders }
    );
  }

  // =========================
  // BINANCE TICKER
  // =========================

  if (url.pathname === "/binance") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    if (!validSymbol(symbol)) {
      return Response.json(
        {
          ok: false,
          source: "BINANCE",
          error: "Invalid symbol",
          symbol
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    try {
      const started = Date.now();

      const result = await fetchJson(
        `${BINANCE_API}?symbol=${encodeURIComponent(symbol)}`
      );

      return Response.json(
        {
          ok: result.http === 200,
          source: "BINANCE",
          type: "ticker",
          symbol,
          http: result.http,
          latency: Date.now() - started,
          data: result.data
        },
        {
          status: result.http === 200 ? 200 : 502,
          headers: corsHeaders
        }
      );
    } catch (error) {
      return Response.json(
        {
          ok: false,
          source: "BINANCE",
          type: "ticker",
          symbol,
          http: 0,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        {
          status: 502,
          headers: corsHeaders
        }
      );
    }
  }

  // =========================
  // BINANCE FUTURES CANDLES
  // =========================

  if (url.pathname === "/binance-candles") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    const interval =
      url.searchParams.get("interval") ||
      "5m";

    const limitRaw =
      url.searchParams.get("limit") ||
      "100";

    const limit = Number(limitRaw);

    if (!validSymbol(symbol)) {
      return Response.json(
        {
          ok: false,
          source: "BINANCE",
          type: "klines",
          error: "Invalid symbol",
          symbol
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    if (!validInterval(interval)) {
      return Response.json(
        {
          ok: false,
          source: "BINANCE",
          type: "klines",
          error: "Invalid interval",
          interval,
          allowed: [
            "1m",
            "3m",
            "5m",
            "15m",
            "30m",
            "1h",
            "2h",
            "4h",
            "6h",
            "8h",
            "12h",
            "1d",
            "3d",
            "1w",
            "1M"
          ]
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    if (!validLimit(limit)) {
      return Response.json(
        {
          ok: false,
          source: "BINANCE",
          type: "klines",
          error: "Invalid limit",
          limit,
          allowed: "1-1500"
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    try {
      const started = Date.now();

      const apiUrl =
        `${BINANCE_KLINES_API}` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&interval=${encodeURIComponent(interval)}` +
        `&limit=${limit}`;

      const result = await fetchJson(apiUrl);

      return Response.json(
        {
          ok: result.http === 200,
          source: "BINANCE",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          limit,
          http: result.http,
          latency: Date.now() - started,
          data: result.data
        },
        {
          status: result.http === 200 ? 200 : 502,
          headers: corsHeaders
        }
      );
    } catch (error) {
      return Response.json(
        {
          ok: false,
          source: "BINANCE",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          limit,
          http: 0,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        {
          status: 502,
          headers: corsHeaders
        }
      );
    }
  }

  // =========================
  // BITGET TICKER
  // =========================

  if (url.pathname === "/bitget") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    if (!validSymbol(symbol)) {
      return Response.json(
        {
          ok: false,
          source: "BITGET",
          error: "Invalid symbol",
          symbol
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    try {
      const started = Date.now();

      const result = await fetchJson(
        `${BITGET_API}?productType=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`
      );

      return Response.json(
        {
          ok: result.http === 200,
          source: "BITGET",
          type: "ticker",
          market: "FUTURES",
          symbol,
          http: result.http,
          latency: Date.now() - started,
          data: result.data
        },
        {
          status: result.http === 200 ? 200 : 502,
          headers: corsHeaders
        }
      );
    } catch (error) {
      return Response.json(
        {
          ok: false,
          source: "BITGET",
          type: "ticker",
          market: "FUTURES",
          symbol,
          http: 0,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        {
          status: 502,
          headers: corsHeaders
        }
      );
    }
  }

  // =========================
  // NOT FOUND
  // =========================

  return Response.json(
    {
      ok: false,
      error: "Not Found",
      path: url.pathname,
      available: [
        "/health",
        "/binance",
        "/binance-candles",
        "/bitget"
      ]
    },
    {
      status: 404,
      headers: corsHeaders
    }
  );
});
