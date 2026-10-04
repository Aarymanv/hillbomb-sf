// HUD, shell, menu, map and legacy (.hb-*) styles, injected once. Tokens come from theme.js (--ui-*); the older
// --acc/--ink/--dim/--cond/--sans names stay defined because other modules' screens use them.
import { injectTheme } from './theme.js';
export const ACCENT = '#ff2e7e';
export function injectStyles() {
  if (document.getElementById('hb-style')) return;
  injectTheme();
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;0,900;1,600;1,700;1,800;1,900&family=Inter:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(l);
  const s = document.createElement('style');
  s.id = 'hb-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
:root{--acc:var(--ui-acc,#ff2e7e);--acc2:#ffc247;--ink:#f6f3ee;--dim:rgba(246,243,238,.62);--faint:rgba(246,243,238,.14);
  --panel:rgba(10,11,17,.62);--panel2:rgba(10,11,17,.84);--glass:linear-gradient(180deg,rgba(18,20,30,.74),rgba(9,10,16,.66));
  --cond:'Barlow Condensed','Arial Narrow',Impact,sans-serif;--sans:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;--cop-r:#ff3040;--cop-b:#2e7bff;
  --good:#39e07a;--bad:#ff4d5e;--ease:cubic-bezier(.2,.9,.25,1)}
.hb-shadow{text-shadow:0 2px 8px rgba(0,0,0,.55),0 0 2px rgba(0,0,0,.6)}
kbd,.kbd{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;box-sizing:border-box;padding:0 6px;margin:0 6px 0 0;border-radius:4px;
  background:rgba(246,243,238,.94);color:#0b0c10;font:800 12px/1 var(--sans);letter-spacing:0;box-shadow:0 2px 0 rgba(0,0,0,.45);vertical-align:middle;text-transform:none}
kbd.pad{border-radius:11px;background:#f6f3ee;min-width:22px;padding:0 5px;font:800 11px/1 var(--sans)}
kbd:empty{display:none}
.ic{display:inline-block;vertical-align:middle;flex:none}
.ic-txt{font-style:normal;font-family:var(--cond);font-weight:800}

/* ================================================================= HUD */
#hud{position:fixed;inset:0;pointer-events:none;z-index:20;color:var(--ink);font-family:var(--sans);user-select:none;--hs:1}
#hud.hidden,#hud.off{visibility:hidden}
#hud.off *{animation-play-state:paused}
.h-cl{position:absolute;zoom:var(--hs)}
.h-tl{left:30px;top:26px;display:flex;flex-direction:column;gap:14px;align-items:flex-start}
.h-tc{left:50%;top:14px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center}
.h-tr{right:30px;top:24px;display:flex;flex-direction:column;align-items:flex-end;gap:12px}
.h-bl{left:30px;bottom:26px}
.h-br{right:26px;bottom:18px}
.h-bc{left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:12px}
.h-cc{position:absolute;inset:0;pointer-events:none}
.h-cc>*{zoom:var(--hs)}

/* notifications */
.h-nt{display:flex;flex-direction:column;gap:8px;width:380px}
.nt{position:relative;display:flex;align-items:stretch;min-height:56px;background:var(--glass);backdrop-filter:blur(10px) saturate(1.25);
  clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,0 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.07);animation:nt-in .42s var(--ease) both;overflow:hidden}
.nt-ic{width:50px;flex:none;display:grid;place-items:center;background:var(--c);color:#0b0c10;clip-path:polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.nt-tx{padding:9px 26px 11px 14px;display:flex;flex-direction:column;justify-content:center;min-width:0}
.nt-tx b{font:italic 800 21px/1.02 var(--cond);letter-spacing:.01em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nt-tx span{margin-top:3px;font:500 12.5px/1.35 var(--sans);color:var(--dim)}
.nt-bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--c);transform-origin:left;opacity:.9}
.nt.out{animation:nt-out .26s ease-in forwards}
@keyframes nt-in{from{opacity:0;transform:translateX(-46px) skewX(-8deg)}}
@keyframes nt-out{to{opacity:0;transform:translateX(-30px)}}
@keyframes nt-drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}

/* race panel */
.h-race{display:none;align-items:stretch;gap:0;background:var(--glass);backdrop-filter:blur(10px);clip-path:polygon(0 0,100% 0,calc(100% - 18px) 100%,0 100%);box-shadow:inset 3px 0 0 var(--acc2)}
.h-race.on{display:flex;animation:nt-in .4s var(--ease)}
.rc-pos{display:flex;align-items:flex-start;padding:8px 18px 6px 18px;min-width:128px;box-sizing:border-box}
.rc-pos b{font:italic 900 88px/.86 var(--cond);letter-spacing:-.02em}
.rc-pos sup{font:italic 900 30px/1 var(--cond);margin:6px 0 0 9px;color:var(--acc2)}
.rc-pos span{align-self:flex-end;margin:0 0 10px 6px;font:italic 800 24px/1 var(--cond);color:var(--dim)}
.h-race.p1 .rc-pos b{color:var(--acc2)}
.h-race.nopos .rc-pos{display:none}
.rc-rows{display:flex;flex-direction:column;justify-content:center;gap:5px;padding:10px 34px 10px 16px;border-left:1px solid var(--faint)}
.rc-rows div{display:flex;align-items:baseline;justify-content:space-between;gap:22px;min-width:170px}
.rc-rows i{font:700 11px/1 var(--sans);font-style:normal;letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.rc-rows b{font:italic 800 26px/1 var(--cond);font-variant-numeric:tabular-nums}

/* checkpoint arrow */
.h-cpa{display:none;flex-direction:column;align-items:center;margin-bottom:4px}
.h-cpa.on{display:flex}
.cpa-a{width:68px;height:68px;will-change:transform}
.cpa-a svg{width:100%;height:100%;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5))}
.cpa-a path{fill:var(--acc2);stroke:#16110a;stroke-width:3;stroke-linejoin:round}
.cpa-d{margin-top:-6px;font:italic 800 17px/1 var(--cond);letter-spacing:.08em;text-shadow:0 2px 6px rgba(0,0,0,.7)}

/* skill chain */
.h-skill{margin-top:52px;display:flex;flex-direction:column;align-items:center;opacity:0;transform:translateY(-8px) scale(.96);transition:opacity .22s,transform .3s var(--ease);text-shadow:0 3px 12px rgba(0,0,0,.55)}
.h-skill.on{opacity:1;transform:none}
.sk-top{display:flex;align-items:flex-start;gap:10px}
.sk-total{font:italic 900 58px/.9 var(--cond);letter-spacing:.01em;font-variant-numeric:tabular-nums}
.sk-mult{margin-top:4px;padding:3px 9px 4px;background:var(--acc);color:#fff;font:italic 900 26px/1 var(--cond);clip-path:polygon(8% 0,100% 0,92% 100%,0 100%);text-shadow:none}
.sk-mult:empty{display:none}
.sk-bar{width:280px;height:4px;margin:9px 0 6px;background:rgba(255,255,255,.18);overflow:hidden;transform:skewX(-20deg)}
.sk-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),#ff7ab0);transform-origin:left}
.sk-state{font:800 12px/1.2 var(--sans);letter-spacing:.24em;text-transform:uppercase}
.sk-state:empty{display:none}
.sk-feed{display:flex;flex-direction:column;align-items:center;gap:1px}
.sk-feed div{font:italic 800 19px/1.2 var(--cond);letter-spacing:.06em;text-transform:uppercase;opacity:.72}
.sk-feed div.n{opacity:1;font-size:23px;animation:sk-pop .28s var(--ease)}
.sk-feed b{margin-left:8px;color:var(--acc2)}
.h-skill.bank .sk-total{color:var(--good)}.h-skill.bank .sk-state{color:var(--good)}
.h-skill.lost .sk-total{color:var(--bad);text-decoration:line-through;text-decoration-thickness:4px}.h-skill.lost .sk-state{color:var(--bad)}
@keyframes sk-pop{from{transform:scale(1.25);opacity:.2}}

/* top right: cash, level, xp */
.h-prog{display:flex;flex-direction:column;align-items:flex-end;gap:6px;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.pg-cash{position:relative;display:flex;align-items:baseline;gap:3px}
.pg-cash i{font:italic 800 26px/1 var(--cond);color:var(--acc2);font-style:italic}
.pg-cash b{font:italic 900 44px/.95 var(--cond);letter-spacing:.005em;font-variant-numeric:tabular-nums}
.pg-pop{position:absolute;right:calc(100% + 12px);top:50%;font:italic 800 20px/1 var(--cond);font-style:italic;color:var(--acc2);opacity:0;transform:translate(8px,-50%);transition:opacity .25s,transform .35s var(--ease);white-space:nowrap}
.pg-pop.on{opacity:1;transform:translate(0,-50%)}
.pg-xpt .pg-pop{font-size:16px;color:#c8b9ff}
.pg-lvl{display:flex;align-items:center;gap:10px}
.pg-badge{display:flex;flex-direction:column;align-items:center;justify-content:center;width:44px;height:48px;background:var(--acc);color:#fff;text-shadow:none;
  clip-path:polygon(50% 0,100% 24%,100% 76%,50% 100%,0 76%,0 24%)}
.pg-badge small{font:800 8.5px/1 var(--sans);letter-spacing:.14em;margin-top:2px}
.pg-badge b{font:italic 900 24px/.9 var(--cond)}
.pg-xp{display:flex;flex-direction:column;align-items:flex-end;gap:5px;width:190px}
.pg-xpt{position:relative;font:600 11.5px/1 var(--sans);letter-spacing:.06em;color:var(--dim);font-variant-numeric:tabular-nums}
.pg-bar{width:100%;height:4px;background:rgba(255,255,255,.16);overflow:hidden;transform:skewX(-20deg)}
.pg-bar i{display:block;height:100%;background:linear-gradient(90deg,#8f7bff,#c8b9ff);transform-origin:left;transition:transform .5s var(--ease)}

/* wanted stars */
.h-stars{display:none;gap:3px}
.h-stars.on{display:flex}
.h-stars i{color:rgba(255,255,255,.2);filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));display:flex}
.h-stars i.lit{color:var(--ink)}
.h-stars.flash i.lit{animation:starflash .5s steps(2) infinite}
@keyframes starflash{50%{color:var(--cop-r)}}

/* objective */
.h-obj{display:none;min-width:240px;max-width:320px;padding:10px 16px 12px;background:var(--glass);backdrop-filter:blur(8px);box-shadow:inset -3px 0 0 var(--acc);text-align:right;
  clip-path:polygon(12px 0,100% 0,100% 100%,0 100%)}
.h-obj.on{display:block;animation:nt-in .35s var(--ease)}
.ob-k{font:800 10.5px/1 var(--sans);letter-spacing:.24em;text-transform:uppercase;color:var(--acc)}
.ob-t{margin-top:5px;font:italic 800 25px/1.02 var(--cond);text-transform:uppercase}
.ob-bar{height:3px;margin:8px 0 7px;background:rgba(255,255,255,.14);overflow:hidden}
.ob-bar i{display:block;height:100%;background:var(--acc);transform-origin:left;transform:scaleX(0)}
.ob-d{font:italic 700 16px/1 var(--cond);letter-spacing:.06em;color:var(--dim)}
.h-obj.cop{box-shadow:inset -3px 0 0 var(--cop-b)}.h-obj.cop .ob-k{color:#6aa8ff}.h-obj.cop .ob-bar i{background:linear-gradient(90deg,var(--cop-r),var(--cop-b))}
.h-obj.race{box-shadow:inset -3px 0 0 var(--acc2)}.h-obj.race .ob-k{color:var(--acc2)}.h-obj.race .ob-bar i{background:var(--acc2)}
.h-slot:empty{display:none}
.h-slot{pointer-events:auto}
.h-slot-radio{position:absolute;left:270px;bottom:4px;max-width:340px}

/* location + minimap */
.h-loc{margin:0 0 10px 6px;text-shadow:0 2px 10px rgba(0,0,0,.7),0 0 2px rgba(0,0,0,.6);max-width:420px}
.h-loc b{display:block;font:italic 800 26px/1 var(--cond);letter-spacing:.01em;text-transform:uppercase;white-space:nowrap}
.h-loc small{display:block;margin-top:4px;font:700 11px/1 var(--sans);letter-spacing:.22em;text-transform:uppercase;color:var(--acc)}
.h-mm{position:relative;width:250px;height:250px;border-radius:50%;overflow:hidden;background:#0b1721;box-shadow:0 10px 34px rgba(0,0,0,.5)}
.h-mm canvas{display:block;width:100%;height:100%}
.mm-ring{position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.16),inset 0 0 0 5px rgba(8,9,14,.55),inset 0 0 34px rgba(0,0,0,.6);transition:box-shadow .15s}
.h-mm.wanted .mm-ring{box-shadow:inset 0 0 0 4px var(--cop-r),inset 0 0 34px rgba(255,48,64,.45)}
.h-mm.wanted.blue .mm-ring{box-shadow:inset 0 0 0 4px var(--cop-b),inset 0 0 34px rgba(46,123,255,.45)}
.h-health{display:none;width:200px;height:5px;margin:12px 16px 0;background:rgba(255,255,255,.14);overflow:hidden;transform:skewX(-20deg)}
.h-health.on{display:block}
.h-health i{display:block;height:100%;background:var(--good);transform-origin:left}
.h-health.low i{background:var(--bad)}

/* speedo */
.h-speedo{position:relative;width:250px;height:250px;display:none}
.h-speedo.on{display:block}
.h-speedo canvas{position:absolute;inset:0;width:100%;height:100%}
.sp-num{position:absolute;left:0;right:0;top:66px;text-align:center;font:italic 900 84px/1 var(--cond);letter-spacing:-.01em;font-variant-numeric:tabular-nums;text-shadow:0 3px 14px rgba(0,0,0,.5)}
.sp-unit{position:absolute;left:0;right:0;top:148px;text-align:center;font:800 11px/1 var(--sans);letter-spacing:.34em;color:var(--dim);padding-left:.34em}
.sp-gear{position:absolute;left:79px;top:170px;width:40px;height:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(246,243,238,.1);box-shadow:inset 0 0 0 1.5px rgba(246,243,238,.3);border-radius:4px}
.sp-gear b{font:italic 900 26px/.9 var(--cond)}
.sp-gear small{font:800 6.5px/1 var(--sans);letter-spacing:.2em;color:var(--dim);margin-top:1px}
.h-speedo.limiter .sp-gear{background:var(--acc);box-shadow:none}
.h-speedo.limiter .sp-gear small{color:#fff}
.sp-pi{position:absolute;left:127px;top:177px;height:26px;display:flex;align-items:center}
.sp-pi .ui-pi{font-size:17px}
.sp-dmg{display:none;position:absolute;left:80px;right:80px;top:224px;height:4px;background:rgba(255,255,255,.14);overflow:hidden;transform:skewX(-20deg)}
.sp-dmg.on{display:block}
.sp-dmg i{display:block;height:100%;background:linear-gradient(90deg,var(--bad),var(--acc2) 45%,var(--good));transform-origin:left}

/* prompt + hint */
.h-prompt{display:none;max-width:560px;padding:12px 26px 14px;background:var(--glass);backdrop-filter:blur(10px);box-shadow:inset 0 -3px 0 var(--acc);font:500 14.5px/1.4 var(--sans);text-align:center;
  clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)}
.h-prompt.on{display:block;animation:nt-in .3s var(--ease)}
.h-prompt b{display:block;font:italic 800 25px/1.05 var(--cond);letter-spacing:.01em;text-transform:uppercase;margin-bottom:3px;color:var(--ink)}
.h-prompt kbd{margin:0 4px}
.h-hint{display:none;font:600 12.5px/1 var(--sans);color:var(--dim);white-space:nowrap;text-shadow:0 1px 6px rgba(0,0,0,.8)}
.h-hint.on{display:block}
.h-hint .kbd{margin:0 5px}

/* centre banner, readout, bust meter, district */
.h-banner{position:absolute;left:0;right:0;top:31%;text-align:center;opacity:0;pointer-events:none}
.h-banner.show{opacity:1;animation:bn-in .5s var(--ease)}
.h-banner h1{margin:0;font:italic 900 clamp(80px,10vw,156px)/.86 var(--cond);letter-spacing:.005em;text-transform:uppercase;text-shadow:0 8px 40px rgba(0,0,0,.45)}
.h-banner p{margin:10px 0 0;font:italic 800 24px/1.2 var(--cond);letter-spacing:.18em;text-transform:uppercase;color:var(--ink);opacity:.85;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.h-banner.red h1{color:var(--bad)}.h-banner.gold h1{color:var(--acc2)}.h-banner.blue h1{color:#6aa8ff}
@keyframes bn-in{from{opacity:0;transform:scale(1.14);filter:blur(6px)}}
.h-readout{position:absolute;left:0;right:0;top:25%;text-align:center;opacity:0;transition:opacity .3s;text-shadow:0 4px 20px rgba(0,0,0,.5)}
.h-readout.show{opacity:1;animation:bn-in .45s var(--ease)}
.h-readout .t{font:800 13px/1 var(--sans);letter-spacing:.3em;text-transform:uppercase;color:var(--acc2)}
.h-readout .v{margin-top:4px;font:italic 900 92px/.95 var(--cond)}
.h-readout .s{font:italic 800 22px/1 var(--cond);letter-spacing:.16em;color:var(--acc2)}
.h-bust{position:absolute;left:50%;top:58%;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:6px}
.h-bust.on{display:flex}
.h-bust span{font:italic 900 30px/1 var(--cond);letter-spacing:.2em;color:#6aa8ff;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.h-bust div{width:260px;height:6px;background:rgba(255,255,255,.18);transform:skewX(-20deg);overflow:hidden}
.h-bust i{display:block;height:100%;background:linear-gradient(90deg,var(--cop-b),var(--cop-r));transform-origin:left}
.h-district{position:absolute;left:0;right:0;top:17%;display:flex;flex-direction:column;align-items:center;opacity:0;pointer-events:none}
.h-district small{font:800 12px/1 var(--sans);letter-spacing:.4em;text-transform:uppercase;color:var(--acc);padding-left:.4em;text-shadow:0 2px 8px rgba(0,0,0,.7)}
.h-district b{margin-top:6px;font:italic 900 74px/.9 var(--cond);text-transform:uppercase;letter-spacing:.01em;text-shadow:0 6px 30px rgba(0,0,0,.5)}
.h-district i{margin-top:10px;height:3px;width:0;background:var(--acc);transform:skewX(-20deg)}
.h-district.show{animation:ds-life 3.4s var(--ease) forwards}
.h-district.show b{animation:ds-in .7s var(--ease)}
.h-district.show i{animation:ds-bar 3.4s var(--ease) forwards}
@keyframes ds-life{0%{opacity:0}10%{opacity:1}82%{opacity:1}100%{opacity:0}}
@keyframes ds-in{from{letter-spacing:.2em;opacity:0}}
@keyframes ds-bar{0%{width:0}25%{width:180px}100%{width:220px}}

/* ================================================================= shell layers */
#ui-layers{position:fixed;inset:0;z-index:50;pointer-events:none}
.ui-layer{position:absolute;inset:0;pointer-events:auto;color:var(--ink);font-family:var(--sans);user-select:none}
.ui-layer.ui-out{animation:ui-out .18s ease-in forwards;pointer-events:none}
@keyframes ui-out{to{opacity:0}}
.ui-scr{animation:ui-in .22s ease-out}
#ui-fade{position:fixed;inset:0;z-index:90;background:#05060a;opacity:0;pointer-events:none;transition:opacity .32s ease;display:flex;align-items:flex-end;justify-content:flex-start;padding:0 0 7vh 6vw}
#ui-fade.on{opacity:1;pointer-events:auto}
#ui-fade .lbl{font:italic 900 34px/1 var(--cond);letter-spacing:.06em;text-transform:uppercase;color:var(--ink);opacity:.9}
#ui-fade .lbl:not(:empty):after{content:'';display:block;margin-top:12px;width:180px;height:3px;background:linear-gradient(90deg,var(--acc),transparent);animation:ld 1s linear infinite;transform:skewX(-20deg)}
@keyframes ld{0%{background-position:-180px 0}100%{background-position:180px 0}}
body.ui-modal canvas{cursor:default}
.focus{outline:none}

/* ================================================================= pause / festival menu */
.mn{display:flex;flex-direction:column;padding:34px 56px 26px;box-sizing:border-box;animation:ui-in .24s ease-out}
.mn-bg{position:absolute;inset:0;z-index:-1;background:linear-gradient(100deg,rgba(6,7,12,.94) 0%,rgba(6,7,12,.84) 45%,rgba(10,8,18,.74) 100%);backdrop-filter:blur(16px) saturate(1.15);overflow:hidden}
.mn-bg:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.018) 0 2px,transparent 2px 9px)}
.mn-bg i{position:absolute;left:-12vw;bottom:-30vh;width:52vw;height:90vh;background:linear-gradient(180deg,rgba(255,46,126,.0),rgba(255,46,126,.16));transform:skewX(-24deg)}
.mn-bg:after{content:'';position:absolute;right:-8vw;top:-20vh;width:28vw;height:60vh;background:linear-gradient(0deg,rgba(143,123,255,0),rgba(143,123,255,.1));transform:skewX(-24deg)}
.mn-top{display:flex;align-items:center;gap:34px;padding-bottom:18px;border-bottom:1px solid var(--faint)}
.mn-brand b{display:block;font:italic 900 34px/.85 var(--cond);letter-spacing:.01em}
.mn-brand b i{font-style:normal;color:var(--acc)}
.mn-brand small{display:block;margin-top:5px;font:700 9.5px/1 var(--sans);letter-spacing:.3em;text-transform:uppercase;color:var(--dim)}
.mn-tabs{flex:1;display:flex;align-items:center;gap:10px;min-width:0}
.mn-strip{position:relative;display:flex;gap:4px;overflow:hidden;min-width:0;flex:0 1 auto}
.mn-tab{display:flex;align-items:center;gap:8px;padding:10px 16px 12px;flex:none;border:0;background:none;color:var(--dim);cursor:pointer;font:italic 800 23px/1 var(--cond);letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;transition:color .15s}
.mn-tab:hover{color:var(--ink)}
.mn-tab.on{color:var(--ink)}
.mn-tab .ic{opacity:.8}
.mn-strip.tight .mn-tab{padding:10px 10px 12px;font-size:20px}.mn-strip.tighter .mn-tab .ic{display:none}.mn-strip.tighter .mn-tab{padding:10px 8px 12px;font-size:19px}
.mn-tab.on .ic{color:var(--acc);opacity:1}
.mn-ink{position:absolute;left:0;bottom:0;height:4px;background:var(--acc);transform-origin:left;transition:transform .28s var(--ease),width .28s var(--ease);clip-path:polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)}
.mn-bump{cursor:pointer;display:flex}
.mn-bump kbd{margin:0;opacity:.85}
.mn-stats{display:flex;align-items:center;gap:16px}
.mn-lvl{display:flex;flex-direction:column;align-items:center;justify-content:center;width:46px;height:50px;background:var(--acc);clip-path:polygon(50% 0,100% 24%,100% 76%,50% 100%,0 76%,0 24%)}
.mn-lvl i{font:800 8.5px/1 var(--sans);font-style:normal;letter-spacing:.14em}
.mn-lvl b{font:italic 900 24px/.9 var(--cond)}
.mn-xp{width:170px}
.mn-xpt{display:flex;justify-content:space-between;font:700 11px/1 var(--sans);letter-spacing:.12em;color:var(--dim);margin-bottom:6px}
.mn-xpt em{font-style:normal;color:var(--ink);letter-spacing:.02em}
.mn-xp .ui-bar{height:4px;transform:skewX(-20deg)}.mn-xp .ui-bar i{background:linear-gradient(90deg,#8f7bff,#c8b9ff)}
.mn-cash{font:italic 900 34px/1 var(--cond)}
.mn-body{position:relative;flex:1;min-height:0;margin-top:22px}
.mn-page{display:none;position:absolute;inset:0;overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent}
.mn-page.on{display:block;animation:pg-in .3s var(--ease)}
@keyframes pg-in{from{opacity:0;transform:translateX(18px)}}
.mn-foot{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-top:16px;margin-top:16px;border-top:1px solid var(--faint)}
.mn-hints{display:flex;gap:22px;font:700 12.5px/1 var(--sans);color:var(--dim);letter-spacing:.02em}
.mn-hints span{display:flex;align-items:center}
.mn-info{display:flex;gap:18px;font:700 11px/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.mn-info span+span:before{content:'';display:inline-block;width:5px;height:5px;margin:0 12px 2px 0;background:var(--acc);transform:rotate(45deg)}

/* shared menu widgets */
.mw-h{margin:0 0 4px;font:italic 900 52px/.9 var(--cond);text-transform:uppercase;letter-spacing:.005em}
.mw-k{font:800 11px/1 var(--sans);letter-spacing:.28em;text-transform:uppercase;color:var(--acc)}
.mw-p{margin:8px 0 0;font:500 14.5px/1.55 var(--sans);color:var(--dim);max-width:640px}
.mw-tile{position:relative;display:flex;flex-direction:column;justify-content:flex-end;min-height:120px;padding:16px 18px;box-sizing:border-box;cursor:pointer;background:var(--ui-glass,rgba(255,255,255,.06));
  box-shadow:inset 0 0 0 1px var(--faint);transition:transform .14s var(--ease),box-shadow .14s,background .14s;overflow:hidden;border:0;color:var(--ink);text-align:left;font-family:var(--sans)}
.mw-tile:hover,.mw-tile.focus{transform:translateY(-3px);background:rgba(255,46,126,.12);box-shadow:inset 0 0 0 3px var(--acc),0 12px 30px rgba(0,0,0,.35)}
.mw-tile .t{font:italic 800 27px/1 var(--cond);text-transform:uppercase}
.mw-tile .s{margin-top:5px;font:500 12.5px/1.4 var(--sans);color:var(--dim)}
.mw-tile .ic-big{position:absolute;right:14px;top:12px;opacity:.9;color:var(--acc)}
.mw-tile .tag{position:absolute;left:16px;top:14px;font:800 10px/1 var(--sans);letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
.mw-tile.locked{opacity:.5}
.mw-btn{display:flex;align-items:center;gap:12px;width:100%;padding:15px 20px;border:0;cursor:pointer;background:rgba(255,255,255,.05);color:var(--ink);font:italic 800 25px/1 var(--cond);letter-spacing:.02em;text-transform:uppercase;text-align:left;
  box-shadow:inset 0 0 0 1px var(--faint);transition:background .12s,box-shadow .12s,padding .14s var(--ease)}
.mw-btn:hover,.mw-btn.focus{background:rgba(255,46,126,.16);box-shadow:inset 4px 0 0 var(--acc);padding-left:28px}
.mw-btn small{display:block;margin-top:4px;font:500 12.5px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--dim)}
.mw-btn .ic{color:var(--acc)}
.mw-btn.danger .ic{color:var(--bad)}
.mw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.mw-stat{padding:14px 16px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--faint)}
.mw-stat i{display:block;font:800 10px/1 var(--sans);font-style:normal;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
.mw-stat b{display:block;margin-top:8px;font:italic 900 34px/1 var(--cond);font-variant-numeric:tabular-nums}

/* settings */
.st{display:grid;grid-template-columns:230px minmax(0,1fr) 300px;gap:34px;height:100%}
.st-cats{display:flex;flex-direction:column;gap:4px}
.st-cat{display:flex;align-items:center;gap:10px;padding:12px 14px;border:0;background:none;color:var(--dim);cursor:pointer;font:italic 800 22px/1 var(--cond);text-transform:uppercase;text-align:left;transition:color .12s,background .12s}
.st-cat.on{color:var(--ink);background:rgba(255,255,255,.05);box-shadow:inset 3px 0 0 var(--acc)}
.st-cat.focus{color:var(--ink);background:rgba(255,46,126,.14);box-shadow:inset 3px 0 0 var(--acc)}
.st-rows{overflow:auto;padding-right:6px;scrollbar-width:thin}
.st-sec{margin:18px 0 8px;font:800 11px/1 var(--sans);letter-spacing:.26em;text-transform:uppercase;color:var(--acc)}
.st-sec:first-child{margin-top:4px}
.st-row{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:52px;padding:0 16px;margin-bottom:3px;background:rgba(255,255,255,.035);cursor:pointer;transition:background .12s,box-shadow .12s}
.st-row>span{font:600 14.5px/1.2 var(--sans)}
.st-row.focus,.st-row:hover{background:rgba(255,46,126,.13);box-shadow:inset 3px 0 0 var(--acc)}
.st-val{display:flex;align-items:center;gap:12px;min-width:250px;justify-content:flex-end}
.st-val .ar{opacity:.35;cursor:pointer;padding:4px;display:flex}
.st-row.focus .st-val .ar{opacity:1;color:var(--acc)}
.st-val b{min-width:130px;text-align:center;font:italic 800 21px/1 var(--cond);text-transform:uppercase}
.st-dots{display:flex;gap:4px;justify-content:center;margin-top:5px}
.st-dots i{width:14px;height:3px;background:rgba(255,255,255,.2)}.st-dots i.on{background:var(--acc)}
.st-slide{position:relative;width:170px;height:6px;background:rgba(255,255,255,.14);cursor:pointer;transform:skewX(-20deg)}
.st-slide i{position:absolute;left:0;top:0;bottom:0;background:var(--acc)}
.st-num{min-width:44px;text-align:right;font:italic 800 21px/1 var(--cond);font-variant-numeric:tabular-nums}
.st-act{justify-content:center}.st-act>span{font:italic 800 20px/1 var(--cond);text-transform:uppercase;letter-spacing:.04em}
.st-help{padding:18px 20px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--faint);align-self:start}
.st-help h4{margin:0 0 8px;font:italic 800 26px/1 var(--cond);text-transform:uppercase}
.st-help p{margin:0;font:500 13.5px/1.55 var(--sans);color:var(--dim)}
.st-keys{display:grid;grid-template-columns:1fr auto auto;gap:0 18px}
.st-keys div{display:contents}
.st-keys span{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);font:500 14px/1.3 var(--sans)}
.st-keys span:nth-child(3n+2),.st-keys span:nth-child(3n){text-align:right;white-space:nowrap}
.st-keys .h{font:800 10px/1 var(--sans);letter-spacing:.22em;text-transform:uppercase;color:var(--acc)}
.st-lic{font:500 13.5px/1.6 var(--sans);color:var(--dim)}
.st-lic h1,.st-lic h2,.st-lic h3{font:italic 800 24px/1.1 var(--cond);text-transform:uppercase;color:var(--ink);margin:16px 0 8px}
.st-lic li{margin:3px 0}.st-lic a{color:var(--ink)}.st-lic code{font:600 12px var(--sans);background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;color:var(--ink)}
.st-lic strong{color:var(--ink)}

/* festival tab */
.fx{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:28px}
.fx-hero{position:relative;padding:26px 28px;min-height:190px;background:linear-gradient(120deg,rgba(255,46,126,.28),rgba(143,123,255,.12) 60%,rgba(255,255,255,.03));box-shadow:inset 0 0 0 1px var(--faint);overflow:hidden}
.fx-hero:after{content:'';position:absolute;right:-60px;top:-40px;width:220px;height:320px;background:rgba(255,255,255,.05);transform:skewX(-24deg)}
.fx-list{display:flex;flex-direction:column;gap:6px}
.fx-ev{display:flex;align-items:center;gap:14px;padding:12px 16px;cursor:pointer;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--faint);border:0;color:var(--ink);text-align:left;width:100%;font-family:var(--sans)}
.fx-ev.focus,.fx-ev:hover{background:rgba(255,46,126,.14);box-shadow:inset 3px 0 0 var(--acc)}
.fx-ev .bd{flex:none;width:36px;height:36px;display:grid;place-items:center;background:var(--c);color:#0b0c10;clip-path:circle(50%)}
.fx-ev .tx{flex:1;min-width:0}.fx-ev .tx b{display:block;font:italic 800 21px/1 var(--cond);text-transform:uppercase}.fx-ev .tx span{font:500 12px/1.3 var(--sans);color:var(--dim)}
.fx-ev em{font:italic 800 18px/1 var(--cond);font-style:italic;color:var(--dim);white-space:nowrap}
.cars-grid .ui-pi{font-size:15px}

/* ================================================================= big map */
.bm{position:absolute;inset:0;overflow:hidden;background:#0b1721;cursor:grab}
.bm:active{cursor:grabbing}
.bm-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
.bm-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% 50%,transparent 55%,rgba(4,6,10,.55));box-shadow:inset 0 120px 120px -80px rgba(4,6,10,.8),inset 0 -110px 110px -80px rgba(4,6,10,.8)}
.bm-head{position:absolute;left:44px;right:44px;top:30px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;pointer-events:none}
.bm-title small{display:block;font:800 11px/1 var(--sans);letter-spacing:.3em;text-transform:uppercase;color:var(--acc)}
.bm-title b{display:block;margin-top:6px;font:italic 900 56px/.86 var(--cond);text-transform:uppercase;text-shadow:0 4px 20px rgba(0,0,0,.5)}
.bm-disc{display:flex;align-items:center;gap:8px;margin-top:10px;font:700 11px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.bm-disc:empty{display:none}.bm-disc b{color:var(--ink);font:italic 800 18px/1 var(--cond)}
.bm-filters{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end;pointer-events:auto;max-width:calc(100% - 380px)}
.bm-chip{display:flex;align-items:center;gap:6px;padding:7px 10px;border:0;cursor:pointer;background:rgba(10,11,17,.72);backdrop-filter:blur(8px);color:var(--dim);font:italic 800 15px/1 var(--cond);text-transform:uppercase;letter-spacing:.03em;
  box-shadow:inset 0 0 0 1px var(--faint);transition:background .12s,color .12s}
.bm-chip em{font:700 10px/1 var(--sans);font-style:normal;padding:2px 5px;background:rgba(255,255,255,.1);border-radius:8px}
.bm-chip.on{color:var(--ink);box-shadow:inset 0 -3px 0 var(--acc),inset 0 0 0 1px var(--faint)}
.bm-chip.on .ic{color:var(--acc)}
.bm-chip:hover{background:rgba(255,46,126,.16)}
.bm-reticle{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;pointer-events:none;opacity:0;transition:opacity .2s}
.bm-reticle.on{opacity:1}
.bm-reticle:before,.bm-reticle:after{content:'';position:absolute;background:rgba(246,243,238,.85)}
.bm-reticle:before{left:22px;top:0;width:2px;height:46px;clip-path:polygon(0 0,100% 0,100% 30%,0 30%,0 70%,100% 70%,100% 100%,0 100%)}
.bm-reticle:after{top:22px;left:0;height:2px;width:46px;clip-path:polygon(0 0,30% 0,30% 100%,0 100%,0 0,70% 0,100% 0,100% 100%,70% 100%)}
.bm-reticle i{position:absolute;inset:14px;border:2px solid var(--acc);border-radius:50%}
.bm-card{position:absolute;left:0;top:0;width:320px;padding:14px 18px 14px;background:rgba(10,11,17,.9);backdrop-filter:blur(10px);box-shadow:inset 3px 0 0 var(--c,var(--acc)),0 16px 40px rgba(0,0,0,.45);
  pointer-events:none;opacity:0;transition:opacity .15s;will-change:transform}
.bm-card.on{opacity:1}
.bm-k{display:flex;align-items:center;gap:7px;font:800 10.5px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--c,var(--acc))}
.bm-k em{margin-left:auto;font:italic 800 16px/1 var(--cond);letter-spacing:.04em;color:var(--dim);font-style:italic}
.bm-card h3{margin:8px 0 2px;font:italic 900 30px/.95 var(--cond);text-transform:uppercase}
.bm-meta{margin-top:5px;font:700 11.5px/1.3 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--acc2)}
.bm-card p{margin:7px 0 0;font:500 13px/1.45 var(--sans);color:var(--dim)}
.bm-acts{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;padding-top:10px;border-top:1px solid var(--faint);font:700 12px/1 var(--sans)}
.bm-acts span{display:flex;align-items:center}.bm-acts span.off{opacity:.4}
.bm-scale{position:absolute;left:46px;bottom:34px;display:flex;flex-direction:column;gap:5px;pointer-events:none}
.bm-scale i{height:5px;border:2px solid rgba(246,243,238,.8);border-top:0}
.bm-scale span{font:700 11px/1 var(--sans);letter-spacing:.16em;color:var(--dim)}
.bm-list{position:absolute;left:44px;top:120px;bottom:90px;width:300px;overflow-y:auto;display:none;padding:10px 0;background:rgba(10,11,17,.82);backdrop-filter:blur(10px);pointer-events:auto}
.bm-list.on{display:block}.bm-list h4{margin:0 14px 8px;font:italic 900 22px/1 var(--cond);text-transform:uppercase;color:var(--ink)}.bm-list h4 em{font:700 11px/1 var(--sans);color:var(--dim);font-style:normal}
.bm-li{display:flex;align-items:center;gap:8px;padding:6px 14px;cursor:pointer;font:600 13px/1.2 var(--sans);color:var(--ink)}.bm-li:hover{background:rgba(255,46,126,.16)}
.bm-li span{flex:1}.bm-li em{font:700 11px/1 var(--sans);font-style:normal;color:var(--dim)}.bm-li button{border:0;padding:4px 8px;background:rgba(255,255,255,.1);color:var(--ink);font:italic 800 13px/1 var(--cond);text-transform:uppercase;cursor:pointer}
.bm-li button:hover{background:var(--acc)}
.bm-foot{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);display:flex;gap:20px;padding:10px 18px;background:rgba(10,11,17,.72);backdrop-filter:blur(8px);font:700 12px/1 var(--sans);color:var(--dim);white-space:nowrap;pointer-events:none}
.bm-foot span{display:flex;align-items:center}
.bm.embedded{inset:0;box-shadow:inset 0 0 0 1px var(--faint)}
.bm.embedded .bm-head{top:22px;left:26px;right:26px}.bm.embedded .bm-title b{font-size:42px}
.bm.embedded .bm-foot{bottom:18px}.bm.embedded .bm-scale{left:26px;bottom:22px}

/* ================================================================= legacy classes (interiors, older screens) */
.hb-overlay{position:fixed;inset:0;z-index:40;background:linear-gradient(100deg,rgba(6,7,12,.93),rgba(6,7,12,.8) 55%,rgba(10,8,18,.72));backdrop-filter:blur(14px) saturate(1.15);color:var(--ink);font-family:var(--sans);display:flex;align-items:center;justify-content:center;animation:ui-in .24s ease-out}
@keyframes fin{from{opacity:0}}
.hb-panel{width:min(980px,92vw);max-height:88vh;overflow:auto;scrollbar-width:thin}
.hb-panel h2{margin:0 0 4px;font:italic 900 60px/.92 var(--cond);letter-spacing:.005em;text-transform:uppercase}
.hb-panel h2 i{font-style:normal;color:var(--acc)}
.hb-sub{margin:0 0 24px;font:500 14px/1.5 var(--sans);color:var(--dim);letter-spacing:.01em}
.hb-menu{display:flex;flex-direction:column;gap:5px;max-width:440px}
.hb-btn{pointer-events:auto;text-align:left;border:0;cursor:pointer;background:rgba(255,255,255,.05);color:var(--ink);padding:14px 18px;font:italic 800 23px/1 var(--cond);letter-spacing:.02em;text-transform:uppercase;
  transition:background .12s,box-shadow .12s,padding .14s var(--ease);box-shadow:inset 0 0 0 1px var(--faint)}
.hb-btn:hover,.hb-btn.sel{background:rgba(255,46,126,.16);box-shadow:inset 4px 0 0 var(--acc);padding-left:26px}
.hb-btn small{display:block;margin-top:4px;font:500 12.5px/1.3 var(--sans);letter-spacing:.01em;text-transform:none;color:var(--dim)}
.hb-btn[disabled]{opacity:.45;cursor:default}
.hb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.hb-card{pointer-events:auto;cursor:pointer;background:rgba(255,255,255,.05);padding:14px 16px;box-shadow:inset 0 0 0 1px var(--faint);transition:box-shadow .12s,background .12s,transform .14s var(--ease)}
.hb-card:hover,.hb-card.sel,.hb-card.focus{box-shadow:inset 0 0 0 3px var(--acc);background:rgba(255,46,126,.1);transform:translateY(-2px)}
.hb-card .cls{display:inline-block;padding:3px 8px;font:italic 800 14px/1.1 var(--cond);letter-spacing:.06em;background:var(--acc);color:#111}
.hb-card .cls.S{background:#b04cf0;color:#fff}.hb-card .cls.A{background:#ff3b4e;color:#fff}.hb-card .cls.B{background:#ff8a1d}.hb-card .cls.C{background:#f7d51d}.hb-card .cls.D{background:#3bc4f4}
.hb-card h3{margin:8px 0 4px;font:italic 800 25px/1 var(--cond);text-transform:uppercase}
.hb-card .stat{display:flex;justify-content:space-between;font:500 12.5px/1.8 var(--sans);color:var(--dim)}
.hb-card .price{margin-top:8px;font:italic 800 21px/1 var(--cond);color:var(--acc2)}
.hb-card.owned .price{color:var(--good)}
.hb-card.locked{opacity:.55}
.hb-row{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);font:500 14px/1.3 var(--sans)}
.hb-row select,.hb-row input{pointer-events:auto;background:#1b1f2a;color:var(--ink);border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:6px 8px;font:500 14px var(--sans)}
.hb-keys{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 36px;font:500 14px/1.9 var(--sans)}
.hb-keys div{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.06)}
.hb-keys span{color:var(--dim)}

/* ================================================================= loading + title */
#boot{position:fixed;inset:0;z-index:100;background:#07080c;color:var(--ink);font-family:var(--sans);display:flex;flex-direction:column;justify-content:flex-end;padding:0 6vw 7vh;transition:opacity .8s}
#boot.out{opacity:0;pointer-events:none}
#boot .logo{font:italic 900 clamp(70px,13vw,190px)/.8 var(--cond);letter-spacing:-.01em}
#boot .logo i{font-style:normal;color:var(--acc)}
#boot .tag{margin:14px 0 36px;font:700 clamp(14px,1.4vw,20px)/1 var(--cond);letter-spacing:.5em;text-transform:uppercase;color:var(--dim)}
#boot .bar{height:3px;background:rgba(255,255,255,.12);max-width:560px;overflow:hidden;transform:skewX(-20deg)}
#boot .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8f7bff,var(--acc));transition:width .3s}
#boot .stage{margin-top:12px;font:600 12px/1 var(--sans);letter-spacing:.24em;text-transform:uppercase;color:var(--dim)}
#boot .bg{position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 70% 30%,rgba(255,46,126,.2),transparent 55%),radial-gradient(ellipse at 20% 80%,rgba(143,123,255,.12),transparent 60%),#07080c}
#boot .gg{position:absolute;right:4vw;bottom:0;width:min(58vw,820px);opacity:.9;z-index:-1}
#title{position:fixed;inset:0;z-index:30;pointer-events:none;color:var(--ink);font-family:var(--sans);display:flex;flex-direction:column;justify-content:flex-end;padding:0 6vw 9vh;background:linear-gradient(0deg,rgba(5,6,10,.8),rgba(5,6,10,0) 58%)}
#title .logo{font:italic 900 clamp(70px,12vw,180px)/.8 var(--cond);letter-spacing:-.01em;text-shadow:0 10px 40px rgba(0,0,0,.4)}
#title .logo i{font-style:normal;color:var(--acc)}
#title .tag{margin:14px 0 28px;font:700 clamp(14px,1.4vw,20px)/1 var(--cond);letter-spacing:.5em;text-transform:uppercase;color:var(--ink);opacity:.8}
#title .press{font:italic 800 22px/1 var(--cond);letter-spacing:.3em;text-transform:uppercase;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
#title .menu{pointer-events:auto;flex-direction:row!important;flex-wrap:wrap;max-width:none!important;gap:10px!important;margin-bottom:26px!important}
#title .modebtn{width:min(300px,28vw);min-height:128px;display:flex;flex-direction:column;justify-content:flex-end;padding:18px 22px!important;font:italic 900 40px/.9 var(--cond);
  background:rgba(10,11,17,.58);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--faint);clip-path:polygon(14px 0,100% 0,calc(100% - 14px) 100%,0 100%);transition:background .15s,transform .2s var(--ease)}
#title .modebtn small{font-size:12.5px;line-height:1.4;margin-top:8px}
#title .modebtn:hover{background:rgba(255,46,126,.3);padding-left:22px!important}
#title .modebtn.sel{background:var(--acc);color:#fff;box-shadow:none;transform:translateY(-4px)}
#title .modebtn.sel small{color:rgba(255,255,255,.88)}
`;
