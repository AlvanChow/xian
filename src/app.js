/* ValueGrid v2 — refined map app */
import { WORLD } from './world.js';
import { COMPANIES, FLOWS } from './data.js';
import { FACTS } from './facts.js';

const C=COMPANIES, FL=FLOWS;
const byId=Object.fromEntries(C.map(c=>[c.id,c]));
const SEC={tech:'#5b8cff',fin:'#2dd4e8',energy:'#f5b042',health:'#3fd68a',cons:'#f472b6',ind:'#a78bfa',gov:'#e2e8f0'};
const SECNAME={tech:'Technology',fin:'Finance',energy:'Energy',health:'Healthcare',cons:'Consumer',ind:'Industrials',gov:'Government / Central Bank'};
const PCOL={R:'#3fd68a',E:'#f5b042',I:'#ff6b7a'}, PNAME={R:'Reported',E:'Estimated',I:'Inferred'};
const PERIODS=['2019','2020','2021','2022','2023','2024'], TMUL=[.62,.60,.82,.95,.97,1.0];
let sizeBy='mcap',secOn={},layerOn={R:1,E:1,I:1},tIdx=5,playing=false,live=false,selected=null,hover=null;
Object.keys(SEC).forEach(s=>secOn[s]=1);
const fmt=v=>v>=1000?'$'+(v/1000).toFixed(2)+'T':(v>=1?'$'+v.toFixed(0)+'B':'$'+(v*1000).toFixed(0)+'M');
// Revenue for the current period: real SEC-reported series where we have one
// (FACTS, generated from XBRL filings), otherwise the curated base figure
// scaled by the global year multiplier — an estimate, and labeled as such.
const hasFact=c=>{const f=FACTS[c.id];return !!(f&&f.revT&&f.revT[PERIODS[tIdx]]!=null);};
const revAt=c=>hasFact(c)?FACTS[c.id].revT[PERIODS[tIdx]]:c.rev*TMUL[tIdx];
// Display provenance: a node only earns the "Reported" tag when the figure for
// the CURRENTLY SELECTED year is backed by a filing — a series with a gap year
// degrades to E while scrubbed onto the gap, matching what revAt displays.
const nProv=c=>hasFact(c)?'R':(c.prov==='R'?'E':c.prov);
// Respect the OS "reduce motion" setting: freeze the travelling flow-dot pulse.
const reduceMotion=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---- projection (equirectangular w/ smooth view) ---- */
const map=document.getElementById('map'),mx=map.getContext('2d');
let MW=0,MH=0;
// Clamp the device-pixel-ratio: canvas fill cost scales with DPR^2, so an
// uncapped 3x display did ~9x the raster work. 2x keeps it crisp without the cliff.
let DPR=Math.min(window.devicePixelRatio||1,2);
let view={cx:10,cy:25,scale:1}, target={cx:10,cy:25,scale:1};
function pxPerDeg(){return (MW/360)*view.scale;}
function proj(lon,lat){const s=pxPerDeg();return{x:MW/2+(lon-view.cx)*s, y:MH/2-(lat-view.cy)*s*0.95};}
function unproj(x,y){const s=pxPerDeg();return{lon:view.cx+(x-MW/2)/s, lat:view.cy-(y-MH/2)/(s*0.95)};}

/* ---- filtered data ---- */
// The selected node always stays visible even if its sector is toggled off
// (search can select any node, so its pin must exist to anchor the view).
// nodeVis is the single visibility rule shared by the map AND the inspector,
// so the inspector's flow lists always agree with the arcs actually drawn.
const nodeVis=c=>secOn[c.sec]||c.id===selected;
const visC=()=>C.filter(nodeVis);
const visF=()=>{const m=TMUL[tIdx];return FL.filter(e=>layerOn[e.p]&&byId[e.f]&&byId[e.t]&&nodeVis(byId[e.f])&&nodeVis(byId[e.t])).map(e=>({...e,vv:e.v*m}));};

