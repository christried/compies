/* Battle replay: three concept players on shared session data. */
(function(){
const TEAMS=[{t:1,n:'Wilde Gurken',s:'Gurken',c:'#e4572e',ink:'#151515'},{t:8,n:'Nacht Eulen',s:'Eulen',c:'#3d2d8f',ink:'#fffdf8'},{t:2,n:'Team Orange',s:'Orange',c:'#f0a202',ink:'#151515'},{t:4,n:'Käse Turbo',s:'Käse',c:'#56b4e9',ink:'#151515'}];
const GAMES=[['Rocket League',[4,3,1,0]],['Mario Kart 8',[2,4,1,1]],['Counter-Strike 2',[1,4,0,2]],['Overcooked 2',[4,1,3,0]],['Codenames',[1,2,4,1]],['Gang Beasts',[5,1,0,1]]];
const REFS=['GG!','Combo x2!','Clutch!','Respawn in 3 …','Level up!','Achievement freigeschaltet','Speedrun!','Lag?!','1-Up!','Boss-Kampf!','Kritischer Treffer!','Noob-Falle!','Comeback-Modus','Neuer Highscore','Taktik-Pause','Daumen am Controller'];
const TOT=[];{let acc=[0,0,0,0];GAMES.forEach(g=>{acc=acc.map((v,i)=>v+g[1][i]);TOT.push(acc.slice());});}
const MAX=TOT[TOT.length-1].reduce((a,b)=>Math.max(a,b),0);
const rank=a=>a.map((v,i)=>[v,i]).sort((x,y)=>y[0]-x[0]||x[1]-y[1]).map(x=>x[1]);
const winOf=g=>g[1].indexOf(Math.max(...g[1]));
const S=(r,s)=>r&&CBO.toState(r,s);
let refBag=[];const ref=()=>{if(!refBag.length)refBag=gsap.utils.shuffle(REFS.slice());return refBag.pop();};
const mk=(tag,css,txt)=>{const e=document.createElement(tag);e.style.cssText=css;if(txt!=null)e.textContent=txt;return e;};
const q=(el,k)=>el.querySelector('[data-k="'+k+'"]');
function say(b,t){if(!b)return;b.textContent=t;gsap.fromTo(b,{opacity:0,scale:.6,y:6},{opacity:1,scale:1,y:0,duration:.3,ease:'back.out(3)'});}
function chip(layer,x,y,txt,bg){const c=mk('span',`position:absolute;left:${x}px;top:${y}px;padding:2px 8px;border:2.5px solid #151515;border-radius:999px;background:${bg||'#ffd23f'};font:800 14px 'Bricolage Grotesque',sans-serif;color:#151515;pointer-events:none;z-index:6`,txt);layer.appendChild(c);gsap.timeline({onComplete:()=>c.remove()}).fromTo(c,{y:0,opacity:0,scale:.5},{y:-26,opacity:1,scale:1,duration:.35,ease:'back.out(3)'}).to(c,{y:-46,opacity:0,duration:.4,delay:.4});}
function counter(el,i){const c=q(el,'gno');if(c)c.textContent=i<0?'Start':'Spiel '+(i+1)+' / '+GAMES.length;}
function cutin(tl,el,i,t,dark){const ci=q(el,'cut');tl.call(()=>{ci.querySelector('b').textContent='Spiel '+(i+1);ci.querySelector('span').textContent=GAMES[i][0];counter(el,i);},null,t)
  .fromTo(ci,{x:'110%',skewX:-12},{x:'0%',skewX:-12,duration:.32,ease:'power3.out'},t).to(ci,{x:'-120%',duration:.28,ease:'power3.in'},t+.95);}

const SC={};
SC.race=(el,R)=>{const cb=R.race,track=q(el,'track'),fx=q(el,'fx'),ci=q(el,'cut'),W=track.offsetWidth,LH=track.offsetHeight/4,X0=8,X1=W-96;
  const tok=TEAMS.map((T,i)=>{const lane=mk('div',`position:absolute;left:0;right:0;top:${i*LH}px;height:${LH}px;border-bottom:${i<3?'2px dashed rgba(21,21,21,.25)':'0'}`);track.appendChild(lane);
    const k=mk('div',`position:absolute;left:0;top:${i*LH+LH/2-21}px;width:42px;height:42px;border-radius:50%;border:3px solid #151515;background:${T.c};color:${T.ink};display:grid;place-items:center;font:800 15px 'Bricolage Grotesque',sans-serif;box-shadow:3px 3px 0 #151515;z-index:2`,T.s.slice(0,2).toUpperCase());track.appendChild(k);
    const pts=mk('span',`position:absolute;left:0;top:${i*LH+LH/2-11}px;font:400 16px 'Bungee',sans-serif;color:#151515;z-index:2`,'0');track.appendChild(pts);return {k,pts};});
  const xOf=v=>X0+(X1-X0)*v/MAX;let tl;
  const reset=()=>{tl&&tl.kill();fx.innerHTML='';tok.forEach(o=>{gsap.set(o.k,{x:xOf(0),y:0,scale:1});gsap.set(o.pts,{x:xOf(0)+56});o.pts.textContent='0';});gsap.set(ci,{autoAlpha:0,y:-14});counter(el,-1);S(cb,'idle');};
  reset();
  return {play(){reset();tl=gsap.timeline();let t=.25,lead=-1;const STEP=1.45;
    GAMES.forEach((g,i)=>{const w=winOf(g),tot=TOT[i],nl=rank(tot)[0];
      tl.call(()=>{ci.querySelector('b').textContent='Spiel '+(i+1);ci.querySelector('span').textContent=g[0];counter(el,i);},null,t)
        .fromTo(ci,{autoAlpha:0,y:-14},{autoAlpha:1,y:0,duration:.2,ease:'back.out(2.5)'},t).to(ci,{autoAlpha:0,y:10,duration:.18,ease:'power2.in'},t+1.15);
      tok.forEach((o,j)=>{tl.to(o.k,{x:xOf(tot[j]),duration:.5,ease:'power2.inOut'},t+.35+j*.04).to(o.pts,{x:xOf(tot[j])+56,duration:.5,ease:'power2.inOut'},t+.35+j*.04).call(()=>{o.pts.textContent=tot[j];},null,t+.6);});
      tl.to(tok[w].k,{y:-12,duration:.12,yoyo:true,repeat:3,ease:'power1.out'},t+.4).call(()=>{const c=mk('span',`position:absolute;left:${xOf(tot[w])+track.offsetLeft+21}px;top:${track.offsetTop+w*LH+LH/2-21-14}px;padding:1px 7px;border:2.5px solid #151515;border-radius:999px;background:#ffd23f;font:400 13px 'Bungee',sans-serif;color:#151515;white-space:nowrap;pointer-events:none;z-index:7`,'+'+g[1][w]);fx.appendChild(c);gsap.timeline({onComplete:()=>c.remove()}).fromTo(c,{xPercent:-50,y:6,opacity:0,scale:.4},{y:0,opacity:1,scale:1,duration:.22,ease:'back.out(3)'}).to(c,{y:-6,opacity:0,duration:.25,delay:.35});},null,t+.75);
      const changed=nl!==lead&&i>0;lead=nl;
      tl.call(()=>S(cb,changed?'excited':'clap'),null,t+.4).call(()=>S(cb,'idle'),null,t+1.2);
      if(changed) tl.call(()=>{const s=mk('span',`position:absolute;left:${Math.max(track.offsetLeft+2,xOf(tot[nl])+track.offsetLeft-92)}px;top:${track.offsetTop+nl*LH+LH/2-13}px;padding:2px 8px;border:2.5px solid #151515;border-radius:6px;background:#ff4f4f;color:#151515;font:400 13px 'Bungee',sans-serif;transform:rotate(-8deg);z-index:7`,'FÜHRUNG');fx.appendChild(s);gsap.timeline({onComplete:()=>s.remove()}).fromTo(s,{scale:2.2,opacity:0},{scale:1,opacity:1,duration:.22,ease:'back.out(2.5)'}).to(s,{opacity:0,duration:.2,delay:.3});},null,t+1.0);
      t+=STEP;});
    const wn=rank(TOT[TOT.length-1])[0];
    tl.call(()=>{S(cb,'dance');counter(el,GAMES.length-1);ci.querySelector('b').textContent='Sieg';ci.querySelector('span').textContent=TEAMS[wn].n;},null,t).fromTo(ci,{autoAlpha:0,y:-14},{autoAlpha:1,y:0,duration:.25,ease:'back.out(2.5)'},t)
      .to(tok[wn].k,{scale:1.3,duration:.35,ease:'back.out(3)'},t).to(tok[wn].pts,{x:xOf(MAX)+58,duration:.35,ease:'back.out(3)'},t)
      .call(()=>{const c=mk('span',`position:absolute;left:${xOf(MAX)+track.offsetLeft+5}px;top:${track.offsetTop+wn*LH-6}px;z-index:7`,'');c.innerHTML='<svg viewBox="0 0 40 26" width="34" height="22"><path d="M3 23L6 5L14 14L20 2L26 14L34 5L37 23Z" style="fill:#ffd23f;stroke:#151515;stroke-width:3;stroke-linejoin:round"></path></svg>';fx.appendChild(c);gsap.from(c,{y:-30,opacity:0,duration:.4,ease:'bounce.out'});},null,t+.15);}};};

SC.arena=(el,R)=>{const cb=R.arena,ar=q(el,'ring'),fx=q(el,'fx'),strip=q(el,'strip'),bub=q(el,'bub'),AW=ar.offsetWidth,AH=ar.offsetHeight,CX=AW/2,CY=AH/2;
  const home=[[CX-150,CY-56],[CX+150,CY-56],[CX-150,CY+56],[CX+150,CY+56]];
  const sh=TEAMS.map((T,i)=>{const d=mk('div',`position:absolute;left:0;top:0;width:64px;height:72px;margin:-36px 0 0 -32px;z-index:2`);
    d.innerHTML=`<svg viewBox="0 0 64 72" width="64" height="72" style="display:block;overflow:visible"><path d="M32 3L60 12V36C60 54 46 66 32 70C18 66 4 54 4 36V12Z" style="fill:${T.c};stroke:#151515;stroke-width:4;stroke-linejoin:round"></path><text x="32" y="44" text-anchor="middle" style="font:800 20px 'Bricolage Grotesque',sans-serif;fill:${T.ink}">${T.s.slice(0,2).toUpperCase()}</text></svg>`;ar.appendChild(d);return d;});
  const chips=TEAMS.map(T=>{const c=mk('div',`position:absolute;left:0;top:0;width:92px;box-sizing:border-box;display:flex;align-items:center;gap:5px;height:34px;padding:0 7px;border:2.5px solid #151515;border-radius:10px;background:#fffdf8;box-shadow:2px 2px 0 #151515;font:800 12px 'Bricolage Grotesque',sans-serif;color:#151515;white-space:nowrap;overflow:hidden`);c.innerHTML=`<i style="flex:none;width:12px;height:12px;border-radius:3px;border:2px solid #151515;background:${T.c}"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${T.s}</span><b style="flex:none;font:400 13px 'Bungee',sans-serif">0</b>`;strip.appendChild(c);return c;});
  const slotW=(strip.offsetWidth)/4;let tl;
  const place=(r,dur,tl0,at)=>r.forEach((ti,pos)=>{const v={x:pos*slotW+4,duration:dur,ease:'power3.inOut'};tl0?tl0.to(chips[ti],v,at):gsap.set(chips[ti],{x:v.x});});
  const scl=v=>.75+.6*v/MAX;
  const reset=()=>{tl&&tl.kill();fx.innerHTML='';sh.forEach((d,i)=>gsap.set(d,{x:home[i][0],y:home[i][1],scale:scl(0),rotation:0}));chips.forEach(c=>c.querySelector('b').textContent='0');place([0,1,2,3]);gsap.set(q(el,'cut'),{x:'110%'});gsap.set(bub,{opacity:0});counter(el,-1);S(cb,'idle');};
  reset();
  const wave=()=>{const w=mk('div',`position:absolute;left:${CX-30}px;top:${CY-30}px;width:60px;height:60px;border-radius:50%;border:4px solid #151515;z-index:1`);fx.appendChild(w);gsap.fromTo(w,{scale:.3,opacity:1},{scale:4,opacity:0,duration:.6,ease:'power2.out',onComplete:()=>w.remove()});
    const s=mk('div',`position:absolute;left:${CX-40}px;top:${CY-26}px;font:400 30px 'Lilita One',sans-serif;color:#151515;z-index:7;text-shadow:3px 3px 0 #ffd23f`,['BÄM!','KRACH!','ZACK!','WUMMS!'][Math.floor(Math.random()*4)]);fx.appendChild(s);gsap.timeline({onComplete:()=>s.remove()}).fromTo(s,{scale:.2,rotation:-12},{scale:1.2,rotation:-6,duration:.25,ease:'back.out(3)'}).to(s,{opacity:0,duration:.3,delay:.3});};
  return {play(){reset();tl=gsap.timeline();let t=.3;
    GAMES.forEach((g,i)=>{cutin(tl,el,i,t);const w=winOf(g),tot=TOT[i];
      tl.call(()=>S(cb,'suspense'),null,t+1.1).to(sh[w],{x:CX,y:CY,duration:.35,ease:'power3.in'},t+1.15).call(wave,null,t+1.5).call(()=>{S(cb,'cheer');say(bub,TEAMS[w].s+': '+ref());},null,t+1.5);
      sh.forEach((d,j)=>{if(j===w)return;const dx=home[j][0]-CX,dy=home[j][1]-CY,L=Math.hypot(dx,dy);tl.to(d,{x:home[j][0]+dx/L*26,y:home[j][1]+dy/L*20,rotation:dx>0?18:-18,duration:.18,ease:'power2.out'},t+1.5).to(d,{x:home[j][0],y:home[j][1],rotation:0,duration:.5,ease:'elastic.out(1,.5)'},t+1.7);
        if(g[1][j]) tl.call(()=>chip(fx,home[j][0]-12,home[j][1]-48,'+'+g[1][j],'#fffdf8'),null,t+1.75);});
      tl.call(()=>chip(fx,CX-14,CY-60,'+'+g[1][w]),null,t+1.55).to(sh[w],{x:home[w][0],y:home[w][1],duration:.45,ease:'power2.out'},t+1.85);
      sh.forEach((d,j)=>tl.to(d,{scale:scl(tot[j]),duration:.4,ease:'back.out(2)'},t+1.9));
      tl.call(()=>chips.forEach((c,j)=>c.querySelector('b').textContent=tot[j]),null,t+2);place(rank(tot),.5,tl,t+2);
      tl.call(()=>S(cb,'idle'),null,t+2.4);t+=2.7;});
    const wn=rank(TOT[TOT.length-1])[0];
    tl.to(sh[wn],{x:CX,y:CY,scale:1.7,duration:.6,ease:'back.out(2)'},t).call(()=>{wave();S(cb,'dance');say(bub,TEAMS[wn].n+' gewinnt!');},null,t+.4);
    sh.forEach((d,j)=>{if(j!==wn)tl.to(d,{opacity:.55,scale:'-=.1',duration:.4},t);});}};};

SC.fight=(el,R)=>{const cb=R.fight,fx=q(el,'fx'),bub=q(el,'bub'),L=q(el,'L'),Rr=q(el,'R'),barL=q(el,'barL'),barR=q(el,'barR'),nmL=q(el,'nmL'),nmR=q(el,'nmR'),big=q(el,'big'),lad=q(el,'ladder');
  const rows=TEAMS.map(T=>{const r=mk('div',`display:grid;grid-template-columns:52px minmax(0,1fr) 30px;align-items:center;gap:6px;font:800 12px 'Bricolage Grotesque',sans-serif;color:#f7efe1`);r.innerHTML=`<span>${T.s}</span><i style="display:block;height:12px;border:2px solid #f7efe1;border-radius:3px;background:linear-gradient(90deg,${T.c} 0,${T.c} var(--p,0%),transparent var(--p,0%))"></i><b style="font:400 13px 'Bungee',sans-serif;text-align:right">0</b>`;lad.appendChild(r);return r;});
  const setLad=(tot,tl0,at)=>rows.forEach((r,j)=>{const f=()=>{r.style.setProperty('--p',(tot[j]/MAX*100)+'%');r.querySelector('b').textContent=tot[j];};tl0?tl0.call(f,null,at):f();});
  const fighter=(box,T)=>{box.style.background=T.c;box.style.color=T.ink;box.querySelector('span').textContent=T.s.slice(0,2).toUpperCase();};
  let tl;
  const reset=()=>{tl&&tl.kill();fx.innerHTML='';setLad([0,0,0,0]);gsap.set([L,Rr],{x:0,rotation:0,opacity:0,scale:1});gsap.set(big,{opacity:0});gsap.set([barL,barR],{scaleX:1});nmL.textContent='';nmR.textContent='';gsap.set(q(el,'cut'),{x:'110%'});gsap.set(bub,{opacity:0});counter(el,-1);S(cb,'idle');};
  reset();
  return {play(){reset();tl=gsap.timeline();let t=.3;
    GAMES.forEach((g,i)=>{const r=rank(g[1].map((v,j)=>v*10-j*.01)),a=r[0],b=r[1];cutin(tl,el,i,t);
      tl.call(()=>{fighter(L,TEAMS[a]);fighter(Rr,TEAMS[b]);nmL.textContent=TEAMS[a].s;nmR.textContent=TEAMS[b].s;},null,t+.9)
        .fromTo(L,{x:-120,opacity:0},{x:0,opacity:1,duration:.3,ease:'power3.out'},t+.95).fromTo(Rr,{x:120,opacity:0},{x:0,opacity:1,duration:.3,ease:'power3.out'},t+.95)
        .set([barL,barR],{scaleX:1},t+.95).call(()=>{big.textContent='FIGHT!';S(cb,'excited');},null,t+1.25).fromTo(big,{opacity:1,scale:2.4},{scale:1,duration:.25,ease:'back.out(2)'},t+1.25).to(big,{opacity:0,duration:.15},t+1.6)
        .to(L,{x:60,duration:.12,yoyo:true,repeat:1,ease:'power2.in'},t+1.7).to(barR,{scaleX:.5,duration:.2},t+1.82).to(Rr,{x:10,rotation:6,duration:.06,yoyo:true,repeat:3},t+1.82)
        .to(Rr,{x:-50,duration:.12,yoyo:true,repeat:1,ease:'power2.in'},t+2.05).to(barL,{scaleX:.8,duration:.2},t+2.17)
        .to(L,{x:70,duration:.12,ease:'power2.in'},t+2.4).to(barR,{scaleX:0,duration:.2},t+2.52).to(Rr,{x:90,rotation:70,opacity:.3,duration:.35,ease:'power2.out'},t+2.52)
        .call(()=>{big.textContent='K.O.!';S(cb,'cheer');say(bub,ref());},null,t+2.52).fromTo(big,{opacity:1,scale:2.6,rotation:-6},{scale:1,duration:.3,ease:'back.out(2.5)'},t+2.52)
        .to(big,{opacity:0,duration:.2},t+3.2).to(L,{x:0,duration:.25},t+3.0);
      setLad(TOT[i],tl,t+2.7);tl.call(()=>S(cb,'idle'),null,t+3.3);t+=3.45;});
    const wn=rank(TOT[TOT.length-1])[0];
    tl.call(()=>{fighter(L,TEAMS[wn]);nmL.textContent=TEAMS[wn].s;nmR.textContent='';big.textContent='SIEG!';S(cb,'dance');say(bub,TEAMS[wn].n+' gewinnt!');},null,t)
      .set(Rr,{opacity:0},t).fromTo(L,{x:-120,opacity:0},{x:130,opacity:1,scale:1.3,duration:.45,ease:'back.out(2)'},t).fromTo(big,{opacity:1,scale:2.4},{scale:1,duration:.35,ease:'back.out(2.5)'},t+.2);}};};

window.BR={init:(id,el,R)=>SC[id]?SC[id](el,R):null,TEAMS,GAMES,TOT};
})();
