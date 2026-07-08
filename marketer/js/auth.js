const MarketerAuth = {
  TOKEN_KEY: 'alheef_marketer_token',
  LOGIN_PATH: '/marketer/login.html',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  isLoginPage() {
    return window.location.pathname.includes('/marketer/login');
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
      const res = await fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      return res.ok && data.authenticated && data.role === 'marketer';
    } catch {
      return false;
    }
  },

  async requireAuth() {
    if (this.isLoginPage()) {
      if (await this.verify()) {
        window.location.href = '/marketer/';
        return false;
      }
      return false;
    }
    if (!(await this.verify())) {
      this.clearToken();
      window.location.replace(this.LOGIN_PATH);
      return false;
    }
    return true;
  },

  logout() {
    this.clearToken();
    window.location.href = this.LOGIN_PATH;
  },
};
