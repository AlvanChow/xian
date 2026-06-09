/* ValueGrid v2 — refined map app */
import { WORLD } from './world.js';
import { COMPANIES, FLOWS } from './data.js';

const C=COMPANIES, FL=FLOWS;
const byId=Object.fromEntries(C.map(c=>[c.id,c]));
const SEC={tech:'#5b8cff',fin:'#2dd4e8',energy:'#f5b042',health:'#3fd68a',cons:'#f472b6',ind:'#a78bfa',gov:'#e2e8f0'};
const SECNAME={tech:'Technology',fin:'Finance',energy:'Energy',health:'Healthcare',cons:'Consumer',ind:'Industrials',gov:'Government / Central Bank'};
const PCOL={R:'#3fd68a',E:'#f5b042',I:'#ff6b7a'}, PNAME={R:'Reported',E:'Estimated',I:'Inferred'};
const PERIODS=['2019','2020','2021','2022','2023','2024'], TMUL=[.62,.60,.82,.95,.97,1.0];
let sizeBy='mcap',secOn={},layerOn={R:1,E:1,I:1},tIdx=5,playing=false,live=false,selected=null,hover=null;
Object.keys(SEC).forEach(s=>secOn[s]=1);
const fmt=v=>v>=1000?'$'+(v/1000).toFixed(2)+'T':(v>=1?'$'+v.toFixed(0)+'B':'$'+(v*1000).toFixed(0)+'M');

/* ---- projection (equirectangular w/ smooth view) ---- */
const map=document.getElementById('map'),mx=map.getContext('2d');
let MW=0,MH=0;
let view={cx:10,cy:25,scale:1}, target={cx:10,cy:25,scale:1};
function pxPerDeg(){return (MW/360)*view.scale;}
function proj(lon,lat){const s=pxPerDeg();return{x:MW/2+(lon-view.cx)*s, y:MH/2-(lat-view.cy)*s*0.95};}
function unproj(x,y){const s=pxPerDeg();return{lon:view.cx+(x-MW/2)/s, lat:view.cy-(y-MH/2)/(s*0.95)};}

/* ---- filtered data ---- */
const visC=()=>C.filter(c=>secOn[c.sec]);
const visF=()=>{const m=TMUL[tIdx];return FL.filter(e=>layerOn[e.p]&&byId[e.f]&&byId[e.t]&&secOn[byId[e.f].sec]&&secOn[byId[e.t].sec]).map(e=>({...e,vv:e.v*m}));};