/* ---- rendering ---- */
let pulse=0,t0=performance.now(),lastDrawn=[];
function frame(now){
  const dt=Math.min(2,(now-t0)/16.7);t0=now;
  // ease view toward target
  view.cx+=(target.cx-view.cx)*0.16*dt; view.cy+=(target.cy-view.cy)*0.16*dt; view.scale+=(target.scale-view.scale)*0.16*dt;
  // clamp center to keep map on-screen (limits widen with zoom)
  target.cx=Math.max(-200,Math.min(200,target.cx)); target.cy=Math.max(-88,Math.min(95,target.cy));
  view.cx=Math.max(-220,Math.min(220,view.cx)); view.cy=Math.max(-92,Math.min(98,view.cy));
  pulse=(pulse+(reduceMotion?0:(live?0.018:0.008))*dt)%1;
  render();
  requestAnimationFrame(frame);
}
function render(){
  DPR=Math.min(window.devicePixelRatio||1,2);
  // Only reallocate the canvas backing store when the size actually changes —
  // reassigning width/height every frame forces a needless clear + GPU realloc.
  const cw=Math.round(map.clientWidth*DPR), ch=Math.round(map.clientHeight*DPR);
  if(MW!==cw||MH!==ch){MW=map.width=cw;MH=map.height=ch;map.style.width='100%';map.style.height='100%';}
  mx.setTransform(1,0,0,1,0,0);
  // bg
  mx.clearRect(0,0,MW,MH);
  // graticule
  mx.strokeStyle='rgba(90,120,170,.08)';mx.lineWidth=1;
  for(let lon=-180;lon<=180;lon+=20){const a=proj(lon,85),b=proj(lon,-85);mx.beginPath();mx.moveTo(a.x,a.y);mx.lineTo(b.x,b.y);mx.stroke();}
  for(let lat=-60;lat<=80;lat+=20){const a=proj(-180,lat),b=proj(180,lat);mx.beginPath();mx.moveTo(a.x,a.y);mx.lineTo(b.x,b.y);mx.stroke();}
  // land (real coastlines)
  mx.lineWidth=1*DPR;
  WORLD.forEach(r=>{
    mx.beginPath();
    for(let i=0;i<r.length;i+=2){const p=proj(r[i],r[i+1]);i?mx.lineTo(p.x,p.y):mx.moveTo(p.x,p.y);}
    mx.closePath();
    mx.fillStyle='#142036';mx.fill();
    mx.strokeStyle='#27375a';mx.stroke();
  });
  const fl=visF();
  // arcs
  fl.forEach(e=>{
    const A=byId[e.f],B=byId[e.t];
    // Antimeridian: route trans-Pacific flows the short way (shift the far
    // endpoint ±360°) instead of dragging the arc across the whole Atlantic.
    let bLng=B.lng; if(Math.abs(bLng-A.lng)>180)bLng+=bLng<A.lng?360:-360;
    const a=proj(A.lng,A.lat),b=proj(bLng,B.lat);
    const hot=selected&&(e.f===selected||e.t===selected);
    if(selected&&!hot)return;
    const col=PCOL[e.p];
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,lift=Math.min(180*DPR,len*0.3);
    const mxp=(a.x+b.x)/2,myp=(a.y+b.y)/2,cx=mxp-dy/len*lift,cy=myp+dx/len*lift-lift*0.3;
    mx.globalAlpha=hot?0.95:0.34;
    mx.setLineDash(e.p==='R'?[]:(e.p==='E'?[8*DPR,6*DPR]:[2*DPR,7*DPR]));
    mx.lineWidth=Math.max(1,Math.log(e.vv+1)*0.6)*(hot?1.7:1)*DPR;
    if(hot){mx.shadowBlur=12*DPR;mx.shadowColor=col;}
    mx.strokeStyle=col;mx.beginPath();mx.moveTo(a.x,a.y);mx.quadraticCurveTo(cx,cy,b.x,b.y);mx.stroke();
    mx.shadowBlur=0;mx.setLineDash([]);
    if(hot||!selected){const t=(pulse+(e.f.charCodeAt(0)%9)/9)%1;const q=quad(a,{x:cx,y:cy},b,t);
      mx.globalAlpha=hot?1:0.55;mx.fillStyle=col;if(hot){mx.shadowBlur=8*DPR;mx.shadowColor=col;}
      mx.beginPath();mx.arc(q.x,q.y,(hot?3:2)*DPR,0,6.28);mx.fill();mx.shadowBlur=0;
      if(hot){const q2=quad(a,{x:cx,y:cy},b,0.97);arrow(q2,b,col);}}
  });
  mx.globalAlpha=1;
  // pins. Radius shrinks as you zoom in so dense clusters reveal separation
  // instead of overlapping into a blob.
  const sized=visC();
  // mcap sizing for listed companies; revenue sizing is time-aware (real SEC
  // series where available). Macro nodes (mcap 0) always size by flow scale.
  const sizeVal=c=>(sizeBy==='mcap'&&c.mcap>0)?c.mcap:revAt(c);
  const maxV=Math.max(1,...sized.map(sizeVal));
  const zoomShrink=Math.max(0.35, Math.min(1, 1.6/Math.sqrt(view.scale))); // 1 at scale~2.5, ~0.35 floor
  const drawn=[];
  sized.slice().sort((p,q)=>sizeVal(q)-sizeVal(p)).forEach(c=>{
    const s=proj(c.lng,c.lat);
    if(s.x<-60||s.x>MW+60||s.y<-60||s.y>MH+60)return;
    const r=(4+Math.sqrt(sizeVal(c)/maxV)*26)*DPR*zoomShrink;
    drawn.push({c,x:s.x,y:s.y,ox:s.x,oy:s.y,r});
  });
  // collision relaxation: always keep pins from overlapping into a blob, at
  // every zoom level. Pins settle near their true coordinates but never cover
  // each other, so dense clusters stay readable whether zoomed out or in.
  for(let pass=0;pass<8;pass++){
    for(let i=0;i<drawn.length;i++)for(let j=i+1;j<drawn.length;j++){
      const a=drawn[i],b=drawn[j];let dx2=b.x-a.x,dy2=b.y-a.y,d=Math.hypot(dx2,dy2)||0.01;
      const want=(a.r+b.r)*0.62+6*DPR;
      if(d<want){const push=(want-d)/2;const ux=dx2/d,uy=dy2/d;a.x-=ux*push;a.y-=uy*push;b.x+=ux*push;b.y+=uy*push;}
    }
  }
  // tether back toward true location; at high zoom the tether nearly releases
  // so coincident companies fan out into a readable cluster instead of stacking.
  const tether=Math.max(0.015, 0.12/Math.max(1,view.scale*0.6));
  drawn.forEach(p=>{p.x+=(p.ox-p.x)*tether;p.y+=(p.oy-p.y)*tether;});
  lastDrawn=drawn;
  // draw connector when a pin was nudged, then big pins first, small on top
  drawn.forEach(p=>{const dd=Math.hypot(p.x-p.ox,p.y-p.oy);if(dd>p.r*0.8){mx.strokeStyle='rgba(255,255,255,.18)';mx.lineWidth=1*DPR;mx.beginPath();mx.moveTo(p.ox,p.oy);mx.lineTo(p.x,p.y);mx.stroke();}});
  drawn.slice().reverse().forEach(({c,x,y,r})=>{const s={x,y};
    const sel=c.id===selected,hov=hover&&hover.id===c.id;
    const isGov=c.sec==='gov'||c.mcap===0; // governments, central banks, household sectors
    function shape(rr){if(isGov){mx.moveTo(s.x,s.y-rr);mx.lineTo(s.x+rr,s.y);mx.lineTo(s.x,s.y+rr);mx.lineTo(s.x-rr,s.y);mx.closePath();}else{mx.arc(s.x,s.y,rr,0,6.28);}}
    // glow
    if(sel||hov){mx.beginPath();shape(r+8*DPR);const g=mx.createRadialGradient(s.x,s.y,r,s.x,s.y,r+10*DPR);g.addColorStop(0,SEC[c.sec]+'66');g.addColorStop(1,SEC[c.sec]+'00');mx.fillStyle=g;mx.fill();}
    mx.beginPath();shape(r);
    mx.fillStyle=SEC[c.sec];mx.globalAlpha=sel?1:(selected?0.4:0.82);
    if(!selected||sel){mx.shadowBlur=(sel||hov?14:6)*DPR;mx.shadowColor=SEC[c.sec];}
    mx.fill();mx.shadowBlur=0;mx.globalAlpha=1;
    mx.lineWidth=(sel||hov?2.2:1.2)*DPR;mx.strokeStyle=sel||hov?'#fff':'rgba(255,255,255,.55)';mx.stroke();
    // provenance marker (shape + color encode the tier)
    const np2=nProv(c);
    mx.fillStyle=PCOL[np2];mx.strokeStyle='#0a0e16';mx.lineWidth=1.3*DPR;
    provDot(mx,s.x+r*0.7,s.y-r*0.7,3.2*DPR,np2);
  });
  // Label pass — drawn biggest-first; skip a label whose box overlaps an already
  // -placed one (selected/hovered always win), and paint a dark halo so labels
  // stay legible over dense clusters instead of smearing into each other.
  const placed=[];mx.textAlign='center';mx.lineJoin='round';
  drawn.forEach(({c,x,y,r})=>{
    const sel=c.id===selected,hov=hover&&hover.id===c.id;
    if(!(r>15*DPR||sel||hov||view.scale>=4))return;
    const fs=11*DPR;mx.font=(sel||hov?'700 ':'600 ')+fs+'px Inter,-apple-system,Segoe UI,Roboto,sans-serif';
    const w=mx.measureText(c.id).width,lx=x,ly=y+r+13*DPR;
    const box={x:lx-w/2-2*DPR,y:ly-fs,w:w+4*DPR,h:fs+5*DPR};
    const clash=placed.some(p=>!(box.x+box.w<p.x||box.x>p.x+p.w||box.y+box.h<p.y||box.y>p.y+p.h));
    if(clash&&!sel&&!hov)return;
    placed.push(box);
    mx.lineWidth=3*DPR;mx.strokeStyle='rgba(8,12,20,.92)';mx.strokeText(c.id,lx,ly);
    mx.fillStyle=sel||hov?'#fff':'#c9d4e3';mx.fillText(c.id,lx,ly);
  });
  // Skip the innerHTML write when nothing changed — this runs every frame and
  // the string only moves while zoom eases or a control flips.
  const ctl=`<b>${live?'Real-time (sim)':PERIODS[tIdx]}</b> · ${sized.length} entities · ${fl.length} flows · sized by <b>${sizeBy==='mcap'?'market cap':'revenue'}</b> · zoom <b>${view.scale.toFixed(1)}×</b>`;
  if(ctl!==ctlPrev)ctlTopEl.innerHTML=ctlPrev=ctl;
}
const ctlTopEl=document.getElementById('ctlTop');let ctlPrev='';
function quad(a,c,b,t){const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};}
function arrow(f,t,col){const an=Math.atan2(t.y-f.y,t.x-f.x),sz=6*DPR;mx.fillStyle=col;mx.beginPath();mx.moveTo(t.x,t.y);mx.lineTo(t.x-sz*Math.cos(an-.4),t.y-sz*Math.sin(an-.4));mx.lineTo(t.x-sz*Math.cos(an+.4),t.y-sz*Math.sin(an+.4));mx.closePath();mx.fill();}
// Provenance marker: shape encodes the tier alongside color (color-blind-safe):
// R = circle, E = square, I = triangle.
function provDot(ctx,x,y,r,p){ctx.beginPath();
  if(p==='R')ctx.arc(x,y,r,0,6.28);
  else if(p==='E')ctx.rect(x-r*0.9,y-r*0.9,r*1.8,r*1.8);
  else{ctx.moveTo(x,y-r*1.15);ctx.lineTo(x+r*1.1,y+r*0.95);ctx.lineTo(x-r*1.1,y+r*0.95);ctx.closePath();}
  ctx.fill();ctx.stroke();}

