/** Recorded twin chainguns, with optional legacy synthesis fallback. */
export const GATLING_SPOOL_SECONDS = 0.55;
export const GATLING_RECORDING_CUES = Object.freeze({ spoolStart: 0.4, spoolEnd: 0.95, loopStart: 1, loopEnd: 7.2, crossfade: 0.04, tailStart: 7.25, tailEnd: 9.25 });
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));

/** Exported for deterministic PCM inspection and offline previews. */
export function synthesizeGatlingShot(sampleRate = 48000, seed = 173) {
  const data = new Float32Array(Math.ceil(sampleRate * 0.29));
  let random = seed >>> 0 || 1, low = 0, phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
    const white = (random >>> 0) / 2147483648 - 1;
    low += (white - low) * (1 - Math.exp(-TAU * 1800 / sampleRate));
    // Fast pressure front, falling sub-body, then a short steel breech rattle.
    phase += TAU * (52 + 115 * Math.exp(-t * 55)) / sampleRate;
    const attack = 1 - Math.exp(-t * 2800);
    const body = Math.sin(phase) * Math.exp(-t * 26) * 0.72;
    const crack = (white - low) * Math.exp(-t * 135) * 0.46;
    // Sustained pressure/noise body bridges 10 Hz paired simulation events.
    // The 100 Hz texture is sound design, not additional simulated projectiles.
    const sustain = t < 0.1 ? 1 : Math.exp(-(t - 0.1) * 42);
    const tear = 0.72 + 0.28 * Math.pow((1 + Math.cos(TAU * 100 * t)) / 2, 3);
    const blast = (low * 0.9 + white * 0.22 + Math.sin(TAU * 73 * t) * 0.23)
      * sustain * tear;
    const steel = (Math.sin(TAU * 1137 * t) + Math.sin(TAU * 1783 * t) * 0.5)
      * Math.exp(-t * 62) * 0.1;
    const breechTime = Math.max(0, t - 0.028);
    const breech = t > 0.028 ? white * (1 - Math.exp(-breechTime * 1800))
      * Math.exp(-breechTime * 80) * 0.12 : 0;
    const tail = Math.min(1, Math.max(0, (0.29 - t) / 0.018));
    data[i] = Math.tanh((body + crack + blast + steel + breech) * attack * 1.6) * 0.78 * tail;
  }
  data[data.length - 1] = 0;
  return data;
}

/** Exactly periodic rotor/gear loop: all harmonics fit in the 0.1s period. */
export function synthesizeGatlingMotor(sampleRate = 48000) {
  const data = new Float32Array(Math.round(sampleRate * 0.1));
  for (let i = 0; i < data.length; i++) {
    const p = TAU * i / data.length;
    const teeth = Math.pow((1 + Math.cos(p * 8)) / 2, 10);
    data[i] = 0.27 * Math.sin(p * 4) + 0.16 * Math.sin(p * 12)
      + 0.09 * Math.sin(p * 24) + (0.07 + teeth * 0.15)
      * (Math.sin(p * 97) * 0.6 + Math.sin(p * 149) * 0.4);
  }
  return data;
}