/* ---- rendering ---- */
let pulse=0,t0=performance.now(),lastDrawn=[];
function frame(now){
  const dt=Math.min(2,(now-t0)/16.7);t0=now;
  // ease view toward target
  view.cx+=(target.cx-view.cx)*0.16*dt; view.cy+=(target.cy-view.cy)*0.16*dt; view.scale+=(target.scale-view.scale)*0.16*dt;
  // clamp center to keep map on-screen (limits widen with zoom)
  target.cx=Math.max(-200,Math.min(200,target.cx)); target.cy=Math.max(-88,Math.min(95,target.cy));
  view.cx=Math.max(-220,Math.min(220,view.cx)); view.cy=Math.max(-92,Math.min(98,view.cy));
  pulse=(pulse+(live?0.018:0.008)*dt)%1;
  render();
  requestAnimationFrame(frame);
}
function render(){
  MW=map.width=map.clientWidth*devicePixelRatio; MH=map.height=map.clientHeight*devicePixelRatio;
  map.style.width='100%';map.style.height='100%';
  mx.setTransform(1,0,0,1,0,0);
  // bg
  mx.clearRect(0,0,MW,MH);
  // graticule
  mx.strokeStyle='rgba(90,120,170,.08)';mx.lineWidth=1;
  for(let lon=-180;lon<=180;lon+=20){const a=proj(lon,85),b=proj(lon,-85);mx.beginPath();mx.moveTo(a.x,a.y);mx.lineTo(b.x,b.y);mx.stroke();}
  for(let lat=-60;lat<=80;lat+=20){const a=proj(-180,lat),b=proj(180,lat);mx.beginPath();mx.moveTo(a.x,a.y);mx.lineTo(b.x,b.y);mx.stroke();}
  // land (real coastlines)
  mx.lineWidth=1*devicePixelRatio;
  WORLD.forEach(r=>{
    mx.beginPath();
    for(let i=0;i<r.length;i+=2){const p=proj(r[i],r[i+1]);i?mx.lineTo(p.x,p.y):mx.moveTo(p.x,p.y);}
    mx.closePath();
    mx.fillStyle='#142036';mx.fill();
    mx.strokeStyle='#27375a';mx.stroke();
  });
  // subtle land top-light overlay
  const fl=visF();
  // arcs
  fl.forEach(e=>{
    const A=byId[e.f],B=byId[e.t];const a=proj(A.lng,A.lat),b=proj(B.lng,B.lat);
    const hot=selected&&(e.f===selected||e.t===selected);
    if(selected&&!hot)return;
    const col=PCOL[e.p];
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,lift=Math.min(180*devicePixelRatio,len*0.3);
    const mxp=(a.x+b.x)/2,myp=(a.y+b.y)/2,cx=mxp-dy/len*lift,cy=myp+dx/len*lift-lift*0.3;
    mx.globalAlpha=hot?0.95:0.34;
    mx.setLineDash(e.p==='R'?[]:(e.p==='E'?[8*devicePixelRatio,6*devicePixelRatio]:[2*devicePixelRatio,7*devicePixelRatio]));
    mx.lineWidth=Math.max(1,Math.log(e.vv+1)*0.6)*(hot?1.7:1)*devicePixelRatio;
    if(hot){mx.shadowBlur=12*devicePixelRatio;mx.shadowColor=col;}
    mx.strokeStyle=col;mx.beginPath();mx.moveTo(a.x,a.y);mx.quadraticCurveTo(cx,cy,b.x,b.y);mx.stroke();
    mx.shadowBlur=0;mx.setLineDash([]);
    if(hot||!selected){const t=(pulse+(e.f.charCodeAt(0)%9)/9)%1;const q=quad(a,{x:cx,y:cy},b,t);
      mx.globalAlpha=hot?1:0.55;mx.fillStyle=col;if(hot){mx.shadowBlur=8*devicePixelRatio;mx.shadowColor=col;}
      mx.beginPath();mx.arc(q.x,q.y,(hot?3:2)*devicePixelRatio,0,6.28);mx.fill();mx.shadowBlur=0;
      if(hot){const q2=quad(a,{x:cx,y:cy},b,0.97);arrow(q2,b,col);}}
  });
  mx.globalAlpha=1;
  // pins. Radius shrinks as you zoom in so dense clusters reveal separation
  // instead of overlapping into a blob.
  const sized=visC();
  const sizeVal=c=>{const v=c[sizeBy]; return v>0?v:c.rev;}; // macro nodes have mcap 0 → fall back to flow scale (rev)
  const maxV=Math.max(...sized.map(sizeVal))||1;
  const zoomShrink=Math.max(0.35, Math.min(1, 1.6/Math.sqrt(view.scale))); // 1 at scale~2.5, ~0.35 floor
  const drawn=[];
  sized.slice().sort((p,q)=>sizeVal(q)-sizeVal(p)).forEach(c=>{
    const s=proj(c.lng,c.lat);
    if(s.x<-60||s.x>MW+60||s.y<-60||s.y>MH+60)return;
    const r=(4+Math.sqrt(sizeVal(c)/maxV)*26)*devicePixelRatio*zoomShrink;
    drawn.push({c,x:s.x,y:s.y,ox:s.x,oy:s.y,r});
  });
  // collision relaxation: always keep pins from overlapping into a blob, at
  // every zoom level. Pins settle near their true coordinates but never cover
  // each other, so dense clusters stay readable whether zoomed out or in.
  for(let pass=0;pass<8;pass++){
    for(let i=0;i<drawn.length;i++)for(let j=i+1;j<drawn.length;j++){
      const a=drawn[i],b=drawn[j];let dx2=b.x-a.x,dy2=b.y-a.y,d=Math.hypot(dx2,dy2)||0.01;
      const want=(a.r+b.r)*0.62+6*devicePixelRatio;
      if(d<want){const push=(want-d)/2;const ux=dx2/d,uy=dy2/d;a.x-=ux*push;a.y-=uy*push;b.x+=ux*push;b.y+=uy*push;}
    }
  }
  // tether back toward true location; at high zoom the tether nearly releases
  // so coincident companies fan out into a readable cluster instead of stacking.
  const tether=Math.max(0.015, 0.12/Math.max(1,view.scale*0.6));
  drawn.forEach(p=>{p.x+=(p.ox-p.x)*tether;p.y+=(p.oy-p.y)*tether;});
  lastDrawn=drawn;
  // draw connector when a pin was nudged, then big pins first, small on top
  drawn.forEach(p=>{const dd=Math.hypot(p.x-p.ox,p.y-p.oy);if(dd>p.r*0.8){mx.strokeStyle='rgba(255,255,255,.18)';mx.lineWidth=1*devicePixelRatio;mx.beginPath();mx.moveTo(p.ox,p.oy);mx.lineTo(p.x,p.y);mx.stroke();}});
  drawn.slice().reverse().forEach(({c,x,y,r})=>{const s={x,y};
    const sel=c.id===selected,hov=hover&&hover.id===c.id;
    const isGov=c.sec==='gov'||c.mcap===0; // governments, central banks, household sectors
    function shape(rr){if(isGov){mx.moveTo(s.x,s.y-rr);mx.lineTo(s.x+rr,s.y);mx.lineTo(s.x,s.y+rr);mx.lineTo(s.x-rr,s.y);mx.closePath();}else{mx.arc(s.x,s.y,rr,0,6.28);}}
    // glow
    if(sel||hov){mx.beginPath();shape(r+8*devicePixelRatio);const g=mx.createRadialGradient(s.x,s.y,r,s.x,s.y,r+10*devicePixelRatio);g.addColorStop(0,SEC[c.sec]+'66');g.addColorStop(1,SEC[c.sec]+'00');mx.fillStyle=g;mx.fill();}
    mx.beginPath();shape(r);
    mx.fillStyle=SEC[c.sec];mx.globalAlpha=sel?1:(selected?0.4:0.82);
    if(!selected||sel){mx.shadowBlur=(sel||hov?14:6)*devicePixelRatio;mx.shadowColor=SEC[c.sec];}
    mx.fill();mx.shadowBlur=0;mx.globalAlpha=1;
    mx.lineWidth=(sel||hov?2.2:1.2)*devicePixelRatio;mx.strokeStyle=sel||hov?'#fff':'rgba(255,255,255,.55)';mx.stroke();
    // provenance dot
    mx.fillStyle=PCOL[c.prov];mx.strokeStyle='#0a0e16';mx.lineWidth=1.3*devicePixelRatio;
    mx.beginPath();mx.arc(s.x+r*0.7,s.y-r*0.7,3.2*devicePixelRatio,0,6.28);mx.fill();mx.stroke();
    if(r>15*devicePixelRatio||sel||hov||view.scale>=4){
      mx.fillStyle=sel||hov?'#fff':'#c9d4e3';
      mx.font=(sel||hov?'700 ':'600 ')+(11*devicePixelRatio)+'px Inter,-apple-system,Segoe UI,Roboto,sans-serif';
      mx.textAlign='center';mx.fillText(c.id,s.x,s.y+r+13*devicePixelRatio);
    }
  });
  document.getElementById('ctlTop').innerHTML=`<b>${live?'Real-time (sim)':PERIODS[tIdx]}</b> · ${sized.length} entities · ${fl.length} flows · sized by <b>${sizeBy==='mcap'?'market cap':'revenue'}</b> · zoom <b>${view.scale.toFixed(1)}×</b>`;
}
function quad(a,c,b,t){const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};}
function arrow(f,t,col){const an=Math.atan2(t.y-f.y,t.x-f.x),sz=6*devicePixelRatio;mx.fillStyle=col;mx.beginPath();mx.moveTo(t.x,t.y);mx.lineTo(t.x-sz*Math.cos(an-.4),t.y-sz*Math.sin(an-.4));mx.lineTo(t.x-sz*Math.cos(an+.4),t.y-sz*Math.sin(an+.4));mx.closePath();mx.fill();}