/* ---- interaction (pointer events: mouse, touch, and pen) ---- */
let panning=false,last={x:0,y:0},moved=false,pinch0=null;
const ptrs=new Map(); // active pointers over the map: id -> CSS-px position
// Touch pointers get a larger hit target: small pins are ~8 CSS px, well under
// fingertip size, so floor the effective radius and widen the slop for touch.
function pick(px,py,touch){const dpr=DPR;px*=dpr;py*=dpr;let best=null,bd=1e9;for(const p of lastDrawn){const eff=touch?Math.max(p.r,12*dpr)+8*dpr:p.r+5*dpr;const d=Math.hypot(px-p.x,py-p.y);if(d<=eff&&d<bd){bd=d;best=p.c;}}return best;}
const hideTip=()=>{const tp=document.getElementById('tip');if(tp)tp.style.opacity=0;};
function zoomAbout(px,py,scale){ // rescale while keeping the (CSS-px) point fixed on screen
  const before=unproj(px*DPR,py*DPR);
  target.scale=view.scale=Math.max(0.8,Math.min(80,scale));
  const after=unproj(px*DPR,py*DPR);
  target.cx=view.cx+=before.lon-after.lon;target.cy=view.cy+=before.lat-after.lat;
}
map.addEventListener('pointerdown',e=>{
  map.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
  if(ptrs.size===1){panning=true;moved=false;last={x:e.offsetX,y:e.offsetY};}
  else if(ptrs.size===2){panning=false;hideTip();const[a,b]=ptrs.values();pinch0={d:Math.hypot(a.x-b.x,a.y-b.y)||1,scale:view.scale};}
});
map.addEventListener('pointermove',e=>{
  const px=e.offsetX,py=e.offsetY;
  if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:px,y:py});
  if(pinch0&&ptrs.size===2){ // two-finger pinch: zoom about the finger midpoint
    const[a,b]=ptrs.values();
    zoomAbout((a.x+b.x)/2,(a.y+b.y)/2,pinch0.scale*(Math.hypot(a.x-b.x,a.y-b.y)/pinch0.d));
    moved=true;return;
  }
  if(panning){const dx=px-last.x,dy=py-last.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;const s=pxPerDeg()/DPR;target.cx-=dx/s;target.cy+=dy/(s*0.95);view.cx=target.cx;view.cy=target.cy;last={x:px,y:py};hideTip();return;}
  if(e.pointerType!=='mouse')return; // hover/tooltip is a mouse-only affordance
  const c=pick(px,py);hover=c;const tip=document.getElementById('tip');if(!tip)return;
  if(c){const isGov=c.mcap===0,np=nProv(c);tip.innerHTML=`<div class="t">${c.name}</div><div class="s">${SECNAME[c.sec]} · ${c.country}</div><div class="s">${isGov?'Annual flows ~'+fmt(revAt(c)):'Cap '+fmt(c.mcap)+' · Rev '+fmt(revAt(c))}</div><div class="pv"><i style="background:${PCOL[np]}"></i>${PNAME[np]} ${isGov?'(modeled)':(hasFact(c)?'revenue (SEC filing)':'revenue')}</div>`;tip.style.left=Math.min(px+16,map.clientWidth-248)+'px';tip.style.top=Math.min(py+16,map.clientHeight-100)+'px';tip.style.opacity=1;map.style.cursor='pointer';}
  else{tip.style.opacity=0;map.style.cursor='grab';}});