export class GatlingAudio {
  constructor(context, { destination = context.destination, volume = 0.75, maxSources = 2, maxVoices = 16, sampleOnly = false } = {}) {
    this.context = context;
    this.sampleOnly = sampleOnly;
    this.recording = null; this.recordingCues = null; this.recordingLabel = null;
    this.recordedVoices = new Set(); this.recordedVoicesStarted = 0;
    this.syntheticVoicesStarted = 0; this.recordedLoopsStarted = 0; this.loadGeneration = 0;
    this.enabled = true;
    this.disposed = false;
    this.maxSources = Math.max(1, Math.min(8, Math.floor(maxSources)));
    this.maxVoices = Math.max(4, Math.min(64, Math.floor(maxVoices)));
    this.sources = new Map();
    this.motors = new Set();
    this.voices = new Set();
    this.shotsPlayed = 0;
    this.volume = clamp(volume, 0, 1);
    this.input = context.createGain();
    this.input.gain.value = 0.7;
    this.limiter = context.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 4096 * 2 - 1) * 1.3) * 0.95;
    this.limiter.curve = curve;
    this.limiter.oversample = '2x';
    this.output = context.createGain();
    this.master = this.output;
    this.output.gain.value = this.volume;
    this.input.connect(this.limiter).connect(this.output).connect(destination);
    const buffer = data => {
      const b = context.createBuffer(1, data.length, context.sampleRate);
      b.copyToChannel(data, 0); return b;
    };
    this.shotBuffers = sampleOnly ? [] : [173, 971, 3253, 7919].map(seed => buffer(synthesizeGatlingShot(context.sampleRate, seed)));
    this.motorBuffer = sampleOnly ? null : buffer(synthesizeGatlingMotor(context.sampleRate));
  }

  async loadRecording(url) {
    const generation = ++this.loadGeneration;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Recording download failed (${response.status})`);
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    if (this.disposed || generation !== this.loadGeneration) return false;
    this.setRecording(buffer, String(url));
    return true;
  }

  setRecording(buffer, label = 'Mech twin chainguns v4.mp3') {
    if (this.disposed) return false;
    const cues = GATLING_RECORDING_CUES;
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration < cues.tailEnd ||
        !buffer.numberOfChannels || !buffer.getChannelData) throw new Error('Recording must contain at least 9.25 seconds of decoded audio');
    const slice = (start, end) => {
      const first = Math.round(start * buffer.sampleRate), length = Math.round(end * buffer.sampleRate) - first;
      const result = this.context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) result.copyToChannel(buffer.getChannelData(ch).subarray(first, first + length), ch);
      return result;
    };
    const spool = slice(cues.spoolStart, cues.spoolEnd);
    const raw = slice(cues.loopStart, cues.loopEnd);
    const overlap = Math.round(cues.crossfade * buffer.sampleRate);
    // Circular, linear overlap: last 40ms blends into the first 40ms.
    // The boundary then continues at source loopStart + 40ms, at native speed.
    const loop = this.context.createBuffer(buffer.numberOfChannels, raw.length - overlap, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = raw.getChannelData(ch), output = loop.getChannelData(ch);
      output.set(input.subarray(overlap));
      for (let i = 0; i < overlap; i++) {
        const mix = i / (overlap - 1);
        output[output.length - overlap + i] = input[input.length - overlap + i] * (1 - mix) + input[i] * mix;
      }
    }
    const tail = slice(cues.tailStart, cues.tailEnd);
    this.stopAll(); ++this.loadGeneration;
    this.recording = buffer; this.recordingCues = { spool, loop, tail }; this.recordingLabel = label;
    return true;
  }

  _recordedVoice(buffer, state, kind, when, offset = 0) {
    while (this.recordedVoices.size >= this.maxVoices) this._kill(this.recordedVoices.values().next().value);
    const v = this._voice(buffer, state.pan, 0, false);
    v.recorded = true; v.kind = kind; v.sourceId = state.id;
    this.syntheticVoicesStarted--; this.recordedVoicesStarted++;
    this.recordedVoices.add(v);
    v.source.loop = kind === 'loop';
    v.gain.gain.setValueAtTime(0, when);
    v.gain.gain.linearRampToValueAtTime(state.level * 0.65, when + 0.012);
    if (kind !== 'loop') {
      const end = when + buffer.duration - offset;
      v.gain.gain.setValueAtTime(state.level * 0.65, Math.max(when + 0.012, end - 0.025));
      v.gain.gain.linearRampToValueAtTime(0, end);
    } else this.recordedLoopsStarted++;
    v.source.start(when, offset);
    return v;
  }

  _kill(v) {
    v.gain.gain.cancelScheduledValues?.(this.context.currentTime);
    v.gain.gain.setValueAtTime(0, this.context.currentTime);
    v.source.stop(this.context.currentTime); this._release(v);
  }

  _startRecorded(id, { pan = 0, level = 1, spin = 0 } = {}) {
    let state = this.sources.get(id);
    if (state) {
      state.pan = clamp(pan, -1, 1);
      for (const v of this.recordedVoices) if (v.sourceId === id) v.panner.pan.setTargetAtTime(state.pan, this.context.currentTime, 0.025);
      return true;
    }
    if (this.sources.size >= this.maxSources) this.stop(this.sources.keys().next().value);
    // A restart replaces all previous release tails for this source.
    for (const v of [...this.recordedVoices]) if (v.sourceId === id) this._kill(v);
    state = { id, pan: clamp(pan, -1, 1), level: clamp(level, 0, 1), firing: false };
    this.sources.set(id, state);
    spin = clamp(spin, 0, 1);
    if (spin < 1) state.spool = this._recordedVoice(this.recordingCues.spool, state, 'spool', this.context.currentTime, spin * GATLING_SPOOL_SECONDS);
    else this._fireRecorded(id);
    return true;
  }

  _fireRecorded(id, options = {}) {
    if (!this.sources.has(id)) this._startRecorded(id, { ...options, spin: 1 });
    const state = this.sources.get(id);
    if (!state.firing) {
      if (state.spool && this.recordedVoices.has(state.spool)) this._finish(state.spool, 0.012);
      state.loop = this._recordedVoice(this.recordingCues.loop, state, 'loop', this.context.currentTime);
      state.firing = true;
    }
    return true;
  }

  _voice(buffer, pan, level, motor = false) {
    this.syntheticVoicesStarted++;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const gain = this.context.createGain();
    gain.gain.value = level;
    const panner = this.context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    source.connect(gain).connect(panner).connect(this.input);
    const voice = { source, gain, panner, motor, stopped: false, startedAt: this.context.currentTime };
    source.onended = () => this._release(voice);
    (motor ? this.motors : this.voices).add(voice);
    return voice;
  }

  _release(voice) {
    voice.source.onended = null;
    voice.source.disconnect(); voice.gain.disconnect(); voice.panner.disconnect();
    this.voices.delete(voice); this.motors.delete(voice); this.recordedVoices.delete(voice);
  }

  _finish(voice, duration = 0.025) {
    voice.stopped = true;
    const now = this.context.currentTime;
    // setTarget rather than abrupt zero keeps all stop paths click-free.
    const gain = voice.gain.gain;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
    gain.setTargetAtTime(0, now, Math.max(0.003, duration / 6));
    voice.source.stop(now + duration);
  }

  start(sourceId, { pan = 0, level = 1, spin = 0 } = {}) {
    if (!this.enabled || this.disposed) return false;
    if (this.recording) return this._startRecorded(sourceId, { pan, level, spin });
    if (this.sampleOnly) return false;
    if (this.sources.has(sourceId)) {
      const v = this.sources.get(sourceId);
      v.panner.pan.setTargetAtTime(clamp(pan, -1, 1), this.context.currentTime, 0.025);
      return true;
    }
    // Bound active barrels; also bound retiring motors during trigger spam.
    if (this.sources.size >= this.maxSources) this.stop(this.sources.keys().next().value);
    if (this.motors.size >= this.maxSources * 2) {
      const oldest = this.motors.values().next().value;
      oldest.source.stop(); this._release(oldest);
    }
    const now = this.context.currentTime;
    const v = this._voice(this.motorBuffer, pan, 0, true);
    v.source.loop = true;
    spin = clamp(spin, 0, 1);
    v.source.playbackRate.setValueAtTime(0.24 * Math.pow(1 / 0.24, spin), now);
    v.source.playbackRate.exponentialRampToValueAtTime(1, now + Math.max(0.035, GATLING_SPOOL_SECONDS * (1 - spin)));
    v.gain.gain.setValueAtTime(0, now);
    v.gain.gain.linearRampToValueAtTime(0.11 * clamp(level, 0, 1), now + 0.035);
    v.gain.gain.linearRampToValueAtTime(0.2 * clamp(level, 0, 1), now + Math.max(0.035, GATLING_SPOOL_SECONDS * (1 - spin)));
    this.sources.set(sourceId, v);
    v.source.start(now);
    return true;
  }

  /** Called only for confirmed simulation shots. Never schedules extra bullets. */
  shot(sourceId, side = 'left', { pan = 0, level = 1, when = this.context.currentTime } = {}) {
    if (!this.enabled || this.disposed) return false;
    if (this.recording) { this.shotsPlayed++; return this._fireRecorded(sourceId, { pan, level }); }
    if (this.sampleOnly) return false;
    // Hard voice bound includes fading/retiring shots. Oldest tails are near silent.
    if (this.voices.size >= this.maxVoices) {
      const oldest = this.voices.values().next().value;
      oldest.source.stop(); this._release(oldest);
    }
    const isLeft = side === 'left' || side === 'L' || side === 0;
    const v = this._voice(this.shotBuffers[this.shotsPlayed % this.shotBuffers.length],
      clamp(pan + (isLeft ? -0.1 : 0.1), -1, 1), clamp(level, 0, 1) * 0.43);
    v.sourceId = sourceId;
    v.source.playbackRate.value = 1;
    v.source.start(when);
    this.shotsPlayed++;
    return true;
  }

  /** Capture one audio-clock timestamp for sample-coincident left/right fire. */
  shotPair(sourceId, options = {}) {
    const when = this.context.currentTime;
    const left = this.shot(sourceId, 'L', { ...options, when });
    const right = this.shot(sourceId, 'R', { ...options, when });
    return left && right;
  }

  stop(sourceId) {
    const v = this.sources.get(sourceId);
    if (!v) return;
    this.sources.delete(sourceId);
    const now = this.context.currentTime;
    if (this.recording) {
      for (const voice of this.recordedVoices) if (voice.sourceId === sourceId) this._finish(voice, 0.025);
      if (v.firing) this._recordedVoice(this.recordingCues.tail, v, 'tail', now);
      return;
    }
    const rate = v.source.playbackRate;
    if (rate.cancelAndHoldAtTime) rate.cancelAndHoldAtTime(now);
    else { rate.cancelScheduledValues(now); rate.setValueAtTime(rate.value, now); }
    rate.exponentialRampToValueAtTime(0.18, now + GATLING_SPOOL_SECONDS);
    this._finish(v, GATLING_SPOOL_SECONDS);
    for (const shot of this.voices) if (shot.sourceId === sourceId) this._finish(shot, 0.06);
  }

  stopAll({ immediate = true } = {}) {
    if (this.recording || this.sampleOnly) {
      if (immediate) {
        this.sources.clear();
        for (const voice of [...this.voices, ...this.motors]) this._finish(voice, 0.025);
      } else for (const id of [...this.sources.keys()]) this.stop(id);
      return;
    }
    if (immediate) {
      this.sources.clear();
      for (const v of this.motors) this._finish(v, 0.025);
    } else {
      for (const id of [...this.sources.keys()]) this.stop(id);
    }
    for (const v of this.voices) this._finish(v);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stopAll();
    this.output.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.015);
  }

  getDiagnostics() {
    return { enabled: this.enabled, disposed: this.disposed, activeSources: this.sources.size,
      motorVoices: this.motors.size, shotVoices: this.voices.size, shotsPlayed: this.shotsPlayed,
      spoolSeconds: GATLING_SPOOL_SECONDS, maxVoices: this.maxVoices,
      sampleOnly: this.sampleOnly, sampleLoaded: Boolean(this.recording), sourceLabel: this.recordingLabel,
      recordedVoices: this.recordedVoices.size, recordedVoicesStarted: this.recordedVoicesStarted,
      recordedLoopsStarted: this.recordedLoopsStarted, syntheticVoicesStarted: this.syntheticVoicesStarted };
  }

  dispose() {
    if (this.disposed) return;
    this.stopAll();
    this.disposed = true; this.enabled = false;
    // Let the 28ms master release complete before disconnecting via a silent source.
    const now = this.context.currentTime;
    this.output.gain.setTargetAtTime(0, now, 0.004);
    const cleanup = this.context.createBufferSource();
    cleanup.buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.032), this.context.sampleRate);
    cleanup.onended = () => {
      for (const v of [...this.voices, ...this.motors]) {
        v.source.stop(); this._release(v);
      }
      this.input.disconnect(); this.limiter.disconnect(); this.output.disconnect();
      cleanup.disconnect(); cleanup.onended = null;
    };
    cleanup.connect(this.output); cleanup.start(now);
  }
}

export default GatlingAudio;

/** Render the actual graph; suspend in chunks so real-time voice limits remain valid. */
export async function renderGatlingPreview(offlineContext, { start = 4, fireStart = 4.55, fireEnd = 10.55, recording = null, onDiagnostics = null } = {}) {
  let scheduledTime = 0;
  const context = new Proxy(offlineContext, { get(target, key) {
    if (key === 'currentTime') return scheduledTime;
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const audio = new GatlingAudio(context, { sampleOnly: Boolean(recording) });
  if (recording) audio.setRecording(recording);
  scheduledTime = start; audio.start('preview');
  const events = [];
  for (let i = 0; fireStart + i / 10 < fireEnd - 1e-8; i++)
    events.push({ time: fireStart + i / 10, fire: true });
  events.push({ time: fireEnd, fire: false });
  // Suspend slightly ahead of each event, then schedule exactly on the audio clock.
  let suspension = offlineContext.suspend(Math.max(0, events[0].time - 0.02));
  const rendered = offlineContext.startRendering();
  for (let i = 0; i < events.length; i++) {
    await suspension;
    scheduledTime = events[i].time;
    if (events[i].fire) audio.shotPair('preview'); else audio.stop('preview');
    if (i + 1 < events.length) suspension = offlineContext.suspend(events[i + 1].time - 0.02);
    await offlineContext.resume();
  }
  const result = await rendered;
  onDiagnostics?.(audio.getDiagnostics());
  return result;
}