/* ---- interaction ---- */
let panning=false,last={x:0,y:0},moved=false;
function pick(px,py){const dpr=devicePixelRatio;px*=dpr;py*=dpr;let best=null,bd=1e9;for(const p of lastDrawn){const d=Math.hypot(px-p.x,py-p.y);if(d<=p.r+5*dpr&&d<bd){bd=d;best=p.c;}}return best;}
map.addEventListener('mousedown',e=>{panning=true;moved=false;last={x:e.offsetX,y:e.offsetY};});
map.addEventListener('mousemove',e=>{const px=e.offsetX,py=e.offsetY;
  if(panning){const dx=px-last.x,dy=py-last.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;const s=pxPerDeg()/devicePixelRatio;target.cx-=dx/s;target.cy+=dy/(s*0.95);view.cx=target.cx;view.cy=target.cy;last={x:px,y:py};const tp=document.getElementById('tip');if(tp)tp.style.opacity=0;return;}
  const c=pick(px,py);hover=c;const tip=document.getElementById('tip');if(!tip)return;
  if(c){const m=TMUL[tIdx];const isGov=c.mcap===0;tip.innerHTML=`<div class="t">${c.name}</div><div class="s">${SECNAME[c.sec]} · ${c.country}</div><div class="s">${isGov?'Annual flows ~'+fmt(c.rev*m):'Cap '+fmt(c.mcap)+' · Rev '+fmt(c.rev*m)}</div><div class="pv"><i style="background:${PCOL[c.prov]}"></i>${PNAME[c.prov]} ${isGov?'(modeled)':'revenue'}</div>`;tip.style.left=Math.min(px+16,map.clientWidth-240)+'px';tip.style.top=(py+16)+'px';tip.style.opacity=1;map.style.cursor='pointer';}
  else{tip.style.opacity=0;map.style.cursor=panning?'grabbing':'grab';}});
