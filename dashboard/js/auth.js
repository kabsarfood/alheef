/**
 * الهيف — مصادقة لوحة التحكم
 */
const Auth = {
  TOKEN_KEY: 'alheef_admin_token',
  PHONE_KEY: 'alheef_admin_phone',
  LOGIN_PATH: '/dashboard/login.html',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getPhone() {
    return localStorage.getItem(this.PHONE_KEY) || '';
  },

  setSession(token, phone) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem('alheef_skip_analytics', '1');
    if (phone) localStorage.setItem(this.PHONE_KEY, phone);
  },

  setToken(token) {
    this.setSession(token, null);
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.PHONE_KEY);
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
      if (res.ok && data.authenticated && data.role === 'admin') {
        if (data.adminPhone) localStorage.setItem(this.PHONE_KEY, data.adminPhone);
        return true;
      }
      return false;
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
