const VERSION = "2.2";

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
        "user-agent": "Mozilla/5.0 CryptoRelay/2.2"
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

/* =========================================================
   INTERVAL HELPERS
   ========================================================= */

const BITGET_INTERVAL_MAP: Record<string, string> = {
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

function intervalMilliseconds(interval: string) {
  const map: Record<string, number> = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "6h": 21_600_000,
    "8h": 28_800_000,
    "12h": 43_200_000,
    "1d": 86_400_000,
    "3d": 259_200_000,
    "1w": 604_800_000,
    "1M": 2_592_000_000
  };

  return map[interval] || 0;
}

/* =========================================================
   BINANCE CLOSED CANDLE
   =========================================================
   Binance:
   [
     openTime,
     open,
     high,
     low,
     close,
     volume,
     closeTime,
     ...
   ]

   Candle terakhir biasanya masih berjalan.
   Kita hanya menganggap candle CLOSED jika closeTime <= now.
   ========================================================= */

function getBinanceClosedCandles(
  data: unknown,
  interval: string
) {
  if (!Array.isArray(data)) {
    return [];
  }

  const now = Date.now();

  return data.filter((candle: any) => {
    if (!Array.isArray(candle)) return false;

    const closeTime = Number(candle[6]);

    if (!Number.isFinite(closeTime)) {
      return false;
    }

    return closeTime <= now;
  });
}

/* =========================================================
   BITGET CLOSED CANDLE
   =========================================================
   Bitget:
   [
     timestamp,
     open,
     high,
     low,
     close,
     baseVolume,
     quoteVolume
   ]

   Bitget tidak memberikan closeTime secara langsung.
   Jadi openTime + interval harus <= sekarang.
   ========================================================= */

function getBitgetClosedCandles(
  data: unknown,
  interval: string
) {
  if (!Array.isArray(data)) {
    return [];
  }

  const duration = intervalMilliseconds(interval);

  if (!duration) {
    return [];
  }

  const now = Date.now();

  return data.filter((candle: any) => {
    if (!Array.isArray(candle)) return false;

    const openTime = Number(candle[0]);

    if (!Number.isFinite(openTime)) {
      return false;
    }

    return openTime + duration <= now;
  });
}

/* =========================================================
   NORMALIZED CANDLE
   ========================================================= */

function normalizeBinanceCandle(candle: any) {
  if (!Array.isArray(candle)) {
    return null;
  }

  return {
    openTime: Number(candle[0]),
    open: Number(candle[1]),
    high: Number(candle[2]),
    low: Number(candle[3]),
    close: Number(candle[4]),
    volume: Number(candle[5]),
    closeTime: Number(candle[6]),
    raw: candle
  };
}

function normalizeBitgetCandle(candle: any) {
  if (!Array.isArray(candle)) {
    return null;
  }

  const openTime = Number(candle[0]);

  return {
    openTime,
    open: Number(candle[1]),
    high: Number(candle[2]),
    low: Number(candle[3]),
    close: Number(candle[4]),
    volume: Number(candle[5]),
    quoteVolume: Number(candle[6]),
    closeTime: openTime,
    raw: candle
  };
}

/* =========================================================
   SERVER
   ========================================================= */

Deno.serve(async (request) => {
  const url = new URL(request.url);

  /* =======================================================
     CORS
     ======================================================= */

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

  /* =======================================================
     HEALTH
     ======================================================= */

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

  /* =======================================================
     BINANCE TICKER
     ======================================================= */

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

  /* =======================================================
     BINANCE CANDLES
     ======================================================= */

  if (url.pathname === "/binance-candles") {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    const interval = (
      url.searchParams.get("interval") ||
      "5m"
    ).toLowerCase();

    const limit = Number(
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

      /*
       * Ambil 1 candle tambahan supaya:
       * - candle aktif tetap tersedia
       * - candle closed selalu tersedia
       */
      const requestLimit = Math.min(
        limit + 2,
        1500
      );

      const apiUrl =
        `${BINANCE_KLINES_API}` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&interval=${encodeURIComponent(interval)}` +
        `&limit=${requestLimit}`;

      const result = await fetchJson(apiUrl);

      const rawData =
        Array.isArray(result.data)
          ? result.data
          : [];

      const closedCandles =
        getBinanceClosedCandles(
          rawData,
          interval
        );

      const normalizedClosed =
        closedCandles
          .map(normalizeBinanceCandle)
          .filter(Boolean);

      const closed =
        normalizedClosed.length
          ? normalizedClosed[
              normalizedClosed.length - 1
            ]
          : null;

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

          /*
           * RAW COMPATIBILITY
           */
          data: result.data,

          /*
           * CLOSED ONLY
           */
          closed,

          closedCandles:
            normalizedClosed.slice(-limit),

          /*
           * DEBUG
           */
          candleCount: rawData.length,
          closedCount: normalizedClosed.length
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

  /* =======================================================
     BITGET TICKER
     ======================================================= */

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

  /* =======================================================
     BITGET CANDLES
     ======================================================= */

  if (
    url.pathname === "/bitget-candles" ||
    url.pathname === "/bitget/candles"
  ) {
    const symbol = (
      url.searchParams.get("symbol") ||
      "BTCUSDT"
    ).toUpperCase();

    const interval = (
      url.searchParams.get("interval") ||
      "5m"
    ).toLowerCase();

    const limit = Number(
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

    const bitgetInterval =
      BITGET_INTERVAL_MAP[interval];

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
          allowed:
            Object.keys(BITGET_INTERVAL_MAP)
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

      const requestLimit = Math.min(
        limit + 2,
        1500
      );

      const apiUrl =
        `${BITGET_CANDLES_API}` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&productType=USDT-FUTURES` +
        `&granularity=${encodeURIComponent(bitgetInterval)}` +
        `&limit=${requestLimit}`;

      const result =
        await fetchJson(apiUrl);

      /*
       * Bitget response:
       * {
       *   code:"00000",
       *   data:[...]
       * }
       */

      let rawData: unknown[] = [];

      if (
        result.data &&
        typeof result.data === "object" &&
        "data" in result.data
      ) {
        const payload =
          (result.data as any).data;

        if (Array.isArray(payload)) {
          rawData = payload;
        }
      }

      const closedCandles =
        getBitgetClosedCandles(
          rawData,
          interval
        );

      const normalizedClosed =
        closedCandles
          .map(normalizeBitgetCandle)
          .filter(Boolean);

      const closed =
        normalizedClosed.length
          ? normalizedClosed[
              normalizedClosed.length - 1
            ]
          : null;

      return json(
        {
          ok:
            result.http === 200 &&
            !!(
              result.data &&
              typeof result.data === "object" &&
              (result.data as any).code ===
                "00000"
            ),

          source: "BITGET",
          type: "klines",
          market: "FUTURES",
          symbol,
          interval,
          bitgetInterval,
          limit,
          http: result.http,
          latency: Date.now() - started,

          /*
           * RAW BITGET RESPONSE
           */
          data: result.data,

          /*
           * CLOSED ONLY
           */
          closed,

          closedCandles:
            normalizedClosed.slice(-limit),

          /*
           * DEBUG
           */
          candleCount: rawData.length,
          closedCount: normalizedClosed.length
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
          bitgetInterval,
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

  /* =======================================================
     NOT FOUND
     ======================================================= */

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
