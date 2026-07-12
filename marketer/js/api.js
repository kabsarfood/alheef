const MarketerAPI = {
  async request(endpoint, options = {}) {
    const res = await fetch(`/api/marketer${endpoint}`, {
      ...options,
      headers: MarketerAuth.authHeaders(options.headers || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      MarketerAuth.clearToken();
      window.location.replace(MarketerAuth.LOGIN_PATH);
      throw new Error('انتهت الجلسة');
    }
    if (!res.ok) throw new Error(data.message || 'حدث خطأ');
    return data;
  },

  getStats() { return this.request('/stats'); },
  getMe() { return this.request('/me'); },
  getProperties(status = '') {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request(`/properties${q}`);
  },
  getProperty(id) { return this.request(`/properties/${id}`); },
  saveProperty(formData, id = null) {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/properties/${id}` : '/properties';
    return fetch(`/api/marketer${url}`, {
      method,
      headers: MarketerAuth.authHeaders(),
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'حدث خطأ');
      return data;
    });
  },
  deleteProperty(id) {
    return this.request(`/properties/${id}`, { method: 'DELETE' });
  },
};

function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast show${type === 'error' ? ' toast--error' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}
