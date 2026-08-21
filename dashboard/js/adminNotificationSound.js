/**
 * Admin dashboard — notification bell sound
 */
const AdminNotificationSound = (() => {
  const SEEN_KEY = 'alheef_admin_notif_seen_v1';
  const MUTE_KEY = 'alheef_admin_notif_sound_muted';
  const SOUND_URL = '/sounds/admin-notification.wav';
  const VOLUME = 0.8;
  const MAX_SEEN = 200;

  let _audio = null;
  let _unlocked = false;
  let _firstPollDone = false;
  let _playing = false;
  let _lastPlayedAt = 0;
  let _pendingPlay = false;

  function isMobileViewport() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  }

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
    _audio = new Audio(SOUND_URL);
    _audio.preload = 'auto';
    _audio.volume = VOLUME;
    return _audio;
  }

  async function unlock() {
    if (_unlocked) return true;
    const audio = ensureAudio();
    const prevVolume = audio.volume;
    try {
      audio.volume = 0.001;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.volume = VOLUME;
      _unlocked = true;
      if (_pendingPlay && shouldPlayPageSound()) {
        _pendingPlay = false;
        await playOnce();
      }
      return true;
    } catch {
      audio.volume = prevVolume;
      return false;
    }
  }

  function bindUnlock() {
    const once = () => {
      unlock();
      document.removeEventListener('click', once, true);
      document.removeEventListener('keydown', once, true);
      document.removeEventListener('touchstart', once, true);
      document.removeEventListener('touchend', once, true);
    };
    document.addEventListener('click', once, true);
    document.addEventListener('keydown', once, true);
    document.addEventListener('touchstart', once, { capture: true, passive: true });
    document.addEventListener('touchend', once, { capture: true, passive: true });
  }

  function vibrateShort() {
    try {
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } catch {
      /* ignore */
    }
  }

  function shouldPlayPageSound() {
    if (typeof document === 'undefined') return false;
    if (document.hidden || document.visibilityState !== 'visible') return false;
    return true;
  }

  async function playOnce() {
    if (isMuted() || !shouldPlayPageSound()) return false;
    const now = Date.now();
    if (_playing || now - _lastPlayedAt < 900) return false;

    _playing = true;
    _lastPlayedAt = now;

    const audio = ensureAudio();
    try {
      if (!audio.src || !audio.src.includes(SOUND_URL)) audio.src = SOUND_URL;
      audio.currentTime = 0;
      audio.volume = VOLUME;
      await audio.play();
      vibrateShort();
      setTimeout(() => { _playing = false; }, 1100);
      return true;
    } catch {
      _playing = false;
      return false;
    }
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

    if (!_unlocked) {
      _pendingPlay = true;
      return fresh;
    }

    if (shouldPlayPageSound()) await playOnce();
    return fresh;
  }

  function isUnlocked() {
    return _unlocked;
  }

  function needsUnlock() {
    return !_unlocked && !isMuted();
  }

  function getMuteLabel() {
    if (isMuted()) return isMobileViewport() ? '🔕 الصوت مكتوم' : '🔕 كتم الصوت';
    if (!_unlocked) return isMobileViewport() ? '🔔 فعّل الصوت' : '🔔 تشغيل الصوت';
    return isMobileViewport() ? '🔔 الصوت مفعّل' : '🔔 تشغيل الصوت';
  }

  function getMuteAria() {
    if (isMuted()) return 'كتم صوت إشعارات الإدارة — مفعّل';
    if (!_unlocked) return 'اضغط لتفعيل صوت التنبيهات';
    return 'تشغيل صوت إشعارات الإدارة — مفعّل';
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && _pendingPlay && _unlocked && !isMuted()) {
        _pendingPlay = false;
        playOnce();
      }
    });
  }

  bindUnlock();

  return {
    handlePoll,
    playOnce,
    isMuted,
    setMuted,
    getMuteLabel,
    getMuteAria,
    isUnlocked,
    needsUnlock,
    unlock,
  };
})();
