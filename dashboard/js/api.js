/**
 * الهيف — Dashboard API Client
 */
const DashboardAPI = {
  base: '/api/admin',

  async request(endpoint, options = {}) {
    const headers = Auth.authHeaders(options.headers || {});
    const res = await fetch(`${this.base}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      Auth.clearToken();
      window.location.replace(Auth.LOGIN_PATH);
      throw new Error('انتهت الجلسة');
    }

    if (!res.ok) throw new Error(data.message || 'حدث خطأ');
    return data;
  },

  getStats() {
    return this.request('/stats');
  },

  getOffers() {
    return this.request('/offers');
  },

  getOffer(id) {
    return this.request(`/offers/${id}`);
  },

  saveOffer(formData, id = null) {
    const method = id ? 'PUT' : 'POST';
    const url = `${this.base}${id ? `/offers/${id}` : '/offers'}`;
    return fetch(url, {
      method,
      headers: Auth.authHeaders(),
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (res.status === 401) {
        Auth.clearToken();
        window.location.replace(Auth.LOGIN_PATH);
        throw new Error('انتهت الجلسة');
      }
      if (!res.ok) throw new Error(data.message || 'حدث خطأ');
      return data;
    });
  },

  deleteOffer(id) {
    return this.request(`/offers/${id}`, { method: 'DELETE' });
  },

  getNews() {
    return this.request('/news');
  },

  saveNews(body, id = null) {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/news/${id}` : '/news';
    return this.request(url, {
      method,
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  },

  deleteNews(id) {
    return this.request(`/news/${id}`, { method: 'DELETE' });
  },

  getRequests() {
    return this.request('/requests').then((d) => d.data || d);
  },

  getSubscriptions() {
    return this.request('/subscriptions').then((d) => d.data || d);
  },

  getBanners() {
    return this.request('/banners');
  },

  saveBanner(formData, id = null) {
    const url = `${this.base}${id ? `/banners/${id}` : '/banners'}`;
    return fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: Auth.authHeaders(),
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'حدث خطأ');
      return data;
    });
  },

  deleteBanner(id) {
    return this.request(`/banners/${id}`, { method: 'DELETE' });
  },

  getTestimonials() {
    return this.request('/testimonials');
  },

  saveTestimonial(formData, id = null) {
    const url = `${this.base}${id ? `/testimonials/${id}` : '/testimonials'}`;
    return fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: Auth.authHeaders(),
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'حدث خطأ');
      return data;
    });
  },

  deleteTestimonial(id) {
    return this.request(`/testimonials/${id}`, { method: 'DELETE' });
  },

  async getSettings() {
    const data = await this.request('/settings');
    return data?.data && data.success !== undefined ? data.data : data;
  },

  saveSettings(formData) {
    return fetch(`${this.base}/settings`, {
      method: 'PUT',
      headers: Auth.authHeaders(),
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (res.status === 401) {
        Auth.clearToken();
        window.location.replace(Auth.LOGIN_PATH);
        throw new Error('انتهت الجلسة');
      }
      if (!res.ok) throw new Error(data.message || 'حدث خطأ');
      return data;
    });
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

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusBadge(status) {
  const map = {
    published: ['منشور', 'badge--published'],
    draft: ['مسودة', 'badge--draft'],
    archived: ['مؤرشف', 'badge--archived'],
  };
  const [label, cls] = map[status] || map.published;
  return `<span class="badge ${cls}">${label}</span>`;
}