window.addEventListener('mouseup',e=>{if(panning&&!moved){const r=map.getBoundingClientRect();const c=pick(e.clientX-r.left,e.clientY-r.top);if(c)selectNode(c.id);}panning=false;});
map.addEventListener('wheel',e=>{e.preventDefault();const before=unproj(e.offsetX*devicePixelRatio,e.offsetY*devicePixelRatio);target.scale=view.scale=Math.max(0.8,Math.min(80,view.scale*(e.deltaY<0?1.18:0.85)));const after=unproj(e.offsetX*devicePixelRatio,e.offsetY*devicePixelRatio);target.cx=view.cx+=before.lon-after.lon;target.cy=view.cy+=before.lat-after.lat;},{passive:false});
map.addEventListener('dblclick',e=>{const before=unproj(e.offsetX*devicePixelRatio,e.offsetY*devicePixelRatio);target.scale=Math.min(80,target.scale*2);target.cx=before.lon;target.cy=before.lat;});
document.getElementById('zin').onclick=()=>target.scale=Math.min(80,target.scale*1.6);
document.getElementById('zout').onclick=()=>target.scale=Math.max(0.8,target.scale/1.6);
document.getElementById('zfit').onclick=()=>{target={cx:10,cy:25,scale:1};selected=null;renderInspectorEmpty();};