function endPointer(e){
  if(!ptrs.delete(e.pointerId))return;
  if(ptrs.size===1){pinch0=null;const[a]=ptrs.values();panning=true;moved=true;last={x:a.x,y:a.y};} // pinch ended: remaining finger keeps panning
  else if(ptrs.size===0){
    if(panning&&!moved&&e.type==='pointerup'){const c=pick(e.offsetX,e.offsetY,e.pointerType!=='mouse');if(c)selectNode(c.id);}
    panning=false;pinch0=null;
  }
}
map.addEventListener('pointerup',endPointer);
map.addEventListener('pointercancel',endPointer);
map.addEventListener('pointerleave',e=>{if(!panning&&e.pointerType==='mouse'){hover=null;hideTip();}});
map.addEventListener('wheel',e=>{e.preventDefault();zoomAbout(e.offsetX,e.offsetY,view.scale*(e.deltaY<0?1.18:0.85));},{passive:false});
map.addEventListener('dblclick',e=>{const before=unproj(e.offsetX*DPR,e.offsetY*DPR);target.scale=Math.min(80,target.scale*2);target.cx=before.lon;target.cy=before.lat;});
// Keyboard map control (the canvas is tabbable): arrows pan, +/- zoom, 0 fits.
map.addEventListener('keydown',e=>{
  const panDeg=60*DPR/pxPerDeg(); // ~60 CSS px per keypress at the current zoom
  if(e.key==='ArrowLeft')target.cx-=panDeg;
  else if(e.key==='ArrowRight')target.cx+=panDeg;
  else if(e.key==='ArrowUp')target.cy+=panDeg;
  else if(e.key==='ArrowDown')target.cy-=panDeg;
  else if(e.key==='+'||e.key==='=')target.scale=Math.min(80,target.scale*1.6);
  else if(e.key==='-'||e.key==='_')target.scale=Math.max(0.8,target.scale/1.6);
  else if(e.key==='0')fitView();
  else return;
  e.preventDefault();
});
function fitView(){target={cx:10,cy:25,scale:1};selected=null;renderInspectorEmpty();syncHash(true);}
document.getElementById('zin').onclick=()=>target.scale=Math.min(80,target.scale*1.6);
document.getElementById('zout').onclick=()=>target.scale=Math.max(0.8,target.scale/1.6);
document.getElementById('zfit').onclick=fitView;

