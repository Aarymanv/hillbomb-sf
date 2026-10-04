// Realistic-human state sheet: forces the player's human through animation states and shoots each one.
//   await import('http://127.0.0.1:5190/dev/ped_states.js'); await __pedStates(['idle','walk',...], 'tag')
// -> shots/pst_<tag>_<state>.jpg (camera 3 m in front, slightly to the side)
(() => {
  const W = window;
  const S = {
    idle: { state: 'idle', speed: 0 }, walk: { state: 'walk', speed: 1.4 }, fastwalk: { state: 'walk', speed: 2.0 },
    jog: { state: 'run', speed: 3.0 }, run: { state: 'run', speed: 5.5 }, phone: { state: 'phone', speed: 0 },
    photo: { state: 'phone', speed: 0, gesture: 'photo' }, wave: { state: 'wave', speed: 0 }, sit: { state: 'sit', speed: 0 },
    talk: { state: 'idle', speed: 0, gesture: 'talk' }, listen: { state: 'idle', speed: 0, gesture: 'listen' },
    drive: { state: 'drive', speed: 0 }, knocked: { state: 'knocked', speed: 0, lying: 1 }, getup: { state: 'getup', speed: 0 },
    jump: { state: 'jump', speed: 2 }, umbrella: { state: 'walk', speed: 1.3, umbrella: true }, umbidle: { state: 'idle', speed: 0, umbrella: true }, look: { state: 'idle', speed: 0, lookYaw: 0.9, lookW: 1 },
  };
  W.__pedStates = async (names, tag = 'x', side = 0.9, dist = 3, frames = 45) => {
    W.__manual = true;
    const P = W.__player, h = P.human, out = [];
    for (const n of names) {
      h._force = S[n];
      W.__frames(frames);
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const aim = () => W.__look(P.pos.x + fx * dist + fz * side, P.pos.y + 1.45, P.pos.z + fz * dist - fx * side, P.pos.x, P.pos.y + 0.95, P.pos.z);
      aim(); W.__frames(1); aim();
      out.push(await W.__shot(`pst_${tag}_${n}`, 640, 480));
    }
    h._force = null;
    return out;
  };
})();
