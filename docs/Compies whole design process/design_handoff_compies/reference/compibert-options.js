/* Compibert direction studies: SVG rig builder + GSAP controller.
   Every rig follows one contract: named groups (compibert-*), data-pivot = GSAP svgOrigin,
   swappable mouths (.cb-m[data-m]), clipped eyelids, fx layer. "-left" = screen-left = near side. */
(function(){
const INK='var(--cb-ink)',B='var(--cb-body)',B2='var(--cb-body2)',Y='var(--cb-belly)',K='var(--cb-spike)',GE='var(--cb-gear)',CK='var(--cb-cheek)';
const MOUTH='#5e1631',TONGUE='#ff70c3',WH='#fffdf8';
const n=v=>Math.round(v*10)/10;
const st=(f,sw)=>`style="fill:${f};stroke:${INK};stroke-width:${sw==null?6:sw};stroke-linejoin:round;stroke-linecap:round"`;
const ln=(c,sw)=>`style="fill:none;stroke:${c};stroke-width:${sw};stroke-linejoin:round;stroke-linecap:round"`;
const g=(c,pv,i)=>`<g class="${c}"${pv?` data-pivot="${pv}"`:''}>${i}</g>`;
const P=(d,f,sw)=>`<path d="${d}" ${st(f,sw)}/>`;
const E=(cx,cy,rx,ry,f,sw,ex)=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${ex||''} ${st(f,sw)}/>`;
const NO=pts=>pts.map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="3.2" ry="4.2" style="fill:${INK}"/>`).join('');
function tp(x0,y0,w0,x1,y1,w1){const dx=x1-x0,dy=y1-y0,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
  return `M${n(x0+nx*w0)} ${n(y0+ny*w0)}L${n(x1+nx*w1)} ${n(y1+ny*w1)}A${w1} ${w1} 0 0 0 ${n(x1-nx*w1)} ${n(y1-ny*w1)}L${n(x0-nx*w0)} ${n(y0-ny*w0)}A${w0} ${w0} 0 0 0 ${n(x0+nx*w0)} ${n(y0+ny*w0)}Z`;}
function tail(segs,fills,deco){let inner='';for(let i=segs.length-1;i>=0;i--){const s=segs[i];inner=g('compibert-tail-'+(i+1),s[0]+' '+s[1],inner+P(tp(...s),fills[i])+(deco?deco(i,s):''));}return inner;}
function stripes(i,s){if(i>1)return '';return (i===0?[.34,.74]:[.5]).map(t=>{const [x0,y0,w0,x1,y1,w1]=s,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t,w=w0+(w1-w0)*t-8,L=Math.hypot(x1-x0,y1-y0),nx=-(y1-y0)/L,ny=(x1-x0)/L;
  return `<path d="M${n(x+nx*w)} ${n(y+ny*w)}L${n(x-nx*w)} ${n(y-ny*w)}" ${ln(K,9)}/>`;}).join('');}
function ring(cx,cy,r,angs,len,fill){const R=d=>d*Math.PI/180,p=(a,rr)=>`${n(cx+rr*Math.cos(R(a)))} ${n(cy+rr*Math.sin(R(a)))}`;
  return angs.map(a=>P(`M${p(a-12,r-6)}L${p(a,r+len)}L${p(a+12,r-6)}Z`,fill)).join('');}

function mouthSVG(m){const {x,y,w}=m,L=ln(INK,6),F=f=>st(f,6);
  const sm=m.smirk?`M${n(x-w/2)} ${n(y+w*.04)}Q${n(x-w*.05)} ${n(y+w*.42)} ${n(x+w/2)} ${n(y-w*.2)}`:`M${n(x-w/2)} ${y}Q${x} ${n(y+w*.44)} ${n(x+w/2)} ${n(y-w*.04)}`;
  const fang=m.fang?`<path d="M${n(x+w*.07)} ${n(y+w*.14)}L${n(x+w*.13)} ${n(y+w*.34)}L${n(x+w*.2)} ${n(y+w*.07)}Z" style="fill:${WH};stroke:${INK};stroke-width:4;stroke-linejoin:round"/>`:'';
  const v=(k,inner,on)=>`<g class="cb-m" data-m="${k}" style="opacity:${on?1:0}">${inner}</g>`;
  const tooth=(ox)=>`<path d="M${n(x+ox)} ${n(y-w*.03)}l${n(w*.08)} ${n(w*.17)}l${n(w*.08)} ${n(-w*.17)}Z" style="fill:${WH};stroke:${INK};stroke-width:4;stroke-linejoin:round"/>`;
  return g('compibert-jaw',`${x} ${y}`,
    v('smile',fang+`<path d="${sm}" ${L}/>`,1)
   +v('grin',`<path d="M${n(x-w/2)} ${y}Q${x} ${n(y+w)} ${n(x+w/2)} ${n(y-w*.04)}Z" ${F(MOUTH)}/><ellipse cx="${n(x+w*.04)}" cy="${n(y+w*.3)}" rx="${n(w*.17)}" ry="${n(w*.08)}" style="fill:${TONGUE}"/>`)
   +v('frown',`<path d="M${n(x-w*.36)} ${n(y+w*.26)}Q${x} ${n(y-w*.12)} ${n(x+w*.36)} ${n(y+w*.22)}" ${L}/>`)
   +v('o',`<ellipse cx="${x}" cy="${n(y+w*.14)}" rx="${n(w*.12)}" ry="${n(w*.15)}" ${F(MOUTH)}/>`)
   +v('roar',`<path d="M${n(x-w*.56)} ${n(y-w*.08)}Q${n(x-w*.1)} ${n(y+w*1.4)} ${n(x+w*.56)} ${n(y-w*.12)}Q${x} ${n(y+w*.12)} ${n(x-w*.56)} ${n(y-w*.08)}Z" ${F(MOUTH)}/><ellipse cx="${x}" cy="${n(y+w*.5)}" rx="${n(w*.2)}" ry="${n(w*.1)}" style="fill:${TONGUE}"/>`+tooth(-w*.36)+tooth(w*.14)));
}
function eyeSVG(e,s,u,happy){const cx=e.cx,cy=e.cy,H=2*e.ry+12,px=n(cx+(e.px||0)),py=n(cy+(e.py==null?2:e.py));
  const hd=happy||`M${n(cx-e.rx*.78)} ${n(cy+e.ry*.28)}Q${cx} ${n(cy-e.ry*1.05)} ${n(cx+e.rx*.78)} ${n(cy+e.ry*.28)}`;
  return `<g class="compibert-eye-${s}" data-pivot="${cx} ${cy}"><clipPath id="${u}c${s}"><ellipse cx="${cx}" cy="${cy}" rx="${e.rx}" ry="${e.ry}"/></clipPath><g class="cb-ball-${s}"><ellipse cx="${cx}" cy="${cy}" rx="${e.rx}" ry="${e.ry}" style="fill:${WH}"/><g clip-path="url(#${u}c${s})"><g class="compibert-pupil-${s}"><circle cx="${px}" cy="${py}" r="${e.pr}" style="fill:${INK}"/><circle cx="${n(px+e.pr*.32)}" cy="${n(py-e.pr*.38)}" r="${n(e.pr*.34)}" style="fill:${WH}"/></g><rect class="compibert-lid-${s}" data-ry="${e.ry}" x="${n(cx-e.rx-8)}" y="${n(cy-e.ry-6)}" width="${n(2*e.rx+16)}" height="${n(H)}" ${st(B)}/></g><ellipse cx="${cx}" cy="${cy}" rx="${e.rx}" ry="${e.ry}" ${ln(INK,6)}/></g><path class="cb-happy-${s}" d="${hd}" style="fill:none;stroke:${INK};stroke-width:7;stroke-linecap:round;opacity:0"/></g>`;}
function fxSVG(c){const [zx,zy]=c.fx.z,[tx,ty]=c.fx.tear,[ax,ay]=c.fx.anger;
  const zs=[14,18,22].map(s=>`<path class="cb-z" data-pivot="${zx} ${zy}" d="M${zx-s/2} ${zy-s/2}h${s}l${-s} ${s}h${s}" style="fill:none;stroke:${INK};stroke-width:5;stroke-linecap:round;stroke-linejoin:round;opacity:0"/>`).join('');
  const sw_=c.fx.sweat?`<path class="cb-sweat" d="M${c.fx.sweat[0]} ${c.fx.sweat[1]}q-9 13 0 18q9 -5 0 -18Z" style="fill:#9cc6ff;stroke:${INK};stroke-width:4;stroke-linejoin:round;opacity:0"/>`:'';
  const qm=c.fx.q?(([x,y])=>{const d=`M${x-11} ${y-6}q0 -15 13 -15q13 0 13 13q0 9 -11 13v7`;return `<g class="cb-q" data-pivot="${x} ${y+28}" style="opacity:0"><path d="${d}" ${ln(INK,12)}/><path d="${d}" ${ln('#ffd23f',5)}/><circle cx="${x+2}" cy="${y+22}" r="5" style="fill:#ffd23f;stroke:${INK};stroke-width:3.5"/></g>`;})(c.fx.q):'';
  const dots=(c.fx.dots||[]).map(([x,y])=>`<circle class="cb-dot" data-pivot="${x} ${y}" cx="${x}" cy="${y}" r="6" style="fill:#ffd23f;stroke:${INK};stroke-width:3.5;opacity:0"/>`).join('');
  const hd=c.fx.hands?(()=>{const [[ax,ay],[bx,by]]=c.fx.hands,mx=(ax+bx)/2,my=Math.min(ay,by)-26;return `<g class="cb-hands" style="opacity:0"><g class="cb-hand-l" data-pivot="${ax} ${ay+14}"><ellipse cx="${ax}" cy="${ay}" rx="13" ry="17" transform="rotate(-14 ${ax} ${ay})" ${st(B,5)}/></g><g class="cb-hand-r" data-pivot="${bx} ${by+14}"><ellipse cx="${bx}" cy="${by}" rx="13" ry="17" transform="rotate(14 ${bx} ${by})" ${st(B,5)}/></g><path class="cb-clapfx" d="M${mx} ${my}v-12M${mx-16} ${my+4}l-8 -8M${mx+16} ${my+4}l8 -8" style="fill:none;stroke:#ffd23f;stroke-width:6;stroke-linecap:round;opacity:0"/></g>`;})():'';
  return `<g class="cb-fx">${zs}${sw_}${qm}${dots}${hd}<path class="cb-tear" d="M${tx} ${ty}q-10 15 0 21q10 -6 0 -21Z" style="fill:#3a86ff;stroke:${INK};stroke-width:4;stroke-linejoin:round;opacity:0"/><path class="cb-anger" data-pivot="${ax} ${ay}" d="M${ax-15} ${ay-4}q11 0 11 -11M${ax+4} ${ay-15}q0 11 11 11M${ax+15} ${ay+4}q-11 0 -11 11M${ax-4} ${ay+15}q0 -11 -11 -11" style="fill:none;stroke:#ff4f4f;stroke-width:6;stroke-linecap:round;opacity:0"/></g>`;}
/* v1 face (first Compibert), original 190-unit coords, scaled per rig via T={s,ox,oy} */
const V1={head:'M110 70C110 50 128 40 148 44C168 48 183 62 183 76C183 90 168 97 150 97C130 98 110 90 110 70Z',brow:'M130 50Q142 42 155 50',smile:'M150 85Q165 93 179 80',fang:'M159 88L162 94L165 89Z',
  grin:'M149 83C158 84 170 82 181 77C178 92 160 99 149 83Z',frown:'M151 90Q165 82 178 89',roar:'M146 81C160 81 172 78 184 70C186 94 164 106 146 81Z',teeth:'M157 81.5l2 6l2.5 -6.4ZM167 79.6l2 6l2.5 -6.8Z',happy:'M134 67Q143 53 152 67',crest:'M124 47L131 33L139 44Z',crest2:'M113 58L109 43L124 50Z'};
function mp(d,T){let cmd='',buf=[],out='',m;const re=/([A-Za-z])|(-?\d*\.?\d+)/g;while((m=re.exec(d))){if(m[1]){cmd=m[1];out+=cmd;buf=[];}else{buf.push(+m[2]);if(buf.length===2){const up=cmd===cmd.toUpperCase();out+=n(up?buf[0]*T.s+T.ox:buf[0]*T.s)+' '+n(up?buf[1]*T.s+T.oy:buf[1]*T.s)+' ';buf=[];}}}return out.trim();}
const pt=(x,y,T)=>[n(x*T.s+T.ox),n(y*T.s+T.oy)];
function faceP(c,u){const T=c.T,[ex,ey]=pt(143,64,T),er=n(10.5*T.s);
  c.eyes={left:{cx:ex,cy:ey,rx:er,ry:er,pr:n(5*T.s),px:n(3*T.s),py:n(1*T.s)}};
  const [bx,by]=pt(142,47,T),[cx,cy]=pt(158,79,T),[nx,ny]=pt(173,69,T),[jx,jy]=pt(150,84,T),[t1x,t1y]=pt(166,89,T),[t2x,t2y]=pt(166,93,T),[ox,oy]=pt(176,86,T);
  const v=(k,inner,on)=>`<g class="cb-m" data-m="${k}" style="opacity:${on?1:0}">${inner}</g>`,L=ln(INK,6),F=st(MOUTH,6),W=`style="fill:${WH};stroke:${INK};stroke-width:4;stroke-linejoin:round"`;
  const mouth=g('compibert-jaw',`${jx} ${jy}`,v('smile',`<path d="${mp(V1.fang,T)}" ${W}/><path d="${mp(V1.smile,T)}" ${L}/>`,1)
    +v('grin',`<path d="${mp(V1.grin,T)}" ${F}/><ellipse cx="${t1x}" cy="${t1y}" rx="${n(6*T.s)}" ry="${n(2.6*T.s)}" style="fill:${TONGUE}"/>`)
    +v('frown',`<path d="${mp(V1.frown,T)}" ${L}/>`)
    +v('flat',`<path d="${mp('M153 87L177 84',T)}" ${L}/>`)
    +v('wobble',`<path d="${mp('M150 88l6 -3l6 3l6 -3l6 3',T)}" ${L}/>`)
    +v('o',`<ellipse cx="${ox}" cy="${oy}" rx="${n(3.6*T.s)}" ry="${n(4.6*T.s)}" ${F}/>`)
    +v('roar',`<path d="${mp(V1.roar,T)}" ${F}/><ellipse cx="${t2x}" cy="${t2y}" rx="${n(7*T.s)}" ry="${n(3*T.s)}" style="fill:${TONGUE}"/><path d="${mp(V1.teeth,T)}" ${W}/>`));
  c.fx=c.fx||{z:pt(184,40,T),tear:pt(141,76,T),anger:pt(124,56,T)};
  return `<ellipse class="compibert-cheek-left" cx="${cx}" cy="${cy}" rx="${n(6*T.s)}" ry="${n(4*T.s)}" style="fill:${CK};opacity:.8"/><circle cx="${nx}" cy="${ny}" r="${n(1.9*T.s)}" style="fill:${INK}"/>`
    +eyeSVG(c.eyes.left,'left',u,mp(V1.happy,T))+`<path class="compibert-brow-left" data-pivot="${bx} ${by}" d="${mp(V1.brow,T)}" style="fill:none;stroke:${INK};stroke-width:7;stroke-linecap:round"/>`+mouth+fxSVG(c);}
function leaf(bx,by,rx,ry,rot,fill){const r=rot*Math.PI/180,cx=n(bx+ry*Math.sin(r)),cy=n(by-ry*Math.cos(r));
  return `<g class="compibert-feather" data-pivot="${bx} ${by}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" ${st(fill||K,5)}/></g>`;}
const FLB='M158 194l-8 32M184 186l-6 32M210 182l-4 30M236 184l-2 26';
function flitzer(f,u,headInner,feathers){
  const fan=(i)=>i===2?leaf(18,197,7,17,-60)+leaf(15,200,7,18,-90)+leaf(17,204,7,16,-120):'';
  return tail([[160,236,30,100,224,22],[100,224,22,52,212,14],[52,212,14,14,198,6]],[B,B,B],feathers?fan:stripes)
   +g('compibert-leg-right','220 262',P(tp(220,262,24,230,304,12),B2)+g('compibert-shin-right','230 304',P(tp(230,304,10,220,342,8),B2)+P(tp(220,344,8,248,360,7),B2)))
   +g('compibert-torso','200 262',
     g('compibert-arm-right','262 246',P(tp(262,246,7,284,268,5),B2))
    +g('compibert-neck','246 222',neck((feathers?leaf(237,201,8,15,-40)+leaf(247,186,8,14,-30)+leaf(257,172,7,12,-20):'')+P(tp(246,226,26,280,164,19),B))
       +g('compibert-head','284 186',headInner+f))
    +g('compibert-body','200 270',(feathers?leaf(140,226,9,20,-55)+leaf(157,208,9,22,-45)+leaf(184,195,9,22,-35)+leaf(214,189,9,20,-25)+leaf(238,190,8,16,-15):'')
       +E(205,236,74,46,B,6,'transform="rotate(-12 205 236)"')
       +`<g clip-path="url(#${u}bb)">${E(234,254,50,24,Y,5,'transform="rotate(-16 234 254)"')}${feathers?'':`<path d="${FLB}" ${ln(K,11)}/>`}</g>`
       +`<ellipse cx="205" cy="236" rx="74" ry="46" transform="rotate(-12 205 236)" ${ln(INK,6)}/>`)
    +g('compibert-arm-left','244 250',P(tp(244,250,8,268,278,6),B)))
   +g('compibert-leg-left','198 266',P(tp(198,262,30,208,312,14),B)+g('compibert-shin-left','208 312',P(tp(208,312,12,194,348,10),B)+P(tp(194,350,10,228,360,8),B)));}
function face(c,u){
  if(c.profile) return faceP(c,u);
  const eye=s=>eyeSVG(c.eyes[s],s,u);
  const brow=s=>{const b=c.brows[s],mx=(b[0]+b[2])/2,my=(b[1]+b[3])/2;return `<path class="compibert-brow-${s}" data-pivot="${mx} ${my}" d="M${b[0]} ${b[1]}Q${mx} ${my-6} ${b[2]} ${b[3]}" style="fill:none;stroke:${INK};stroke-width:8;stroke-linecap:round;opacity:0"/>`;};
  const ck=c.cheeks.map((k,i)=>`<ellipse class="compibert-cheek-${i?'right':'left'}" cx="${k[0]}" cy="${k[1]}" rx="${k[2]}" ry="${k[3]}" style="fill:${CK};opacity:.8"/>`).join('');
  return ck+eye('left')+eye('right')+brow('left')+brow('right')+mouthSVG(c.mouth)+fxSVG(c);
}
const neck=s=>`<g class="cb-neckshape">${s}</g>`;

const CH={
A:{vb:{full:'14 30 372 352',bust:'90 34 262 262',head:'92 38 258 258',tail:'14 214 180 180'},ground:[212,370],shadowRx:100,
  eyes:{left:{cx:205,cy:150,rx:26,ry:30,pr:13,px:4},right:{cx:268,cy:146,rx:22,ry:27,pr:11,px:4}},
  mouth:{x:272,y:206,w:56},brows:{left:[182,110,226,112],right:[250,108,288,110]},
  cheeks:[[178,198,15,10],[320,200,9,7]],fx:{z:[316,74],tear:[202,184],anger:[298,100]},
  fig:(f)=>tail([[152,306,26,100,320,19],[100,320,19,60,306,13],[60,306,13,40,274,7]],[B,B,K])
   +g('compibert-leg-right','226 318',P(tp(226,316,20,232,348,15),B2)+E(246,360,27,12,B2))
   +g('compibert-leg-left','184 320',P(tp(184,318,22,180,350,16),B)+E(196,362,29,13,B))
   +g('compibert-torso','205 336',
     g('compibert-arm-right','250 252',P(tp(250,252,10,276,280,8),B2))
    +g('compibert-body','205 344',E(205,282,60,62,B)+E(220,294,36,44,Y,5))
    +g('compibert-neck','205 246',
       g('compibert-head','206 236',P('M172 98L182 52L210 88Z',K)+P('M146 124L134 80L176 100Z',K)+P('M136 156L102 120L152 120Z',K)
        +P('M130 170C128 110 175 78 222 80C275 82 305 115 308 150C330 160 336 200 312 220C290 240 240 246 200 244C150 242 132 215 130 170Z',B)
        +NO([[320,176],[306,172]])+f))
    +g('compibert-arm-left','214 258',P(tp(214,258,11,238,292,9),B)))},
B:{vb:{full:'0 62 400 318',bust:'166 60 234 234',head:'228 58 166 166',tail:'0 136 194 194'},ground:[214,370],shadowRx:124,
  eyes:{left:{cx:292,cy:130,rx:18,ry:21,pr:9,px:3},right:{cx:324,cy:118,rx:14,ry:17,pr:7.5,px:3}},
  mouth:{x:338,y:172,w:46},brows:{left:[278,100,306,98],right:[316,92,338,96]},
  cheeks:[[302,164,11,7]],fx:{z:[356,70],tear:[290,152],anger:[264,112]},
  defs:u=>`<clipPath id="${u}bb"><ellipse cx="205" cy="236" rx="74" ry="46" transform="rotate(-12 205 236)"/></clipPath>`,
  fig:(f,u)=>tail([[160,236,30,100,224,22],[100,224,22,52,212,14],[52,212,14,14,198,6]],[B,B,B],stripes)
   +g('compibert-leg-right','220 262',P(tp(220,262,24,230,304,12),B2)+g('compibert-shin-right','230 304',P(tp(230,304,10,220,342,8),B2)+P(tp(220,344,8,248,360,7),B2)))
   +g('compibert-torso','200 262',
     g('compibert-arm-right','262 246',P(tp(262,246,7,284,268,5),B2))
    +g('compibert-neck','246 222',neck(P(tp(246,226,26,280,164,19),B))
       +g('compibert-head','278 170',`<path d="M262 116q-20 -20 -8 -42M272 108q-2 -26 18 -34M254 132q-30 -6 -36 -28" ${ln(INK,17)}/><path d="M262 116q-20 -20 -8 -42M272 108q-2 -26 18 -34M254 132q-30 -6 -36 -28" ${ln(K,8)}/>`
        +P('M250 150C248 112 280 96 308 100C336 104 352 120 360 140C380 148 386 170 368 180C350 190 300 194 276 188C256 183 251 168 250 150Z',B)
        +NO([[372,154]])+f))
    +g('compibert-body','200 270',E(205,236,74,46,B,6,'transform="rotate(-12 205 236)"')
       +`<g clip-path="url(#${u}bb)">${E(234,254,50,24,Y,5,'transform="rotate(-16 234 254)"')}<path d="M158 194l-8 32M184 186l-6 32M210 182l-4 30M236 184l-2 26" ${ln(K,11)}/></g>`
       +`<ellipse cx="205" cy="236" rx="74" ry="46" transform="rotate(-12 205 236)" ${ln(INK,6)}/>`)
    +g('compibert-arm-left','244 250',P(tp(244,250,8,268,278,6),B)))
   +g('compibert-leg-left','198 266',P(tp(198,262,30,208,312,14),B)+g('compibert-shin-left','208 312',P(tp(208,312,12,194,348,10),B)+P(tp(194,350,10,228,360,8),B)))},
C:{vb:{full:'16 28 368 352',bust:'104 28 262 262',head:'132 30 218 218',tail:'20 214 170 170'},ground:[206,372],shadowRx:100,
  eyes:{left:{cx:200,cy:94,rx:27,ry:27,pr:12,px:4},right:{cx:262,cy:90,rx:25,ry:25,pr:11,px:4}},
  mouth:{x:286,y:158,w:50},brows:{left:[178,54,222,56],right:[242,50,282,52]},
  cheeks:[[236,156,12,8]],fx:{z:[320,42],tear:[198,126],anger:[306,106]},
  fig:(f)=>g('compibert-tail-1','158 294',g('compibert-tail-2','106 304',g('compibert-tail-3','72 302',P('M72 290L72 314L32 280Z',Y))+P('M106 290L106 320L60 302Z',K))+P('M158 270L158 318L96 306Z',B))
   +g('compibert-leg-right','226 316',`<rect x="214" y="296" width="24" height="56" rx="5" ${st(B2)}/>`+P('M204 370A24 24 0 0 1 252 370Z',B2))
   +g('compibert-leg-left','184 318',`<rect x="171" y="298" width="26" height="56" rx="5" ${st(B)}/>`+P('M158 372A26 26 0 0 1 210 372Z',B))
   +g('compibert-torso','200 338',
     g('compibert-arm-right','252 246',P(tp(252,246,9,280,270,9),B2))
    +g('compibert-neck','212 214',neck(`<rect x="194" y="176" width="38" height="52" rx="6" ${st(B)}/>`)
       +g('compibert-head','212 196',P('M152 112L124 124L152 140Z',K)+P('M152 144L126 158L152 172Z',K)
        +P('M150 128Q150 90 188 90L280 90A50 50 0 0 1 280 190L188 190Q150 190 150 152Z',B)
        +NO([[318,122]])+f))
    +g('compibert-body','200 338',ring(200,272,66,[194,220,246],30,K)+`<circle cx="200" cy="272" r="66" ${st(B)}/><circle cx="222" cy="286" r="40" ${st(Y,5)}/>`
       +[[206,272],[226,264],[244,280],[214,292],[234,300],[222,316],[200,300]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.4" style="fill:${INK}"/>`).join(''))
    +g('compibert-arm-left','236 236',P(tp(236,236,10,266,262,10),B)))},
D:{vb:{full:'20 18 360 364',bust:'136 18 252 252',head:'146 18 218 218',tail:'20 224 180 180'},ground:[222,372],shadowRx:96,
  eyes:{left:{cx:232,cy:114,rx:20,ry:24,pr:10,px:4},right:{cx:278,cy:110,rx:16,ry:20,pr:8.5,px:4}},
  lidRest:.34,browRest:[4,-12],mouth:{x:316,y:148,w:56,fang:true,smirk:true},brows:{left:[212,82,252,84],right:[262,80,292,76]},
  cheeks:[[262,150,11,7]],fx:{z:[326,40],tear:[230,144],anger:[318,90]},
  fig:(f)=>{const shoe=(x0,fl)=>`<path d="M${x0+6} 344h36q20 0 20 16v4h-62v-8q0 -12 6 -12Z" ${st(fl)}/><rect x="${x0-2}" y="361" width="66" height="9" rx="4" ${st(WH,5)}/>`;
   const band='M182 104C176 50 218 30 250 36C278 42 296 62 294 86';
   return tail([[166,308,22,114,328,16],[114,328,16,72,320,11],[72,320,11,48,292,6]],[B,B,K])
   +g('compibert-leg-right','232 318',P(tp(232,316,16,236,348,12),B2)+shoe(214,GE))
   +g('compibert-leg-left','194 320',P(tp(194,318,17,192,350,13),B)+shoe(172,GE))
   +g('compibert-torso','214 334',
     g('compibert-arm-right','250 228',P(tp(250,228,8,268,262,6),B2))
    +g('compibert-neck','214 206',neck(P(tp(212,214,22,222,168,19),B))
       +g('compibert-head','222 176',`<ellipse cx="296" cy="92" rx="9" ry="14" transform="rotate(20 296 92)" ${st(GE)}/>`
        +P('M165 120C162 80 196 58 232 60C268 62 290 80 300 100C330 104 352 116 354 136C356 158 336 170 306 172C270 176 226 180 200 172C176 164 166 148 165 120Z',B)
        +NO([[344,124]])+f
        +g('compibert-headset','230 60',`<path d="${band}" ${ln(INK,18)}/><path d="${band}" ${ln(GE,9)}/><path d="M184 146Q194 178 238 176" ${ln(INK,6)}/><ellipse cx="246" cy="175" rx="10" ry="8" style="fill:${INK}"/><rect x="164" y="100" width="34" height="50" rx="14" ${st(GE)}/><ellipse cx="181" cy="125" rx="7" ry="13" ${ln(INK,4)}/>`)))
    +g('compibert-body','214 334',P('M174 222L172 248L150 232Z',K)+P('M170 254L169 280L146 264Z',K)+P('M169 286L172 310L148 300Z',K)
       +P('M172 232C170 200 200 186 222 192C250 200 262 240 260 280C258 318 236 332 210 332C182 332 168 312 168 285C168 262 172 250 172 232Z',B)+E(230,284,26,40,Y,5))
    +g('compibert-arm-left','226 236',P(tp(226,236,9,246,272,7),B)));}}
};

const T1={s:1.85,ox:46.5,oy:22},T2={s:2.3,ox:-29,oy:-22};
const BBC=u=>`<clipPath id="${u}bb"><ellipse cx="205" cy="236" rx="74" ry="46" transform="rotate(-12 205 236)"/></clipPath>`;
CH.F1={profile:true,T:T1,browRest:[0,0],vb:{full:'0 58 400 322',bust:'160 52 236 236',head:'210 52 186 186',tail:'0 136 194 194'},ground:[214,370],shadowRx:124,defs:BBC,
  fig:(f,u)=>flitzer(f,u,`<path d="M268 120q-20 -20 -8 -42M280 112q-2 -26 18 -34M258 134q-30 -6 -36 -28" ${ln(INK,17)}/><path d="M268 120q-20 -20 -8 -42M280 112q-2 -26 18 -34M258 134q-30 -6 -36 -28" ${ln(K,8)}/>`+P(mp(V1.head,T1),B),false)};
CH.F3={profile:true,T:T1,browRest:[0,0],vb:{full:'-8 58 408 322',bust:'160 52 236 236',head:'210 52 186 186',tail:'-8 136 194 194'},ground:[214,370],shadowRx:124,defs:BBC,
  fig:(f,u)=>flitzer(f,u,leaf(258,132,8,18,-62)+leaf(268,120,9,22,-40)+leaf(284,110,9,24,-18)+leaf(300,106,8,18,2)+P(mp(V1.head,T1),B),true)};
CH.F2={profile:true,T:T2,browRest:[0,0],vb:{full:'0 36 404 344',bust:'150 36 254 254',head:'212 40 192 192',emote:'172 -4 270 270',tail:'2 157 196 196'},ground:[210,370],shadowRx:120,fx:{z:[384,70],tear:[296,160],anger:[248,108],sweat:[244,112],q:[336,46],dots:[[350,64],[368,54],[386,44]],hands:[[284,226],[334,226]]},
  defs:u=>`<clipPath id="${u}bb"><ellipse cx="196" cy="258" rx="72" ry="50" transform="rotate(-10 196 258)"/></clipPath>`,
  fig:(f,u)=>tail([[150,258,32,96,250,22],[96,250,22,56,240,14],[56,240,14,26,226,7]],[B,B,B],stripes)
   +g('compibert-leg-right','214 280',P(tp(214,280,26,224,318,13),B2)+g('compibert-shin-right','224 318',P(tp(224,318,11,216,346,9),B2)+P(tp(216,348,9,244,360,8),B2)))
   +g('compibert-torso','200 284',
     g('compibert-arm-right','256 262',P(tp(256,262,8,278,286,6),B2))
    +g('compibert-neck','240 236',neck(P(tp(240,236,30,264,192,26),B))+g('compibert-head','262 198',P(mp(V1.crest2,T2),K)+P(mp(V1.crest,T2),K)+P(mp(V1.head,T2),B)+f))
    +g('compibert-body','196 300',E(196,258,72,50,B,6,'transform="rotate(-10 196 258)"')+`<g clip-path="url(#${u}bb)">${E(226,278,52,24,Y,5,'transform="rotate(-14 226 278)"')}<path d="M152 216l-8 32M178 208l-6 32M204 204l-4 30M230 206l-2 26" ${ln(K,11)}/></g><ellipse cx="196" cy="258" rx="72" ry="50" transform="rotate(-10 196 258)" ${ln(INK,6)}/>`)
    +g('compibert-arm-left','238 270',P(tp(238,270,9,262,296,7),B)))
   +g('compibert-leg-left','192 284',P(tp(192,280,32,202,322,15),B)+g('compibert-shin-left','202 322',P(tp(202,322,13,190,350,11),B)+P(tp(190,352,10,224,360,9),B)))};
const filters=u=>`<filter id="${u}stk" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="8" result="d"/><feFlood flood-color="#fffdf8" result="w"/><feComposite in="w" in2="d" operator="in" result="rim"/><feOffset in="d" dx="7" dy="8" result="o"/><feFlood flood-color="#151515"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="${u}hrd" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feOffset in="SourceAlpha" dx="7" dy="8" result="o"/><feFlood flood-color="#151515"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

function build(key,view,u){const c=CH[key],[gx,gy]=c.ground;
  return `<svg viewBox="${c.vb[view]}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:${view==='full'?'visible':'hidden'}"><defs>${filters(u)}${c.defs?c.defs(u):''}</defs><ellipse class="compibert-shadow" data-pivot="${gx} ${gy}" cx="${gx}" cy="${gy}" rx="${c.shadowRx}" ry="10" style="fill:#151515;opacity:.14"/><g class="cb-fig"><g class="compibert-root" data-pivot="${gx} ${gy}">${c.fig(face(c,u),u)}</g></g></svg>`;}

const CW={
  Minze:{body:'#2ec4b6',body2:'#1d9a8e',belly:'#ffd23f',spike:'#ff70c3',cheek:'#ff70c3',gear:'#3a86ff'},
  Pop:{body:'#ff70c3',body2:'#df4c9e',belly:'#ffd23f',spike:'#3a86ff',cheek:'#ff4f4f',gear:'#2ec4b6'},
  Kobalt:{body:'#3a86ff',body2:'#2463d2',belly:'#ffd23f',spike:'#ff70c3',cheek:'#ff70c3',gear:'#2ec4b6'}
};
const HIDE='.compibert-shadow,.compibert-tail-1,.compibert-leg-left,.compibert-leg-right,.compibert-arm-left,.compibert-arm-right,.compibert-body,.cb-neckshape';
const R=(a,b)=>gsap.utils.random(a,b);
const A=(...x)=>x.filter(Boolean);
const lidY=(el,f)=>-(2*(+el.dataset.ry)+10)*(1-f);

function mount(div,i){gsap.config({nullTargetWarn:false});
  const key=div.dataset.rig,view=div.dataset.view||'full',u='cb'+i+'_';
  div.innerHTML=build(key,view,u);
  const svg=div.firstChild,q=s=>svg.querySelector('.'+s);
  if(view==='head'||view==='emote') svg.querySelectorAll(HIDE).forEach(e=>e.style.display='none');
  if(view==='tail'&&key==='F2') svg.querySelectorAll('.compibert-torso,.compibert-leg-left,.compibert-leg-right').forEach(e=>e.style.display='none');
  if(view!=='full') q('compibert-shadow').style.display='none';
  const r={svg,div,key,view,u,cfg:CH[key],hero:!!div.dataset.hero,coin:!!div.dataset.coin,state:'idle',lid:CH[key].lidRest||0,loops:[]};
  r.p={root:q('compibert-root'),torso:q('compibert-torso'),body:q('compibert-body'),neck:q('compibert-neck'),head:q('compibert-head'),armL:q('compibert-arm-left'),armR:q('compibert-arm-right'),legL:q('compibert-leg-left'),legR:q('compibert-leg-right'),shinL:q('compibert-shin-left'),shinR:q('compibert-shin-right'),t1:q('compibert-tail-1'),t2:q('compibert-tail-2'),t3:q('compibert-tail-3'),jaw:q('compibert-jaw'),browL:q('compibert-brow-left'),browR:q('compibert-brow-right'),lidL:q('compibert-lid-left'),lidR:q('compibert-lid-right'),pupL:q('compibert-pupil-left'),pupR:q('compibert-pupil-right'),ballL:q('cb-ball-left'),ballR:q('cb-ball-right'),hapL:q('cb-happy-left'),hapR:q('cb-happy-right'),shadow:q('compibert-shadow'),fig:q('cb-fig'),tear:q('cb-tear'),anger:q('cb-anger')};
  r.p.sweat=q('cb-sweat');r.p.q=q('cb-q');r.dots=[...svg.querySelectorAll('.cb-dot')];
  r.handsG=q('cb-hands');r.clapfx=q('cb-clapfx');if(r.handsG)r.hands=[q('cb-hand-l'),q('cb-hand-r')];
  r.zs=[...svg.querySelectorAll('.cb-z')];r.ms=[...svg.querySelectorAll('.cb-m')];r.fx=[...svg.querySelectorAll('.cb-fx > *')];
  svg.querySelectorAll('[data-pivot]').forEach(el=>{gsap.set(el,{svgOrigin:el.dataset.pivot});
    if(r.hero&&el.tagName==='g'){const [x,y]=el.dataset.pivot.split(' ');el.insertAdjacentHTML('beforeend',`<circle class="cb-pv" cx="${x}" cy="${y}" r="5.5" style="fill:#ff4f4f;stroke:#151515;stroke-width:2.5;display:none"/>`);}});
  const c=r.cfg,p=r.p;
  gsap.set(A(p.lidL,p.lidR),{y:(k,el)=>lidY(el,r.lid)});
  if(c.browRest){gsap.set(p.browL,{opacity:1,rotation:c.browRest[0]});if(p.browR)gsap.set(p.browR,{opacity:1,rotation:c.browRest[1]});}
  svg.querySelectorAll('.compibert-feather').forEach(el=>{if(view!=='head'||el.closest('.compibert-head'))r.loops.push(gsap.fromTo(el,{rotation:-5},{rotation:6,duration:R(.9,1.4),ease:'sine.inOut',yoyo:true,repeat:-1,delay:R(0,1)}));});
  if(view!=='head'&&view!=='emote'){
    r.loops.push(gsap.to(p.body,{scaleY:1.035,scaleX:.99,duration:R(1.6,2.1),ease:'sine.inOut',yoyo:true,repeat:-1}));
    [[p.t1,4,0],[p.t2,7,.22],[p.t3,11,.44]].forEach(([el,a,d])=>{if(!el)return;gsap.set(el,{rotation:-a});r.loops.push(gsap.to(el,{rotation:a,duration:1.5,ease:'sine.inOut',yoyo:true,repeat:-1,delay:d}));});
  }
  r.speed=k=>gsap.to(r.loops,{timeScale:k,duration:.4,overwrite:true});
  const blink=()=>{if(!svg.isConnected)return;if(r.state!=='sleep'){const L=A(p.lidL,p.lidR),tl=gsap.timeline();tl.to(L,{y:0,duration:.07,ease:'power2.in'}).to(L,{y:(k,el)=>lidY(el,r.lid),duration:.11,ease:'power2.out'});if(Math.random()<.18)tl.to(L,{y:0,duration:.06}).to(L,{y:(k,el)=>lidY(el,r.lid),duration:.1});}r.blinkCall=gsap.delayedCall(R(1.6,5.2),blink);};
  r.blinkCall=gsap.delayedCall(R(.3,3),blink);
  const e=c.eyes;r.mp=A(e.left,e.right).map(o=>[o.rx*.42,o.ry*.36]);
  r.qpx=A(p.pupL,p.pupR).map(el=>gsap.quickTo(el,'x',{duration:.4,ease:'power3'}));
  r.qpy=A(p.pupL,p.pupR).map(el=>gsap.quickTo(el,'y',{duration:.4,ease:'power3'}));
  if(!r.coin) r.qn=gsap.quickTo(p.neck,'rotation',{duration:.7,ease:'power2'});
  if(r.hero) toState(r,'idle');
  return r;
}
function setLids(r,f,d,tl,at){r.lid=f;tl.to(A(r.p.lidL,r.p.lidR),{y:(k,el)=>lidY(el,f),duration:d,ease:'power2.inOut'},at||0);}
function mouth(r,name,d,tl,at){r.ms.forEach(m=>{const tw={opacity:m.dataset.m===name?1:0,duration:d==null?.1:d};tl?tl.to(m,tw,at||0):gsap.to(m,tw);});}
function restTo(r,tl,d){const p=r.p,c=r.cfg;
  tl.to([p.root,p.torso,p.head,p.armL,p.armR,p.legL,p.legR,p.shinL,p.shinR,p.jaw].filter(Boolean),{rotation:0,x:0,y:0,scaleX:1,scaleY:1,scale:1,duration:d,ease:'power2.out'},0);
  if(p.shadow) tl.to(p.shadow,{scaleX:1,scaleY:1,opacity:.14,duration:d},0);
  const br=c.browRest;tl.to(p.browL,{opacity:br?1:0,rotation:br?br[0]:0,y:0,duration:d},0);if(p.browR)tl.to(p.browR,{opacity:br?1:0,rotation:br?br[1]:0,y:0,duration:d},0);
  tl.to(A(p.ballL,p.ballR),{opacity:1,duration:.12},0).to(A(p.hapL,p.hapR),{opacity:0,duration:.12},0).to(r.fx,{opacity:0,duration:.15},0);
  if(r.noFollow){r.noFollow=false;tl.to(A(p.pupL,p.pupR),{x:0,y:0,duration:d},0);}
  setLids(r,c.lidRest||0,d,tl,0);mouth(r,'smile',.12,tl,0);r.speed(1);}
const happyEyes=(r,tl)=>tl.to(A(r.p.ballL,r.p.ballR),{opacity:0,duration:.1},.05).to(A(r.p.hapL,r.p.hapR),{opacity:1,duration:.1},.05);
const STATES={
  idle(r){const p=r.p;const micro=()=>{if(r.state!=='idle')return;const k=Math.random();
      if(k<.45) gsap.to(p.head,{rotation:R(-8,6),duration:R(.35,.6),ease:'sine.inOut',yoyo:true,repeat:1,repeatDelay:R(.5,1.4)});
      else if(k<.72) gsap.to(p.armL,{rotation:-22,duration:.14,yoyo:true,repeat:3,ease:'sine.inOut'});
      else gsap.to(p.root,{y:-10,duration:.14,yoyo:true,repeat:1,ease:'power2.out'});
      r.micro=gsap.delayedCall(R(2.2,5.5),micro);};
    r.micro=gsap.delayedCall(R(1,3),micro);},
  wave(r,tl){const p=r.p;mouth(r,'grin',.1,tl,.05);
    tl.to(p.armL,{rotation:-140,duration:.35,ease:'back.out(2)'},.05).to(p.head,{rotation:-6,duration:.4,ease:'sine.out'},.05)
      .to(A(p.browL,p.browR),{opacity:1,y:-6,rotation:0,duration:.2},.05);
    r.speed(1.8);
    const w=gsap.timeline({repeat:-1,repeatDelay:.9});w.to(p.armL,{rotation:-108,duration:.17,ease:'sine.inOut',yoyo:true,repeat:5});tl.add(w,.4);},
  cheer(r,tl){const p=r.p;happyEyes(r,tl);mouth(r,'grin',.1,tl,.05);r.speed(2.2);
    tl.to(p.armL,{rotation:-150,duration:.3,ease:'back.out(2)'},.05).to(p.armR,{rotation:-140,duration:.3,ease:'back.out(2)'},.09);
    const j=gsap.timeline({repeat:-1,repeatDelay:.1});
    j.to(p.root,{y:-38,duration:.26,ease:'power2.out'}).to(p.shadow,{scaleX:.6,scaleY:.6,opacity:.06,duration:.26,ease:'power2.out'},0)
     .to(p.armL,{rotation:-168,duration:.26},0).to(p.armR,{rotation:-118,duration:.26},0)
     .to(p.root,{y:0,duration:.2,ease:'power2.in'}).to(p.shadow,{scaleX:1,scaleY:1,opacity:.14,duration:.2,ease:'power2.in'},'<')
     .to(p.armL,{rotation:-140,duration:.2},'<').to(p.armR,{rotation:-152,duration:.2},'<')
     .to(p.root,{scaleY:.9,scaleX:1.07,duration:.07,yoyo:true,repeat:1,ease:'power1.out'});
    tl.add(j,.3);},
  angry(r,tl){const p=r.p;mouth(r,'frown',.1,tl,.05);setLids(r,.3,.15,tl,.05);r.speed(2.6);
    tl.to(p.browL,{opacity:1,rotation:p.browR?18:16,y:5,duration:.15},.05).to(A(p.browR),{opacity:1,rotation:-18,y:5,duration:.15},.05)
      .to(p.torso,{rotation:6,duration:.3},.05).to(p.head,{rotation:4,duration:.3},.05)
      .to(p.armL,{rotation:-48,duration:.2},.05).to(p.armR,{rotation:-56,duration:.2},.05)
      .to(p.anger,{opacity:1,duration:.1},.1);
    tl.add(gsap.to(p.anger,{scale:1.2,duration:.22,yoyo:true,repeat:-1,ease:'sine.inOut'}),.1);
    const rl=gsap.timeline({repeat:-1,repeatDelay:1.1});
    rl.call(()=>mouth(r,'roar',.05)).to(p.head,{rotation:-10,duration:.12,ease:'power2.out'}).to(p.head,{x:3,duration:.04,yoyo:true,repeat:9,ease:'none'})
      .to(p.armL,{rotation:-70,duration:.08,yoyo:true,repeat:3},'<').call(()=>mouth(r,'frown',.1)).to(p.head,{rotation:4,x:0,duration:.3,ease:'power2.out'});
    tl.add(rl,.5);},
  sad(r,tl){const p=r.p;mouth(r,'frown',.15,tl,.05);setLids(r,.38,.3,tl,.05);r.speed(.4);
    tl.to(p.browL,{opacity:1,rotation:p.browR?-16:-14,y:-2,duration:.3},.05).to(A(p.browR),{opacity:1,rotation:16,y:-2,duration:.3},.05)
      .to(p.head,{rotation:12,duration:.6,ease:'sine.inOut'},.05).to(p.torso,{rotation:5,duration:.6,ease:'sine.inOut'},.05)
      .to([p.armL,p.armR],{rotation:12,duration:.5},.05);
    tl.add(gsap.fromTo(p.tear,{opacity:1,y:0,scale:.6},{y:46,opacity:0,scale:1,duration:1.3,ease:'power1.in',repeat:-1,repeatDelay:.5}),.4);},
  sleep(r,tl){const p=r.p;mouth(r,'o',.2,tl,.05);setLids(r,1,.5,tl,.05);r.speed(.3);
    tl.to(p.head,{rotation:14,duration:.9,ease:'sine.inOut'},.05).to(p.torso,{rotation:4,duration:.9,ease:'sine.inOut'},.05).to([p.armL,p.armR],{rotation:10,duration:.6},.05)
      .to(A(p.pupL,p.pupR),{x:0,y:0,duration:.3},.05);
    r.zs.forEach((z,i)=>{const zt=gsap.timeline({repeat:-1,delay:i*.75});zt.set(z,{opacity:0,x:0,y:0,scale:.5}).to(z,{opacity:1,duration:.4}).to(z,{x:30,y:-60,scale:1.1,duration:2,ease:'sine.out'},0).to(z,{opacity:0,duration:.5},1.6);tl.add(zt,.6);});}
};
STATES.look=function(r,tl){const p=r.p,[mx,my]=r.mp[0];r.noFollow=true;r.speed(.7);
  const l=gsap.timeline({repeat:-1,repeatDelay:.6});
  l.to(A(p.pupL),{x:-mx,y:0,duration:.35,ease:'power2.inOut'}).to(p.head,{rotation:-4,duration:.6,ease:'sine.inOut'},'<')
   .to(A(p.pupL),{x:-mx*.6,y:-my,duration:.4,ease:'power2.inOut'},'+=.7').to(p.head,{rotation:-10,duration:.6,ease:'sine.inOut'},'<')
   .to(A(p.pupL),{x:mx,y:-my*.3,duration:.45,ease:'power2.inOut'},'+=.6').to(p.head,{rotation:3,duration:.6,ease:'sine.inOut'},'<').to(p.browL,{opacity:1,y:-4,duration:.3},'<')
   .to(A(p.pupL),{x:0,y:0,duration:.35,ease:'power2.inOut'},'+=.8').to(p.head,{rotation:0,duration:.5},'<').to(p.browL,{y:0,duration:.3},'<');
  tl.add(l,.1);};
STATES.excited=function(r,tl){const p=r.p;mouth(r,'grin',.1,tl,.05);setLids(r,0,.15,tl,.05);r.speed(2.6);
  tl.to(p.browL,{y:-7,duration:.2},.05).to(p.armL,{rotation:-60,duration:.2},.05).to(A(p.armR),{rotation:-130,duration:.2},.05).to(p.head,{rotation:2,duration:.2},.05);
  const e=gsap.timeline({repeat:-1});
  e.to(p.armL,{rotation:-130,duration:.2,ease:'power2.out'},0).to(A(p.armR),{rotation:-60,duration:.2,ease:'power2.out'},0).to(p.root,{y:-12,duration:.2,ease:'power2.out'},0).to(p.head,{rotation:-5,duration:.2},0)
   .to(p.armL,{rotation:-60,duration:.2,ease:'power2.out'},.22).to(A(p.armR),{rotation:-130,duration:.2,ease:'power2.out'},.22).to(p.root,{y:0,duration:.2,ease:'power2.in'},.22).to(p.head,{rotation:2,duration:.2},.22);
  tl.add(e,.3);};
STATES.suspense=function(r,tl){const p=r.p,[mx]=r.mp[0];r.noFollow=true;mouth(r,'o',.1,tl,.05);setLids(r,0,.15,tl,.05);r.speed(.2);
  tl.to(A(p.pupL),{x:mx*.7,y:0,duration:.25},.05).to(p.browL,{opacity:1,y:-8,rotation:-10,duration:.25},.05)
   .to(p.armL,{rotation:-80,duration:.4,ease:'power2.out'},.05).to(A(p.armR),{rotation:-90,duration:.4,ease:'power2.out'},.05).to(p.torso,{rotation:-3,duration:.5},.05).to(p.head,{rotation:3,duration:.5},.05);
  tl.add(gsap.to(p.root,{x:1.6,duration:.05,yoyo:true,repeat:-1,ease:'none'}),.3);
  if(p.sweat) tl.add(gsap.fromTo(p.sweat,{opacity:1,y:0},{y:30,opacity:0,duration:1.1,ease:'power1.in',repeat:-1,repeatDelay:.4}),.4);};
STATES.laugh=function(r,tl){const p=r.p;happyEyes(r,tl);mouth(r,'grin',.1,tl,.05);r.speed(1.8);
  tl.to(p.head,{rotation:-12,duration:.25,ease:'power2.out'},.05).to(p.armL,{rotation:24,duration:.25},.05).to(A(p.armR),{rotation:18,duration:.25},.05);
  const h=gsap.timeline({repeat:-1,repeatDelay:.35});h.to(p.torso,{rotation:-5,duration:.09,yoyo:true,repeat:7,ease:'sine.inOut'}).to(p.root,{y:-4,duration:.09,yoyo:true,repeat:7,ease:'sine.inOut'},0);tl.add(h,.2);
  if(p.tear){const t=p.tear,tt=gsap.timeline({repeat:-1,repeatDelay:.2});tt.set(t,{opacity:1,x:0,y:0,scale:.7}).to(t,{x:-28,scale:1,duration:.9,ease:'power1.out'},0).to(t,{y:-8,duration:.25,ease:'power2.out'},0).to(t,{y:28,duration:.65,ease:'power2.in'},.25).to(t,{opacity:0,duration:.25},.65);tl.add(tt,.2);}};
STATES.dance=function(r,tl){const p=r.p,b=.5;happyEyes(r,tl);mouth(r,'grin',.1,tl,.05);r.speed(2);
  tl.to(p.torso,{rotation:-8,duration:.25},.05).to(p.head,{rotation:6,duration:.25},.05).to(p.armL,{rotation:-40,duration:.25},.05).to(A(p.armR),{rotation:-150,duration:.25},.05).to(p.legL,{rotation:-6,duration:.25},.05).to(p.legR,{rotation:10,duration:.25},.05);
  const d=gsap.timeline({repeat:-1});
  [[1,-150,-40,10,-6],[-1,-40,-150,-6,10]].forEach(([s,aL,aR,lL,lR],i)=>{const t=i*b;
    d.to(p.torso,{rotation:8*s,duration:b,ease:'sine.inOut'},t).to(p.head,{rotation:-6*s,duration:b,ease:'sine.inOut'},t)
     .to(p.armL,{rotation:aL,duration:b*.8,ease:'back.out(1.6)'},t).to(A(p.armR),{rotation:aR,duration:b*.8,ease:'back.out(1.6)'},t)
     .to(p.legL,{rotation:lL,duration:b*.5,ease:'sine.inOut'},t).to(p.legR,{rotation:lR,duration:b*.5,ease:'sine.inOut'},t)
     .to(p.root,{y:-14,duration:b*.5,ease:'power2.out'},t).to(p.root,{y:0,duration:b*.5,ease:'power2.in'},t+b*.5);});
  tl.add(d,.3);};
STATES.think=function(r,tl){const p=r.p,[mx,my]=r.mp[0];r.noFollow=true;mouth(r,'flat',.12,tl,.05);r.speed(.6);
  tl.to(A(p.pupL),{x:mx*.4,y:-my,duration:.35,ease:'power2.inOut'},.05).to(p.browL,{opacity:1,y:-8,rotation:-8,duration:.3},.05)
   .to(p.head,{rotation:-7,duration:.5,ease:'sine.inOut'},.05).to(p.armL,{rotation:-100,duration:.45,ease:'power2.out'},.05);
  tl.add(gsap.to(p.armL,{rotation:-108,duration:.35,yoyo:true,repeat:-1,ease:'sine.inOut'}),.55);
  if(r.dots.length){const dt=gsap.timeline({repeat:-1,repeatDelay:.3});r.dots.forEach((el,i)=>dt.fromTo(el,{opacity:0,scale:.4},{opacity:1,scale:1,duration:.2,ease:'back.out(2)'},i*.3));dt.to(r.dots,{opacity:0,duration:.2},'+=.5');tl.add(dt,.3);}};
STATES.confused=function(r,tl){const p=r.p,[mx,my]=r.mp[0];r.noFollow=true;mouth(r,'wobble',.1,tl,.05);r.speed(.6);
  tl.to(A(p.pupL),{x:-mx*.5,y:-my*.6,duration:.3},.05).to(p.browL,{opacity:1,y:-6,rotation:14,duration:.25},.05)
   .to(p.armL,{rotation:-55,duration:.3,ease:'back.out(2)'},.05).to(A(p.armR),{rotation:-65,duration:.3,ease:'back.out(2)'},.05).to(p.head,{rotation:-12,duration:.4,ease:'sine.inOut'},.05);
  if(p.q){tl.fromTo(p.q,{opacity:0,scale:.2},{opacity:1,scale:1,duration:.35,ease:'back.out(2.4)'},.15);tl.add(gsap.fromTo(p.q,{rotation:-12},{rotation:12,duration:.6,yoyo:true,repeat:-1,ease:'sine.inOut'}),.5);}
  tl.add(gsap.fromTo(p.head,{rotation:-12},{rotation:8,duration:.6,ease:'sine.inOut',yoyo:true,repeat:-1,repeatDelay:.8}),.5);};
STATES.run=function(r,tl){const p=r.p,h=.15;mouth(r,'grin',.1,tl,.05);r.speed(3);
  tl.to(p.torso,{rotation:8,duration:.2},.05).to(p.head,{rotation:-8,duration:.2},.05);
  const c=gsap.timeline({repeat:-1});
  [[-42,34,-8,40,30,-40],[34,-42,40,-8,-40,30]].forEach(([lL,lR,sL,sR,aL,aR],i)=>{const t=i*h;
    c.to(p.legL,{rotation:lL,duration:h,ease:'sine.inOut'},t).to(p.legR,{rotation:lR,duration:h,ease:'sine.inOut'},t)
     .to(A(p.shinL),{rotation:sL,duration:h},t).to(A(p.shinR),{rotation:sR,duration:h},t)
     .to(p.armL,{rotation:aL,duration:h},t).to(A(p.armR),{rotation:aR,duration:h},t)
     .to(p.root,{y:-9,duration:h/2,yoyo:true,repeat:1,ease:'power1.out'},t);});
  tl.add(c,.08);};
STATES.clap=function(r,tl){const p=r.p;happyEyes(r,tl);mouth(r,'grin',.1,tl,.05);r.speed(1.6);
  tl.to(p.armL,{rotation:-96,duration:.2},.05).to(A(p.armR),{rotation:-70,duration:.2},.05).to(p.head,{rotation:-4,duration:.3},.05);
  const c=gsap.timeline({repeat:-1,repeatDelay:.04});
  c.to(p.armL,{rotation:-74,duration:.09,ease:'power2.in'}).to(A(p.armR),{rotation:-92,duration:.09,ease:'power2.in'},0).to(p.root,{y:-3,duration:.09},0)
   .to(p.armL,{rotation:-96,duration:.11,ease:'power2.out'}).to(A(p.armR),{rotation:-70,duration:.11,ease:'power2.out'},'<').to(p.root,{y:0,duration:.11},'<');
  tl.add(c,.25);
  if(r.view!=='full'&&r.view!=='bust'&&r.hands){const [hl,hr]=r.hands;tl.to(r.handsG,{opacity:1,duration:.12},.05);
    const h=gsap.timeline({repeat:-1,repeatDelay:.04});h.to(hl,{x:9,rotation:10,duration:.09,ease:'power2.in'}).to(hr,{x:-9,rotation:-10,duration:.09,ease:'power2.in'},0).set(r.clapfx,{opacity:1}).to(r.clapfx,{opacity:0,duration:.1})
     .to(hl,{x:0,rotation:0,duration:.11,ease:'power2.out'},.09).to(hr,{x:0,rotation:0,duration:.11,ease:'power2.out'},.09);tl.add(h,.2);}};
STATES.roar=function(r,tl){const p=r.p;r.speed(2.4);
  tl.to(p.browL,{opacity:1,rotation:16,y:5,duration:.15},.05).to(A(p.browR),{opacity:1,rotation:-16,y:5,duration:.15},.05);
  const c=gsap.timeline({repeat:-1,repeatDelay:.7});
  c.call(()=>mouth(r,'o',.08)).to(p.head,{rotation:-14,duration:.4,ease:'power2.out'},0).to(p.torso,{rotation:-5,scale:1.04,duration:.4,ease:'power2.out'},0)
   .to(p.armL,{rotation:-30,duration:.4},0).to(A(p.armR),{rotation:-36,duration:.4},0)
   .call(()=>mouth(r,'roar',.04),null,.45).to(p.head,{rotation:9,duration:.12,ease:'power3.out'},.45).to(p.torso,{rotation:6,scale:1,duration:.12,ease:'power3.out'},.45)
   .to(p.armL,{rotation:-70,duration:.12},.45).to(A(p.armR),{rotation:-78,duration:.12},.45)
   .to(p.head,{x:2.5,duration:.03,yoyo:true,repeat:21,ease:'none'},.57)
   .call(()=>mouth(r,'frown',.1),null,1.3).to(p.head,{rotation:0,x:0,duration:.3},1.3).to(p.torso,{rotation:0,duration:.3},1.3);
  tl.add(c,.1);};
function toState(r,s,tries){if(!STATES[s])s='idle';tries=tries||0;
  r.pending&&r.pending.kill();
  if(tries<8&&gsap.getProperty(r.p.root,'y')<-3){r.pending=gsap.delayedCall(.04,()=>toState(r,s,tries+1));return;}
  r.state=s;r.stateTl&&r.stateTl.kill();r.micro&&r.micro.kill();
  const tl=gsap.timeline();restTo(r,tl,r.reduced?.2:.25);STATES[s](r,tl);r.stateTl=tl;
  if(r.reduced){r.speed(.25);tl.call(()=>tl.getChildren(true,true,true).forEach(c=>{if(c.repeat&&c.repeat()===-1)c.pause(0);}),null,.45);}}
function treat(r,t){const f=r.coin?'':t==='Sticker'?`url(#${r.u}stk)`:t==='Harter Schatten'?`url(#${r.u}hrd)`:'';f?r.p.fig.setAttribute('filter',f):r.p.fig.removeAttribute('filter');}
function pivots(r,on){r.svg.querySelectorAll('.cb-pv').forEach(c=>c.style.display=on?'':'none');}
function track(rigs,mx,my){for(const r of rigs){if(r.state==='sleep'||r.noFollow||!r.p.ballL)continue;const b=r.p.ballL.getBoundingClientRect();if(!b.width)continue;
  const dx=mx-(b.left+b.width/2),dy=my-(b.top+b.height/2),d=Math.hypot(dx,dy)||1,k=Math.min(1,d/220);
  r.qpx.forEach((q,i)=>q(dx/d*k*r.mp[i][0]));r.qpy.forEach((q,i)=>q(dy/d*k*r.mp[i][1]));if(r.qn)r.qn(Math.max(-6,Math.min(6,dy/d*k*6)));}}
function kill(r){r.loops.forEach(t=>t.kill());r.stateTl&&r.stateTl.kill();r.blinkCall&&r.blinkCall.kill();r.micro&&r.micro.kill();}
function vis(r,on){if(!on&&!r._seen)return;if(on)r._seen=true;if(r._vis===on)return;r._vis=on;const f=on?'resume':'pause';r.loops.forEach(t=>t[f]());r.stateTl&&r.stateTl[f]();r.svg.style.visibility=on?'':'hidden';}
let VIO=null;const VMAP=new Map();
function watch(r){if(!('IntersectionObserver' in window))return;if(!VIO)VIO=new IntersectionObserver(es=>es.forEach(e=>{const x=VMAP.get(e.target);x&&vis(x,e.isIntersecting);}),{rootMargin:'120px'});VMAP.set(r.div,r);VIO.observe(r.div);}
window.CBO={mount:(d,i)=>{const r=mount(d,i);watch(r);return r;},toState,treat,pivots,track:(rs,x,y)=>track(rs.filter(r=>r._vis!==false),x,y),kill,CW,CH,build,vis};
})();
