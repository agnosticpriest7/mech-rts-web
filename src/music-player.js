// A single streaming media element, not three full decoded AudioBuffers.
// Volume is linear media gain (0.4 = 40%), separate from weapon/effects levels.
export const MUSIC_TRACKS = Object.freeze([
  { title: 'Steel Horizon v4', url: new URL("../assets/audio/music/steel-horizon-v4.mp3",import.meta.url).href },
  { title: 'Steel Horizon v3', url: new URL("../assets/audio/music/steel-horizon-v3.mp3",import.meta.url).href },
  { title: 'Steel Horizon v2', url: new URL("../assets/audio/music/steel-horizon-v2.mp3",import.meta.url).href },
  { title: 'Steel Horizon', url: new URL("../assets/audio/music/steel-horizon.mp3",import.meta.url).href },
]);
const SETTINGS_KEY = 'frontier-music-v1';
const clamp = value => Math.max(0, Math.min(1, value));

export class MusicPlayer {
  constructor({ tracks = MUSIC_TRACKS, createAudio = () => new Audio(), storage = null, onChange = () => {} } = {}) {
    this.tracks = tracks;
    this.createAudio = createAudio;
    this.storage = storage;
    this.onChange = onChange;
    this.volume = .4;
    this.enabled = true;
    this.masterEnabled = true;
    this.active = false;
    this.unlocked = false;
    this.index = 0;
    this.status = 'waiting';
    this.error = null;
    this.media = null;
    this.generation = 0;
    this.failed = new Set();
    this.disposed = false;
    try {
      const saved = JSON.parse(storage?.getItem(SETTINGS_KEY) || 'null');
      if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) this.volume = clamp(saved.volume);
      if (typeof saved?.enabled === 'boolean') this.enabled = saved.enabled;
    } catch { /* Privacy mode or stale settings must not block the game. */ }
  }
  get shouldPlay() {
    return !this.disposed && this.active && this.unlocked && this.enabled && this.masterEnabled && this.volume > 0 && this.tracks.length > 0;
  }
  diagnostics() {
    return { status: this.status, volume: this.volume, enabled: this.enabled, masterEnabled: this.masterEnabled,
      active: this.active, unlocked: this.unlocked, track: this.tracks[this.index]?.title || null,
      index: this.index, count: this.tracks.length, failedCount: this.failed.size,
      currentTime: this.media?.currentTime || 0, duration: Number.isFinite(this.media?.duration) ? this.media.duration : null,
      readyState: this.media?.readyState || 0, error: this.error };
  }
  notify() { this.onChange(this.diagnostics()); }
  save() { try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify({ volume: this.volume, enabled: this.enabled })); } catch {} }
  ensureMedia() {
    if (this.media) return this.media;
    this.media = this.createAudio();
    this.media.preload = 'none';
    this.media.loop = false;
    this.media.volume = this.volume;
    this.onEnded = () => { if (!this.disposed) this.next(); };
    this.onError = () => { if (!this.disposed) this.failTrack('Audio file could not load or decode.'); };
    this.onMetadata = () => this.notify();
    this.media.addEventListener('ended', this.onEnded);
    this.media.addEventListener('error', this.onError);
    this.media.addEventListener('loadedmetadata', this.onMetadata);
    this.selectTrack();
    return this.media;
  }
  selectTrack() {
    this.generation++;
    this.pending = false;
    if (this.media) {
      this.media.pause();
      this.media.src = this.tracks[this.index]?.url || '';
      this.media.load();
    }
    this.status = 'waiting';
    this.error = null;
  }
  sync() {
    if (this.disposed) return;
    if (!this.shouldPlay) {
      if (this.media && (!this.media.paused || this.pending)) {
        this.generation++;
        this.pending = false;
        this.media.pause();
      }
      if (this.status !== 'error' && this.status !== 'blocked') this.status = this.unlocked ? 'paused' : 'waiting';
      this.notify();
      return;
    }
    if (this.status === 'blocked' || this.status === 'error' || this.pending || (this.media && !this.media.paused)) return;
    try {
      const media = this.ensureMedia();
      media.volume = this.volume;
      const generation = this.generation;
      this.pending = true;
      this.status = 'loading';
      this.notify();
      Promise.resolve(media.play()).then(() => {
        if (this.disposed || generation !== this.generation) return;
        this.pending = false;
        if (!this.shouldPlay) { media.pause(); this.status = 'paused'; }
        else { this.status = 'playing'; this.error = null; }
        this.notify();
      }).catch(error => {
        if (this.disposed || generation !== this.generation) return;
        this.pending = false;
        if (error?.name === 'NotAllowedError') {
          this.status = 'blocked';
          this.error = 'Click MUSIC or press a key to start audio.';
          this.notify();
        } else if (error?.name === 'AbortError') {
          this.status = 'paused';
          this.notify();
        } else this.failTrack(error?.message || 'Audio playback unavailable.');
      });
    } catch (error) {
      // No Audio API is a platform issue, not a reason to churn through tracks.
      this.pending = false;
      this.status = 'error';
      this.error = error?.message || 'Audio playback unavailable.';
      this.notify();
    }
  }
  failTrack(message) {
    if (this.disposed || this.status === 'error') return;
    this.failed.add(this.index);
    this.generation++;
    this.pending = false;
    this.media?.pause();
    if (this.failed.size >= this.tracks.length) {
      this.status = 'error';
      this.error = message;
      this.notify();
      return;
    }
    do { this.index = (this.index + 1) % this.tracks.length; } while (this.failed.has(this.index));
    this.selectTrack();
    this.sync();
  }
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    if (this.status === 'blocked') { this.status = 'waiting'; this.error = null; }
    this.sync();
  }
  retry() {
    if (this.disposed) return;
    this.failed.clear();
    this.unlocked = true;
    this.selectTrack();
    this.sync();
  }
  setActive(active) {
    active = !!active;
    if (active === this.active) return;
    this.active = active;
    this.sync();
  }
  setMasterEnabled(enabled) { this.masterEnabled = !!enabled; this.sync(); }
  setEnabled(enabled) { this.enabled = !!enabled; this.save(); this.sync(); }
  setVolume(volume) {
    if (!Number.isFinite(Number(volume))) return;
    this.volume = Math.round(clamp(Number(volume)) * 100) / 100;
    if (this.media) this.media.volume = this.volume;
    this.save();
    this.sync();
    this.notify();
  }
  next() {
    if (this.disposed || !this.tracks.length) return;
    this.index = (this.index + 1) % this.tracks.length;
    this.failed.clear();
    this.selectTrack();
    this.sync();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.pending = false;
    if (this.media) {
      this.media.pause();
      this.media.removeEventListener('ended', this.onEnded);
      this.media.removeEventListener('error', this.onError);
      this.media.removeEventListener('loadedmetadata', this.onMetadata);
      this.media.removeAttribute('src');
      this.media.load();
      this.media = null;
    }
  }
}