/* ---- inspector ---- */
function selectNode(id){selected=id;const n=byId[id],m=TMUL[tIdx];
  target.cx=n.lng;target.cy=n.lat;if(target.scale<2)target.scale=2.2;
  const outs=FL.filter(e=>e.f===id&&layerOn[e.p]).map(e=>({...e,vv:e.v*m}));
  const ins=FL.filter(e=>e.t===id&&layerOn[e.p]).map(e=>({...e,vv:e.v*m}));
  const sO=outs.reduce((a,b)=>a+b.vv,0),sI=ins.reduce((a,b)=>a+b.vv,0);
  const mv=Math.max(1,...outs.map(x=>x.vv),...ins.map(x=>x.vv));
  const flowRow=(e,dir)=>{const o=dir==='out'?e.t:e.f,oc=byId[o];return `<div class="flow" data-e="${e.f}|${e.t}"><div class="r1"><div class="who"><span class="ar">${dir==='out'?'→':'←'}</span><span style="width:9px;height:9px;border-radius:50%;background:${SEC[oc.sec]};display:inline-block"></span>${oc.name}<span class="tag ${e.p}">${PNAME[e.p][0]}</span></div><div class="amt">${fmt(e.vv)}</div></div><div class="bar"><i style="width:${Math.min(100,e.vv/mv*100)}%;background:${PCOL[e.p]}"></i></div><div class="meth">confidence ${(e.c*100|0)}%</div></div>`;};
  const html=`
   <div class="ihead"><div class="tk">${n.id}</div><div class="nm">${n.name}</div>
     <div class="meta"><span class="pill"><span class="d" style="background:${SEC[n.sec]}"></span>${SECNAME[n.sec]}</span><span class="pill">📍 ${n.country}</span></div></div>
   <div class="stats">
     <div class="stat"><div class="k">${n.mcap===0?'ANNUAL FLOWS':'MARKET CAP'}</div><div class="v">${n.mcap===0?fmt(n.rev*m):fmt(n.mcap)}<span class="tag E">E</span></div></div>
     <div class="stat"><div class="k">REVENUE · ${PERIODS[tIdx]}</div><div class="v">${fmt(n.rev*m)}<span class="tag ${n.prov}">${PNAME[n.prov][0]}</span></div></div>
     <div class="stat"><div class="k">OUTFLOWS</div><div class="v" style="color:var(--accent)">${fmt(sO)}</div></div>
     <div class="stat"><div class="k">INFLOWS</div><div class="v" style="color:var(--live)">${fmt(sI)}</div></div>
   </div>
   <button class="ddbtn" id="openDD">View relationship graph →</button>
   ${n.prov==='R'?`<div class="verdict ok">✓ Revenue anchored to a primary filing. Market cap is point-in-time (tagged Estimated — it moves every trading day).</div>`:`<div class="verdict warn">⚠ Revenue carries a ${PNAME[n.prov]} tag — modeled or from limited disclosure. Treat as directional.</div>`}
   <div class="flowsec"><div class="lbl">Outflows <span>${outs.length}</span></div>${outs.length?outs.sort((a,b)=>b.vv-a.vv).map(e=>flowRow(e,'out')).join(''):'<div style="color:var(--mut);font-size:12px;padding:6px 0">No seeded outflows. In production these derive from supplier disclosures + input-output tables.</div>'}</div>
   <div class="flowsec" style="border-top:1px solid var(--line)"><div class="lbl">Inflows <span>${ins.length}</span></div>${ins.length?ins.sort((a,b)=>b.vv-a.vv).map(e=>flowRow(e,'in')).join(''):'<div style="color:var(--mut);font-size:12px;padding:6px 0">No seeded inflows in current view.</div>'}</div>
   <div class="mblock" id="methblock"><div class="lbl">Methodology</div><div style="color:var(--mut);font-size:12px">Select a flow above to see how its figure was derived.</div></div>`;
  const el=document.getElementById('inspector');el.innerHTML=html;
  el.querySelectorAll('.flow').forEach(r=>r.onclick=()=>{const[f,t]=r.dataset.e.split('|');showMethod(FL.find(e=>e.f===f&&e.t===t));});
  document.getElementById('openDD').onclick=()=>openDrill(id);
}
function renderInspectorEmpty(){document.getElementById('inspector').innerHTML='<div class="ins-empty"><div class="big">◎</div>Select any node on the map to inspect its scale, capital flows, counterparties, and the provenance behind every figure.</div>';}
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
let ddN=[],ddDrag=null,ddRAF=null,ddC=null;
document.getElementById('ddClose').onclick=closeDrill;
modal.addEventListener('mousedown',e=>{if(e.target===modal)closeDrill();});
function openDrill(id){ddC=id;const eg=FL.filter(e=>(e.f===id||e.t===id)&&layerOn[e.p]);const ids=new Set([id]);eg.forEach(e=>{ids.add(e.f);ids.add(e.t);});ddN=[...ids].map((nid,i)=>{const an=i/ids.size*6.28;return{id:nid,x:nid===id?0:Math.cos(an)*170,y:nid===id?0:Math.sin(an)*170,vx:0,vy:0};});document.getElementById('ddTitle').textContent='Relationships · '+byId[id].name;document.getElementById('ddFoot').innerHTML=`${eg.length} seeded flows. Line style = provenance (solid reported · dashed estimated · dotted inferred). Drag to rearrange. Production resolves the full counterparty set from filings and input-output tables.`;modal.classList.add('show');cancelAnimationFrame(ddRAF);ddLoop();}
function closeDrill(){modal.classList.remove('show');cancelAnimationFrame(ddRAF);}
function ddLoop(){dd.width=dd.clientWidth*devicePixelRatio;dd.height=dd.clientHeight*devicePixelRatio;dx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const W=dd.clientWidth,H=dd.clientHeight,cx=W/2,cy=H/2;const m=Object.fromEntries(ddN.map(n=>[n.id,n]));const eg=FL.filter(e=>m[e.f]&&m[e.t]&&layerOn[e.p]);
  for(let i=0;i<ddN.length;i++)for(let j=i+1;j<ddN.length;j++){const a=ddN[i],b=ddN[j];let ax=a.x-b.x,ay=a.y-b.y,d2=ax*ax+ay*ay||1,f=30000/d2,d=Math.sqrt(d2);a.vx+=ax/d*f;a.vy+=ay/d*f;b.vx-=ax/d*f;b.vy-=ay/d*f;}
  eg.forEach(e=>{const a=m[e.f],b=m[e.t],ax=b.x-a.x,ay=b.y-a.y,d=Math.hypot(ax,ay)||1,f=(d-160)*0.01;a.vx+=ax/d*f;a.vy+=ay/d*f;b.vx-=ax/d*f;b.vy-=ay/d*f;});
  ddN.forEach(n=>{if(n.id===ddC){n.x=0;n.y=0;return;}n.vx+=-n.x*0.01;n.vy+=-n.y*0.01;if(n!==ddDrag){n.x+=n.vx*0.5;n.y+=n.vy*0.5;}n.vx*=0.85;n.vy*=0.85;});
  dx.clearRect(0,0,W,H);
  eg.forEach(e=>{const a=m[e.f],b=m[e.t];dx.strokeStyle=PCOL[e.p];dx.globalAlpha=0.85;dx.setLineDash(e.p==='R'?[]:(e.p==='E'?[6,4]:[2,5]));dx.lineWidth=Math.max(1,Math.log(e.v+1)*0.7);dx.beginPath();dx.moveTo(cx+a.x,cy+a.y);dx.lineTo(cx+b.x,cy+b.y);dx.stroke();dx.setLineDash([]);const t=pulse%1,px=a.x+(b.x-a.x)*t,py=a.y+(b.y-a.y)*t;dx.fillStyle=PCOL[e.p];dx.globalAlpha=1;dx.beginPath();dx.arc(cx+px,cy+py,2.6,0,6.28);dx.fill();dx.fillStyle='#c9d4e3';dx.font='10px Inter,sans-serif';dx.textAlign='center';dx.fillText(fmt(e.v*TMUL[tIdx]),cx+(a.x+b.x)/2,cy+(a.y+b.y)/2-4);});
  dx.globalAlpha=1;
  ddN.forEach(n=>{const c=byId[n.id],r=n.id===ddC?28:19;dx.beginPath();dx.arc(cx+n.x,cy+n.y,r,0,6.28);dx.fillStyle=SEC[c.sec];dx.globalAlpha=n.id===ddC?1:0.88;dx.shadowBlur=n.id===ddC?16:6;dx.shadowColor=SEC[c.sec];dx.fill();dx.shadowBlur=0;dx.globalAlpha=1;dx.lineWidth=n.id===ddC?3:1.5;dx.strokeStyle='#fff';dx.stroke();dx.fillStyle=PCOL[c.prov];dx.strokeStyle='#101725';dx.lineWidth=1.4;dx.beginPath();dx.arc(cx+n.x+r*0.7,cy+n.y-r*0.7,3.4,0,6.28);dx.fill();dx.stroke();dx.fillStyle='#fff';dx.font='600 11px Inter,sans-serif';dx.textAlign='center';dx.fillText(n.id,cx+n.x,cy+n.y+r+14);});
  ddRAF=requestAnimationFrame(ddLoop);}
