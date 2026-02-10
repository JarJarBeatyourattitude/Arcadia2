"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Game = {
  id: number;
  title: string;
  description: string;
  prompt: string;
  code: string;
  created_at: string;
};

export default function GamePage({ params }: { params: { id: string } }) {
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  function withAIHelper(code: string) {
    const wsUrl = API.replace("http://", "ws://").replace("https://", "wss://");
    const helper = `
<script>
window.GameFactoryAI = async function(prompt, system, timeoutMs=8000){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch("${API}/ai", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ prompt, system }),
      signal: controller.signal
    });
    const data = await res.json();
    return data.content || "";
  } finally {
    clearTimeout(timer);
  }
};
window.GameFactoryMultiplayer = function(roomId){
  const ws = new WebSocket("${wsUrl}/ws/" + encodeURIComponent(roomId || "lobby"));
  const handlers = [];
  ws.onmessage = (evt) => {
    handlers.forEach((fn) => fn(evt.data));
  };
  return {
    send: (data) => {
      if (ws.readyState === 1) ws.send(typeof data === "string" ? data : JSON.stringify(data));
    },
    onMessage: (fn) => handlers.push(fn),
    disconnect: () => ws.close()
  };
};
window.GameFactoryKit = (function(){
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const map = (v,inMin,inMax,outMin,outMax)=>outMin+(outMax-outMin)*((v-inMin)/(inMax-inMin));
  const rand = (min=0,max=1)=>Math.random()*(max-min)+min;
  const choice = (arr)=>arr[Math.floor(Math.random()*arr.length)];
  const now = ()=>performance.now();
  const easing = {
    linear:t=>t,
    inQuad:t=>t*t,
    outQuad:t=>t*(2-t),
    inOutQuad:t=>t<0.5?2*t*t:-1+(4-2*t)*t
  };
  const tween = (obj, prop, to, duration, ease=easing.inOutQuad) => {
    const from = obj[prop];
    const start = now();
    return new Promise((resolve)=>{
      function tick(){
        const t = Math.min(1, (now()-start)/duration);
        obj[prop] = from + (to-from)*ease(t);
        if (t<1) requestAnimationFrame(tick); else resolve(true);
      }
      tick();
    });
  };
  const storage = {
    save:(key,val)=>localStorage.setItem(key,JSON.stringify(val)),
    load:(key,def=null)=>{ try{const v=localStorage.getItem(key); return v?JSON.parse(v):def;}catch{return def;} },
    slotSave:(slot,val)=>localStorage.setItem("gf_slot_"+slot,JSON.stringify(val)),
    slotLoad:(slot,def=null)=>{ try{const v=localStorage.getItem("gf_slot_"+slot); return v?JSON.parse(v):def;}catch{return def;} }
  };
  const input = (function(){
    const keys = {};
    const mouse = {x:0,y:0,down:false};
    window.addEventListener('keydown',e=>keys[e.key]=true);
    window.addEventListener('keyup',e=>keys[e.key]=false);
    window.addEventListener('mousemove',e=>{mouse.x=e.clientX; mouse.y=e.clientY;});
    window.addEventListener('mousedown',()=>mouse.down=true);
    window.addEventListener('mouseup',()=>mouse.down=false);
    return { keys, mouse, isDown:(k)=>!!keys[k] };
  })();
  const audio = (function(){
    let ctx;
    const ensure=()=>ctx||(ctx=new (window.AudioContext||window.webkitAudioContext)());
    const beep=(freq=440,dur=0.1,type='sine',vol=0.2)=>{
      if (dur > 5) dur = dur / 1000;
      const c=ensure();
      const o=c.createOscillator(); const g=c.createGain();
      o.type=type; o.frequency.value=freq;
      const t=c.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t+dur+0.02);
    };
    return { beep };
  })();
  const physics2d = {
    step:(obj,dt)=>{ obj.vx=(obj.vx||0)+(obj.ax||0)*dt; obj.vy=(obj.vy||0)+(obj.ay||0)*dt; obj.x+=obj.vx*dt; obj.y+=obj.vy*dt; },
    aabb:(a,b)=>a.x<a.w+b.x&&a.x+a.w>b.x&&a.y<a.h+b.y&&a.y+a.h>b.y,
    circle:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<(a.r+b.r)
  };
  const cooldown = (function(){
    const map = new Map();
    const ready=(key,ms)=>{ const t=now(); if(!map.has(key)||t-map.get(key)>=ms){ map.set(key,t); return true;} return false; };
    return { ready };
  })();
  const timers = (function(){
    const list=[];
    const after=(ms,fn)=>{ const t=now()+ms; list.push({t,fn}); };
    const tick=()=>{ const t=now(); for(let i=list.length-1;i>=0;i--){ if(t>=list[i].t){ list[i].fn(); list.splice(i,1);} } };
    return { after, tick };
  })();
  const particles = (function(){
    const list=[];
    const spawn=(x,y,count=20)=>{ for(let i=0;i<count;i++){ list.push({x,y,vx:rand(-1,1),vy:rand(-1,1),life:rand(0.4,1)});} };
    const update=(dt)=>{ for(const p of list){ p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.life-=dt; } };
    const draw=(ctx)=>{ for(const p of list){ if(p.life<=0) continue; ctx.globalAlpha=Math.max(0,p.life); ctx.fillRect(p.x,p.y,2,2);} ctx.globalAlpha=1; };
    const prune=()=>{ for(let i=list.length-1;i>=0;i--){ if(list[i].life<=0) list.splice(i,1);} };
    return { spawn, update, draw, prune, list };
  })();
  const pseudo3d = {
    project:(pt,cam)=>{ const z=pt.z-(cam.z||0); const scale=(cam.fov||400)/(z||1); return { x:(pt.x-(cam.x||0))*scale+(cam.cx||0), y:(pt.y-(cam.y||0))*scale+(cam.cy||0), scale }; }
  };
  const color = {
    hexToRgb:(hex)=>{ const h=hex.replace('#',''); const bigint=parseInt(h,16); return {r:(bigint>>16)&255,g:(bigint>>8)&255,b:bigint&255}; },
    rgbToHex:(r,g,b)=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''),
    lerp:(a,b,t)=>({ r:Math.round(a.r+(b.r-a.r)*t), g:Math.round(a.g+(b.g-a.g)*t), b:Math.round(a.b+(b.b-a.b)*t) })
  };
  const text = {
    wrap:(ctx,text,maxWidthOrX,y,maybeW,maybeLineH)=>{
      if (typeof maxWidthOrX === 'number' && typeof y === 'number' && typeof maybeW === 'number') {
        const x = maxWidthOrX;
        const maxW = maybeW;
        const lineH = typeof maybeLineH === 'number' ? maybeLineH : 18;
        const lines = textWrap(ctx, text, maxW);
        lines.forEach((ln,i)=>ctx.fillText(ln,x,y+i*lineH));
        return lines;
      }
      return textWrap(ctx, text, maxWidthOrX);
    }
  };
  function textWrap(ctx, txt, maxWidth){
    const words=String(txt||'').split(' '); let line=''; const lines=[];
    for(const w of words){ const test=line+w+' '; if(ctx.measureText(test).width>maxWidth){ lines.push(line.trim()); line=w+' '; } else { line=test; } }
    lines.push(line.trim()); return lines;
  }
  const rng = (function(){
    let seed = 1234567;
    const setSeed = (s)=>{ seed = s>>>0; };
    const next = ()=>{ seed = (seed*1664525+1013904223)>>>0; return seed/4294967296; };
    return { setSeed, next };
  })();
  const eventBus = (function(){
    const map=new Map();
    const on=(evt,fn)=>{ if(!map.has(evt)) map.set(evt,[]); map.get(evt).push(fn); };
    const emit=(evt,data)=>{ (map.get(evt)||[]).forEach(fn=>fn(data)); };
    return { on, emit };
  })();
  const fsm = (initial)=>{ let state=initial; const transitions=new Map(); const on=(from,to,fn)=>transitions.set(from+'>'+to,fn); const set=(to)=>{ const fn=transitions.get(state+'>'+to); state=to; if(fn) fn(); }; const get=()=>state; return { on, set, get }; };
  const sprites = {
    draw:(ctx,img,frame,fw,fh,x,y,scale=1)=>{ const sx=frame*fw; ctx.drawImage(img,sx,0,fw,fh,x,y,fw*scale,fh*scale); }
  };
  const pathfinding = {
    aStar:(grid,start,end)=>{ const open=[start]; const came=new Map(); const g=new Map(); const f=new Map(); const key=(p)=>p.x+','+p.y; const h=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y); g.set(key(start),0); f.set(key(start),h(start,end)); while(open.length){ open.sort((a,b)=>f.get(key(a))-f.get(key(b))); const current=open.shift(); if(current.x===end.x&&current.y===end.y){ const path=[current]; let k=key(current); while(came.has(k)){ const p=came.get(k); path.push(p); k=key(p); } return path.reverse(); } const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]; for(const d of dirs){ const nx={x:current.x+d.x,y:current.y+d.y}; if(grid[nx.y]?.[nx.x]===1) continue; const tentative=(g.get(key(current))||0)+1; const nk=key(nx); if(tentative < (g.get(nk)??Infinity)){ came.set(nk,current); g.set(nk,tentative); f.set(nk,tentative+h(nx,end)); if(!open.find(p=>p.x===nx.x&&p.y===nx.y)) open.push(nx); } } } return []; }
  };
  const navmesh = {
    build:(grid,diag=false)=>({ grid, diag }),
    neighbors:(mesh,node)=>{ const dirs=mesh.diag?[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:1},{x:1,y:-1},{x:-1,y:-1}]:[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]; return dirs.map(d=>({x:node.x+d.x,y:node.y+d.y})).filter(n=>mesh.grid[n.y]?.[n.x]!==1); },
    lineOfSight:(mesh,a,b)=>{ let x0=a.x,y0=a.y,x1=b.x,y1=b.y; const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0); let sx=x0<x1?1:-1, sy=y0<y1?1:-1; let err=dx-dy; while(true){ if(mesh.grid[y0]?.[x0]===1) return false; if(x0===x1 && y0===y1) break; const e2=2*err; if(e2>-dy){ err-=dy; x0+=sx; } if(e2<dx){ err+=dx; y0+=sy; } } return true; },
    smooth:(path,mesh)=>{ if(path.length<=2) return path; const out=[path[0]]; let i=0; while(i<path.length-1){ let j=path.length-1; for(;j>i+1;j--){ if(navmesh.lineOfSight(mesh,path[i],path[j])) break; } out.push(path[j]); i=j; } return out; },
    findPath:(mesh,start,end)=>{ const p=pathfinding.aStar(mesh.grid,start,end); return navmesh.smooth(p,mesh); }
  };
  const levelGrammar = {
    expand:(rules,axiom,depth=3)=>{ let str=axiom; for(let i=0;i<depth;i++){ let out=""; for(const ch of str){ const rule=rules[ch]; if(!rule){ out+=ch; continue; } if(Array.isArray(rule)){ const pick=rule[Math.floor(Math.random()*rule.length)]; out+=pick; } else if(typeof rule==='object'){ const entries=Object.entries(rule); const total=entries.reduce((s,[,w])=>s+Number(w||0),0); let r=Math.random()*total; for(const [sym,w] of entries){ r-=Number(w||0); if(r<=0){ out+=sym; break; } } } else { out+=String(rule); } } str=out; } return str; },
    toGrid:(str,w,wall='#')=>{ const rows=[]; for(let i=0;i<str.length;i+=w){ rows.push(str.slice(i,i+w).split("").map(c=>c===wall?1:0)); } return rows; },
    interpret:(str,handlers)=>{ const state={ x:0,y:0,dir:0,stack:[] }; for(const ch of str){ if(handlers[ch]) handlers[ch](state); } return state; }
  };
  const audioSeq = (function(){
    let ctx;
    const ensure=()=>ctx||(ctx=new (window.AudioContext||window.webkitAudioContext)());
    const noteToFreq=(n)=>{ const A4=440; const map={'C':-9,'C#':-8,'D':-7,'D#':-6,'E':-5,'F':-4,'F#':-3,'G':-2,'G#':-1,'A':0,'A#':1,'B':2}; const m=n.match(/([A-G]#?)(\d)/); if(!m) return 440; const sem=map[m[1]]+(Number(m[2])-4)*12; return A4*Math.pow(2,sem/12); };
    const play=(pattern,bpm=120)=>{ const c=ensure(); const beat=60/bpm; let t=c.currentTime; for(const note of pattern){ const o=c.createOscillator(); const g=c.createGain(); o.type=note.type||'sine'; o.frequency.value=note.freq|| (note.note?noteToFreq(note.note):440); g.gain.value=note.vol||0.15; o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+(note.dur||0.2)); t+=beat*(note.beats||1); } };
    const track=(steps,bpm=120)=>{ const c=ensure(); const beat=60/bpm; const start=c.currentTime; steps.forEach((s,i)=>{ if(!s) return; const o=c.createOscillator(); const g=c.createGain(); o.type=s.type||'square'; o.frequency.value=s.freq|| (s.note?noteToFreq(s.note):440); g.gain.value=s.vol||0.1; o.connect(g); g.connect(c.destination); o.start(start+i*beat); o.stop(start+i*beat+(s.dur||0.2)); }); };
    return { play, track, noteToFreq };
  })();
  const ui = {
    button:(text, x, y, w, h, onClick)=>({ type:'button', text, x,y,w,h,onClick,hover:false }),
    slider:(label,x,y,w,min,max,value,onChange)=>({ type:'slider', label,x,y,w,h:24,min,max,value,onChange }),
    checkbox:(label,x,y,value,onChange)=>({ type:'checkbox', label,x,y,w:18,h:18,value,onChange }),
    draw:(ctx, widgets)=>{ widgets.forEach(w=>{ if(w.type==='button'){ ctx.fillStyle=w.hover?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.5)'; ctx.fillRect(w.x,w.y,w.w,w.h); ctx.fillStyle='#fff'; ctx.fillText(w.text,w.x+8,w.y+w.h/2+4); } if(w.type==='slider'){ ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(w.x,w.y,w.w,w.h); const t=(w.value-w.min)/(w.max-w.min); ctx.fillStyle='#7df9ff'; ctx.fillRect(w.x, w.y, w.w*t, w.h); ctx.fillStyle='#fff'; ctx.fillText(w.label+': '+w.value.toFixed(1), w.x+4, w.y-4); } if(w.type==='checkbox'){ ctx.strokeStyle='#fff'; ctx.strokeRect(w.x,w.y,w.w,w.h); if(w.value){ ctx.fillStyle='#7df9ff'; ctx.fillRect(w.x+3,w.y+3,w.w-6,w.h-6); } ctx.fillStyle='#fff'; ctx.fillText(w.label, w.x+w.w+6, w.y+w.h-2); } }); },
    hit:(w, mx, my)=>mx>=w.x&&mx<=w.x+w.w&&my>=w.y&&my<=w.y+w.h,
    handleClick:(widgets,mx,my)=>{ widgets.forEach(w=>{ if(ui.hit(w,mx,my)){ if(w.type==='button' && w.onClick) w.onClick(); if(w.type==='checkbox' && w.onChange){ w.value=!w.value; w.onChange(w.value); } } }); },
    handleDrag:(widgets,mx,my)=>{ widgets.forEach(w=>{ if(w.type==='slider' && ui.hit(w,mx,my)){ const t=Math.max(0,Math.min(1,(mx-w.x)/w.w)); w.value=w.min + (w.max-w.min)*t; if(w.onChange) w.onChange(w.value); } }); }
  };
  const ecs = (function(){
    let nextId=1;
    const entities=new Set();
    const components=new Map();
    const systems=[];
    const create=()=>{ const id=nextId++; entities.add(id); return id; };
    const add=(id,name,data)=>{ if(!components.has(name)) components.set(name,new Map()); components.get(name).set(id,data); return data; };
    const get=(id,name)=>components.get(name)?.get(id);
    const has=(id,name)=>components.get(name)?.has(id);
    const remove=(id)=>{ entities.delete(id); for(const map of components.values()){ map.delete(id);} };
    const query=(names)=>{ const sets=names.map(n=>components.get(n)||new Map()); return [...entities].filter(id=>names.every(n=>sets[names.indexOf(n)].has(id))); };
    const system=(names,fn)=>{ systems.push({names,fn}); };
    const update=(dt)=>{ for(const s of systems){ const ids=query(s.names); for(const id of ids){ const comps=s.names.map(n=>get(id,n)); s.fn(id, ...comps, dt); } } };
    return { create, add, get, has, remove, query, system, update, components, entities };
  })();
  const terrain = {
    perlin2:(x,y)=>{ const s=Math.sin(x*12.9898+y*78.233)*43758.5453; return s-Math.floor(s); },
    heightMap:(w,h,scale=0.1)=>{ const map=[]; for(let y=0;y<h;y++){ const row=[]; for(let x=0;x<w;x++){ row.push(terrain.perlin2(x*scale,y*scale)); } map.push(row);} return map; }
  };
  const camera = {
    shake:(state,strength=6,decay=0.9)=>{ state.shake= {strength,decay,x:0,y:0}; },
    applyShake:(state,ctx)=>{ if(!state.shake) return; state.shake.x = rand(-state.shake.strength,state.shake.strength); state.shake.y = rand(-state.shake.strength,state.shake.strength); ctx.translate(state.shake.x,state.shake.y); state.shake.strength*=state.shake.decay; if(state.shake.strength<0.3) state.shake=null; }
  };
  const webgl = {
    create:(canvas)=>canvas.getContext('webgl')||canvas.getContext('experimental-webgl')
  };
  const gamepad = (function(){
    const state={ axes:[], buttons:[] };
    const poll=()=>{ const gp=navigator.getGamepads?.()[0]; if(!gp) return state; state.axes=gp.axes; state.buttons=gp.buttons.map(b=>b.pressed); return state; };
    return { poll, state };
  })();
  const assets = {
    image:(src)=>new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=rej; img.src=src; }),
    audio:(src)=>new Promise((res,rej)=>{ const a=new Audio(); a.oncanplaythrough=()=>res(a); a.onerror=rej; a.src=src; })
  };
  const grid = {
    make:(w,h,fill=0)=>Array.from({length:h},()=>Array.from({length:w},()=>fill)),
    inBounds:(g,x,y)=>y>=0&&y<g.length&&x>=0&&x<g[0].length
  };
  const camera2d = {
    worldToScreen:(cam,x,y)=>({ x: x-cam.x, y: y-cam.y }),
    screenToWorld:(cam,x,y)=>({ x: x+cam.x, y: y+cam.y })
  };
  const metrics = (function(){
    let last=now(), fps=0;
    const tick=()=>{ const t=now(); fps=1000/(t-last); last=t; return fps; };
    return { tick, get:()=>fps };
  })();
  const logger = (function(){
    const logs=[]; const push=(msg)=>{ logs.unshift({ msg, t:now() }); if(logs.length>20) logs.pop(); };
    return { logs, push };
  })();
  const dialogue = (function(){
    const lines=[]; const say=(text)=>lines.push(text); const next=()=>lines.shift();
    return { say, next, lines };
  })();
  const timeline = (function(){
    const steps=[]; const add=(at,fn)=>steps.push({at,fn,done:false}); const run=(t)=>{ for(const s of steps){ if(!s.done && t>=s.at){ s.done=true; s.fn(); } } };
    return { add, run };
  })();
  return { clamp, lerp, map, rand, choice, now, easing, tween, storage, input, audio, physics2d, cooldown, timers, particles, pseudo3d, color, text, rng, eventBus, fsm, sprites, pathfinding, navmesh, levelGrammar, audioSeq, ui, ecs, terrain, camera, webgl, gamepad, assets, grid, camera2d, metrics, logger, dialogue, timeline };
})();
// Compatibility shims for models that don't namespace helpers
(function(){
  const K = window.GameFactoryKit;
  if (!K) return;
  window.clamp = window.clamp || K.clamp;
  window.lerp = window.lerp || K.lerp;
  window.map = window.map || K.map;
  window.rand = window.rand || K.rand;
  window.rng = window.rng || K.rng;
  window.choice = window.choice || K.choice;
  window.now = window.now || K.now;
  window.audio = window.audio || K.audio;
  window.input = window.input || K.input;
  window.storage = window.storage || K.storage;
  window.text = window.text || K.text;
  window.pseudo3d = window.pseudo3d || K.pseudo3d;
  const camState = { shake: null };
  window.camera = window.camera || {
    shake: (strength=6, decay=0.9) => K.camera.shake(camState, strength, decay),
    applyShake: (ctx) => K.camera.applyShake(camState, ctx)
  };
  window.particles = window.particles || {
    spawn: (a,b,c) => {
      if (typeof a === "object") {
        const o = a || {};
        K.particles.spawn(o.x || 0, o.y || 0, o.count || 20);
      } else {
        K.particles.spawn(a || 0, b || 0, c || 20);
      }
    },
    update: (dt) => {
      const v = dt > 10 ? dt / 1000 : dt;
      K.particles.update(v);
      K.particles.prune();
    },
    draw: (ctx) => K.particles.draw(ctx),
    prune: () => K.particles.prune()
  };
})();
</script>
`;
    if (code.includes("window.GameFactoryKit") || code.includes("GameFactoryAI = async function")) return code;
    if (code.includes("</head>")) return code.replace("</head>", `${helper}</head>`);
    return helper + code;
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/games/${params.id}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setGame(data);
      } catch (err: any) {
        setError(err.message || "Failed to load game");
      }
    }
    load();
  }, [params.id]);

  async function openFullscreen() {
    if (!previewRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await previewRef.current.requestFullscreen();
  }

  function focusPreview() {
    iframeRef.current?.contentWindow?.focus();
  }

  return (
    <main className="section">
      <Link href="/" className="badge">Back</Link>
      {error && <p style={{ color: "#ff9b9b" }}>{error}</p>}
      {!game && !error && <p>Loading...</p>}
      {game && (
        <div style={{ display: "grid", gap: 16 }}>
          <h1>{game.title}</h1>
          <p style={{ color: "#98a0b5" }}>{game.description}</p>
          <div className="preview-header">
            <div className="card-title">Play</div>
            <button className="secondary" onClick={openFullscreen}>Fullscreen</button>
          </div>
          <div className="preview" ref={previewRef} onClick={focusPreview}>
            <iframe ref={iframeRef} srcDoc={withAIHelper(game.code)} sandbox="allow-scripts" />
          </div>
          <div className="card">
            <div className="card-title">Prompt</div>
            <div className="card-meta">{game.prompt}</div>
          </div>
        </div>
      )}
    </main>
  );
}