/* ---- inspector ---- */
// fly=false refreshes the inspector in place (filter/scrub changes) without
// re-aiming the camera at the node.
function selectNode(id,fly=true){const n=byId[id];if(!n)return;selected=id;const m=TMUL[tIdx],np=nProv(n),fx=FACTS[id];
  if(fly){target.cx=n.lng;target.cy=n.lat;if(target.scale<2)target.scale=2.2;}
  const outs=FL.filter(e=>e.f===id&&layerOn[e.p]&&nodeVis(byId[e.t])).map(e=>({...e,vv:e.v*m}));
  const ins=FL.filter(e=>e.t===id&&layerOn[e.p]&&nodeVis(byId[e.f])).map(e=>({...e,vv:e.v*m}));
  const sO=outs.reduce((a,b)=>a+b.vv,0),sI=ins.reduce((a,b)=>a+b.vv,0);
  const outsS=[...outs].sort((a,b)=>b.vv-a.vv),insS=[...ins].sort((a,b)=>b.vv-a.vv);
  const net=sI-sO,conc=outsS.length?Math.round(outsS[0].vv/sO*100):0;
  // YoY delta from the real SEC series (only when both years are reported)
  const cur=fx&&fx.revT[PERIODS[tIdx]],prv=fx&&fx.revT[String(+PERIODS[tIdx]-1)];
  const yoy=(cur!=null&&prv!=null)?Math.round((cur-prv)/prv*100):null;
  const mv=Math.max(1,...outs.map(x=>x.vv),...ins.map(x=>x.vv));
  const flowRow=(e,dir)=>{const o=dir==='out'?e.t:e.f,oc=byId[o];return `<div class="flow" role="button" tabindex="0" data-e="${e.f}|${e.t}"><div class="r1"><div class="who"><span class="ar">${dir==='out'?'→':'←'}</span><span style="width:9px;height:9px;border-radius:50%;background:${SEC[oc.sec]};display:inline-block"></span><span class="cplink" data-go="${o}" title="Open ${oc.name}">${oc.name}</span><span class="tag ${e.p}">${PNAME[e.p][0]}</span></div><div class="amt">${fmt(e.vv)}</div></div><div class="bar"><i style="width:${Math.min(100,e.vv/mv*100)}%;background:${PCOL[e.p]}"></i></div><div class="meth">confidence ${(e.c*100|0)}%</div></div>`;};
  const html=`
   <div class="ihead"><div class="tk">${n.id}</div><div class="nm">${n.name}</div>
     <div class="meta"><span class="pill"><span class="d" style="background:${SEC[n.sec]}"></span>${SECNAME[n.sec]}</span><span class="pill">📍 ${n.country}</span></div></div>
   <div class="stats">
     <div class="stat"><div class="k">${n.mcap===0?'ANNUAL FLOWS':'MARKET CAP'}</div><div class="v">${n.mcap===0?fmt(revAt(n)):fmt(n.mcap)}<span class="tag ${n.mcap===0?np:'E'}">${n.mcap===0?PNAME[np][0]:'E'}</span></div></div>
     <div class="stat"><div class="k">REVENUE · ${PERIODS[tIdx]}</div><div class="v">${fmt(revAt(n))}<span class="tag ${np}">${PNAME[np][0]}</span></div></div>
     <div class="stat"><div class="k">OUTFLOWS</div><div class="v" style="color:var(--accent)">${fmt(sO)}</div></div>
     <div class="stat"><div class="k">INFLOWS</div><div class="v" style="color:var(--live)">${fmt(sI)}</div></div>
     <div class="stat"><div class="k">NET FLOW</div><div class="v" style="color:${net>=0?'var(--live)':'var(--inferred)'}">${net>=0?'+':'−'}${fmt(Math.abs(net))}</div></div>
     <div class="stat"><div class="k">TOP OUTFLOW SHARE</div><div class="v">${outsS.length?conc+'%':'—'}</div>${outsS.length?`<div class="k" style="margin-top:2px">to ${byId[outsS[0].t].name}</div>`:''}</div>
   </div>
   ${fx?`<div class="nsw"><div class="k">SEC-REPORTED REVENUE SERIES${yoy!=null?` · <span class="${yoy>=0?'up':'down'}">${yoy>=0?'+':''}${yoy}% YoY</span>`:''}</div><canvas id="nspark" aria-label="Reported revenue ${PERIODS[0]}–${PERIODS[PERIODS.length-1]}"></canvas><div class="yrs"><span>${PERIODS[0]}</span><span>${PERIODS[PERIODS.length-1]}</span></div></div>`:''}
   <button class="ddbtn" id="openDD">View relationship graph →</button>
   ${hasFact(n)?`<div class="verdict ok">✓ Revenue is the reported figure from SEC XBRL filings (10-K/20-F, through ${fx.asOf}) — scrubbing years shows the real series, not an estimate. <a href="${fx.url}" target="_blank" rel="noopener">Verify at SEC ↗</a></div>`:fx?`<div class="verdict warn">⚠ No SEC filing figure for ${PERIODS[tIdx]} — showing a modeled estimate for this year. <a href="${fx.url}" target="_blank" rel="noopener">Verify other years at SEC ↗</a></div>`:np==='R'?`<div class="verdict ok">✓ Revenue anchored to a primary filing. Market cap is point-in-time (tagged Estimated — it moves every trading day).</div>`:`<div class="verdict warn">⚠ Revenue carries a ${PNAME[np]} tag — modeled or not yet verified against a filing. Treat as directional.</div>`}
   <div class="flowsec"><div class="lbl">Outflows <span>${outs.length}</span></div>${outsS.length?outsS.map(e=>flowRow(e,'out')).join(''):'<div style="color:var(--mut);font-size:12px;padding:6px 0">No seeded outflows. In production these derive from supplier disclosures + input-output tables.</div>'}</div>
   <div class="flowsec" style="border-top:1px solid var(--line)"><div class="lbl">Inflows <span>${ins.length}</span></div>${insS.length?insS.map(e=>flowRow(e,'in')).join(''):'<div style="color:var(--mut);font-size:12px;padding:6px 0">No seeded inflows in current view.</div>'}</div>
   <div class="mblock" id="methblock"><div class="lbl">Methodology</div><div style="color:var(--mut);font-size:12px">Select a flow above to see how its figure was derived.</div></div>`;
  const el=document.getElementById('inspector');el.innerHTML=html;
  el.querySelectorAll('.flow').forEach(r=>{const go=()=>{const[f,t]=r.dataset.e.split('|');showMethod(FL.find(e=>e.f===f&&e.t===t));};r.onclick=go;r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});
  // counterparty names navigate to that node (flow row body still opens methodology)
  el.querySelectorAll('.cplink').forEach(s=>{s.onclick=e=>{e.stopPropagation();selectNode(s.dataset.go);};});
  document.getElementById('openDD').onclick=()=>openDrill(id);
  // sparkline of the real reported series, with a marker on the scrubbed year
  const cv=document.getElementById('nspark');
  if(cv&&fx){const g=cv.getContext('2d');const w=cv.clientWidth||300,h=46;
    cv.width=Math.round(w*DPR);cv.height=Math.round(h*DPR);g.setTransform(DPR,0,0,DPR,0,0);
    const pts=PERIODS.map((p,i)=>({i,v:fx.revT[p]})).filter(d=>d.v!=null);
    const lo=Math.min(...pts.map(d=>d.v)),hi=Math.max(...pts.map(d=>d.v));
    const X=i=>10+i/(PERIODS.length-1)*(w-20),Y=v=>h-8-((v-lo)/((hi-lo)||1))*(h-18);
    g.strokeStyle=PCOL.R;g.lineWidth=1.8;g.beginPath();pts.forEach((d,k)=>k?g.lineTo(X(d.i),Y(d.v)):g.moveTo(X(d.i),Y(d.v)));g.stroke();
    g.fillStyle=PCOL.R;pts.forEach(d=>{g.beginPath();g.arc(X(d.i),Y(d.v),2,0,6.28);g.fill();});
    if(cur!=null){g.fillStyle='#fff';g.beginPath();g.arc(X(tIdx),Y(cur),3.2,0,6.28);g.fill();
      g.font='600 10px Inter,sans-serif';g.textAlign='center';g.fillStyle='#e8eef7';
      g.fillText(fmt(cur),Math.min(w-26,Math.max(26,X(tIdx))),Math.max(10,Y(cur)-8));}
  }
  syncHash(fly);
}
function renderInspectorEmpty(){const el=document.getElementById('inspector');el.innerHTML='<div class="ins-empty"><div class="big">◎</div>Select any node on the map to inspect its scale, capital flows, counterparties, and the provenance behind every figure.<div class="note" style="margin-top:12px">Illustrative dataset — revenue is SEC-verified where tagged R. <a href="#about" id="abLink" style="color:var(--accent)">About the data</a></div></div>';const l=document.getElementById('abLink');if(l)l.onclick=e=>{e.preventDefault();openAbout();};}
function showMethod(e){if(!e)return;const b=document.getElementById('methblock');if(!b)return;
  b.innerHTML=`<div class="lbl">Methodology · ${e.f} → ${e.t}</div>
   <div class="mb-row"><span class="k">Value (${PERIODS[tIdx]})</span><span class="v">${fmt(e.v*TMUL[tIdx])}</span></div>
   <div class="mb-row"><span class="k">Provenance</span><span class="v"><span class="tag ${e.p}">${PNAME[e.p]}</span></span></div>
   <div class="mb-row"><span class="k">Confidence</span><span class="v">${(e.c*100|0)}%</span></div>
   <div class="track" style="margin-top:6px"><i style="width:${e.c*100}%;background:${PCOL[e.p]}"></i></div>
   <div class="prov-txt"><b>Method.</b> ${e.m}</div><div class="prov-txt"><b>Source.</b> ${e.s}</div>`;
  b.scrollIntoView({behavior:'smooth',block:'nearest'});
}

