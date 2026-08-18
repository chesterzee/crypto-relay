const VERSION = "2.1";

const BINANCE_API =
  "https://fapi.binance.com/fapi/v1/ticker/price";

const BINANCE_KLINES_API =
  "https://fapi.binance.com/fapi/v1/klines";

const BITGET_API =
  "https://api.bitget.com/api/v2/mix/market/ticker";

const BITGET_CANDLES_API =
  "https://api.bitget.com/api/v2/mix/market/candles";

const FETCH_TIMEOUT = 10000;

async function fetchJson(url: string) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 CryptoRelay/2.1"
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

function validBitgetInterval(interval: string) {
  return [
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1H",
    "2H",
    "4H",
    "6H",
    "12H",
    "1D",
    "3D",
    "1W"
  ].includes(interval);
}

function validLimit(limit: number) {
  return (
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 1500
  );
}

function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return Response.json(
    data,
    {
      status,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        ...headers
      }
    }
  );
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  // =========================================================
  // CORS
  // =========================================================

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type"
      }
    });
  }

  if (request.method !== "GET") {
    return json(
      {
        ok: false,
        error: "Method Not Allowed"
      },
      405
    );
  }

  // =========================================================
  // HEALTH
  // =========================================================

  if (url.pathname === "/health") {
    return json({
      ok: true,
      service: "crypto-relay",
      version: VERSION,
      endpoints: [
        "/health",
        "/binance",
        "/binance-candles",
        "/bitget",
        "/bitget-candles"
      ]
    });
  }

  // =========================================================
  // BINANCE TICKER
  // =========================================================

  if (url.pathname === "/binance") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    if (!validSymbol(symbol)) {
      return json(
        {
          ok: false,
          source: "BINANCE",
          type: "ticker",
          market: "FUTURES",
          symbol,
          error: "Invalid symbol"
        },
        400
      );
    }

    try {
      const started = Date.now();

      const result = await fetchJson(
        `${BINANCE_API}?symbol=${encodeURIComponent(symbol)}`
      );

      return json(
        {
          ok: result.http === 200,
          source: "BINANCE",
          type: "ticker",
          market: "FUTURES",
          symbol,
          http: result.http,
          latency: Date.now() - started,
          data: result.data
        },
        result.http === 200 ? 200 : 502
      );

    } catch (error) {
      return json(
        {
          ok: false,
          source: "BINANCE",
          type: "ticker",
          market: "FUTURES",
          symbol,
          http: 0,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        502
      );
    }
  }

  // =========================================================
  // BINANCE FUTURES CANDLES
  // =========================================================

  if (url.pathname === "/binance-candles") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    const interval =
      url.searchParams.get("interval") ||
      "5m";

    const limit =
      Number(
        url.searchParams.get("limit") ||
        "10"
      );

    if (!validSymbol(symbol)) {
      return json(
        {
          ok: false,
          source: "BINANCE",
          type: "klines",
          market: "FUTURES",
          symbol,
          error: "Invalid symbol"
        },
        400
      );
    }

    if (!validInterval(interval)) {
      return json(
        {
          ok: false,
          source: "BINANCE",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          error: "Invalid interval"
        },
        400
      );
    }

    if (!validLimit(limit)) {
      return json(
        {
          ok: false,
          source: "BINANCE",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          limit,
          error: "Invalid limit"
        },
        400
      );
    }

    try {
      const started = Date.now();

      const apiUrl =
        `${BINANCE_KLINES_API}` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&interval=${encodeURIComponent(interval)}` +
        `&limit=${limit}`;

      const result =
        await fetchJson(apiUrl);

      return json(
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
        result.http === 200 ? 200 : 502
      );

    } catch (error) {
      return json(
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
        502
      );
    }
  }

  // =========================================================
  // BITGET TICKER
  // =========================================================

  if (url.pathname === "/bitget") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    if (!validSymbol(symbol)) {
      return json(
        {
          ok: false,
          source: "BITGET",
          type: "ticker",
          market: "FUTURES",
          symbol,
          error: "Invalid symbol"
        },
        400
      );
    }

    try {
      const started = Date.now();

      const apiUrl =
        `${BITGET_API}` +
        `?productType=USDT-FUTURES` +
        `&symbol=${encodeURIComponent(symbol)}`;

      const result =
        await fetchJson(apiUrl);

      return json(
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
        result.http === 200 ? 200 : 502
      );

    } catch (error) {
      return json(
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
        502
      );
    }
  }

  // =========================================================
  // BITGET FUTURES CANDLES
  // =========================================================

  if (
    url.pathname === "/bitget-candles" ||
    url.pathname === "/bitget/candles"
  ) {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    const interval =
      url.searchParams.get("interval") ||
      "5m";

    const limit =
      Number(
        url.searchParams.get("limit") ||
        "10"
      );

    if (!validSymbol(symbol)) {
      return json(
        {
          ok: false,
          source: "BITGET",
          type: "klines",
          market: "FUTURES",
          symbol,
          error: "Invalid symbol"
        },
        400
      );
    }

    /*
     * Worker memakai format:
     * 5m
     * 15m
     * 30m
     * 1h
     *
     * Bitget menggunakan:
     * 5m
     * 15m
     * 30m
     * 1H
     */

    const bitgetIntervalMap: Record<string, string> = {
      "1m": "1m",
      "3m": "3m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1H",
      "2h": "2H",
      "4h": "4H",
      "6h": "6H",
      "12h": "12H",
      "1d": "1D",
      "3d": "3D",
      "1w": "1W"
    };

    const bitgetInterval =
      bitgetIntervalMap[interval];

    if (!bitgetInterval) {
      return json(
        {
          ok: false,
          source: "BITGET",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          error: "Invalid interval",
          allowed: Object.keys(
            bitgetIntervalMap
          )
        },
        400
      );
    }

    if (!validLimit(limit)) {
      return json(
        {
          ok: false,
          source: "BITGET",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          limit,
          error: "Invalid limit"
        },
        400
      );
    }

    try {
      const started = Date.now();

      const apiUrl =
        `${BITGET_CANDLES_API}` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&productType=USDT-FUTURES` +
        `&granularity=${encodeURIComponent(bitgetInterval)}` +
        `&limit=${limit}`;

      const result =
        await fetchJson(apiUrl);

      return json(
        {
          ok: result.http === 200,
          source: "BITGET",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          bitgetInterval,
          limit,
          http: result.http,
          latency: Date.now() - started,
          data: result.data
        },
        result.http === 200 ? 200 : 502
      );

    } catch (error) {
      return json(
        {
          ok: false,
          source: "BITGET",
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
        502
      );
    }
  }

  // =========================================================
  // NOT FOUND
  // =========================================================

  return json(
    {
      ok: false,
      error: "Not Found",
      path: url.pathname,
      available: [
        "/health",
        "/binance",
        "/binance-candles",
        "/bitget",
        "/bitget-candles"
      ]
    },
    404
  );
});
