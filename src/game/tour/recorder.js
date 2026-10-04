// Canvas recorder for the cinematic tour: composites the WebGL frame + the tour overlay (letterbox, titles,
// attribution) into a 2D canvas and records it with MediaRecorder (VP9/VP8 webm, ~40 Mbps), plus the game's audio
// (the audio engine's final output node) when the audio context exists.
// manual = true: captureStream(0) + requestFrame() after every composite (frame-stepped capture for automation).
export function createRecorder({ w, h, fps = 60, bitrate = 40e6, audio = null, manual = false }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not available in this browser');
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const stream = cv.captureStream(manual ? 0 : fps);
  const vtrack = stream.getVideoTracks()[0];
  let dest = null;
  try {
    const actx = audio?.ctx, out = audio?.core?.out;
    if (actx && out && actx.createMediaStreamDestination) {
      dest = actx.createMediaStreamDestination(); out.connect(dest);
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    }
  } catch (e) { console.warn('[tour] no audio track', e); dest = null; }
  const hasAudio = stream.getAudioTracks().length > 0;
  const types = hasAudio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(1000);
  let paused = false;
  return {
    canvas: cv, mimeType, hasAudio, w, h,
    get paused() { return paused; },
    frame(src, drawOverlay) {
      ctx.drawImage(src, 0, 0, w, h);
      drawOverlay?.(ctx, w, h);
      if (manual && !paused) vtrack.requestFrame?.();
    },
    pause() { if (!paused && rec.state === 'recording') { rec.pause(); paused = true; } },
    resume() { if (paused && rec.state === 'paused') { rec.resume(); paused = false; } },
    stop() {
      return new Promise(res => {
        const done = () => {
          try { dest && audio?.core?.out?.disconnect(dest); } catch { /* already gone */ }
          stream.getTracks().forEach(t => t.stop());
          res(new Blob(chunks, { type: (mimeType || 'video/webm').split(';')[0] }));
        };
        if (rec.state === 'inactive') { done(); return; }
        rec.onstop = done;
        try { if (rec.state === 'paused') rec.resume(); rec.stop(); } catch { done(); }
      });
    },
  };
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