/* ---- drill modal (force graph) ---- */
const modal=document.getElementById('modal'),dd=document.getElementById('dd'),dx=dd.getContext('2d');
let ddN=[],ddDrag=null,ddRAF=null,ddC=null,ddPrevFocus=null;
document.getElementById('ddClose').onclick=closeDrill;
modal.addEventListener('mousedown',e=>{if(e.target===modal)closeDrill();});
// Keep keyboard focus inside the dialog while it's open (only the close button is
// focusable, so Tab parks there rather than leaking into the page behind).
modal.addEventListener('keydown',e=>{if(e.key==='Tab'&&modal.classList.contains('show')){e.preventDefault();document.getElementById('ddClose').focus();}});
function openDrill(id){ddPrevFocus=document.activeElement;ddC=id;const eg=FL.filter(e=>(e.f===id||e.t===id)&&layerOn[e.p]);const ids=new Set([id]);eg.forEach(e=>{ids.add(e.f);ids.add(e.t);});ddN=[...ids].map((nid,i)=>{const an=i/ids.size*6.28;return{id:nid,x:nid===id?0:Math.cos(an)*170,y:nid===id?0:Math.sin(an)*170,vx:0,vy:0};});document.getElementById('ddTitle').textContent='Relationships · '+byId[id].name;document.getElementById('ddFoot').innerHTML=`${eg.length} seeded flows. Line style = provenance (solid reported · dashed estimated · dotted inferred). Drag to rearrange. Production resolves the full counterparty set from filings and input-output tables.`;modal.classList.add('show');document.getElementById('ddClose').focus();cancelAnimationFrame(ddRAF);ddLoop();}
function closeDrill(){modal.classList.remove('show');cancelAnimationFrame(ddRAF);if(ddPrevFocus&&ddPrevFocus.focus){try{ddPrevFocus.focus();}catch{/* element gone */}}}
function ddLoop(){
  // Resize the backing store only when needed (reassigning width every frame
  // forces a clear + GPU realloc); the explicit clearRect below wipes the frame.
  const cw=Math.round(dd.clientWidth*DPR),ch=Math.round(dd.clientHeight*DPR);
  if(dd.width!==cw||dd.height!==ch){dd.width=cw;dd.height=ch;}
  dx.setTransform(DPR,0,0,DPR,0,0);const W=dd.clientWidth,H=dd.clientHeight,cx=W/2,cy=H/2;const m=Object.fromEntries(ddN.map(n=>[n.id,n]));const eg=FL.filter(e=>m[e.f]&&m[e.t]&&layerOn[e.p]);
  for(let i=0;i<ddN.length;i++)for(let j=i+1;j<ddN.length;j++){const a=ddN[i],b=ddN[j];let ax=a.x-b.x,ay=a.y-b.y,d2=ax*ax+ay*ay||1,f=30000/d2,d=Math.sqrt(d2);a.vx+=ax/d*f;a.vy+=ay/d*f;b.vx-=ax/d*f;b.vy-=ay/d*f;}
  eg.forEach(e=>{const a=m[e.f],b=m[e.t],ax=b.x-a.x,ay=b.y-a.y,d=Math.hypot(ax,ay)||1,f=(d-160)*0.01;a.vx+=ax/d*f;a.vy+=ay/d*f;b.vx-=ax/d*f;b.vy-=ay/d*f;});
  ddN.forEach(n=>{if(n.id===ddC){n.x=0;n.y=0;return;}n.vx+=-n.x*0.01;n.vy+=-n.y*0.01;if(n!==ddDrag){n.x+=n.vx*0.5;n.y+=n.vy*0.5;}n.vx*=0.85;n.vy*=0.85;});
  dx.clearRect(0,0,W,H);
  eg.forEach(e=>{const a=m[e.f],b=m[e.t];dx.strokeStyle=PCOL[e.p];dx.globalAlpha=0.85;dx.setLineDash(e.p==='R'?[]:(e.p==='E'?[6,4]:[2,5]));dx.lineWidth=Math.max(1,Math.log(e.v+1)*0.7);dx.beginPath();dx.moveTo(cx+a.x,cy+a.y);dx.lineTo(cx+b.x,cy+b.y);dx.stroke();dx.setLineDash([]);const t=pulse%1,px=a.x+(b.x-a.x)*t,py=a.y+(b.y-a.y)*t;dx.fillStyle=PCOL[e.p];dx.globalAlpha=1;dx.beginPath();dx.arc(cx+px,cy+py,2.6,0,6.28);dx.fill();dx.fillStyle='#c9d4e3';dx.font='10px Inter,sans-serif';dx.textAlign='center';dx.fillText(fmt(e.v*TMUL[tIdx]),cx+(a.x+b.x)/2,cy+(a.y+b.y)/2-4);});
  dx.globalAlpha=1;
  ddN.forEach(n=>{const c=byId[n.id],r=n.id===ddC?28:19;dx.beginPath();dx.arc(cx+n.x,cy+n.y,r,0,6.28);dx.fillStyle=SEC[c.sec];dx.globalAlpha=n.id===ddC?1:0.88;dx.shadowBlur=n.id===ddC?16:6;dx.shadowColor=SEC[c.sec];dx.fill();dx.shadowBlur=0;dx.globalAlpha=1;dx.lineWidth=n.id===ddC?3:1.5;dx.strokeStyle='#fff';dx.stroke();const dnp=nProv(c);dx.fillStyle=PCOL[dnp];dx.strokeStyle='#101725';dx.lineWidth=1.4;provDot(dx,cx+n.x+r*0.7,cy+n.y-r*0.7,3.4,dnp);dx.fillStyle='#fff';dx.font='600 11px Inter,sans-serif';dx.textAlign='center';dx.fillText(n.id,cx+n.x,cy+n.y+r+14);});
  ddRAF=requestAnimationFrame(ddLoop);}
dd.addEventListener('pointerdown',e=>{dd.setPointerCapture(e.pointerId);const px=e.offsetX-dd.clientWidth/2,py=e.offsetY-dd.clientHeight/2;ddDrag=ddN.find(n=>Math.hypot(px-n.x,py-n.y)<(n.id===ddC?33:24))||null;});
dd.addEventListener('pointermove',e=>{if(ddDrag){ddDrag.x=e.offsetX-dd.clientWidth/2;ddDrag.y=e.offsetY-dd.clientHeight/2;ddDrag.vx=ddDrag.vy=0;}});
dd.addEventListener('pointerup',()=>ddDrag=null);
dd.addEventListener('pointercancel',()=>ddDrag=null);

