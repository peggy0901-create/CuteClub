const SUPABASE_URL = "https://irxaturxkrahouwsjzbe.supabase.co";
const SUPABASE_KEY = "sb_publishable_xh73MVaLxZYOU-atalZsUg_h1Od5bgE";
const SUPABASE_TABLE = "moverank_state";
const SUPABASE_STATE_ID = "cuteclub-main";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === "object") return Promise.resolve(request.body);
  if (typeof request.body === "string") {
    try {
      return Promise.resolve(JSON.parse(request.body));
    } catch {
      return Promise.resolve({});
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function loadState() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}&select=data,updated_at&limit=1`,
    { headers: supabaseHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Supabase load failed: ${response.status}`);
  }

  const [row] = await response.json();
  return row || null;
}

async function saveState(data) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: supabaseHeaders({
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify({
      id: SUPABASE_STATE_ID,
      data,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase save failed: ${response.status}`);
  }

  const [row] = await response.json();
  return row;
}

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    if (request.method === "GET") {
      const row = await loadState();
      sendJson(response, 200, { ok: true, data: row?.data || null, updatedAt: row?.updated_at || null });
      return;
    }

    if (request.method === "POST") {
      const body = await readBody(request);
      const row = await saveState(body.data || {});
      sendJson(response, 200, { ok: true, data: row?.data || null, updatedAt: row?.updated_at || null });
      return;
    }

    sendJson(response, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message || "Server error" });
  }
};