dd.addEventListener('mousedown',e=>{const W=dd.clientWidth,H=dd.clientHeight,px=e.offsetX-W/2,py=e.offsetY-H/2;ddDrag=ddN.find(n=>Math.hypot(px-n.x,py-n.y)<24)||null;});
dd.addEventListener('mousemove',e=>{if(ddDrag){const W=dd.clientWidth,H=dd.clientHeight;ddDrag.x=e.offsetX-W/2;ddDrag.y=e.offsetY-H/2;ddDrag.vx=ddDrag.vy=0;}});
window.addEventListener('mouseup',()=>ddDrag=null);

/* ---- panels ---- */
function buildSectors(){const ct={};C.forEach(c=>ct[c.sec]=(ct[c.sec]||0)+1);document.getElementById('sectors').innerHTML=Object.keys(SEC).map(s=>`<button class="chip ${secOn[s]?'on':''}" data-s="${s}" style="${secOn[s]?'background:'+SEC[s]+'1a;border-color:'+SEC[s]+'66':''}"><span class="l"><span class="d" style="background:${SEC[s]}"></span>${SECNAME[s]}</span><span class="ct">${ct[s]}</span></button>`).join('');document.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{secOn[b.dataset.s]=!secOn[b.dataset.s];buildSectors();refreshStats();});}
function buildLayers(){const L={R:'Filing-anchored revenue & disclosures',E:'Modeled from disclosure + I-O; point-in-time caps',I:'Third-party or allocation heuristics'};document.getElementById('layers').innerHTML=Object.keys(L).map(k=>`<div class="leg ${layerOn[k]?'':'off'}" data-l="${k}"><span class="ln" style="border-color:${PCOL[k]};border-top-style:${k==='R'?'solid':k==='E'?'dashed':'dotted'}"></span><div><div class="ttl" style="color:${PCOL[k]}">${PNAME[k]}</div><div class="sub">${L[k]}</div></div></div>`).join('');document.querySelectorAll('[data-l]').forEach(el=>el.onclick=()=>{layerOn[el.dataset.l]=!layerOn[el.dataset.l];buildLayers();refreshStats();if(selected)selectNode(selected);});}
function refreshStats(){const sc=visC(),fl=visF();document.getElementById('hCap').textContent=fmt(sc.reduce((a,c)=>a+c.mcap,0));document.getElementById('hF').textContent=fl.length;document.getElementById('hN').textContent=sc.length;const mix={R:0,E:0,I:0};fl.forEach(e=>mix[e.p]+=e.vv);const tot=mix.R+mix.E+mix.I||1;document.getElementById('provmix').innerHTML=['R','E','I'].map(k=>`<div class="mixrow"><div class="h"><b style="color:${PCOL[k]}">${PNAME[k]}</b><span>${(mix[k]/tot*100).toFixed(0)}%</span></div><div class="track"><i style="width:${mix[k]/tot*100}%;background:${PCOL[k]}"></i></div></div>`).join('')+`<div class="note">Share of visible flow volume by source quality. Toggle layers to see how much rests on modeling vs. reported figures.</div>`;}