/* ---- panels ---- */
function buildSectors(){const ct={};C.forEach(c=>ct[c.sec]=(ct[c.sec]||0)+1);document.getElementById('sectors').innerHTML=Object.keys(SEC).map(s=>`<button class="chip ${secOn[s]?'on':''}" data-s="${s}" style="${secOn[s]?'background:'+SEC[s]+'1a;border-color:'+SEC[s]+'66':''}"><span class="l"><span class="d" style="background:${SEC[s]}"></span>${SECNAME[s]}</span><span class="ct">${ct[s]}</span></button>`).join('');document.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{secOn[b.dataset.s]=!secOn[b.dataset.s];buildSectors();refreshStats();if(selected)selectNode(selected,false);syncHash(false);});}
function buildLayers(){const L={R:'Filing-anchored revenue & disclosures',E:'Modeled from disclosure + I-O; point-in-time caps',I:'Third-party or allocation heuristics'};document.getElementById('layers').innerHTML=Object.keys(L).map(k=>`<div class="leg ${layerOn[k]?'':'off'}" data-l="${k}" role="switch" tabindex="0" aria-checked="${layerOn[k]?'true':'false'}" aria-label="${PNAME[k]} layer"><span class="ln" style="border-color:${PCOL[k]};border-top-style:${k==='R'?'solid':k==='E'?'dashed':'dotted'}"></span><div><div class="ttl" style="color:${PCOL[k]}">${PNAME[k]}</div><div class="sub">${L[k]}</div></div></div>`).join('');document.querySelectorAll('[data-l]').forEach(el=>{const go=()=>{layerOn[el.dataset.l]=!layerOn[el.dataset.l];buildLayers();refreshStats();if(selected)selectNode(selected,false);syncHash(false);};el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});}
function refreshStats(){const sc=visC(),fl=visF();map.setAttribute('aria-label','Capital-flow world map — '+sc.length+' entities and '+fl.length+' flows shown for period '+(live?'live (simulated)':PERIODS[tIdx])+'. When focused: arrow keys pan, plus and minus zoom, zero resets. Use the search box and side panels to explore entity details and provenance.');document.getElementById('hCap').textContent=fmt(sc.reduce((a,c)=>a+c.mcap,0));document.getElementById('hF').textContent=fl.length;document.getElementById('hN').textContent=sc.length;const mix={R:0,E:0,I:0};fl.forEach(e=>mix[e.p]+=e.vv);const tot=mix.R+mix.E+mix.I||1;document.getElementById('provmix').innerHTML=['R','E','I'].map(k=>`<div class="mixrow"><div class="h"><b style="color:${PCOL[k]}">${PNAME[k]}</b><span>${(mix[k]/tot*100).toFixed(0)}%</span></div><div class="track"><i style="width:${mix[k]/tot*100}%;background:${PCOL[k]}"></i></div></div>`).join('')+`<div class="note">Share of visible flow volume by source quality. Toggle layers to see how much rests on modeling vs. reported figures.</div>`;}

/* ---- search (ranked: exact ticker ≫ ticker prefix ≫ name ≫ country) ---- */
const srch=document.getElementById('srch'),reslist=document.getElementById('reslist');
let srchIdx=-1;
function searchScore(c,q){
  const id=c.id.toLowerCase(),nm=c.name.toLowerCase();
  const tie=Math.min(9,(c.mcap||c.rev)/500); // big entities float on ties
  if(id===q)return 100+tie;
  if(id.startsWith(q))return 80+tie;
  if(nm.startsWith(q))return 60+tie;
  if(nm.includes(q))return 40+tie;
  if(c.country.toLowerCase().includes(q))return 20+tie;
  return -1;
}
srch.oninput=()=>{srchIdx=-1;const q=srch.value.toLowerCase().trim();if(!q){reslist.innerHTML='';return;}
  const h=C.map(c=>[searchScore(c,q),c]).filter(([s])=>s>=0).sort((a,b)=>b[0]-a[0]).slice(0,24).map(([,c])=>c);
  reslist.innerHTML=h.map(c=>`<div class="resrow" role="option" tabindex="0" data-id="${c.id}"><span class="dot" style="background:${SEC[c.sec]}"></span><span class="nm">${c.name}</span><span class="cty">${c.country}</span></div>`).join('')||'<div class="note" style="padding:8px">No matches.</div>';
  reslist.querySelectorAll('[data-id]').forEach(r=>{const go=()=>{selectNode(r.dataset.id);srch.value='';reslist.innerHTML='';srchIdx=-1;};r.onclick=go;r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});};
// Arrow keys walk the results from the input; Enter selects (default: top hit).
srch.onkeydown=e=>{
  const rows=[...reslist.querySelectorAll('[data-id]')];
  if(e.key==='Escape'){e.stopPropagation();srch.value='';reslist.innerHTML='';srchIdx=-1;return;}
  if(!rows.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();srchIdx=Math.min(rows.length-1,srchIdx+1);}
  else if(e.key==='ArrowUp'){e.preventDefault();srchIdx=Math.max(0,srchIdx-1);}
  else if(e.key==='Enter'){e.preventDefault();(rows[Math.max(0,srchIdx)]||rows[0]).click();return;}
  else return;
  rows.forEach((r,i)=>r.classList.toggle('active',i===srchIdx));
  if(rows[srchIdx])rows[srchIdx].scrollIntoView({block:'nearest'});
};

