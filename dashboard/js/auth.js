/**
 * الهيف — مصادقة لوحة التحكم
 */
const Auth = {
  TOKEN_KEY: 'alheef_admin_token',
  LOGIN_PATH: '/dashboard/login.html',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem('alheef_skip_analytics', '1');
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem('alheef_skip_analytics');
  },

  isLoginPage() {
    return window.location.pathname.includes('login.html');
  },

  authHeaders(extra = {}) {
    const token = this.getToken();
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  },

  async verify() {
    const token = this.getToken();
    if (!token) return false;
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return res.ok && data.authenticated && data.role === 'admin';
    } catch {
      return false;
    }
  },

  async requireAuth() {
    if (this.isLoginPage()) {
      const ok = await this.verify();
      if (ok) {
        window.location.href = '/dashboard/';
      }
      return false;
    }

    const ok = await this.verify();
    if (!ok) {
      this.clearToken();
      window.location.replace(this.LOGIN_PATH);
      return false;
    }
    localStorage.setItem('alheef_skip_analytics', '1');
    return true;
  },

  logout() {
    this.clearToken();
    window.location.href = this.LOGIN_PATH;
  },
};
