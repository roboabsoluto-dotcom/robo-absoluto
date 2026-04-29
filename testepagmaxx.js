const axios = require("axios");
const https = require("https");

const api = axios.create({
  baseURL: "https://api.prod.pagmaxx.com/api",
  httpsAgent: new https.Agent({
    rejectUnauthorized: false, // ⚠️ temporário
  }),
});

let tokenCache = null;
let tokenExpiraEm = null;

async function login() {
  try {
    const res = await api.post("/auth/token", {
      email: process.env.PAGMAXX_EMAIL,
      password: process.env.PAGMAXX_SENHA,
    });

    const token = res.data.token || res.data.access_token;

    tokenCache = token;
    tokenExpiraEm = Date.now() + 30 * 60 * 1000;

    console.log("✅ Token gerado");
    return token;

  } catch (err) {
    console.error("❌ Erro login:", err.response?.data || err.message);
    return null;
  }
}

async function getToken() {
  if (tokenCache && Date.now() < tokenExpiraEm) {
    return tokenCache;
  }
  return await login();
}

async function getVenda(slug) {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await api.get("/payment-link/get", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        slug: slug,
        // pode adicionar mais depois se precisar
      },
    });

    console.log("📦 RESPOSTA PAGMAXX:", res.data);

    return res.data;

  } catch (err) {
    console.error(
      "❌ Erro cobrança:",
      err.response?.status,
      err.response?.data || err.message
    );
    return null;
  }
}

module.exports = { getVenda };