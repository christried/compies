/* Compibert decision demos: one scene per option. Each scene gets its stage element + mounted rigs by data-id. */
(function(){
const q=(el,k)=>el.querySelector('[data-k="'+k+'"]'),qa=(el,k)=>[...el.querySelectorAll('[data-k="'+k+'"]')];
const S=(r,s)=>r&&CBO.toState(r,s),RN=(a,b)=>gsap.utils.random(a,b);
const PAL=['#ffd23f','#ff70c3','#2ec4b6','#3a86ff','#ff4f4f','#fffdf8'];
function confetti(layer,x,y,n){for(let i=0;i<(n||36);i++){const d=document.createElement('i');
  d.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${RN(6,10)}px;height:${RN(9,14)}px;background:${PAL[i%PAL.length]};border:1.5px solid #151515;border-radius:${i%3?2:50}px;pointer-events:none`;
  layer.appendChild(d);gsap.timeline({onComplete:()=>d.remove()})
   .to(d,{x:RN(-180,180),y:RN(-190,-70),rotation:RN(-360,360),duration:.5,ease:'power2.out'})
   .to(d,{y:'+='+RN(280,420),x:'+='+RN(-50,50),rotation:'+=420',duration:RN(1.3,2),ease:'power1.in'})
   .to(d,{opacity:0,duration:.3},'-=.35');}}
function burst(layer,x,y,col){for(let i=0;i<14;i++){const d=document.createElement('i'),a=i/14*Math.PI*2;
  d.style.cssText=`position:absolute;left:${x-4}px;top:${y-4}px;width:8px;height:8px;border-radius:50%;background:${col};box-shadow:0 0 10px ${col};pointer-events:none`;
  layer.appendChild(d);gsap.timeline({onComplete:()=>d.remove()}).to(d,{x:Math.cos(a)*RN(56,80),y:Math.sin(a)*RN(56,80),duration:.7,ease:'power3.out'}).to(d,{y:'+=26',opacity:0,scale:.3,duration:.6,ease:'power1.in'},.45);}}
function say(b,t){if(!b)return;b.textContent=t;gsap.fromTo(b,{opacity:0,scale:.7,y:6},{opacity:1,scale:1,y:0,duration:.3,ease:'back.out(3)'});}
const SC={};

SC['3a']=(el,R)=>{const cb=R.b3a,egg=q(el,'egg'),top=q(el,'top'),crack=q(el,'crack'),grp=q(el,'grp'),w=q(el,'cbw'),Ls=qa(el,'L'),len=crack.getTotalLength();let tl;
  const reset=()=>{tl&&tl.kill();gsap.set(egg,{rotation:0,transformOrigin:'50% 100%'});gsap.set(top,{x:0,y:0,rotation:0,opacity:1,svgOrigin:'60 70'});gsap.set(crack,{strokeDasharray:len,strokeDashoffset:len});gsap.set(grp,{x:0});gsap.set(w,{y:0});gsap.set(Ls,{y:-50,opacity:0,rotation:i=>i%2?14:-14});S(cb,'idle');};
  reset();
  return {play(){reset();tl=gsap.timeline();
    tl.to(egg,{keyframes:{rotation:[0,5,-5,0]},duration:.4,ease:'none'},.2).to(crack,{strokeDashoffset:len*.5,duration:.2},.75)
      .to(egg,{keyframes:{rotation:[0,9,-9,7,-7,0]},duration:.55,ease:'none'},.9).to(crack,{strokeDashoffset:0,duration:.18},1.4)
      .to(top,{x:80,y:-190,rotation:150,duration:.75,ease:'power2.out'},1.6).to(top,{opacity:0,duration:.25},2.1)
      .to(w,{y:-74,duration:.5,ease:'back.out(2.2)'},1.6).call(()=>S(cb,'cheer'),null,1.6)
      .to(grp,{x:-118,duration:.55,ease:'power2.inOut'},2.7).call(()=>S(cb,'wave'),null,2.7)
      .to(Ls,{y:0,opacity:1,rotation:0,duration:.5,ease:'back.out(3)',stagger:.06},2.9).call(()=>S(cb,'idle'),null,5.2);}};};

SC['3b']=(el,R)=>{const cb=R.b3b,w=q(el,'cbw'),Ls=qa(el,'L'),sl=qa(el,'sl'),dust=qa(el,'dust');let tl;
  const reset=()=>{tl&&tl.kill();gsap.set(w,{x:-620});gsap.set(Ls,{y:46,opacity:0,scaleY:.3,transformOrigin:'50% 100%'});gsap.set(sl,{opacity:0,scaleX:.4,transformOrigin:'100% 50%'});gsap.set(dust,{opacity:0});S(cb,'idle');};
  reset();
  return {play(){reset();tl=gsap.timeline();const T=.9,base=w.offsetLeft+w.offsetWidth*.9-620;
    tl.call(()=>S(cb,'run'),null,0).to(sl,{opacity:1,scaleX:1,duration:.2,stagger:.05},0).to(w,{x:0,duration:T,ease:'none'},0);
    Ls.forEach(L=>{const lx=L.offsetLeft+L.parentElement.offsetLeft+L.offsetWidth/2,t=Math.max(0,(lx-base)/620*T);tl.to(L,{y:0,opacity:1,scaleY:1,duration:.45,ease:'back.out(3)'},t);});
    tl.to(sl,{opacity:0,duration:.15},T-.05).call(()=>S(cb,'idle'),null,T).to(w,{x:16,duration:.16,ease:'power2.out'},T).to(w,{x:0,duration:.3,ease:'back.out(3)'},T+.16)
      .fromTo(dust,{opacity:1,scale:.3,x:0,y:0},{opacity:0,scale:1.7,x:i=>-18-i*16,y:i=>-4-i*5,duration:.65,stagger:.04,ease:'power2.out'},T)
      .call(()=>S(cb,'wave'),null,T+.5).call(()=>S(cb,'idle'),null,T+2.8);}};};

SC['3c']=(el,R)=>{const cb=R.b3c,hole=q(el,'hole'),head=q(el,'head'),Ls=qa(el,'L'),st=q(el,'status');let tl;
  const reset=()=>{tl&&tl.kill();gsap.set(Ls,{opacity:0,y:24,scale:.7});gsap.set(hole,{scale:0});gsap.set(head,{y:96});gsap.set(st,{opacity:0});S(cb,'idle');};
  reset();
  return {play(){reset();tl=gsap.timeline();
    tl.to(Ls,{opacity:1,y:0,scale:1,stagger:.05,duration:.4,ease:'back.out(2.5)'},0).to(hole,{scale:1,duration:.35,ease:'back.out(2.5)'},.1)
      .to(head,{y:34,duration:.3,ease:'power2.out'},.5).call(()=>S(cb,'look'),null,.55)
      .to(head,{y:4,duration:.35,ease:'back.out(3)'},2.1).call(()=>S(cb,'wave'),null,2.1)
      .to(cb.p.lidL,{y:0,duration:.08},2.75).to(cb.p.lidL,{y:-58.3,duration:.14},3.0)
      .to(st,{opacity:1,duration:.2},3.6).call(()=>S(cb,'think'),null,3.6).to(head,{y:30,duration:.45,ease:'sine.inOut',yoyo:true,repeat:3},3.6)
      .to(st,{opacity:0,duration:.2},5.5).to(head,{y:4,duration:.3},5.5).call(()=>S(cb,'idle'),null,5.5);}};};

function wheelScene(el,R,id,fn){const wh=q(el,'wheel'),res=q(el,'res');let tl;
  const base=()=>{tl&&tl.kill();gsap.set(wh,{rotation:0});gsap.set(res,{opacity:0,scale:.6});};
  return {base,run(f){base();tl=gsap.timeline();tl.to(wh,{rotation:1835,duration:3.3,ease:'power3.out'},f.spin||0).to(res,{opacity:1,scale:1,duration:.35,ease:'back.out(3)'},(f.spin||0)+3.3);f(tl);return tl;}};}
SC['4a']=(el,R)=>{const cb=R.p4a,logo=R.p4aLogo,w=q(el,'cbw'),W=wheelScene(el,R);
  const reset=()=>{W.base();gsap.set(w,{y:180});S(cb,'idle');};reset();
  return {play(){reset();W.run(Object.assign(tl=>{tl.to(w,{y:0,duration:.45,ease:'back.out(1.8)'},.1).call(()=>S(cb,'excited'),null,.1).call(()=>S(cb,'suspense'),null,1.9)
    .call(()=>{S(cb,'cheer');S(logo,'cheer');},null,3.3).call(()=>S(logo,'idle'),null,4.6).to(w,{y:180,duration:.4,ease:'power2.in'},5.3);},{spin:0}));}};};
SC['4b']=(el,R)=>{const cb=R.p4b,b=q(el,'bub'),W=wheelScene(el,R);
  const reset=()=>{W.base();S(cb,'idle');b.textContent='Wer dreht?';};reset();
  return {play(){reset();W.run(Object.assign(tl=>{tl.call(()=>{say(b,'Dreht! Dreht!');S(cb,'excited');},null,0).call(()=>{say(b,'Langsamer … langsamer …');S(cb,'suspense');},null,1.9)
    .call(()=>{say(b,'Kaktus! Wusst ich’s.');S(cb,'cheer');},null,3.3).call(()=>S(cb,'idle'),null,5.2).call(()=>say(b,'Wer dreht als Nächstes?'),null,5.8);},{spin:0}));}};};
SC['4c']=(el,R)=>{const cb=R.p4c,w=q(el,'cbw'),W=wheelScene(el,R),DX=+w.dataset.dx,DY=+w.dataset.dy;
  const reset=()=>{W.base();gsap.set(w,{x:0,y:0});S(cb,'idle');};reset();
  const hop=(tl,t,x,y)=>{tl.to(w,{x,duration:.7,ease:'power1.inOut'},t).to(w,{y:Math.min(y,gsap.getProperty(w,'y'))-80,duration:.35,ease:'power2.out'},t).to(w,{y,duration:.35,ease:'power2.in'},t+.35)
    .to(cb.p.root,{scaleY:.84,scaleX:1.1,duration:.08,yoyo:true,repeat:1},t+.7);};
  return {play(){reset();W.run(Object.assign(tl=>{tl.call(()=>S(cb,'cheer'),null,0);hop(tl,.05,DX,DY);tl.call(()=>S(cb,'excited'),null,.9).call(()=>S(cb,'suspense'),null,2.9)
    .call(()=>S(cb,'cheer'),null,4.2).call(()=>S(cb,'idle'),null,5.6);tl.to(w,{x:0,duration:.7,ease:'power1.inOut'},5.8).to(w,{y:DY-80,duration:.35,ease:'power2.out'},5.8).to(w,{y:0,duration:.35,ease:'power2.in'},6.15);},{spin:.9}));}};};

SC['5a']=(el,R)=>{const cb=R.i5a,w=q(el,'cbw'),dots=qa(el,'dot'),b=q(el,'bub');let n=0,dec,back;
  const paint=()=>dots.forEach((d,i)=>d.style.background=i<n?'#ffd23f':'transparent');
  w.addEventListener('pointerdown',e=>{e.preventDefault();clearTimeout(dec);clearTimeout(back);n++;paint();
    if(n>=5){n=0;paint();S(cb,'angry');say(b,'Hey! Lass das.');back=setTimeout(()=>{S(cb,'idle');gsap.to(b,{opacity:0,duration:.2});},2600);return;}
    const pool=['laugh','hop','wave','squash','confused'].filter(x=>x!==w._last),k=pool[Math.floor(Math.random()*pool.length)];w._last=k;
    if(k==='hop'){S(cb,'idle');gsap.timeline().to(cb.p.root,{y:-46,duration:.22,ease:'power2.out',delay:.05}).to(cb.p.root,{y:0,duration:.18,ease:'power2.in'}).to(cb.p.root,{scaleY:.86,scaleX:1.08,duration:.07,yoyo:true,repeat:1});}
    else if(k==='squash'){S(cb,'idle');gsap.timeline().to(cb.p.root,{scaleY:.72,scaleX:1.18,duration:.1,ease:'power2.out',delay:.05}).to(cb.p.root,{scaleY:1,scaleX:1,duration:.5,ease:'elastic.out(1.2,.35)'});}
    else S(cb,k);
    back=setTimeout(()=>S(cb,'idle'),1500);dec=setTimeout(()=>{n=0;paint();},2200);});
  return {play(){}};};

SC['5b']=(el,R)=>{const cb=R.i5b,w=q(el,'cbw'),dust=qa(el,'dust');let drag=false,sx,sy,lx,vx=0,back;
  const qx=gsap.quickTo(w,'x',{duration:.18,ease:'power3'}),qy=gsap.quickTo(w,'y',{duration:.18,ease:'power3'}),qr=gsap.quickTo(w,'rotation',{duration:.35,ease:'power2'});
  gsap.set(w,{transformOrigin:'72% 30%'});
  w.addEventListener('pointerdown',e=>{e.preventDefault();drag=true;clearTimeout(back);w.setPointerCapture(e.pointerId);sx=e.clientX-gsap.getProperty(w,'x');sy=e.clientY-gsap.getProperty(w,'y');lx=e.clientX;gsap.killTweensOf(w,'y');S(cb,'suspense');w.style.cursor='grabbing';});
  w.addEventListener('pointermove',e=>{if(!drag)return;const st=el.getBoundingClientRect(),bw=w.offsetWidth;
    const x=gsap.utils.clamp(-w.offsetLeft,st.width-w.offsetLeft-bw,e.clientX-sx),y=gsap.utils.clamp(-w.offsetTop,0,e.clientY-sy);
    vx=e.clientX-lx;lx=e.clientX;qx(x);qy(y);qr(gsap.utils.clamp(-28,28,-vx*1.4));});
  const drop=()=>{if(!drag)return;drag=false;w.style.cursor='grab';const h=-gsap.getProperty(w,'y');qr(0);
    gsap.to(w,{y:0,duration:Math.max(.15,Math.sqrt(h)/26),ease:'power2.in',onComplete:()=>{
      gsap.timeline().to(cb.p.root,{scaleY:.78,scaleX:1.14,duration:.08}).to(cb.p.root,{scaleY:1,scaleX:1,duration:.45,ease:'elastic.out(1.1,.4)'});
      if(h>30)gsap.fromTo(dust,{opacity:1,scale:.3,x:0},{opacity:0,scale:1.6,x:i=>(i%2?1:-1)*(20+i*8),duration:.55,ease:'power2.out'});
      S(cb,h>60?'confused':'idle');back=setTimeout(()=>S(cb,'idle'),1500);}});};
  w.addEventListener('pointerup',drop);w.addEventListener('pointercancel',drop);
  return {play(){}};};

SC['5c']=(el,R)=>{const cb=R.i5c,w=q(el,'cbw');let last=0,back;
  w.addEventListener('pointerenter',()=>{const t=Date.now();if(t-last<4000)return;last=t;S(cb,'wave');clearTimeout(back);back=setTimeout(()=>S(cb,'idle'),1900);});
  return {play(){}};};

SC['6a']=(el,R)=>{const cb=R.c6a,b=q(el,'bub'),fx=q(el,'fx'),P=[1,2,3].map(i=>q(el,'p'+i)),N=[1,2,3].map(i=>q(el,'n'+i));let tl;
  const reset=()=>{tl&&tl.kill();gsap.set(P,{y:220});gsap.set(N,{opacity:0,y:-24,scale:1});gsap.set(b,{opacity:0});S(cb,'idle');};reset();
  return {play(){reset();tl=gsap.timeline();const up=(i,t,e)=>tl.to(P[i],{y:0,duration:.55,ease:e||'back.out(1.6)'},t).to(N[i],{opacity:1,y:0,duration:.35,ease:'back.out(3)'},t+.4);
    tl.call(()=>{say(b,'Die Siegerehrung!');S(cb,'wave');},null,0);up(2,1.0);tl.call(()=>{say(b,'Platz 3: Nachos!');S(cb,'clap');},null,1.2);
    up(1,2.3);tl.call(()=>say(b,'Platz 2: Raptoren!'),null,2.5).call(()=>{say(b,'Und gewonnen hat …');S(cb,'suspense');},null,3.6)
      .to(b,{x:2,duration:.04,yoyo:true,repeat:25,ease:'none'},3.9);
    up(0,5.0,'back.out(2.6)');tl.fromTo(N[0],{scale:.2},{scale:1,duration:.5,ease:'back.out(3)'},5.4).call(()=>{say(b,'TEAM KAKTUS!');S(cb,'dance');const r=P[0].getBoundingClientRect(),s=el.getBoundingClientRect();confetti(fx,r.left-s.left+r.width/2,r.top-s.top);confetti(fx,r.left-s.left+r.width/2,r.top-s.top,24);},null,5.4);}};};

SC['6b']=(el,R)=>{const cb=R.c6b,w=q(el,'cbw'),tro=q(el,'tro'),win=q(el,'win'),stamp=q(el,'stamp'),fx=q(el,'fx');let tl;
  const reset=()=>{tl&&tl.kill();gsap.set(w,{x:-220,rotation:0,transformOrigin:'62% 96%'});gsap.set(tro,{x:-220,y:0,rotation:0});gsap.set(stamp,{opacity:0,scale:2.4,rotation:-8});gsap.set(win,{y:0,scale:1});S(cb,'idle');};reset();
  return {play(){reset();tl=gsap.timeline();const tx=+tro.dataset.tx,ty=+tro.dataset.ty;
    tl.call(()=>S(cb,'run'),null,0).to([w,tro],{x:150,duration:1.05,ease:'none'},0).to(tro,{y:-7,duration:.15,yoyo:true,repeat:6,ease:'sine.inOut'},0)
      .call(()=>S(cb,'suspense'),null,1.05).to(w,{rotation:78,x:'+=46',duration:.38,ease:'power2.in'},1.05)
      .to(tro,{x:tx,duration:.75,ease:'power1.out'},1.1).to(tro,{y:ty-70,duration:.45,ease:'power2.out'},1.1).to(tro,{y:ty,duration:.3,ease:'power2.in'},1.55).to(tro,{rotation:720,duration:.75,ease:'power1.out'},1.1)
      .to(win,{y:6,scale:1.04,duration:.08,yoyo:true,repeat:1},1.85).to(stamp,{opacity:1,scale:1,duration:.3,ease:'back.out(2.4)'},2.0)
      .call(()=>{const r=win.getBoundingClientRect(),s=el.getBoundingClientRect();confetti(fx,r.left-s.left+r.width/2,r.top-s.top+10);},null,2.0)
      .to(w,{rotation:0,x:'-=46',duration:.45,ease:'back.out(2)'},2.3).call(()=>S(cb,'laugh'),null,2.3).call(()=>S(cb,'clap'),null,4.0).call(()=>S(cb,'idle'),null,6);}};};

SC['6c']=(el,R)=>{const cb=R.c6c,spot=q(el,'spot'),drum=q(el,'drum'),C=qa(el,'card'),fx=q(el,'fx');let tl;
  const reset=()=>{tl&&tl.kill();gsap.set(spot,{x:0,opacity:0});gsap.set(C,{opacity:.4,scale:1});gsap.set(C[1],{boxShadow:'6px 6px 0 #ff5a36'});gsap.set(drum,{y:0});S(cb,'idle');};reset();
  return {play(){reset();tl=gsap.timeline();const X=[0,360,180,0,360,180,0,180],D=[.16,.2,.22,.3,.38,.5,.7,.95];
    tl.call(()=>S(cb,'excited'),null,0).to(drum,{y:2,duration:.05,yoyo:true,repeat:85,ease:'none'},0).to(spot,{opacity:1,duration:.2},0);
    let t=.1;X.forEach((x,i)=>{tl.to(spot,{x,duration:D[i],ease:'power1.inOut'},t);t+=D[i];});
    tl.to(C[1],{opacity:1,scale:1.08,boxShadow:'8px 8px 0 #ffd23f',duration:.35,ease:'back.out(3)'},t).to(drum,{scale:1.1,duration:.08,yoyo:true,repeat:1},t).call(()=>{S(cb,'cheer');
      [[120,70,'#ffd23f'],[280,40,'#ff7fc0'],[440,74,'#3fd6c6']].forEach(([x,y,c],i)=>setTimeout(()=>burst(fx,x,y,c),i*240));},null,t).call(()=>S(cb,'dance'),null,t+2);}};};

SC['6final']=(el,R)=>{const cb=R.cf,w=q(el,'cbw'),tro=q(el,'tro'),win=q(el,'win'),front=q(el,'front'),back=q(el,'back'),stamp=q(el,'stamp'),fx=q(el,'fx'),ban=q(el,'banner'),rows=qa(el,'row'),share=q(el,'share');let tl,v='trip';
  const vb=[...(el.closest('.dv-opt')||el.parentElement).querySelectorAll('[data-variant]')];
  const paint=()=>vb.forEach(b=>{const on=b.dataset.variant===v;b.style.background=on?'#ffd23f':'#fffdf8';b.setAttribute('aria-pressed',on);});
  vb.forEach(b=>b.addEventListener('click',()=>{v=b.dataset.variant;paint();api.play();}));paint();
  const reset=()=>{tl&&tl.kill();gsap.set(w,{x:-240,rotation:0,transformOrigin:'62% 96%'});gsap.set(tro,{x:-240,y:0,rotation:0});gsap.set(ban,{y:-120,rotation:-4});gsap.set(rows,{x:420,opacity:0});
    gsap.set(win,{scale:.9,opacity:0,y:0});gsap.set(front,{opacity:1});gsap.set(back,{opacity:0});gsap.set(stamp,{opacity:0,scale:2.4,rotation:-8});gsap.set(share,{opacity:0,y:16});S(cb,'idle');};
  reset();
  const api={play(){reset();tl=gsap.timeline();const tx=+tro.dataset.tx,ty=+tro.dataset.ty,RUN=300;
    tl.to(ban,{y:0,duration:.55,ease:'back.out(2.2)'},0).to(rows,{x:0,opacity:1,duration:.5,ease:'power3.out',stagger:.5},.7).to(win,{opacity:1,scale:1,duration:.4,ease:'back.out(2)'},1.6);
    tl.call(()=>S(cb,'run'),null,2.1).to([w,tro],{x:RUN,duration:1.05,ease:'none'},2.1).to(tro,{y:-7,duration:.15,yoyo:true,repeat:6,ease:'sine.inOut'},2.1);
    let land;
    if(v==='trip'){tl.call(()=>S(cb,'suspense'),null,3.15).to(w,{rotation:78,x:'+=46',duration:.38,ease:'power2.in'},3.15)
      .to(tro,{x:tx,duration:.75,ease:'power1.out'},3.2).to(tro,{y:ty-80,duration:.45,ease:'power2.out'},3.2).to(tro,{y:ty,duration:.3,ease:'power2.in'},3.65).to(tro,{rotation:720,duration:.75,ease:'power1.out'},3.2);
      land=3.95;tl.to(w,{rotation:0,x:'-=46',duration:.45,ease:'back.out(2)'},land+.3);}
    else{tl.call(()=>S(cb,'cheer'),null,3.15).to(tro,{y:-170,rotation:360,duration:.5,ease:'power2.out'},3.2).to(tro,{y:14,duration:.42,ease:'power2.in'},3.7)
      .call(()=>S(cb,'confused'),null,4.12).to(tro,{y:-4,duration:.12,yoyo:true,repeat:1},4.12)
      .to(tro,{x:tx,duration:.7,ease:'power1.inOut'},4.7).to(tro,{y:ty-90,duration:.38,ease:'power2.out'},4.7).to(tro,{y:ty,duration:.32,ease:'power2.in'},5.08).to(tro,{rotation:720,duration:.7},4.7);
      land=5.4;}
    tl.to(win,{y:6,duration:.08,yoyo:true,repeat:1},land).to(front,{opacity:0,duration:.15},land).to(back,{opacity:1,duration:.15},land)
      .to(stamp,{opacity:1,scale:1,duration:.3,ease:'back.out(2.4)'},land+.15)
      .call(()=>{const r=win.getBoundingClientRect(),s=el.getBoundingClientRect(),k=s.width/el.offsetWidth||1;confetti(fx,(r.left-s.left+r.width/2)/k,(r.top-s.top)/k);confetti(fx,(r.left-s.left+r.width/2)/k,(r.top-s.top)/k,24);},null,land+.15)
      .call(()=>S(cb,'laugh'),null,land+.3).call(()=>S(cb,'dance'),null,land+2.2).to(share,{opacity:1,y:0,duration:.35,ease:'back.out(2)'},land+1.4);}};
  return api;};

const EM={clap:'clap',tears:'laugh',angry:'angry',roar:'roar'};
function emoteScene(el,R,opts){const fl=q(el,'fl'),rings=qa(el,'ring'),btns=[...el.closest('.dv-opt').querySelectorAll('[data-emote]')];let tl,cd=0;
  gsap.set(fl,{opacity:0});
  const send=k=>{const now=Date.now();if(now<cd)return;cd=now+2000;btns.forEach(b=>{b.style.opacity=.45;b.setAttribute('aria-disabled','true');});setTimeout(()=>btns.forEach(b=>{b.style.opacity=1;b.removeAttribute('aria-disabled');}),2000);
    tl&&tl.kill();opts.show(k);tl=gsap.timeline();tl.fromTo(fl,{y:80,scale:.3,opacity:0,rotation:0},{y:0,scale:1,opacity:1,duration:.45,ease:'back.out(2)'})
      .to(fl,{rotation:opts.wob?6:0,duration:.3,yoyo:true,repeat:opts.wob?3:0,ease:'sine.inOut'},.45);
    if(k==='roar')tl.fromTo(rings,{scale:.4,opacity:1},{scale:2.2,opacity:0,duration:.7,stagger:.18,ease:'power2.out'},.6);
    tl.to(fl,{y:-70,opacity:0,duration:.6,ease:'power1.in'},2.1);};
  btns.forEach(b=>b.addEventListener('click',()=>send(b.dataset.emote)));
  return {play(){['clap','tears','angry','roar'].forEach((k,i)=>setTimeout(()=>{cd=0;send(k);},i*2700));}};}
SC['7a']=(el,R)=>{['clap','tears','angry','roar'].forEach(k=>{const r=R['e7a_'+k];if(r){r.reduced=true;S(r,EM[k]);}});return emoteScene(el,R,{show:k=>S(R.e7aFl,EM[k])});};
SC['7b']=(el,R)=>{['clap','tears','angry','roar'].forEach(k=>{const r=R['e7b_'+k];if(r){r.reduced=true;S(r,EM[k]);}});return emoteScene(el,R,{show:k=>S(R.e7bFl,EM[k])});};
SC['7c']=(el,R)=>emoteScene(el,R,{wob:true,show:k=>qa(el,'st').forEach(s=>s.style.display=s.dataset.e===k?'flex':'none')});

window.CBD={init:(id,el,R)=>SC[id]?SC[id](el,R):null};
})();
