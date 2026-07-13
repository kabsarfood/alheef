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

  getSystemStatus() {
    return this.request('/system-status');
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

  getMarketerJoinRequests(status = '') {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request(`/marketer-join-requests${q}`);
  },

  updateMarketerJoinRequest(id, body) {
    return this.request(`/marketer-join-requests/${id}`, {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  },

  getMarketers() {
    return this.request('/marketers');
  },

  updateMarketerStatus(id, status) {
    return this.request(`/marketers/${id}/status`, {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
  },

  getPropertyReviews(status = 'pending_review') {
    return this.request(`/property-reviews?status=${encodeURIComponent(status)}`);
  },

  reviewProperty(id, body) {
    return this.request(`/properties/${id}/review`, {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  },

  getNotifications(unreadOnly = false) {
    const q = unreadOnly ? '?unread=true' : '';
    return this.request(`/notifications${q}`);
  },

  markNotificationRead(id) {
    return this.request(`/notifications/${id}/read`, { method: 'PUT' });
  },

  markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PUT' });
  },

  testPushNotification() {
    const headers = Auth.authHeaders({ 'Content-Type': 'application/json' });
    return fetch('/api/push/test-admin', { method: 'POST', headers })
      .then((res) => res.json().then((data) => {
        if (!res.ok) throw new Error(data.message || 'فشل إرسال الاختبار');
        return data;
      }));
  },

  getPrivateOffersSettings() {
    return this.request('/private-offers/settings');
  },

  setPrivateGlobalActive(active) {
    return this.request('/private-offers/settings/active', {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ active }),
    });
  },

  getPrivateClients() {
    return this.request('/private-offers/clients').then((d) => d.clients || []);
  },

  createPrivateClient(payload) {
    const body = typeof payload === 'string'
      ? { clientLabel: payload }
      : (payload || {});
    return this.request('/private-offers/clients', {
      method: 'POST',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  },

  updatePrivateClientCode(id, accessCode) {
    return this.request(`/private-offers/clients/${id}/code`, {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ accessCode }),
    });
  },

  regeneratePrivateClient(id) {
    return this.request(`/private-offers/clients/${id}/regenerate`, { method: 'POST' });
  },

  setPrivateClientActive(id, active) {
    return this.request(`/private-offers/clients/${id}/active`, {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ active }),
    });
  },

  updatePrivateClientLabel(id, clientLabel) {
    return this.request(`/private-offers/clients/${id}/label`, {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientLabel }),
    });
  },

  updatePrivateClient(id, payload) {
    return this.request(`/private-offers/clients/${id}`, {
      method: 'PUT',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {}),
    });
  },

  getPrivateOffers() {
    return this.request('/private-offers').then((d) => d.offers || []);
  },

  savePrivateOffer(formData, id = null) {
    const url = `${this.base}${id ? `/private-offers/${id}` : '/private-offers'}`;
    return fetch(url, {
      method: id ? 'PUT' : 'POST',
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

  deletePrivateOffer(id) {
    return this.request(`/private-offers/${id}`, { method: 'DELETE' });
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
