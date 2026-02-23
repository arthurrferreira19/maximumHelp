// public/assets/js/api.js
window.API = (function () {
  const TOKEN_KEY = "mh_token";
  const USER_KEY = "mh_user";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }



  async function upload(url, formData, { method = "POST" } = {}) {
    const token = getToken();
    const opts = { method, headers: {} };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    opts.body = formData;
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) ? (data.message || data.error) : `Erro ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function request(url, { method = "GET", body = null, headers = {} } = {}) {
    const token = getToken();

    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    };

    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!res.ok) {
      const msg = data?.message || data?.error || `Erro HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  return { getToken, getUser, setAuth, clearAuth, request, upload };
})();
