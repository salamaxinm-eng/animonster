export function prepareDoorCreak() {
  let context: AudioContext | null = null,
    timer: ReturnType<typeof setTimeout> | null = null;
  try {
    context = new AudioContext();
    void context.resume().catch(() => {});
  } catch {}
  const dispose = () => {
    if (timer) clearTimeout(timer);
    if (context) {
      void context.close().catch(() => {});
      context = null;
    }
  };
  return {
    dispose,
    play() {
      if (!context) return;
      const ctx = context,
        duration = 0.9;
      const buffer = ctx.createBuffer(
          1,
          Math.ceil(ctx.sampleRate * duration),
          ctx.sampleRate,
        ),
        samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const t = i / ctx.sampleRate;
        const envelope = Math.sin((Math.PI * t) / duration);
        const friction = 0.4 + 0.6 * Math.pow(Math.sin(t * 47), 2);
        samples[i] = (Math.random() * 2 - 1) * envelope * friction;
      }
      const source = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.Q.value = 8;
      filter.frequency.setValueAtTime(850, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(
        330,
        ctx.currentTime + duration,
      );
      gain.gain.value = 0.012;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      timer = setTimeout(dispose, 1200);
    },
  };
}