/* ---- search ---- */
const srch=document.getElementById('srch'),reslist=document.getElementById('reslist');
srch.oninput=()=>{const q=srch.value.toLowerCase().trim();if(!q){reslist.innerHTML='';return;}const h=C.filter(c=>c.name.toLowerCase().includes(q)||c.id.toLowerCase().includes(q)||c.country.toLowerCase().includes(q)).slice(0,24);reslist.innerHTML=h.map(c=>`<div class="resrow" data-id="${c.id}"><span class="dot" style="background:${SEC[c.sec]}"></span><span class="nm">${c.name}</span><span class="cty">${c.country}</span></div>`).join('')||'<div class="note" style="padding:8px">No matches.</div>';reslist.querySelectorAll('[data-id]').forEach(r=>r.onclick=()=>{selectNode(r.dataset.id);srch.value='';reslist.innerHTML='';});};

/* ---- size toggle / time / live ---- */
document.querySelectorAll('#sizeBy button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#sizeBy button').forEach(x=>x.classList.remove('on'));b.classList.add('on');sizeBy=b.dataset.by;});
const scrub=document.getElementById('scrub');scrub.oninput=()=>{tIdx=+scrub.value;document.getElementById('period').textContent=PERIODS[tIdx];refreshStats();if(selected)selectNode(selected);};
document.getElementById('play').onclick=function(){playing=!playing;this.textContent=playing?'⏸':'▶';if(playing){const iv=setInterval(()=>{if(!playing){clearInterval(iv);return;}tIdx=(tIdx+1)%6;scrub.value=tIdx;scrub.oninput();},1100);}};
const feeds=[{k:'WTI Crude',v:72.4,u:''},{k:'Brent',v:76.1,u:''},{k:'USD/JPY',v:151.2,u:''},{k:'EUR/USD',v:1.083,u:''},{k:'10Y UST',v:4.21,u:'%'},{k:'Gold',v:2032,u:''}];
const sd=Array.from({length:90},()=>50);
function tick(){if(live)feeds.forEach(f=>{const d=(Math.random()-0.5)*f.v*0.004;f.v=Math.max(.001,f.v+d);f.dir=d>=0;});document.getElementById('feeds').innerHTML=feeds.map(f=>`<div class="feed"><span class="k">${f.k}</span><span class="v ${f.dir?'up':'down'}">${f.v>100?f.v.toFixed(1):f.v.toFixed(3)}${f.u} ${live?(f.dir?'▲':'▼'):''}</span></div>`).join('');if(live){sd.push(sd[sd.length-1]+(Math.random()-.48)*6);sd.shift();}drawSpark();}
const sc=document.getElementById('spark'),sx=sc.getContext('2d');
function drawSpark(){sc.width=sc.clientWidth*devicePixelRatio;sc.height=38*devicePixelRatio;sx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const w=sc.clientWidth,h=38,mn=Math.min(...sd),mv=Math.max(...sd);sx.clearRect(0,0,w,h);sx.beginPath();sd.forEach((v,i)=>{const x=i/sd.length*w,y=h-((v-mn)/((mv-mn)||1))*(h-6)-3;i?sx.lineTo(x,y):sx.moveTo(x,y);});sx.strokeStyle=live?'#2dd4e8':'#5b8cff';sx.lineWidth=1.8;sx.stroke();}
document.getElementById('liveBtn').onclick=function(){live=!live;this.classList.toggle('on',live);document.getElementById('liveDot').classList.toggle('on',live);document.getElementById('period').textContent=live?'LIVE':PERIODS[tIdx];};
setInterval(tick,900);
setInterval(()=>document.getElementById('clock').textContent=new Date().toLocaleTimeString('en-GB'),1000);
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrill();});

/* boot */
buildSectors();buildLayers();refreshStats();tick();requestAnimationFrame(frame);
setTimeout(()=>selectNode('NVDA'),400);