/* ---- size toggle / time / live ---- */
document.querySelectorAll('#sizeBy button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#sizeBy button').forEach(x=>x.classList.remove('on'));b.classList.add('on');sizeBy=b.dataset.by;syncHash(false);});
const scrub=document.getElementById('scrub');scrub.oninput=()=>{tIdx=+scrub.value;document.getElementById('period').textContent=PERIODS[tIdx];refreshStats();if(selected)selectNode(selected,false);syncHash(false);};
let playIv=null;
document.getElementById('play').onclick=function(){playing=!playing;this.textContent=playing?'⏸':'▶';this.setAttribute('aria-label',playing?'Pause timeline':'Play timeline');clearInterval(playIv);playIv=null;if(playing){playIv=setInterval(()=>{tIdx=(tIdx+1)%PERIODS.length;scrub.value=tIdx;scrub.oninput();},1100);}};
const feeds=[{k:'WTI Crude',v:72.4,u:''},{k:'Brent',v:76.1,u:''},{k:'USD/JPY',v:151.2,u:''},{k:'EUR/USD',v:1.083,u:''},{k:'10Y UST',v:4.21,u:'%'},{k:'Gold',v:2032,u:''},{k:'Bitcoin',v:97000,u:''}];
const sd=Array.from({length:90},()=>50);
// Real quotes where a keyless, CORS-open API exists: Frankfurter (ECB FX) and
// CoinGecko (BTC, PAXG as a gold proxy). Rows the APIs cover are marked "live";
// the rest stay an honest simulation marked "sim". Fetches run only while the
// Live toggle is on, and any failure (offline, rate limit, file://) silently
// leaves the row simulating — no console noise, no broken panel.
let liveIv=null;
async function fetchFeeds(){
  if(!live)return;
  const set=(k,val)=>{const f=feeds.find(x=>x.k===k);if(f&&val>0){f.dir=val>=f.v;f.v=val;f.real=true;}};
  // Each API fails independently — a CoinGecko rate-limit must not take the
  // ECB FX rows down with it (and vice versa). Failed rows keep simulating.
  await Promise.all([
    fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY,EUR').then(r=>r.json())
      .then(fx=>{if(fx&&fx.rates){set('USD/JPY',fx.rates.JPY);set('EUR/USD',1/fx.rates.EUR);}}).catch(()=>{}),
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,pax-gold&vs_currencies=usd').then(r=>r.json())
      .then(cg=>{if(cg){if(cg['pax-gold'])set('Gold',cg['pax-gold'].usd);if(cg.bitcoin)set('Bitcoin',cg.bitcoin.usd);}}).catch(()=>{})
  ]);
  tick();
}
function startLiveFetch(){clearInterval(liveIv);liveIv=null;if(live){fetchFeeds();liveIv=setInterval(fetchFeeds,60000);}}
// Direction coloring only applies while live — before the sim runs there's no
// tick-to-tick move, so values stay neutral instead of all reading as "down".
function tick(){if(live)feeds.forEach(f=>{if(f.real)return;const d=(Math.random()-0.5)*f.v*0.004;f.v=Math.max(.001,f.v+d);f.dir=d>=0;});const anyReal=feeds.some(f=>f.real);const tg=document.getElementById('feedTag');if(tg)tg.textContent=anyReal?'MIXED':'SIM';document.getElementById('feeds').innerHTML=feeds.map(f=>`<div class="feed"><span class="k">${f.k}</span><span class="v ${live?(f.dir?'up':'down'):''}">${f.v>100?f.v.toFixed(1):f.v.toFixed(3)}${f.u} ${live?(f.dir?'▲':'▼'):''}${live?`<i class="fsrc">${f.real?'live':'sim'}</i>`:''}</span></div>`).join('');if(live){sd.push(sd[sd.length-1]+(Math.random()-.48)*6);sd.shift();}drawSpark();}
const sc=document.getElementById('spark'),sx=sc.getContext('2d');
function drawSpark(){const cw=Math.round(sc.clientWidth*DPR),ch=Math.round(38*DPR);if(sc.width!==cw||sc.height!==ch){sc.width=cw;sc.height=ch;}sx.setTransform(DPR,0,0,DPR,0,0);const w=sc.clientWidth,h=38,mn=Math.min(...sd),mv=Math.max(...sd);sx.clearRect(0,0,w,h);sx.beginPath();sd.forEach((v,i)=>{const x=i/sd.length*w,y=h-((v-mn)/((mv-mn)||1))*(h-6)-3;i?sx.lineTo(x,y):sx.moveTo(x,y);});sx.strokeStyle=live?'#2dd4e8':'#5b8cff';sx.lineWidth=1.8;sx.stroke();}
document.getElementById('liveBtn').onclick=function(){live=!live;this.classList.toggle('on',live);this.setAttribute('aria-pressed',live?'true':'false');document.getElementById('liveDot').classList.toggle('on',live);document.getElementById('period').textContent=live?'LIVE':PERIODS[tIdx];if(!live)feeds.forEach(f=>delete f.real);startLiveFetch();};
const clockFn=()=>document.getElementById('clock').textContent=new Date().toLocaleTimeString('en-GB');
let tickIv=setInterval(tick,900),clockIv=setInterval(clockFn,1000);
// Pause the always-on timers while the tab is hidden — no point burning CPU/battery
// on the simulated feed + clock for a tab nobody's looking at. (The RAF render loop
// is already suspended by the browser when backgrounded.)
document.addEventListener('visibilitychange',()=>{
  clearInterval(tickIv);clearInterval(clockIv);clearInterval(liveIv);liveIv=null;
  if(!document.hidden){tickIv=setInterval(tick,900);clockIv=setInterval(clockFn,1000);clockFn();startLiveFetch();}
});
/* ---- about modal ---- */
const aboutModal=document.getElementById('aboutModal');
let abPrevFocus=null;
function openAbout(){abPrevFocus=document.activeElement;aboutModal.classList.add('show');document.getElementById('abClose').focus();}
function closeAbout(){aboutModal.classList.remove('show');if(abPrevFocus&&abPrevFocus.focus){try{abPrevFocus.focus();}catch{/* element gone */}}}
document.getElementById('aboutBtn').onclick=openAbout;
document.getElementById('abClose').onclick=closeAbout;
aboutModal.addEventListener('mousedown',e=>{if(e.target===aboutModal)closeAbout();});
aboutModal.addEventListener('keydown',e=>{if(e.key==='Tab'&&aboutModal.classList.contains('show')){e.preventDefault();document.getElementById('abClose').focus();}});

// Escape closes whichever overlay is open, otherwise clears the map selection.
window.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(aboutModal.classList.contains('show'))closeAbout();else if(modal.classList.contains('show'))closeDrill();else if(selected){selected=null;renderInspectorEmpty();syncHash(true);}});

/* ---- shareable URL state ----
   #node=NVDA&t=2022&hide=fin,energy&layers=RE&size=rev — every interesting
   view is linkable. Selection changes push history (back/forward steps
   through nodes); filter/scrub changes replace in place. */
let restoring=false;
function syncHash(push){
  if(restoring)return;
  const p=new URLSearchParams();
  if(selected)p.set('node',selected);
  if(tIdx!==PERIODS.length-1)p.set('t',PERIODS[tIdx]);
  const off=Object.keys(SEC).filter(s=>!secOn[s]);if(off.length)p.set('hide',off.join(','));
  const lay=['R','E','I'].filter(k=>layerOn[k]).join('');if(lay!=='REI')p.set('layers',lay);
  if(sizeBy!=='mcap')p.set('size',sizeBy);
  const h=p.toString()?'#'+p.toString():'';
  if(h===location.hash)return;
  if(push)history.pushState(null,'',h||'#');
  else history.replaceState(null,'',h||location.pathname+location.search);
}
function applyHash(){
  const raw=location.hash.slice(1);
  if(raw==='about'){openAbout();return false;}
  if(!raw)return false;
  const p=new URLSearchParams(raw);restoring=true;
  if(p.has('t')){const i=PERIODS.indexOf(p.get('t'));if(i>=0){tIdx=i;scrub.value=i;document.getElementById('period').textContent=PERIODS[i];}}
  Object.keys(SEC).forEach(s=>secOn[s]=true);
  if(p.has('hide'))p.get('hide').split(',').forEach(s=>{if(s in secOn)secOn[s]=false;});
  if(p.has('layers')){const l=p.get('layers');['R','E','I'].forEach(k=>layerOn[k]=l.includes(k));}
  if(p.has('size')&&['mcap','rev'].includes(p.get('size'))){sizeBy=p.get('size');document.querySelectorAll('#sizeBy button').forEach(x=>x.classList.toggle('on',x.dataset.by===sizeBy));}
  buildSectors();buildLayers();refreshStats();
  let sel=false;
  if(p.has('node')&&byId[p.get('node')]){selectNode(p.get('node'));sel=true;}
  restoring=false;
  return sel;
}

/* boot */
buildSectors();buildLayers();refreshStats();tick();requestAnimationFrame(frame);
const deepLinked=applyHash();
window.addEventListener('hashchange',applyHash);
if(!deepLinked&&location.hash!=='#about')setTimeout(()=>selectNode('NVDA'),400);
