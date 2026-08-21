/**
 * Admin dashboard — notification bell sound
 */
const AdminNotificationSound = (() => {
  const SEEN_KEY = 'alheef_admin_notif_seen_v1';
  const MUTE_KEY = 'alheef_admin_notif_sound_muted';
  const SOUND_URLS = ['/sounds/admin-notification.mp3', '/sounds/admin-notification.wav'];
  const VOLUME = 0.8;
  const MAX_SEEN = 200;

  let _audio = null;
  let _unlocked = false;
  let _firstPollDone = false;
  let _playing = false;
  let _lastPlayedAt = 0;

  function getSeenIds() {
    try {
      const raw = sessionStorage.getItem(SEEN_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  }

  function saveSeenIds(set) {
    try {
      const list = [...set].slice(-MAX_SEEN);
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(list));
    } catch {
      /* quota / private mode */
    }
  }

  function isMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setMuted(muted) {
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function ensureAudio() {
    if (_audio) return _audio;
    _audio = new Audio(SOUND_URLS[SOUND_URLS.length - 1]);
    _audio.preload = 'auto';
    _audio.volume = VOLUME;
    return _audio;
  }

  function unlock() {
    if (_unlocked) return;
    _unlocked = true;
    const audio = ensureAudio();
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => {
      /* autoplay blocked until real interaction — ok */
    });
  }

  function bindUnlock() {
    const once = () => {
      unlock();
      document.removeEventListener('click', once, true);
      document.removeEventListener('keydown', once, true);
      document.removeEventListener('touchstart', once, true);
    };
    document.addEventListener('click', once, true);
    document.addEventListener('keydown', once, true);
    document.addEventListener('touchstart', once, true);
  }

  function vibrateShort() {
    try {
      if (navigator.vibrate) navigator.vibrate(120);
    } catch {
      /* ignore */
    }
  }

  function shouldPlayPageSound() {
    if (typeof document !== 'undefined' && document.hidden) return false;
    return true;
  }

  async function playOnce() {
    if (isMuted() || !shouldPlayPageSound()) return false;
    const now = Date.now();
    if (_playing || now - _lastPlayedAt < 900) return false;

    _playing = true;
    _lastPlayedAt = now;

    for (const url of SOUND_URLS) {
      const audio = ensureAudio();
      try {
        if (audio.src && !audio.src.endsWith(url)) audio.src = url;
        if (!audio.src) audio.src = url;
        audio.currentTime = 0;
        audio.volume = VOLUME;
        await audio.play();
        vibrateShort();
        setTimeout(() => { _playing = false; }, 1100);
        return true;
      } catch {
        /* try next source */
      }
    }

    _playing = false;
    return false;
  }

  /**
   * @returns {object[]} newly arrived notifications since baseline
   */
  function ingest(items) {
    const list = Array.isArray(items) ? items : [];
    const seen = getSeenIds();

    if (!_firstPollDone) {
      list.forEach((n) => { if (n?.id) seen.add(n.id); });
      saveSeenIds(seen);
      _firstPollDone = true;
      return [];
    }

    const fresh = list.filter((n) => n?.id && !seen.has(n.id));
    if (fresh.length) {
      fresh.forEach((n) => seen.add(n.id));
      saveSeenIds(seen);
    }
    return fresh;
  }

  async function handlePoll(items) {
    const fresh = ingest(items);
    if (!fresh.length) return fresh;
    if (_unlocked) await playOnce();
    return fresh;
  }

  function getMuteLabel() {
    return isMuted() ? '🔕 كتم الصوت' : '🔔 تشغيل الصوت';
  }

  function getMuteAria() {
    return isMuted() ? 'كتم صوت إشعارات الإدارة — مفعّل' : 'تشغيل صوت إشعارات الإدارة — مفعّل';
  }

  bindUnlock();

  return {
    handlePoll,
    playOnce,
    isMuted,
    setMuted,
    getMuteLabel,
    getMuteAria,
    unlock,
  };
})();
