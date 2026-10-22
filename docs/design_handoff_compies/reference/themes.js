(function(){
if(window.COMPIES_THEMES)return;
const hx=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.substr(i,2),16));};
const toHex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const shade=(h,k)=>toHex(hx(h).map(v=>k<0?v*(1+k):v+(255-v)*k));
const rgba=(h,a)=>{const c=hx(h);return `rgba(${c[0]},${c[1]},${c[2]},${a})`;};
const pxb=(c,s)=>`0 -${s}px 0 0 ${c}, 0 ${s}px 0 0 ${c}, -${s}px 0 0 0 ${c}, ${s}px 0 0 0 ${c}`;
const U=s=>'url("data:image/svg+xml,'+encodeURIComponent(s)+'")';
const svg=(vb,d,c,w,extra='')=>U(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'><path d='${d}' fill='none' stroke='${c}' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round' ${extra}/></svg>`)+' center/contain no-repeat';
const SQ=(c,w=6)=>svg('0 0 140 34','M6 17 Q 19 3 32 17 T 58 17 T 84 17 T 110 17 T 134 17',c,w);
const ZZ=(c,w=6)=>svg('0 0 120 34','M5 27 L19 8 L33 27 L47 8 L61 27 L75 8 L89 27 L103 8 L116 27',c,w);
const STAR=(c,w=3)=>svg('0 0 60 60','M30 6 L36 23 L54 24 L40 35 L45 53 L30 43 L15 53 L20 35 L6 24 L24 23 Z',c,w);
const ARROW=(c,w=3)=>svg('0 0 120 50','M6 40 C 34 8, 72 6, 108 24 M 92 12 L 110 25 L 92 34',c,w);
const LOOP=(c,w=3)=>svg('0 0 70 60','M36 8 C 58 6 66 26 60 40 C 52 56 20 58 10 42 C 2 26 16 8 40 12',c,w);
const GL=['●','▲','■','◆','★','✚','▼','✱'];
const TN=['Rot','Orange','Gelb','Grün','Türkis','Blau','Lila','Pink'];
const teams=l=>l.map((x,i)=>({n:TN[i],c:x[0],ink:x[1],g:GL[i]}));
const isObj=o=>o&&typeof o==='object'&&!Array.isArray(o);
const dm=(a,b)=>{const o={...a};for(const k in b){o[k]=isObj(b[k])&&isObj(a[k])?dm(a[k],b[k]):b[k];}return o;};
const SP=[[-8,-12,560,440],[52,-18,620,480],[18,40,580,440],[66,46,660,500],[-12,62,520,400],[38,8,440,360]];
function smoke(kind,cols,o){if(window.COMPIES_STILL)return SP.slice(0,3).map((p,i)=>{const c=cols[i%cols.length];return {x:p[0]+'%',y:p[1]+'%',w:p[2]+'px',h:p[3]+'px',bg:`radial-gradient(closest-side, ${rgba(c,1)}, ${rgba(c,0)})`,mask:'none',o:Math.min(o,.18),anim:'none'};});return SP.map((p,i)=>{const c=cols[i%cols.length];let bg,mask='none';
 if(kind==='soft'||kind==='fog')bg=`radial-gradient(closest-side, ${rgba(c,1)}, ${rgba(c,0)})`;
 if(kind==='dots'){bg=`radial-gradient(circle, ${c} 2.2px, transparent 2.8px) 0 0/14px 14px`;mask='radial-gradient(closest-side, #000 15%, transparent)';}
 if(kind==='chalk'){bg=`repeating-radial-gradient(closest-side, ${rgba(c,.9)} 0 1.5px, transparent 2.5px 11px)`;mask='radial-gradient(closest-side, #000 5%, transparent)';}
 if(kind==='pixel'){bg=`radial-gradient(closest-side, ${c} 0 28%, ${rgba(c,.6)} 28% 50%, ${rgba(c,.28)} 50% 72%, transparent 72%)`;mask='repeating-conic-gradient(#000 0 25%, rgba(0,0,0,.4) 0 50%) 0 0/8px 8px';}
 if(kind==='puff')bg=`radial-gradient(circle at 32% 60%, ${c} 0 20%, transparent 20.5%), radial-gradient(circle at 53% 45%, ${c} 0 26%, transparent 26.5%), radial-gradient(circle at 73% 61%, ${c} 0 18%, transparent 18.5%), radial-gradient(42% 14% at 53% 68%, ${c} 99%, transparent 100%)`;
 return {x:p[0]+'%',y:p[1]+'%',w:p[2]+'px',h:p[3]+'px',bg,mask,o,anim:`${i%2?'cpDriftB':'cpDriftA'} ${36+i*8}s ease-in-out ${-i*9}s infinite`};});}
const D=o=>Object.assign({r:'0',b:'none',rot:'0deg',clip:'none',o:1,sh:'none',bg:'transparent'},o);
const TRI='polygon(50% 0,100% 100%,0 100%)';
const pstar=(x,y,c='#ffffff')=>D({x,y,w:'4px',h:'4px',bg:c,sh:`4px 0 0 ${rgba(c,.5)},-4px 0 0 ${rgba(c,.5)},0 4px 0 ${rgba(c,.5)},0 -4px 0 ${rgba(c,.5)}`,o:.8});
const MPH=(k,ink)=>[D({x:'31%',y:'10%',w:'44px',h:'38px',bg:k[2],clip:TRI,rot:'14deg'}),D({x:'57%',y:'92.5%',w:'130px',h:'34px',bg:SQ(ink)}),D({x:'1.6%',y:'54%',w:'34px',h:'34px',r:'50%',b:`3px solid ${ink}`}),D({x:'63%',y:'10.5%',w:'90px',h:'40px',bg:`radial-gradient(circle,${k[7]} 2.5px,transparent 3px) 0 0/12px 12px`}),D({x:'44%',y:'92%',w:'60px',h:'30px',bg:k[5],r:'60px 60px 0 0',rot:'-14deg'}),D({x:'1%',y:'93%',w:'110px',h:'26px',bg:ZZ(k[4])})];
const PXM={h:"'Silkscreen',monospace",hw:700,hc:'uppercase',n:"'Press Start 2P',monospace",nw:400,nsize:'34px',wl:'10px',wheelStrokeW:4,ringW:12,ringCap:'butt',vetoR:'0px',vetoBorder:'none',r:'0px',scan:true,pixel:true};
const T={};

T.swiss={id:'swiss',no:'01',name:'Swiss Style',de:'Raster',kind:'Single',mode:'dark',modes:{dark:'Recommended',light:'Good'},
 alt:{bg:'#f2f1ec',panel:'#ffffff',ink:'#111110',accent:'#ff3b1f'},
 f:{h:"'Hanken Grotesk',sans-serif",hw:900,hc:'none',ht:'-0.035em',b:"'Hanken Grotesk',sans-serif",bw:500,bs:'14px',n:"'Hanken Grotesk',sans-serif",nw:900,lab:"'JetBrains Mono',monospace",labc:'uppercase',labt:'0.06em',title:'44px',logo:'22px'},
 c:{bg:'#0e0e0d',bgImg:'linear-gradient(to right, rgba(243,242,237,.045) 1px, transparent 1px)',bgSize:'calc(100% / 12) 100%',panel:'#171716',panel2:'#20201e',ink:'#f3f2ed',ink2:'#9b998f',line:'rgba(243,242,237,.14)',accent:'#f3f2ed',accentInk:'#0e0e0d',hot:'#ff3b1f',hotInk:'#0e0e0d',av:['#3a3a37','#4a4843','#2f3433','#45403b','#38363f','#3e4440']},
 teams:teams([['#ff3b1f','#000'],['#ff8a00','#000'],['#ffd400','#000'],['#00b25c','#000'],['#00c2d1','#000'],['#3f63ff','#fff'],['#9b4dff','#fff'],['#ff4fa3','#000']]),
 s:{r:'0px',rBtn:'0px',rAv:'50%',rChip:'0px'},
 i:{sw:1.75,cap:'square',join:'miter'},
 mascot:{style:'geo',body:'#ff3b1f',belly:'#f3f2ed',spike:'#f3f2ed',ink:'#0e0e0d',eye:'#ffffff',blush:'#ff8a7a',note:'Built from primitives only – ellipses, triangles, one curve per limb. No outline; the rig parts are literally the shapes.'},
 decos:[D({x:'-7%',y:'80%',w:'300px',h:'300px',r:'50%',bg:'#ff3b1f',o:.9})],
 smoke:smoke('soft',['#ff3b1f','#f3f2ed','#3f63ff'],.09),smokeKind:'soft',smokeColors:['#ff3b1f','#f3f2ed','#3f63ff'],boot:'grid',
 x:{lab:{kicker:'01 / Lobby',bench:'02 — Bench',stands:'03 — Tribüne'}},
 tile:{fh:'Hanken Grotesk 900, tight tracking',fb:'Hanken Grotesk 500',fn:'Hanken Grotesk 900, tabular figures',hs:'48px',shapes:'0 px radius, 1 px hairlines, flush-left, everything snaps to a 12-column grid. Circles only for avatars & the signal dot.',tex:'Hairline column grid in the background, flat fills. Smoke = soft grey/red light, barely there.',icons:'1.75 px line, square caps, 24 px grid, geometric.',motion:'Snappy, linear-ish: things slide along grid lines, counters roll, nothing bounces.'},
 ratings:{fun:2,read:5,teams:5,motion:3,mobile:5}};

T.memphis={id:'memphis',no:'02',name:'Memphis',de:'Konfetti',kind:'Single',mode:'light',modes:{dark:'Only as neon variant',light:'Recommended'},
 alt:{bg:'#1b1035',panel:'#2a1b4f',ink:'#fff3df',accent:'#ff4f6d'},
 f:{h:"'Bricolage Grotesque',sans-serif",hw:800,hc:'none',ht:'-0.03em',b:"'Bricolage Grotesque',sans-serif",bw:500,bs:'14px',n:"'Bungee',sans-serif",nw:400,lab:"'Bricolage Grotesque',sans-serif",labc:'uppercase',labt:'0.08em',title:'46px',logo:'24px'},
 c:{bg:'#fff3df',bgImg:'radial-gradient(rgba(21,21,21,.10) 1.4px, transparent 1.6px)',bgSize:'22px 22px',panel:'#ffffff',panel2:'#fff9ef',ink:'#151515',ink2:'#5d5650',line:'#151515',accent:'#ffd23f',accentInk:'#151515',hot:'#ff4f4f',hotInk:'#151515',av:['#ffd6a5','#caffbf','#9bf6ff','#bdb2ff','#ffc6ff','#fdffb6'],ok:'#06b46b'},
 teams:teams([['#ff5a5a','#151515'],['#ff9f1c','#151515'],['#ffd23f','#151515'],['#8ac926','#151515'],['#2ec4b6','#151515'],['#3a86ff','#151515'],['#8338ec','#ffffff'],['#ff70c3','#151515']]),
 s:{r:'14px',rBtn:'999px',rAv:'50%',rChip:'999px',border:'3px solid #151515',shadow:'6px 6px 0 #151515',btnShadow:'4px 4px 0 #151515',btnBorder:'3px solid #151515',avBorder:'2.5px solid #151515',div:'3px solid #151515'},
 i:{sw:2.5,cap:'round',join:'round',offset:true},
 mascot:{style:'memphis',body:'#2ec4b6',belly:'#ffd23f',spike:'#ff5a5a',ink:'#151515',eye:'#ffffff',blush:'#ff70c3',note:'Flat candy fills, 3 px black outline, hard offset shadow. Pink spikes, yellow belly – he looks like a 1985 toy.'},
 decos:MPH(['#ff5a5a','#ff9f1c','#ffd23f','#8ac926','#2ec4b6','#3a86ff','#8338ec','#ff70c3'],'#151515'),
 smoke:smoke('dots',['#ff70c3','#3a86ff','#ffd23f','#2ec4b6'],.5),smokeKind:'shapes',smokeColors:['#ff70c3','#3a86ff','#ffd23f','#2ec4b6'],boot:'pop',
 x:{lab:{kicker:'Lobby',bench:'Bench',stands:'Tribüne'}},
 tile:{fh:'Bricolage Grotesque 800',fb:'Bricolage Grotesque 500',fn:'Bungee',hs:'46px',shapes:'Mixed radii: pills, 14 px cards, triangles & half-circles. Always a 3 px black outline and a 6 px hard offset shadow.',tex:'Dot-grid paper, halftone smoke, squiggles & zigzags as confetti in the gaps.',icons:'2.5 px round line + black offset duplicate.',motion:'Bouncy overshoot, shapes pop and spin in, shadows "press" on click.'},
 ratings:{fun:4,read:3,teams:3,motion:4,mobile:3}};

T.hand={id:'hand',no:'03',name:'Hand-Drawn',de:'Kreidetafel',kind:'Single',mode:'dark',modes:{dark:'Recommended (chalkboard)',light:'Good (paper)'},
 alt:{bg:'#fbf8f1',panel:'#ffffff',ink:'#2b2a27',accent:'#e5352b'},
 f:{h:"'Caveat Brush',cursive",hw:400,hc:'none',ht:'0',b:"'Patrick Hand',sans-serif",bw:400,bs:'16px',n:"'Caveat Brush',cursive",nw:400,lab:"'Patrick Hand',sans-serif",labc:'none',labt:'0.02em',title:'52px',logo:'30px',ths:'20px'},
 c:{bg:'#1f2b27',bgImg:'radial-gradient(ellipse at 20% 30%, rgba(255,255,255,.06), transparent 50%), radial-gradient(ellipse at 80% 75%, rgba(255,255,255,.045), transparent 45%)',bgSize:'100% 100%',panel:'rgba(255,255,255,.035)',panel2:'rgba(255,255,255,.07)',ink:'#f1ede2',ink2:'#b9b5a7',line:'rgba(241,237,226,.55)',accent:'#ffe066',accentInk:'#1f2b27',hot:'#ff7b7b',hotInk:'#1f2b27',av:['#3b4a44','#46423a','#3d3f4c','#4a3b3f','#36463f','#44463a'],panelSide:'rgba(0,0,0,.12)'},
 teams:teams([['#ff7b7b','#1f2b27'],['#ffad5c','#1f2b27'],['#ffe066','#1f2b27'],['#8fe388','#1f2b27'],['#5fd8e0','#1f2b27'],['#7c9bff','#1f2b27'],['#c49bff','#1f2b27'],['#ff8fc8','#1f2b27']]),
 s:{r:'10px',rBtn:'12px',rAv:'50%',rChip:'10px',border:'2px solid rgba(241,237,226,.8)',ff:'url(#cp-wob)',btnBorder:'2px solid #1f2b27',div:'1.5px dashed rgba(241,237,226,.35)'},
 i:{sw:2.2,cap:'round',join:'round',filter:'url(#cp-wob)'},
 mascot:{style:'hand',body:'#8fe388',belly:'#ffe066',spike:'#ff8fc8',ink:'#f1ede2',eye:'#1f2b27',blush:'#ff8fc8',note:'Chalk line drawn with a wobble, colour slightly off-register like a quick marker fill. Feels drawn on the spot.'},
 decos:[D({x:'33%',y:'8.5%',w:'54px',h:'54px',bg:STAR('#ffe066')}),D({x:'1.5%',y:'93%',w:'140px',h:'30px',bg:SQ('rgba(241,237,226,.6)',4)}),D({x:'60%',y:'91%',w:'110px',h:'46px',bg:ARROW('#ff8fc8')})],
 smoke:smoke('chalk',['#f1ede2','#ffe066','#7c9bff'],.22),smokeKind:'chalk',smokeColors:['#f1ede2','#ffe066','#7c9bff'],boot:'draw',
 x:{lab:{kicker:'die Lobby',bench:'Bench',stands:'Tribüne'}},
 tile:{fh:'Caveat Brush',fb:'Patrick Hand (bigger base size: 16 px)',fn:'Caveat Brush',hs:'56px',shapes:'Wobbly 2 px chalk frames (SVG displacement on the frame layer only – text stays crisp). No shadows.',tex:'Chalkboard with smudges, chalk-dust ring smoke. Light variant: dotted paper.',icons:'2.2 px wobbly chalk line, round caps.',motion:'Line-boil (frames jitter at 8 fps), things get "drawn on" with stroke reveals.'},
 ratings:{fun:4,read:3,teams:3,motion:3,mobile:3}};

T.pixel={id:'pixel',no:'04',name:'Pixel Art',de:'16-Bit',kind:'Single',mode:'dark',modes:{dark:'Recommended',light:'Weak'},
 alt:{bg:'#e8e4d8',panel:'#ffffff',ink:'#14112a',accent:'#ff004d'},
 f:{h:"'Silkscreen',monospace",hw:700,hc:'uppercase',ht:'0',b:"'Pixelify Sans',sans-serif",bw:500,bs:'15px',n:"'Press Start 2P',monospace",nw:400,lab:"'Silkscreen',monospace",labc:'uppercase',labt:'0.04em',title:'34px',logo:'20px',ths:'13px'},
 c:{bg:'#14112a',bgImg:'repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 2px, transparent 2px 4px), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',bgSize:'100% 4px, 16px 16px, 16px 16px',panel:'#211c42',panel2:'#2c2657',ink:'#f4f0ff',ink2:'#a59fd0',line:'#4a4290',accent:'#ffec27',accentInk:'#14112a',hot:'#ff004d',hotInk:'#ffffff',av:['#3a3370','#4b3a6e','#2f4a6e','#5a3a5a','#3a5a5a','#4a4a7a'],ok:'#00e436'},
 teams:teams([['#ff004d','#ffffff'],['#ffa300','#14112a'],['#ffec27','#14112a'],['#00e436','#14112a'],['#2ce8f5','#14112a'],['#3b6bff','#ffffff'],['#b05cff','#ffffff'],['#ff77a8','#14112a']]),
 s:{r:'0px',rBtn:'0px',rAv:'0px',rChip:'0px',rDot:'0px',border:'none',shadow:pxb('#4a4290',4)+', 0 8px 0 0 rgba(0,0,0,.45)',btnShadow:pxb('#000',3)+', 0 6px 0 0 rgba(0,0,0,.5)',div:'4px solid #4a4290',slotEmpty:'3px dashed #4a4290'},
 i:{pixel:true},
 mascot:{style:'pixel',body:'#00e436',belly:'#ffec27',spike:'#ff004d',ink:'#14112a',eye:'#ffffff',blush:'#ff77a8',note:'The same vector rig, rasterised live to a 64 px sprite and snapped to the palette – so pixel Compibert can use every pose the vector one has.'},
 decos:[pstar('34%','9%'),pstar('61%','12%','#2ce8f5'),pstar('3%','52%','#ffec27'),pstar('47%','95%'),pstar('70%','93%','#ff77a8')],
 smoke:smoke('pixel',['#b05cff','#2ce8f5','#ff004d'],.2),smokeKind:'pixel',smokeColors:['#b05cff','#2ce8f5','#ff004d'],boot:'crt',
 x:{lab:{kicker:'Level 1 — Lobby',bench:'Bench',stands:'Tribüne'}},
 tile:{fh:'Silkscreen 700',fb:'Pixelify Sans 500',fn:'Press Start 2P',hs:'30px',shapes:'Stepped corners (4 px pixel border), hard 8 px drop, square avatars. No anti-aliased curves anywhere.',tex:'CRT scanlines + 16 px grid, dithered pixel smoke.',icons:'8×8 bitmaps, scaled ×3/×4, crisp edges.',motion:'Stepped (steps()) easing, 12 fps sprite loops, screen-shake & flash on reveals.'},
 ratings:{fun:4,read:2,teams:4,motion:4,mobile:2}};

T.picnic={id:'picnic',no:'05',name:'Company Picnic',de:'Bühne & Charakter',kind:'Single · reference',mode:'dark',modes:{dark:'Recommended',light:'Good (cream)'},
 alt:{bg:'#f5efe2',panel:'#ffffff',ink:'#17121d',accent:'#ff5a36'},
 f:{h:"'Big Shoulders Display',sans-serif",hw:900,hc:'uppercase',ht:'0',b:"'Instrument Sans',sans-serif",bw:500,bs:'14px',n:"'Big Shoulders Display',sans-serif",nw:900,lab:"'Instrument Sans',sans-serif",labc:'uppercase',labt:'0.12em',title:'84px',logo:'26px',ths:'18px'},
 c:{bg:'#17121d',bgImg:'radial-gradient(ellipse at 50% -10%, rgba(255,176,32,.13), transparent 55%), radial-gradient(ellipse at 50% 120%, rgba(0,0,0,.5), transparent 60%)',bgSize:'100% 100%',panel:'#221b2b',panel2:'#2d2438',ink:'#f7efe1',ink2:'#b5a99b',line:'rgba(247,239,225,.16)',accent:'#ff5a36',accentInk:'#17121d',hot:'#ff5a36',hotInk:'#17121d',av:['#3a3045','#4a3a40','#33404a','#4a4235','#3d3550','#45383a']},
 teams:teams([['#ff5a36','#17121d'],['#ffb020','#17121d'],['#f4e04d','#17121d'],['#45d483','#17121d'],['#2ec5d3','#17121d'],['#4d7cfe','#ffffff'],['#a073ff','#ffffff'],['#ff6fb5','#17121d']]),
 s:{r:'22px',rBtn:'999px',rAv:'50%',rChip:'999px',border:'1.5px solid rgba(247,239,225,.16)',shadow:'0 24px 48px rgba(0,0,0,.35)'},
 i:{sw:2,cap:'round',join:'round',fill:true},
 mascot:{style:'toon',body:'#45d483',belly:'#f4e04d',spike:'#ff5a36',ink:'#17121d',eye:'#ffffff',blush:'#ff6fb5',note:'Character-first: thick ink line, big expressive eye, slight belly shading. Built to "step out" of frames and act.'},
 decos:[],
 smoke:smoke('fog',['#ff5a36','#ffb020','#a073ff'],.15),smokeKind:'fog',smokeColors:['#ff5a36','#ffb020','#a073ff'],boot:'stage',
 x:{marquee:true,lab:{kicker:'Heute Abend',bench:'Bench',stands:'Tribüne'}},
 tile:{fh:'Big Shoulders Display 900, caps – condensed, so German compounds fit',fb:'Instrument Sans 500',fn:'Big Shoulders Display 900',hs:'64px',shapes:'Big soft "stage" panels (22 px), pills; characters overlap panel edges.',tex:'Stage-light vignette, warm fog smoke, scrolling marquee bands.',icons:'2 px round line with solid fills – trophy/award vocabulary.',motion:'Cinematic: slam-in type, marquees, characters with idle loops stepping out of frames.'},
 ratings:{fun:4,read:4,teams:4,motion:4,mobile:3}};

T.kofi={id:'kofi',no:'06',name:'Ko-fi, abstracted',de:'Spielzeugkiste',kind:'Single · reference',mode:'light',modes:{dark:'Good ("Kakao")',light:'Recommended'},
 alt:{bg:'#2a211c',panel:'#362b25',ink:'#fbf5ec',accent:'#1ac0ff'},
 f:{h:"'Fredoka',sans-serif",hw:600,hc:'none',ht:'-0.01em',b:"'Nunito',sans-serif",bw:600,bs:'14px',n:"'Fredoka',sans-serif",nw:700,lab:"'Nunito',sans-serif",labc:'none',labt:'0',title:'42px',logo:'24px'},
 c:{bg:'#fbf5ec',bgImg:'radial-gradient(rgba(120,90,60,.10) 1.3px, transparent 1.5px)',bgSize:'26px 26px',panel:'#ffffff',panel2:'#f6efe4',ink:'#2b2420',ink2:'#7a6e64',line:'#ece2d4',accent:'#1ac0ff',accentInk:'#0b2733',hot:'#ff5e5b',hotInk:'#ffffff',av:['#ffe0c2','#d6f0ff','#e6ddff','#d8f5df','#ffe1ee','#fff1b8'],avInk:'#2b2420',ok:'#2fbf71'},
 teams:teams([['#ff5e5b','#ffffff'],['#ff9a3c','#2b2420'],['#ffd23f','#2b2420'],['#4cc97a','#2b2420'],['#2fd4c5','#2b2420'],['#3a8bff','#ffffff'],['#8f7bff','#ffffff'],['#ff7ac0','#2b2420']]),
 s:{r:'24px',rBtn:'999px',rAv:'50%',rChip:'999px',border:'none',shadow:'0 12px 30px rgba(90,60,30,.10), 0 2px 0 rgba(90,60,30,.05)',btnShadow:'0 6px 0 #0a93c6',div:'1px solid #ece2d4'},
 i:{sw:2.2,cap:'round',join:'round',fill:true},
 mascot:{style:'cozy',body:'#6fd39a',belly:'#ffe7a8',spike:'#ff7ac0',ink:'#2b2420',eye:'#ffffff',blush:'#ff9ab8',note:'Soft and round, warm brown outline, rosy cheeks. Friendly first, cheeky second.'},
 decos:[D({x:'33%',y:'9%',w:'46px',h:'46px',r:'50%',bg:'#ffd23f',sh:'0 8px 18px rgba(90,60,30,.15)'}),D({x:'60%',y:'92%',w:'90px',h:'32px',r:'999px',bg:'#ff7ac0',rot:'-8deg',sh:'0 8px 18px rgba(90,60,30,.15)'}),D({x:'1.4%',y:'52%',w:'26px',h:'26px',r:'50%',bg:'#1ac0ff'}),D({x:'45%',y:'94%',w:'20px',h:'20px',r:'6px',bg:'#4cc97a',rot:'20deg'})],
 smoke:smoke('puff',['#ffffff','#dff5ff','#ffe3ef','#efe8ff'],.95),smokeKind:'puff',smokeColors:['#ffffff','#dff5ff','#ffe3ef','#efe8ff'],boot:'pop',
 x:{lab:{kicker:'Willkommen in der Lobby',bench:'Bench',stands:'Tribüne'}},
 tile:{fh:'Fredoka 600',fb:'Nunito 600',fn:'Fredoka 700',hs:'48px',shapes:'Big 24 px radii, pills everywhere, borderless white cards that float on soft warm shadows; primary buttons have a "pressable" bottom lip.',tex:'Cream paper with dot grid, puffy pastel cloud-smoke.',icons:'2.2 px rounded line, duotone fills.',motion:'Gentle bob & pop, springy lips on buttons, stickers that wiggle when you hover.'},
 ratings:{fun:3,read:5,teams:4,motion:4,mobile:5}};

T.swissmemphis=dm(T.swiss,{id:'swissmemphis',no:'07',name:'Swiss × Memphis',de:'Raster & Konfetti',kind:'Combination',modes:{dark:'Recommended',light:'Good'},
 f:{n:"'Bungee',sans-serif",nw:400},
 c:{accent:'#ffd400',accentInk:'#0e0e0d'},
 teams:teams([['#ff4f4f','#000'],['#ff9f1c','#000'],['#ffd400','#000'],['#8ac926','#000'],['#2ec4b6','#000'],['#3a86ff','#000'],['#9b5cff','#fff'],['#ff70c3','#000']]),
 s:{rBtn:'999px',rChip:'999px',btnShadow:'4px 4px 0 #ff70c3',avBorder:'none'},
 mascot:{style:'memphis',body:'#2ec4b6',belly:'#ffd400',spike:'#ff70c3',ink:'#0e0e0d',note:'Memphis Compibert living on a calm Swiss page – the mascot is allowed to be loud because the system is not.'},
 decos:[D({x:'31%',y:'10%',w:'40px',h:'34px',bg:'#ffd400',clip:TRI,rot:'14deg'}),D({x:'57%',y:'93%',w:'120px',h:'30px',bg:SQ('#ff70c3',5)}),D({x:'-4%',y:'84%',w:'160px',h:'160px',r:'50%',bg:'#3a86ff',o:.9}),D({x:'64%',y:'11%',w:'80px',h:'36px',bg:'radial-gradient(circle,#2ec4b6 2.5px,transparent 3px) 0 0/12px 12px'})],
 smoke:smoke('soft',['#ff70c3','#3a86ff','#ffd400'],.11),smokeKind:'shapes',smokeColors:['#ff70c3','#3a86ff','#ffd400','#2ec4b6'],boot:'grid',
 tile:{fn:'Bungee (numerals & celebration only)',hs:'48px',shapes:'Swiss 0 px cards & hairlines; Memphis only on primary actions (pill + hard pink offset) and in celebrations.',tex:'Column grid; Memphis shapes peek out of gaps, confetti bursts on wins.',icons:'Swiss line icons; Memphis offset only on the active state.',motion:'Swiss snap for UI, Memphis bounce & confetti for wins/reveals.'},
 ratings:{fun:4,read:5,teams:5,motion:4,mobile:5}});

T.swisspixel=dm(T.swiss,{id:'swisspixel',no:'08',name:'Swiss × Pixel',de:'Ruhige Basis, Arcade-Momente',kind:'Combination',modes:{dark:'Recommended',light:'Possible (UI only)'},
 c:{bg:'#0d0e14',panel:'#161722',panel2:'#1f2030',bgImg:'linear-gradient(to right, rgba(240,240,255,.04) 1px, transparent 1px)',accent:'#ffec27',accentInk:'#0d0e14',hot:'#ff004d',hotInk:'#ffffff',ok:'#00e436'},
 teams:teams([['#ff004d','#fff'],['#ffa300','#000'],['#ffec27','#000'],['#00e436','#000'],['#2ce8f5','#000'],['#3b6bff','#fff'],['#b05cff','#fff'],['#ff77a8','#000']]),
 mascot:{style:'pixel',body:'#00e436',belly:'#ffec27',spike:'#ff004d',ink:'#0d0e14',note:'Pixel sprite Compibert = the "game is happening" character. In calm UI he appears small; in moments he takes over the screen.'},
 decos:[pstar('34%','9%'),pstar('62%','12%','#2ce8f5'),pstar('48%','95%','#ffec27')],
 m:Object.assign({},PXM,{vetoShadow:pxb('#000',4)+', 0 8px 0 0 rgba(0,0,0,.5)',frame:pxb('#33355a',4),frameBorder:'none'}),
 smoke:smoke('pixel',['#3b6bff','#b05cff','#2ce8f5'],.13),smokeKind:'pixel',smokeColors:['#3b6bff','#b05cff','#2ce8f5'],boot:'crt',
 tile:{fn:'Hanken Grotesk 900 in UI · Press Start 2P in moments',hs:'48px',shapes:'Swiss hairlines & 0 px cards for UI; stepped pixel frames ONLY for live moments (wheel, veto, coin flip, leaderboard jumps).',tex:'Calm grid base; scanlines + dithered smoke switch on during moments.',icons:'Swiss line icons; 8×8 bitmaps inside moments.',motion:'Calm slides in UI → hard cut to arcade: CRT flicker, stepped spins, screen-shake.'},
 ratings:{fun:4,read:5,teams:5,motion:5,mobile:5}});

T.kofihand=dm(T.kofi,{id:'kofihand',no:'09',name:'Ko-fi × Hand-Drawn',de:'Kritzel-Café',kind:'Combination',modes:{dark:'Good ("Kakao")',light:'Recommended'},
 f:{n:"'Caveat Brush',cursive",nw:400},
 mascot:{style:'hand',body:'#6fd39a',belly:'#ffe7a8',spike:'#ff7ac0',ink:'#2b2420',eye:'#ffffff',note:'Scribbled marker Compibert sitting on clean, rounded UI – like a doodle on a café napkin.'},
 decos:[D({x:'33%',y:'8.5%',w:'50px',h:'50px',bg:STAR('#ff9a3c')}),D({x:'60%',y:'91%',w:'110px',h:'46px',bg:ARROW('#2b2420',2.5)}),D({x:'1.4%',y:'52%',w:'26px',h:'26px',r:'50%',bg:'#1ac0ff'}),D({x:'45%',y:'93%',w:'60px',h:'50px',bg:LOOP('#ff5e5b')})],
 smoke:smoke('puff',['#ffffff','#fff1c9','#dff5ff'],.95),smokeKind:'puff',smokeColors:['#ffffff','#fff1c9','#dff5ff'],boot:'draw',
 x:{note:{f:"'Caveat Brush',cursive",c:'#ff5e5b',txt:'zieh Olli rein, dann geht\u2019s los!'}},
 tile:{fn:'Caveat Brush (countdowns, scores) · Fredoka for UI numbers',hs:'48px',shapes:'Clean rounded Ko-fi cards; hand-drawn only for Compibert, emotes, host hints and celebration doodles.',tex:'Cream dot paper, pastel cloud smoke, marker doodles in margins.',icons:'Rounded duotone UI icons; emotes & stickers hand-drawn.',motion:'Soft springs for UI, line-boil + doodle reveals for character moments.'},
 ratings:{fun:5,read:4,teams:4,motion:4,mobile:4}});

T.picnicpixel=dm(T.picnic,{id:'picnicpixel',no:'10',name:'Picnic × Pixel',de:'Character Arcade',kind:'Combination',modes:{dark:'Recommended',light:'Weak'},
 m:Object.assign({},PXM,{vetoShadow:pxb('#000',4)+', 0 8px 0 0 rgba(0,0,0,.5)',frame:pxb('#4a3a5a',4),frameBorder:'none'}),
 decos:[pstar('34%','11%','#ffb020'),pstar('63%','13%','#2ec5d3')],
 smoke:smoke('fog',['#ff5a36','#a073ff','#2ec5d3'],.15),smokeKind:'fog',smokeColors:['#ff5a36','#a073ff','#2ec5d3'],boot:'stage',
 tile:{fn:'Big Shoulders in UI · Press Start 2P for moment cut-ins',hs:'64px',shapes:'Stage panels for UI; pixel "cut-scene" frames slam in for live moments and battle replay.',tex:'Stage fog + marquee; scanlines only inside cut-ins.',icons:'Award/trophy line icons; pixel sprites in cut-ins.',motion:'Cinematic slams + pixel cut-scenes. Best fit for the battle replay.'},
 ratings:{fun:5,read:4,teams:4,motion:5,mobile:3}});

T.memphispixel=dm(T.memphis,{id:'memphispixel',no:'11',name:'Memphis × Pixel',de:'Samstagmorgen \u201994',kind:'Combination',mode:'dark',modes:{dark:'Recommended',light:'Good'},
 f:{h:"'Silkscreen',monospace",hw:700,hc:'uppercase',ht:'0',title:'36px',logo:'20px',ths:'13px',n:"'Press Start 2P',monospace"},
 c:{bg:'#1b1035',bgImg:'radial-gradient(rgba(255,255,255,.09) 1.4px, transparent 1.6px)',panel:'#2a1b4f',panel2:'#35235f',ink:'#fff3df',ink2:'#c4b5e6',line:'#000000',accent:'#00f0ff',accentInk:'#1b1035',hot:'#ff2bd6',hotInk:'#1b1035',av:['#4b3a7a','#5a3a6e','#3a4a7a','#6a3a5a','#3a5a6e','#5a4a7a'],ok:'#7dff3a'},
 teams:teams([['#ff3b5c','#1b1035'],['#ff9f1c','#1b1035'],['#ffe600','#1b1035'],['#7dff3a','#1b1035'],['#00f0ff','#1b1035'],['#4d7cff','#ffffff'],['#b84dff','#ffffff'],['#ff2bd6','#1b1035']]),
 s:{rAv:'0px',border:'3px solid #000',shadow:'6px 6px 0 #000',btnShadow:'4px 4px 0 #000',btnBorder:'3px solid #000',avBorder:'2.5px solid #000',div:'3px solid #000'},
 mascot:{style:'memphis',body:'#00f0ff',belly:'#ffe600',spike:'#ff2bd6',ink:'#000000',note:'Neon Memphis toy-Compibert; turns into a pixel sprite for moments.'},
 decos:MPH(['#ff3b5c','#ff9f1c','#ffe600','#7dff3a','#00f0ff','#4d7cff','#b84dff','#ff2bd6'],'#ff2bd6').concat([pstar('50%','5%','#ffe600')]),
 m:Object.assign({},PXM,{vetoShadow:'6px 6px 0 #000',vetoBorder:'3px solid #000',frame:'6px 6px 0 #000',frameBorder:'3px solid #000'}),
 smoke:smoke('dots',['#ff2bd6','#00f0ff','#ffe600'],.32),smokeKind:'pixel',smokeColors:['#ff2bd6','#00f0ff','#ffe600'],boot:'crt',
 tile:{fh:'Silkscreen 700',fn:'Press Start 2P',hs:'30px',shapes:'Memphis outlines & hard shadows, square pixel avatars, neon shapes on deep purple.',tex:'Dot grid on purple, neon halftone smoke, pixel stars.',icons:'Pixel bitmaps with black offset.',motion:'Everything bounces AND steps – max energy, needs strict calm zones for chat.'},
 ratings:{fun:5,read:3,teams:3,motion:5,mobile:3}});

T.swisshand=dm(T.swiss,{id:'swisshand',no:'12',name:'Swiss × Hand-Drawn',de:'Raster mit Randnotizen',kind:'Combination',mode:'light',modes:{dark:'Good',light:'Recommended'},
 alt:{bg:'#0e0e0d',panel:'#171716',ink:'#f3f2ed',accent:'#ff3b1f'},
 c:{bg:'#f2f0ea',bgImg:'linear-gradient(to right, rgba(17,17,16,.06) 1px, transparent 1px)',panel:'#ffffff',panel2:'#f7f6f2',ink:'#111110',ink2:'#6b6960',line:'rgba(17,17,16,.16)',accent:'#111110',accentInk:'#f2f0ea',hot:'#e5352b',hotInk:'#ffffff',av:['#dedbd2','#d4d8d6','#e3d9cf','#d9d6e0','#d6ded8','#e0dccf'],avInk:'#111110',ok:'#00a356'},
 teams:teams([['#e5352b','#fff'],['#f07d00','#000'],['#f2c500','#000'],['#00a356','#000'],['#00a9b8','#000'],['#2f55e6','#fff'],['#8a3ff0','#fff'],['#e8418f','#fff']]),
 s:{border:'1px solid rgba(17,17,16,.16)',div:'1px solid rgba(17,17,16,.16)',slotEmpty:'1px dashed rgba(17,17,16,.35)'},
 mascot:{style:'hand',body:'#9bdc7a',belly:'#ffe58a',spike:'#e5352b',ink:'#111110',eye:'#ffffff',blush:'#e8418f',note:'Pencil-and-marker Compibert in the margins of a strict grid – the human touch on a precise page.'},
 decos:[D({x:'-6%',y:'82%',w:'260px',h:'260px',r:'50%',bg:'#e5352b',o:.9}),D({x:'60%',y:'91%',w:'110px',h:'46px',bg:ARROW('#e5352b')}),D({x:'33%',y:'8.5%',w:'52px',h:'46px',bg:LOOP('#e5352b')})],
 smoke:smoke('soft',['#8a8780','#e5352b','#2f55e6'],.08),smokeKind:'chalk',smokeColors:['#8a8780','#e5352b','#2f55e6'],boot:'draw',
 x:{note:{f:"'Caveat Brush',cursive",c:'#e5352b',txt:'Olli fehlt noch in Lila \u2192 rein mit ihm!'}},
 tile:{fn:'Hanken Grotesk 900 · Caveat Brush for annotations',hs:'48px',shapes:'Swiss 0 px & hairlines; red-pencil circles, arrows and notes as the only "soft" shapes.',tex:'Paper-white grid; pencil smudge smoke.',icons:'Swiss line icons; emotes hand-drawn.',motion:'Swiss snap + annotations that get scribbled on (stroke reveal).'},
 ratings:{fun:4,read:5,teams:5,motion:3,mobile:5}});

// ---------- round 2: Memphis family ----------
const R32=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let q=Math.imul(a^a>>>15,1|a);q=q+Math.imul(q^q>>>7,61|q)^q;return((q^q>>>14)>>>0)/4294967296;};
const SPARK='polygon(50% 0,59% 41%,100% 50%,59% 59%,50% 100%,41% 59%,0 50%,41% 41%)';
const SHP={
 tri:o=>{const v=o.z(20,38);return D({x:o.x,y:o.y,w:v,h:v,bg:o.c,clip:TRI,rot:o.rot});},
 ring:o=>{const v=o.z(22,40);return D({x:o.x,y:o.y,w:v,h:v,r:'50%',b:`3px solid ${o.c}`});},
 dots:o=>D({x:o.x,y:o.y,w:o.z(54,90),h:o.z(30,48),bg:`radial-gradient(circle,${o.c} 2.5px,transparent 3px) 0 0/12px 12px`,rot:o.rot}),
 squig:o=>D({x:o.x,y:o.y,w:o.z(90,130),h:'30px',bg:SQ(o.c,5),rot:o.rot}),
 zig:o=>D({x:o.x,y:o.y,w:o.z(80,110),h:'28px',bg:ZZ(o.c,5),rot:o.rot}),
 half:o=>{const v=o.n(30,56);return D({x:o.x,y:o.y,w:v+'px',h:(v/2)+'px',bg:o.c,r:`${v}px ${v}px 0 0`,rot:o.rot});},
 rect:o=>D({x:o.x,y:o.y,w:o.z(9,13),h:o.z(18,26),bg:o.c,rot:o.rot}),
 dot:o=>{const v=o.z(10,18);return D({x:o.x,y:o.y,w:v,h:v,r:'50%',bg:o.c});},
 disc:o=>{const v=o.z(40,90);return D({x:o.x,y:o.y,w:v,h:v,r:'50%',bg:o.c});},
 quarter:o=>{const v=o.z(36,70);return D({x:o.x,y:o.y,w:v,h:v,r:'100% 0 0 0',bg:o.c,rot:(Math.floor(o.r()*4)*90)+'deg'});},
 sq:o=>{const v=o.z(18,36);return D({x:o.x,y:o.y,w:v,h:v,bg:o.c});},
 bar:o=>D({x:o.x,y:o.y,w:o.z(60,120),h:'12px',bg:o.c,rot:(Math.floor(o.r()*2)*90)+'deg'}),
 spark:o=>{const v=o.z(18,40);return D({x:o.x,y:o.y,w:v,h:v,bg:o.c,clip:SPARK});},
 pix:o=>{const v=[8,12,16][Math.floor(o.r()*3)]+'px';return D({x:o.x,y:o.y,w:v,h:v,bg:o.c});},
 pst:o=>pstar(o.x,o.y,o.c),
 riso:o=>{const v=o.z(18,40);return D({x:o.x,y:o.y,w:v,h:v,r:'50%',bg:o.c,o:.85,sh:`5px 4px 0 ${rgba(o.c2,.75)}`});},
 halftone:o=>{const v=o.z(70,120);return D({x:o.x,y:o.y,w:v,h:v,r:'50%',bg:`radial-gradient(circle,${o.c} 2px,transparent 2.6px) 0 0/8px 8px`});},
 blob:o=>{const v=o.z(22,46);return D({x:o.x,y:o.y,w:v,h:v,r:'50%',bg:`radial-gradient(circle at 35% 30%, #ffffff 0 7%, ${o.c} 38%, ${shade(o.c,-.28)} 100%)`,sh:'0 10px 16px rgba(60,40,120,.22)'});},
 pill:o=>D({x:o.x,y:o.y,w:o.z(44,70),h:'22px',r:'999px',bg:`linear-gradient(180deg, ${shade(o.c,.4)}, ${o.c} 55%, ${shade(o.c,-.22)})`,sh:'0 8px 14px rgba(60,40,120,.2)',rot:o.rot}),
 stick:o=>{const v=o.z(26,46);return D({x:o.x,y:o.y,w:v,h:v,r:o.r()<.5?'50%':'10px',bg:o.c,b:'4px solid #ffffff',sh:'0 4px 8px rgba(40,25,10,.3)',rot:o.rot});},
 dstar:o=>D({x:o.x,y:o.y,w:'46px',h:'46px',bg:STAR(o.c,3)}),
 dloop:o=>D({x:o.x,y:o.y,w:'56px',h:'48px',bg:LOOP(o.c,3),rot:o.rot}),
 darrow:o=>D({x:o.x,y:o.y,w:'100px',h:'42px',bg:ARROW(o.ink,2.5),rot:o.rot})};
const KIND={memphis:['tri','ring','dots','squig','zig','half','rect'],paper:['rect','rect','dot','squig'],bauhaus:['disc','half','quarter','sq','bar'],spark:['spark','spark','dot','ring'],riso:['riso','halftone','tri','squig'],pixel:['pix','pix','pst'],clay:['blob','blob','pill'],sticker:['stick','stick','spark'],stickdoodle:['stick','stick','stick','dstar','dloop'],doodle:['dstar','dloop','squig','darrow']};
function CONF(kind,dose,cols,ink,seed,fg){const r=R32(seed);const n=fg?[0,0,0,0,5,10][dose]:[0,4,8,14,22,34][dose];const ks=KIND[kind]||KIND.memphis;const out=[];const sc=fg?.65:1;
 for(let i=0;i<n;i++){const o={r,ink,x:(r()*96).toFixed(1)+'%',y:(r()*96).toFixed(1)+'%',rot:Math.round(r()*360)+'deg',c:cols[Math.floor(r()*cols.length)],c2:cols[Math.floor(r()*cols.length)]};o.n=(a,b)=>Math.round((a+r()*(b-a))*sc);o.z=(a,b)=>o.n(a,b)+'px';out.push(SHP[ks[Math.floor(r()*ks.length)]](o));}
 return out;}
const MS=(ink,o)=>Object.assign({r:'14px',rBtn:'999px',rAv:'50%',rChip:'999px',border:`3px solid ${ink}`,shadow:`6px 6px 0 ${ink}`,btnShadow:`4px 4px 0 ${ink}`,btnBorder:`3px solid ${ink}`,avBorder:`2.5px solid ${ink}`,div:`3px solid ${ink}`},o||{});
const TK=(ink,l)=>teams(l.map(c=>Array.isArray(c)?c:[c,ink]));
const RUB="'Rubik',sans-serif";

T.m2a=dm(T.memphis,{id:'m2a',no:'2a',name:'Memphis Klassik 2.0',de:'Konfetti, aufgeräumt',kind:'Memphis family · iterates 1b',mode:'light',modes:{dark:'Possible, see 2j',light:'Recommended'},
 c:{panel2:'#fff6e6'},s:{},lay:'grid',conf:{dose:3,kind:'memphis'},smoke:smoke('dots',['#ff70c3','#3a86ff','#ffd23f'],.4),
 tile:{shapes:'1b\u2019s 3 px outline + 6 px hard shadow, but decor is banned from cards and chat: shapes live only in gutters and margins.',tex:'Dot-grid paper; confetti shapes in the gutters only.',motion:'Pop-in with overshoot; confetti cannon on joins, wins and the wheel stop.'},
 ratings:{fun:4,read:4,teams:4,motion:4,mobile:4}});

T.m2b=dm(T.memphis,{id:'m2b',no:'2b',name:'Eine Prise Konfetti',de:'Ruhig, mit Würze',kind:'Memphis family · dose 1',mode:'light',modes:{dark:'Good',light:'Recommended'},alt:{bg:'#18171c',panel:'#222129',ink:'#f5f1e8',accent:'#ffd23f'},
 f:{h:RUB,hw:800,ht:'-0.03em',b:RUB,bw:400,n:"'Shrikhand',cursive",nw:400,lab:RUB,labt:'0.08em',title:'44px'},
 c:{bg:'#fbf7ef',bgImg:'none',panel:'#ffffff',panel2:'#f6f1e7',ink:'#1a1a1a',ink2:'#66605a',line:'rgba(26,26,26,.14)',accent:'#ffd23f',accentInk:'#1a1a1a',hot:'#ff5a5a',hotInk:'#1a1a1a'},
 s:{r:'12px',border:'1.5px solid rgba(26,26,26,.16)',shadow:'none',btnShadow:'3px 3px 0 #1a1a1a',btnBorder:'2px solid #1a1a1a',avBorder:'none',div:'1.5px solid rgba(26,26,26,.12)'},
 i:{offset:false,sw:2},mascot:{ink:'#1a1a1a'},lay:'rows',conf:{dose:1,kind:'paper'},smoke:smoke('soft',['#ffd23f','#ff70c3','#3a86ff'],.1),
 tile:{fh:'Rubik 800',fb:'Rubik 400',fn:'Shrikhand (scores & countdowns only)',hs:'44px',shapes:'Hairline cards, 12 px radius. Memphis survives only on primary buttons (black outline + hard offset) and in the numerals.',tex:'Plain warm paper, no pattern. Confetti is a reward, not wallpaper.',icons:'2 px round line, no offset.',motion:'Calm slides; a short paper-confetti puff only on joins and wins.'},
 ratings:{fun:3,read:5,teams:5,motion:3,mobile:5}});

T.m2c=dm(T.memphis,{id:'m2c',no:'2c',name:'Volle Party',de:'Alles auf Konfetti',kind:'Memphis family · dose 5',mode:'light',modes:{dark:'Weak',light:'Recommended'},alt:{bg:'#1b1035',panel:'#2a1b4f',ink:'#fff3df',accent:'#ff70c3'},
 f:{h:"'Rammetto One',sans-serif",hw:400,ht:'-0.01em',title:'40px',logo:'20px',th:RUB,thw:800,b:RUB,bw:500,n:"'Rammetto One',sans-serif",lab:RUB},
 c:{bg:'#ffd23f',bgImg:'repeating-linear-gradient(45deg, rgba(21,21,21,.07) 0 10px, transparent 10px 20px)',bgSize:'100% 100%',panel:'#ffffff',panel2:'#fff4cc',ink2:'#4d463a',accent:'#ff70c3',accentInk:'#151515',hot:'#3a86ff',hotInk:'#ffffff',panelSide:'#fff4cc'},
 s:MS('#151515',{r:'18px',border:'4px solid #151515',shadow:'8px 8px 0 #151515',btnBorder:'3.5px solid #151515'}),
 mascot:{spike:'#3a86ff',body:'#ff70c3',belly:'#ffd23f'},m:{wl:'11px'},lay:'scatter',conf:{dose:5,kind:'memphis'},smoke:smoke('dots',['#ff70c3','#3a86ff','#2ec4b6'],.55),
 tile:{fh:'Rammetto One',fb:'Rubik 500',fn:'Rammetto One',hs:'30px',shapes:'4 px outlines, 8 px hard shadows, tilted cards like a pinboard. Shapes may overlap card corners.',tex:'Striped sunshine-yellow ground, halftone smoke, confetti on every layer.',icons:'2.5 px round line + black offset.',motion:'Everything wiggles a little, all the time. Confetti cannons from both corners plus rain from the top.'},
 ratings:{fun:5,read:2,teams:3,motion:4,mobile:2}});

const PAS='#2d2140';
T.m2d=dm(T.memphis,{id:'m2d',no:'2d',name:'Pastell-Memphis',de:'Bonbonpapier',kind:'Memphis family · pastel',mode:'light',modes:{dark:'Weak (pastels go muddy)',light:'Recommended'},alt:{bg:'#241b35',panel:'#30254a',ink:'#f4eeff',accent:'#ffe27a'},
 f:{h:"'Fredoka',sans-serif",hw:700,ht:'-0.01em',title:'46px',b:"'Nunito',sans-serif",bw:600,n:"'Shrikhand',cursive",nw:400,lab:"'Nunito',sans-serif"},
 c:{bg:'#efe6ff',bgImg:'radial-gradient(rgba(60,40,110,.10) 1.4px, transparent 1.6px)',panel:'#ffffff',panel2:'#f7f2ff',ink:PAS,ink2:'#6e6488',line:PAS,accent:'#ffe27a',accentInk:PAS,hot:'#ff7aa8',hotInk:PAS,av:['#ffe0ec','#e0f7f3','#fff4c7','#e6e0ff','#ffe6d6','#e3f6dc'],avInk:PAS},
 teams:TK(PAS,['#ff8a8a','#ffb36b','#ffe066','#97dd7f','#76dccf','#86a8ff','#c19bff','#ff98d4']),
 s:MS(PAS,{r:'16px',border:`2.5px solid ${PAS}`,shadow:'5px 5px 0 #c7a3ff',btnShadow:`3px 3px 0 ${PAS}`,btnBorder:`2.5px solid ${PAS}`,avBorder:`2px solid ${PAS}`,div:`2.5px solid ${PAS}`}),
 mascot:{body:'#76dccf',belly:'#ffe066',spike:'#ff98d4',ink:PAS,blush:'#ff98d4'},lay:'grid',conf:{dose:3,kind:'memphis'},smoke:smoke('puff',['#ffffff','#ffe0ec','#e0f7f3'],.85),
 tile:{fh:'Fredoka 700',fb:'Nunito 600',fn:'Shrikhand',hs:'46px',shapes:'Softer 2.5 px plum outline; the hard shadow is lilac instead of black, so it reads as a sticker rather than a print.',tex:'Lilac dot paper, pastel cloud smoke.',icons:'2.5 px round line, pink offset.',motion:'Bouncy but slower; candy-coloured confetti.'},
 ratings:{fun:4,read:4,teams:3,motion:4,mobile:4}});

const NB='#0d0b16';
T.m2e=dm(T.memphis,{id:'m2e',no:'2e',name:'Neon-Memphis',de:'Nachtclub',kind:'Memphis family · neon',mode:'dark',modes:{dark:'Recommended',light:'Not possible'},alt:{bg:'#f4f0ff',panel:'#ffffff',ink:NB,accent:'#ff3d9a'},
 f:{h:"'Bungee',sans-serif",hw:400,hc:'uppercase',ht:'0',title:'40px',logo:'20px',th:RUB,thw:800,b:RUB,bw:500,n:"'Bungee',sans-serif",lab:RUB},
 c:{bg:NB,bgImg:'radial-gradient(rgba(255,255,255,.07) 1.4px, transparent 1.6px)',panel:'#161325',panel2:'#1f1a33',ink:'#f6f1ff',ink2:'#a59cc4',line:'#2ef0ff',accent:'#fff23a',accentInk:NB,hot:'#ff3d9a',hotInk:NB,av:['#2a2445','#33264a','#232f4a','#3a2440','#22383f','#30304f'],ok:'#5dff7a'},
 teams:TK(NB,['#ff3d6e','#ff9a1f','#fff23a','#5dff7a','#2ef0ff',['#4d7bff','#ffffff'],['#c15bff','#ffffff'],'#ff4fd8']),
 s:{r:'14px',border:'2px solid #2ef0ff',shadow:'0 0 18px rgba(46,240,255,.28), 5px 5px 0 #ff3d9a',btnShadow:'0 0 18px rgba(255,242,58,.55)',btnBorder:'none',avBorder:`2px solid ${NB}`,div:'2px solid rgba(46,240,255,.4)'},
 mascot:{style:'toon',body:'#2ef0ff',belly:'#fff23a',spike:'#ff3d9a',ink:NB,blush:'#ff4fd8'},m:{wl:'11px'},lay:'arena',conf:{dose:3,kind:'memphis'},smoke:smoke('dots',['#ff3d9a','#2ef0ff','#fff23a'],.3),boot:'crt',
 tile:{fh:'Bungee (caps)',fb:'Rubik 500',fn:'Bungee',hs:'34px',shapes:'Cyan neon-tube outlines with a soft glow plus a hard magenta offset: Memphis drawn in light.',tex:'Black dot grid, neon halftone smoke.',icons:'2.5 px line with magenta offset.',motion:'Flicker-on like neon tubes; confetti glows.'},
 ratings:{fun:5,read:3,teams:4,motion:5,mobile:3}});

const ER='#2f241c';
T.m2f=dm(T.memphis,{id:'m2f',no:'2f',name:'Terrakotta-Memphis',de:'Scherenschnitt',kind:'Memphis family · earthy',mode:'light',modes:{dark:'Good ("Espresso")',light:'Recommended'},alt:{bg:'#241c16',panel:'#30261e',ink:'#f1e6d2',accent:'#e39a3b'},
 f:{h:"'DM Serif Display',serif",hw:400,ht:'-0.01em',title:'50px',logo:'24px',th:"'DM Sans',sans-serif",thw:700,b:"'DM Sans',sans-serif",bw:500,n:"'DM Serif Display',serif",nw:400,lab:"'DM Sans',sans-serif",labt:'0.1em'},
 c:{bg:'#f1e6d2',bgImg:'radial-gradient(rgba(90,60,30,.10) 1px, transparent 1.4px)',bgSize:'16px 16px',panel:'#fbf5ea',panel2:'#efe3cf',ink:ER,ink2:'#7a6656',line:'rgba(47,36,28,.18)',accent:ER,accentInk:'#f1e6d2',hot:'#d0573a',hotInk:'#ffffff',av:['#e8d6bc','#dcc9ad','#e6cfb6','#d6c6ae','#eadbc4','#ddcbb0'],avInk:ER},
 teams:TK(ER,[['#d0573a','#ffffff'],'#e39a3b','#e8c547','#a3b04a','#4f9e93',['#3c64a8','#ffffff'],['#7d4b8f','#ffffff'],'#d9789a']),
 s:{r:'6px',border:'none',shadow:'none',btnShadow:'none',btnBorder:'none',avBorder:'none',div:'1.5px solid rgba(47,36,28,.15)',slotEmpty:'2px dashed rgba(47,36,28,.3)'},
 i:{offset:false,sw:2},mascot:{style:'geo',body:'#d0573a',belly:'#e8c547',spike:'#4f9e93',ink:ER,eye:'#ffffff',blush:'#d9789a'},lay:'mosaic',conf:{dose:2,kind:'bauhaus'},smoke:smoke('soft',['#d0573a','#e39a3b','#4f9e93'],.12),
 tile:{fh:'DM Serif Display',fb:'DM Sans 500',fn:'DM Serif Display',hs:'50px',shapes:'Flat cut-paper: no outlines, no shadows. Memphis lives in the shapes (half-circles, quarter-discs, bars) and the colour blocking.',tex:'Sandy paper grain; warm fog smoke.',icons:'2 px round line, flat.',motion:'Paper-cut slides and flips; confetti falls slowly like cut-out shapes.'},
 ratings:{fun:3,read:5,teams:3,motion:3,mobile:4}});

const NV='#16205e';
T.m2g=dm(T.memphis,{id:'m2g',no:'2g',name:'Flach & Laut',de:'Memphis ohne Linie',kind:'Memphis family · flat',mode:'dark',modes:{dark:'Recommended',light:'Good (cream)'},alt:{bg:'#fff3df',panel:'#ffffff',ink:NV,accent:'#ff70c3'},
 f:{h:"'Archivo Black',sans-serif",hw:400,ht:'-0.02em',title:'46px',logo:'22px',th:"'Archivo',sans-serif",thw:800,b:"'Archivo',sans-serif",bw:500,n:"'Archivo Black',sans-serif",nw:400,lab:"'Archivo',sans-serif"},
 c:{bg:NV,bgImg:'none',panel:'#202c7a',panel2:'#2a3790',ink:'#fff6e5',ink2:'#b8bde6',line:'rgba(255,246,229,.18)',accent:'#ffd23f',accentInk:NV,hot:'#ff5a5a',hotInk:NV,av:['#34418f','#3d3a8a','#2f4a8f','#45407f','#2f5585','#3a4790'],ok:'#8ac926'},
 teams:TK(NV,['#ff5a5a','#ff9f1c','#ffd23f','#8ac926','#2ec4b6','#5fb4ff','#b388ff','#ff70c3']),
 s:{r:'18px',border:'none',shadow:'none',btnShadow:'none',btnBorder:'none',avBorder:'none',div:'2px solid rgba(255,246,229,.14)',slotEmpty:'2px dashed rgba(255,246,229,.3)'},
 i:{offset:false},mascot:{style:'geo',body:'#ff70c3',belly:'#ffd23f',spike:'#2ec4b6',ink:NV,eye:'#ffffff'},lay:'grid',conf:{dose:3,kind:'memphis'},smoke:smoke('soft',['#ff70c3','#5fb4ff','#ffd23f'],.12),
 tile:{fh:'Archivo Black',fb:'Archivo 500',fn:'Archivo Black',hs:'38px',shapes:'No outlines, no shadows. Memphis is carried by flat shapes and colour alone; 18 px radii keep it friendly.',tex:'Flat ink-blue ground; big soft colour smoke.',icons:'2 px round line, flat.',motion:'Shapes slide in on hard easing; confetti is the only noise.'},
 ratings:{fun:4,read:4,teams:4,motion:4,mobile:4}});

const PL='#15153c';
T.m2h=dm(T.memphis,{id:'m2h',no:'2h',name:'Plastik-Memphis',de:'Spielzeug-Kante',kind:'Memphis family · toy depth',mode:'light',modes:{dark:'Good',light:'Recommended'},alt:{bg:'#14143a',panel:'#1f1f52',ink:'#eef4ff',accent:'#ffd23f'},
 f:{h:"'Baloo 2',sans-serif",hw:800,ht:'-0.02em',title:'48px',th:"'Baloo 2',sans-serif",thw:800,ths:'16px',b:RUB,bw:500,n:"'Baloo 2',sans-serif",nw:800,lab:RUB},
 c:{bg:'#dff1ff',bgImg:'radial-gradient(rgba(21,21,60,.08) 1.6px, transparent 1.8px)',bgSize:'24px 24px',panel:'#ffffff',panel2:'#eef6ff',ink:PL,ink2:'#5b5f86',line:PL,accent:'#ffd23f',accentInk:PL,hot:'#ff4f4f',hotInk:'#ffffff',avInk:PL},
 teams:TK(PL,['#ff5a5a','#ff9f1c','#ffd23f','#8ac926','#2ec4b6','#3a86ff',['#8338ec','#ffffff'],'#ff70c3']),
 s:MS(PL,{r:'20px',rBtn:'16px',shadow:`0 7px 0 ${PL}`,btnShadow:`0 5px 0 ${PL}`,avBorder:`3px solid ${PL}`}),
 mascot:{ink:PL},lay:'arena',conf:{dose:4,kind:'memphis'},smoke:smoke('puff',['#ffffff','#eaf6ff','#fff6d6'],.9),
 tile:{fh:'Baloo 2 800',fb:'Rubik 500',fn:'Baloo 2 800',hs:'46px',shapes:'Chunky 3 px outline with a 7 px bottom lip instead of a diagonal shadow: everything looks like a pressable plastic toy part.',tex:'Sky dot grid, white cloud smoke.',icons:'2.5 px round line, solid fills.',motion:'Press-down on click (the lip collapses), springy release, confetti from both corners.'},
 ratings:{fun:5,read:4,teams:4,motion:5,mobile:4}});

const BW='#151515';
T.m2i=dm(T.memphis,{id:'m2i',no:'2i',name:'Schwarz-Weiß + Teams',de:'Nur die Teams sind bunt',kind:'Memphis family · mono',mode:'light',modes:{dark:'Good (inverted)',light:'Recommended'},alt:{bg:'#111111',panel:'#1c1c1c',ink:'#ffffff',accent:'#ffffff'},
 c:{bg:'#ffffff',bgImg:'radial-gradient(rgba(21,21,21,.20) 1.3px, transparent 1.6px)',bgSize:'20px 20px',panel:'#ffffff',panel2:'#f4f4f4',ink:BW,ink2:'#5a5a5a',line:BW,accent:BW,accentInk:'#ffffff',hot:BW,hotInk:'#ffffff',av:['#ececec','#dedede','#f2f2f2','#d6d6d6','#e6e6e6','#d0d0d0'],avInk:BW},
 s:{},mascot:{body:'#ffffff',belly:'#e4e4e4',spike:BW,ink:BW,blush:'#d6d6d6'},lay:'grid',conf:{dose:2,kind:'memphis',cols:[BW]},smoke:smoke('dots',[BW,'#666666'],.18),
 tile:{shapes:'Classic Memphis outline + hard shadow, but every decorative shape is black. Colour is reserved for the 8 teams.',tex:'Black dot grid on white, black halftone smoke, black squiggles.',motion:'Black confetti; team colour floods in only when a team scores.'},
 ratings:{fun:3,read:5,teams:5,motion:4,mobile:5}});

const AU='#231a2e',CR='#fff1dc';
T.m2j=dm(T.memphis,{id:'m2j',no:'2j',name:'Memphis Nacht',de:'Konfetti nach Feierabend',kind:'Memphis family · dark',mode:'dark',modes:{dark:'Recommended',light:'Good (= 2a)'},alt:{bg:'#fff3df',panel:'#ffffff',ink:'#151515',accent:'#ffd23f'},
 c:{bg:AU,bgImg:'radial-gradient(rgba(255,241,220,.08) 1.4px, transparent 1.6px)',panel:'#2f2440',panel2:'#3a2d4f',ink:CR,ink2:'#bcaec9',line:CR,accent:'#ffd23f',accentInk:AU,hot:'#ff5a7a',hotInk:AU,av:['#4a3a5e','#55405a','#3e4560','#5a3f4f','#3c5050','#4c4566'],ok:'#9be15d'},
 teams:TK(AU,['#ff6b6b','#ffa94d','#ffd84d','#9be15d','#3fd6c6','#5b9bff','#a57bff','#ff7fd0']),
 s:{border:`2.5px solid ${CR}`,shadow:'5px 5px 0 #0f0a16',btnShadow:'4px 4px 0 #0f0a16',btnBorder:`2.5px solid ${CR}`,avBorder:`2px solid ${CR}`,div:'2.5px solid rgba(255,241,220,.85)'},
 mascot:{ink:'#0f0a16',body:'#3fd6c6',belly:'#ffd84d',spike:'#ff7fd0'},lay:'rows',conf:{dose:3,kind:'memphis'},smoke:smoke('dots',['#ff7fd0','#5b9bff','#ffd84d'],.22),
 tile:{shapes:'Memphis outlines flipped to cream; shadows sink into near-black. Same shapes and bounce, but easy on the eyes after 22:00.',tex:'Aubergine ground with cream dot grid, dim halftone smoke.',motion:'Same pop & overshoot as 2a; confetti slightly brighter than the UI so it reads as light.'},
 ratings:{fun:4,read:4,teams:5,motion:4,mobile:4}});

const SW='#111110';
T.m2k=dm(T.swissmemphis,{id:'m2k',no:'2k',name:'Swiss × Memphis, hell',de:'Raster & Konfetti 2',kind:'Mix · iterates 1g',mode:'light',modes:{dark:'Good (= 1g)',light:'Recommended'},alt:{bg:'#0e0e0d',panel:'#171716',ink:'#f3f2ed',accent:'#ffd400'},
 c:{bg:'#f4f2ec',bgImg:'linear-gradient(to right, rgba(17,17,16,.06) 1px, transparent 1px)',panel:'#ffffff',panel2:'#f7f6f2',ink:SW,ink2:'#6b6960',line:'rgba(17,17,16,.16)',accent:'#ffd400',accentInk:SW,hot:'#ff4f4f',hotInk:SW,av:['#e4e1d8','#d9ddd9','#e7ddd2','#dcd9e3','#d9e2db','#e3dfd2'],avInk:SW,ok:'#00a356'},
 s:{border:'1px solid rgba(17,17,16,.16)',div:'1px solid rgba(17,17,16,.16)',btnShadow:'4px 4px 0 #ff70c3',btnBorder:`2px solid ${SW}`,slotEmpty:'1px dashed rgba(17,17,16,.35)'},
 mascot:{ink:SW},lay:'rows',conf:{dose:2,kind:'memphis'},smoke:smoke('soft',['#ff70c3','#3a86ff','#ffd400'],.1),
 tile:{fh:'Hanken Grotesk 900',fb:'Hanken Grotesk 500',fn:'Bungee (numerals & celebrations)',hs:'48px',shapes:'Swiss hairlines and 0 px cards; teams as rows with a colour block. Memphis = pink hard offset on actions, shapes in the margins, confetti on wins.',tex:'Paper-white column grid; Memphis shapes peek out of gutters.',icons:'Swiss 1.75 px line; Memphis offset on active state.',motion:'Swiss snap for UI; Memphis bounce + confetti for wins and the wheel.'},
 ratings:{fun:4,read:5,teams:5,motion:4,mobile:5}});

T.m2l=dm(T.memphispixel,{id:'m2l',no:'2l',name:'Memphis × Pixel v2',de:'Samstagmorgen, lesbar',kind:'Mix · iterates 1k',modes:{dark:'Recommended',light:'Good'},
 f:{h:"'Bricolage Grotesque',sans-serif",hw:800,hc:'none',ht:'-0.03em',title:'44px',logo:'22px',th:"'Silkscreen',monospace",thw:700,thc:'uppercase',ths:'13px',b:RUB,bw:500,lab:"'Silkscreen',monospace"},
 c:{bg:'#2a1d5c',panel:'#36277a',panel2:'#41308c'},s:{},
 mascot:{style:'pixel'},lay:'arena',conf:{dose:4,kind:'pixel'},
 tile:{fh:'Bricolage Grotesque 800',fb:'Rubik 500',fn:'Press Start 2P',hs:'46px',shapes:'Memphis outlines + hard black shadows, square pixel avatars. Pixel type only on team labels and numbers, so chat and long words stay readable.',tex:'Lighter purple with dot grid; pixel stars and neon halftone smoke.',icons:'8×8 bitmaps with black offset.',motion:'Bounce for UI, stepped 12 fps for game moments; confetti falls as pixel squares.'},
 ratings:{fun:5,read:4,teams:4,motion:5,mobile:3}});

T.m2m=dm(T.memphis,{id:'m2m',no:'2m',name:'Memphis × Hand-Drawn',de:'Kritzelparty',kind:'Mix · revisits a no-go',mode:'light',modes:{dark:'Good (chalkboard)',light:'Recommended'},
 f:{h:"'Caveat Brush',cursive",hw:400,ht:'0',title:'60px',logo:'30px',th:"'Caveat Brush',cursive",thw:400,ths:'21px',b:RUB,bw:500,n:"'Caveat Brush',cursive",nw:400,lab:RUB},
 c:{bg:'#fffaf0',bgImg:'linear-gradient(rgba(58,134,255,.13) 1px, transparent 1px)',bgSize:'100% 30px'},
 s:{ff:'url(#cp-wob)',shadow:'5px 5px 0 #151515'},i:{filter:'url(#cp-wob)'},
 mascot:{style:'hand',eye:'#ffffff'},lay:'scatter',conf:{dose:3,kind:'doodle'},
 x:{tape:true,note:{f:"'Caveat Brush',cursive",c:'#ff5a5a',txt:'Olli \u2192 Lila, dann Konfetti!'}},smoke:smoke('chalk',['#3a86ff','#ff70c3','#ffd23f'],.18),boot:'draw',
 tile:{fh:'Caveat Brush',fb:'Rubik 500 (never handwritten)',fn:'Caveat Brush',hs:'56px',shapes:'Memphis outline + hard shadow, drawn with a wobbly marker. Flat Memphis fills stay crisp; only frames boil.',tex:'Lined notebook paper; doodled stars, loops and arrows in the margins.',icons:'2.5 px wobbly marker line + offset.',motion:'Line-boil on frames; doodle confetti (stars, loops) instead of paper.'},
 ratings:{fun:5,read:3,teams:3,motion:4,mobile:3}});

T.m2n=dm(T.picnic,{id:'m2n',no:'2n',name:'Memphis × Picnic',de:'Party-Bühne',kind:'Mix · revisits a no-go',modes:{dark:'Recommended',light:'Good (cream)'},
 f:{n:"'Bungee',sans-serif",nw:400,title:'60px'},c:{line:'#f7efe1',accent:'#ffd23f',accentInk:'#17121d'},
 s:{r:'18px',border:'2.5px solid #f7efe1',shadow:'6px 6px 0 #ff5a36',btnShadow:'4px 4px 0 #000000',btnBorder:'2.5px solid #f7efe1',avBorder:'2px solid #f7efe1',div:'2.5px solid rgba(247,239,225,.8)'},
 mascot:{style:'memphis',ink:'#17121d'},lay:'arena',conf:{dose:4,kind:'memphis'},x:{marquee:true},
 tile:{fn:'Bungee',shapes:'Stage panels with cream Memphis outlines and orange hard shadows. Shapes act as props around the board, never inside the cards.',tex:'Stage fog, marquee band, props in the wings.',icons:'2 px round line + solid fills.',motion:'Slam-in type, marquee, props bounce on beats; confetti cannons from the wings.'},
 ratings:{fun:5,read:3,teams:4,motion:5,mobile:2}});

T.m2o=dm(T.kofi,{id:'m2o',no:'2o',name:'Memphis × Ko-fi',de:'Bonbonschachtel',kind:'Mix',modes:{dark:'Good ("Kakao")',light:'Recommended'},
 f:{n:"'Bungee',sans-serif",nw:400},c:{accent:'#ff70c3',accentInk:'#2b2420'},s:{btnShadow:'0 6px 0 #c94a92'},
 lay:'grid',conf:{dose:3,kind:'memphis'},
 tile:{fn:'Bungee (scores & countdowns)',shapes:'Borderless 24 px cards on warm shadows; Memphis shapes float around them like sweets.',tex:'Cream dot paper, puffy cloud smoke, Memphis shapes as floating toys.',icons:'2.2 px rounded line, duotone.',motion:'Gentle bob & pop; Memphis-shaped confetti with softer physics.'},
 ratings:{fun:4,read:5,teams:4,motion:4,mobile:5}});

const RB='#1d2b6b';
T.m2p=dm(T.memphis,{id:'m2p',no:'2p',name:'Memphis × Risograph',de:'Fanzine',kind:'Mix · new',mode:'light',modes:{dark:'Weak (paper is the point)',light:'Recommended'},alt:{bg:'#141a3f',panel:'#1d2452',ink:'#f3eee3',accent:'#ff48b0'},
 f:{h:"'Archivo Black',sans-serif",hw:400,hc:'uppercase',ht:'-0.01em',title:'46px',logo:'22px',th:"'Archivo Black',sans-serif",thw:400,ths:'14px',b:"'Archivo',sans-serif",bw:500,n:"'Archivo Black',sans-serif",nw:400,lab:"'Space Mono',monospace",labt:'0.04em'},
 c:{bg:'#f3eee3',bgImg:'radial-gradient(rgba(29,43,107,.13) .8px, transparent 1.2px), radial-gradient(rgba(255,72,176,.10) .8px, transparent 1.2px)',bgSize:'7px 7px, 11px 11px',panel:'#faf6ec',panel2:'#efe8d8',ink:RB,ink2:'#5a6290',line:RB,accent:'#ffe800',accentInk:RB,hot:'#ff48b0',hotInk:RB,av:['#ffd1e8','#d4e4ff','#fff3a8','#cdeedd','#e6dcff','#ffe0cc'],avInk:RB},
 teams:TK(RB,['#f15060','#ff6c2f','#ffe800','#00a95c','#00b2b5',['#0078bf','#ffffff'],['#765ba7','#ffffff'],'#ff48b0']),
 s:{r:'4px',rChip:'4px',border:`2px solid ${RB}`,shadow:'5px 4px 0 rgba(255,72,176,.85)',btnShadow:'3px 3px 0 rgba(255,72,176,.9)',btnBorder:`2px solid ${RB}`,avBorder:`2px solid ${RB}`,div:`2px solid ${RB}`},
 mascot:{style:'riso',body:'#0078bf',belly:'#ffe800',spike:'#ff48b0',ink:RB,eye:'#ffffff',blush:'#ff48b0'},m:{wl:'11px'},lay:'mosaic',conf:{dose:3,kind:'riso',cols:['#ff48b0','#0078bf','#ffe800']},smoke:smoke('dots',['#ff48b0','#0078bf'],.3),
 tile:{fh:'Archivo Black (caps)',fb:'Archivo 500',fn:'Archivo Black',hs:'38px',shapes:'Thin blue-ink outlines with a misregistered fluoro-pink shadow, like a second print pass that slipped. 4 px radii.',tex:'Paper grain in two inks, halftone smoke, overprint where colours cross.',icons:'2 px line printed in blue, offset pink pass.',motion:'Shapes "print in" pass by pass; confetti overprints (multiply) where it overlaps.'},
 ratings:{fun:4,read:4,teams:4,motion:3,mobile:4}});

const CL='#2a2350';
T.m2q=dm(T.kofi,{id:'m2q',no:'2q',name:'Memphis × Clay',de:'Knete & Konfetti',kind:'Mix · new',mode:'light',modes:{dark:'Good (night clay)',light:'Recommended'},alt:{bg:'#1d1838',panel:'#2a2450',ink:'#f2eeff',accent:'#7b5cff'},
 f:{h:"'Bagel Fat One',sans-serif",hw:400,ht:'0',title:'46px',th:"'Nunito',sans-serif",thw:800,ths:'15px',b:"'Nunito',sans-serif",bw:700,n:"'Bagel Fat One',sans-serif",nw:400,lab:"'Nunito',sans-serif",labc:'uppercase',labt:'0.06em'},
 c:{bg:'#ece6ff',bgImg:'radial-gradient(ellipse at 15% 10%, rgba(255,255,255,.7), transparent 40%), radial-gradient(ellipse at 85% 90%, rgba(190,170,255,.5), transparent 45%)',bgSize:'100% 100%',panel:'#f9f7ff',panel2:'#efeaff',ink:CL,ink2:'#6f6a96',line:'#ddd5fb',accent:'#7b5cff',accentInk:'#ffffff',hot:'#ff5c8a',hotInk:'#ffffff',av:['#ffe0ec','#dff4ff','#fff1c2','#e6dcff','#dcf7e6','#ffe3d1'],avInk:CL},
 teams:TK(CL,['#ff5c6c','#ff9a3d','#ffd23f','#4fd17f','#2fd0c8',['#4a7bff','#ffffff'],['#9a6bff','#ffffff'],'#ff7ccb']),
 s:{r:'26px',border:'none',shadow:'inset 0 -6px 0 rgba(90,70,170,.10), inset 0 3px 0 #ffffff, 0 16px 30px rgba(90,70,170,.20)',btnShadow:'inset 0 -5px 0 rgba(0,0,0,.20), inset 0 3px 0 rgba(255,255,255,.35), 0 8px 18px rgba(90,70,170,.30)',btnBorder:'none',avBorder:'none',div:'1px solid #ddd5fb'},
 mascot:{style:'clay',body:'#4fd17f',belly:'#ffe7a8',spike:'#ff7ccb',ink:CL,eye:'#ffffff',blush:'#ff9ab8'},m:{wl:'11px'},lay:'arena',conf:{dose:4,kind:'clay'},smoke:smoke('puff',['#ffffff','#f3eeff','#ffe9f3'],.9),
 tile:{fh:'Bagel Fat One',fb:'Nunito 700',fn:'Bagel Fat One',hs:'40px',shapes:'Pillowy 26 px shapes with an inner highlight on top, an inner shade at the bottom and a soft drop: everything looks squeezable. Memphis triangles and squiggles become clay blobs.',tex:'Lavender studio light, clay-blob confetti with glossy highlights.',icons:'2.2 px rounded line, puffy duotone fills.',motion:'Squash & stretch on every press; confetti is chunky and bounces once on the floor.'},
 ratings:{fun:5,read:4,teams:4,motion:5,mobile:4}});

const BH='#111111';
T.m2r=dm(T.memphis,{id:'m2r',no:'2r',name:'Memphis × Bauhaus',de:'Kreis, Quadrat, Party',kind:'Mix · new',mode:'light',modes:{dark:'Good (black ground)',light:'Recommended'},alt:{bg:'#111111',panel:'#1c1c1c',ink:'#f1ebdd',accent:'#f2c12e'},
 f:{h:"'League Spartan',sans-serif",hw:800,hc:'uppercase',ht:'-0.01em',title:'46px',th:"'League Spartan',sans-serif",thw:700,ths:'15px',b:"'DM Sans',sans-serif",bw:500,n:"'League Spartan',sans-serif",nw:800,lab:"'DM Sans',sans-serif",labt:'0.12em'},
 c:{bg:'#f1ebdd',bgImg:'none',panel:'#faf6ec',panel2:'#ece4d2',ink:BH,ink2:'#5c574d',line:BH,accent:'#f2c12e',accentInk:BH,hot:'#d9381e',hotInk:'#ffffff',av:['#e9dfc8','#dcd3bf','#e4d8c0','#d6cdb8','#ece3cf','#ddd2b8'],avInk:BH},
 teams:TK(BH,[['#d9381e','#ffffff'],'#ec7c26','#f2c12e','#3c8d4f','#2a9d9f',['#1f4fa3','#ffffff'],['#6a3d9a','#ffffff'],'#e0679b']),
 s:{r:'0px',rBtn:'999px',rChip:'999px',rAv:'50%',border:`2.5px solid ${BH}`,shadow:'none',btnShadow:'none',btnBorder:`2.5px solid ${BH}`,avBorder:`2.5px solid ${BH}`,div:`2.5px solid ${BH}`},
 i:{offset:false,sw:2.4,cap:'butt',join:'miter'},mascot:{style:'geo',body:'#d9381e',belly:'#f2c12e',spike:'#1f4fa3',ink:BH,eye:'#ffffff'},lay:'mosaic',conf:{dose:2,kind:'bauhaus',cols:['#d9381e','#f2c12e','#1f4fa3','#111111']},smoke:smoke('soft',['#d9381e','#f2c12e','#1f4fa3'],.1),boot:'grid',
 tile:{fh:'League Spartan 800 (caps)',fb:'DM Sans 500',fn:'League Spartan 800',hs:'44px',shapes:'Only circle, square, triangle, half and quarter discs. 0 px cards, pill buttons, 2.5 px black rules. Memphis brings the playfulness, Bauhaus the order.',tex:'Flat cream ground; primary-colour shapes as big compositional blocks.',icons:'2.4 px geometric line, butt caps.',motion:'Shapes rotate in 90° steps and slide on a grid; confetti in primary geometry.'},
 ratings:{fun:3,read:5,teams:4,motion:4,mobile:4}});

const YK='#1b1f3b';
T.m2s=dm(T.memphis,{id:'m2s',no:'2s',name:'Memphis × Y2K',de:'Chrom & Glitzer',kind:'Mix · new',mode:'light',modes:{dark:'Good (black chrome)',light:'Recommended (silver)'},alt:{bg:'#0b0c14',panel:'#161827',ink:'#eef0fa',accent:'#c6ff3d'},
 f:{h:"'Syne',sans-serif",hw:800,hc:'none',ht:'-0.02em',title:'46px',th:"'Syne',sans-serif",thw:700,ths:'15px',b:"'Space Grotesk',sans-serif",bw:500,n:"'Orbitron',sans-serif",nw:800,lab:"'Space Grotesk',sans-serif",labt:'0.12em'},
 c:{bg:'#e7eaf6',bgImg:'radial-gradient(ellipse at 10% 0%, rgba(198,255,61,.35), transparent 40%), radial-gradient(ellipse at 90% 20%, rgba(255,47,168,.22), transparent 40%), radial-gradient(ellipse at 60% 100%, rgba(46,242,224,.30), transparent 45%)',bgSize:'100% 100%',panel:'#f7f8fd',panel2:'#eceff9',ink:YK,ink2:'#606684',line:'#c9cee6',accent:'#c6ff3d',accentInk:YK,hot:'#ff2fa8',hotInk:'#ffffff',av:['#dfe4f7','#e8dcf7','#d8f1f0','#f3e4ef','#e2f5d6','#e4e8ee'],avInk:YK},
 teams:TK(YK,['#ff3b6b','#ff9a2e','#ffe53b','#9cff3d','#2ef2e0',['#4a7dff','#ffffff'],['#a95cff','#ffffff'],'#ff4fd1']),
 s:{r:'22px',border:'1.5px solid #ffffff',shadow:'0 0 0 1px #c9cee6, 0 12px 28px rgba(60,70,140,.18)',btnShadow:`0 0 0 1.5px ${YK}, 0 6px 16px rgba(198,255,61,.6)`,btnBorder:'none',avBorder:'2px solid #ffffff',div:'1.5px solid #c9cee6'},
 mascot:{style:'toon',body:'#c6ff3d',belly:'#ffffff',spike:'#ff2fa8',ink:YK,blush:'#ff4fd1'},m:{wl:'11px'},lay:'rows',conf:{dose:3,kind:'spark'},smoke:smoke('soft',['#c6ff3d','#ff2fa8','#2ef2e0'],.16),
 tile:{fh:'Syne 800',fb:'Space Grotesk 500',fn:'Orbitron 800',hs:'40px',shapes:'Glossy 22 px bubbles with a white rim and a cool shadow; Memphis shapes turn into sparkles, stars and chrome blobs.',tex:'Silver ground with iridescent lime, pink and cyan light pools.',icons:'2 px round line with a lime glow on active.',motion:'Shimmer sweeps across chrome, sparkles twinkle; confetti is 4-point stars.'},
 ratings:{fun:4,read:4,teams:4,motion:4,mobile:4}});

const ST='#24201b';
T.m2t=dm(T.memphis,{id:'m2t',no:'2t',name:'Memphis × Sticker',de:'Pinnwand',kind:'Mix · new',mode:'light',modes:{dark:'Good (laptop lid)',light:'Recommended'},alt:{bg:'#262a33',panel:'#323743',ink:'#fdfbf5',accent:'#ffd23f'},
 f:{h:"'Lilita One',sans-serif",hw:400,ht:'0',title:'52px',th:"'Lilita One',sans-serif",thw:400,ths:'16px',b:RUB,bw:500,n:"'Lilita One',sans-serif",nw:400,lab:RUB},
 c:{bg:'#c9a57a',bgImg:'radial-gradient(rgba(80,50,20,.22) 1px, transparent 1.6px), radial-gradient(rgba(255,240,210,.25) 1px, transparent 1.6px)',bgSize:'9px 9px, 13px 13px',panel:'#fffdf7',panel2:'#f5efe2',ink:ST,ink2:'#4a4236',line:ST,accent:'#ffd23f',accentInk:ST,hot:'#ff4f4f',hotInk:'#ffffff',avInk:ST,panelSide:'#f5efe2'},
 teams:TK(ST,['#ff5a5a','#ff9f1c','#ffd23f','#8ac926','#2ec4b6','#3a86ff',['#8338ec','#ffffff'],'#ff70c3']),
 s:{r:'16px',border:'4px solid #ffffff',shadow:'0 6px 14px rgba(60,35,10,.35)',btnShadow:'0 4px 10px rgba(60,35,10,.35)',btnBorder:'3px solid #ffffff',avBorder:'3px solid #ffffff',div:'2px dashed rgba(36,32,27,.35)'},
 mascot:{ink:ST},lay:'scatter',conf:{dose:4,kind:'sticker'},smoke:smoke('soft',['#fff3d6','#ffd23f','#ff70c3'],.12),
 tile:{fh:'Lilita One',fb:'Rubik 500',fn:'Lilita One',hs:'46px',shapes:'Every element is a die-cut sticker: thick white rim, soft drop shadow, slightly tilted. Memphis shapes become stickers too.',tex:'Cork pinboard; stickers overlap freely in the margins.',icons:'2.5 px round line on white sticker discs.',motion:'Stickers peel up on hover and slap down on drop; confetti is a burst of mini stickers.'},
 ratings:{fun:5,read:3,teams:4,motion:4,mobile:3}});

const R2=['m2a','m2b','m2c','m2d','m2e','m2f','m2g','m2h','m2i','m2j','m2k','m2l','m2m','m2n','m2o','m2p','m2q','m2r','m2s','m2t'];
R2.forEach((id,i)=>{const t=T[id];const cf=t.conf;cf.cols=cf.cols||t.teams.map(x=>x.c).concat([t.c.accent]);cf.ink=t.c.ink||'#151515';t.decos=CONF(cf.kind,cf.dose,cf.cols,cf.ink,101+i*7);t.fg=CONF(cf.kind,cf.dose,cf.cols,cf.ink,977+i*13,true);t.smokeKind=t.smokeKind||'soft';});

// ---------- round 3: favourites × light/dark, sticker confetti ----------
const STG='#17121d',CRM='#f7efe1',FOG='radial-gradient(ellipse at 50% -10%, rgba(255,176,32,.14), transparent 55%), radial-gradient(ellipse at 50% 120%, rgba(0,0,0,.5), transparent 60%)';
const STAGE_C={bg:STG,bgImg:FOG,bgSize:'100% 100%',panel:'#221b2b',panel2:'#2d2438',ink:CRM,ink2:'#b9ad9f',line:CRM,accent:'#ffd23f',accentInk:STG,hot:'#ff5a36',hotInk:STG,av:['#3a3045','#4a3a40','#33404a','#4a4235','#3d3550','#45383a'],avInk:CRM,ok:'#45d483',panelSide:'rgba(23,18,29,.6)'};
const STAGE_T=TK(STG,['#ff6b5a','#ffb020','#f4e04d','#5fe08f','#3fd6d6','#6b93ff','#b08cff','#ff7fc0']);
const STAGE_S=sh=>MS(CRM,{border:`2.5px solid ${CRM}`,shadow:`6px 6px 0 ${sh}`,btnShadow:'4px 4px 0 #000000',btnBorder:`2.5px solid ${CRM}`,avBorder:`2px solid ${CRM}`,div:'2.5px solid rgba(247,239,225,.8)'});
const LIGHT_ALT={bg:'#fff3df',panel:'#ffffff',ink:'#151515',accent:'#ffd23f'};
const CAV="'Caveat Brush',cursive";

T.m3a=dm(T.m2a,{id:'m3a',no:'3a',name:'Memphis Klassik 3.0',de:'Konfetti, aufgeräumt',kind:'Pair A · light · iterates 2a',mode:'light',modes:{dark:'Recommended → 3b',light:'Recommended'},
 lay:'grid',conf:{dose:3,kind:'sticker'},
 tile:{tex:'Dot-grid paper; die-cut sticker shapes in the gutters only, never on cards or chat.',motion:'Pop-in with overshoot; sticker confetti on joins, wins and the wheel stop. Stickers flutter, then land.'},
 ratings:{fun:4,read:4,teams:4,motion:5,mobile:4}});

T.m3b=dm(T.m2a,{id:'m3b',no:'3b',name:'Memphis Klassik 3.0 · Bühne',de:'Konfetti im Scheinwerfer',kind:'Pair A · dark · 2a on the 2n stage',mode:'dark',modes:{dark:'Recommended',light:'→ 3a'},alt:LIGHT_ALT,
 c:STAGE_C,teams:STAGE_T,s:STAGE_S('#ff5a36'),mascot:{ink:STG},lay:'grid',conf:{dose:3,kind:'sticker'},smoke:smoke('fog',['#ff5a36','#ffb020','#a073ff'],.15),
 tile:{shapes:'2a\u2019s grammar on 2n\u2019s stage: cream 2.5 px outlines, one hard orange shadow instead of black, 14 px cards, pills.',tex:'Stage-light vignette and warm fog; sticker shapes in the wings.',icons:'2.5 px round line + black offset.',motion:'Same pop as 3a; the stickers read like lit props against the dark.'},
 ratings:{fun:4,read:4,teams:5,motion:5,mobile:4}});

T.m3c=dm(T.m2m,{id:'m3c',no:'3c',name:'Kritzelparty 2.0',de:'Gerade gerückt',kind:'Pair B · light · iterates 2m',mode:'light',modes:{dark:'Recommended → 3d',light:'Recommended'},
 lay:'grid',conf:{dose:3,kind:'stickdoodle'},
 tile:{shapes:'2m\u2019s wobbly marker frames + hard shadow, but cards sit straight in a grid; tape strips keep the crafty feel.',tex:'Lined notebook paper; stickers and doodled stars share the margins.',motion:'Line-boil on frames; confetti mixes die-cut stickers with doodled stars and loops.'},
 ratings:{fun:5,read:4,teams:4,motion:5,mobile:3}});

T.m3d=dm(T.m2m,{id:'m3d',no:'3d',name:'Kritzelparty · Bühne',de:'Marker im Scheinwerfer',kind:'Pair B · dark',mode:'dark',modes:{dark:'Recommended',light:'→ 3c'},alt:LIGHT_ALT,
 c:Object.assign({},STAGE_C,{bgImg:'linear-gradient(rgba(247,239,225,.05) 1px, transparent 1px), '+FOG,bgSize:'100% 30px, 100% 100%, 100% 100%'}),
 teams:STAGE_T,s:Object.assign(STAGE_S('#ff5a36'),{ff:'url(#cp-wob)',shadow:'5px 5px 0 #ff5a36'}),
 mascot:{style:'hand',ink:CRM,eye:STG},lay:'grid',conf:{dose:3,kind:'stickdoodle'},smoke:smoke('chalk',['#ff7fc0','#6b93ff','#ffd23f'],.16),
 x:{tape:true,tapeC:'rgba(255,226,120,.55)',note:{f:CAV,c:'#ffd23f',txt:'Olli \u2192 Lila, dann Konfetti!'}},
 tile:{shapes:'Cream wobbly marker on the dark stage, orange hard shadow. Fills stay crisp; only frames boil.',tex:'Faint cream notebook lines under stage fog; doodles glow like chalk.',motion:'Line-boil, doodle + sticker confetti in cream and team colours.'},
 ratings:{fun:5,read:4,teams:5,motion:5,mobile:3}});

T.m3e=dm(T.swissmemphis,{id:'m3e',no:'3e',name:'Raster & Konfetti 3',de:'Swiss-Ruhe, Sticker-Party',kind:'Pair C · dark · iterates 1g',mode:'dark',modes:{dark:'Recommended',light:'→ 3f'},alt:{bg:'#f4f2ec',panel:'#ffffff',ink:'#111110',accent:'#ffd400'},
 lay:'mosaic',conf:{dose:3,kind:'sticker'},
 tile:{shapes:'1g unchanged at the core: 0 px cards, hairlines, 12-column grid. Title and countdown become tiles in a Swiss mosaic.',tex:'Hairline column grid; sticker shapes peek out of the gutters.',motion:'Swiss snap for UI; the only bounce in the system is the sticker confetti.'},
 ratings:{fun:4,read:5,teams:5,motion:5,mobile:5}});

T.m3f=dm(T.m2k,{id:'m3f',no:'3f',name:'Raster & Konfetti 3, hell',de:'Papier-Raster',kind:'Pair C · light',mode:'light',modes:{dark:'→ 3e',light:'Recommended'},
 lay:'mosaic',conf:{dose:3,kind:'sticker'},
 tile:{shapes:'Same mosaic as 3e on paper white; pink hard offset only on primary actions.',tex:'Paper-white column grid; stickers in the gutters.',motion:'Swiss snap; sticker confetti on wins.'},
 ratings:{fun:4,read:5,teams:5,motion:5,mobile:5}});

T.m3g=dm(T.m2a,{id:'m3g',no:'3g',name:'Konfetti-Bühne, hell',de:'Best of 2a · 2m · 1g · 2n',kind:'Pair D · light · mashup',mode:'light',modes:{dark:'Recommended → 3h',light:'Recommended'},
 f:{title:'54px'},c:{bgImg:'linear-gradient(to right, rgba(21,21,21,.06) 1px, transparent 1px)',bgSize:'calc(100% / 12) 100%'},
 lay:'arena',conf:{dose:4,kind:'sticker'},x:{marquee:true,tape:true},
 tile:{shapes:'2a cards (outline + hard shadow) in 2n\u2019s arena with the marquee band; 2m\u2019s tape strips; 1g\u2019s column grid underneath.',tex:'Cream paper with a Swiss column grid; stickers as props.',motion:'Marquee, pop-ins, sticker cannons from both corners.'},
 ratings:{fun:5,read:4,teams:4,motion:5,mobile:3}});

T.m3h=dm(T.m3g,{id:'m3h',no:'3h',name:'Konfetti-Bühne',de:'Best of, nach Feierabend',kind:'Pair D · dark · mashup',mode:'dark',modes:{dark:'Recommended',light:'→ 3g'},alt:LIGHT_ALT,
 c:Object.assign({},STAGE_C,{bgImg:'linear-gradient(to right, rgba(247,239,225,.045) 1px, transparent 1px), '+FOG,bgSize:'calc(100% / 12) 100%, 100% 100%, 100% 100%'}),
 teams:STAGE_T,s:STAGE_S('#ff5a36'),mascot:{ink:STG},conf:{dose:4,kind:'sticker'},smoke:smoke('fog',['#ff5a36','#ffb020','#a073ff'],.15),x:{tapeC:'rgba(255,226,120,.6)'},
 tile:{shapes:'3g on the 2n stage: cream outlines, orange hard shadow, marquee band, tape strips.',tex:'Column grid under stage fog; stickers as props in the wings.',motion:'Marquee, pop-ins, sticker cannons from the wings.'},
 ratings:{fun:5,read:4,teams:5,motion:5,mobile:3}});

const R3=['m3a','m3b','m3c','m3d','m3e','m3f','m3g','m3h'];
R3.forEach((id,i)=>{const t=T[id];const cf=t.conf;cf.cols=t.teams.map(x=>x.c).concat([t.c.accent]);cf.ink=t.c.ink;cf.rim=cf.rim||'#ffffff';t.decos=CONF(cf.kind,cf.dose,cf.cols,cf.ink,301+i*7);t.fg=CONF(cf.kind,cf.dose,cf.cols,cf.ink,1377+i*13,true);t.smokeKind=t.smokeKind||'soft';});

function fin(t){
 const c=t.c;
 c.ok=c.ok||'#00c86b';c.off=c.off||rgba(hx(c.ink2).length?c.ink2:'#888',.6);c.avInk=c.avInk||c.ink;c.barBg=c.barBg||'transparent';c.panelSide=c.panelSide||rgba(c.bg.startsWith('#')?c.bg:'#000000',.55);
 c.warnBg=c.warnBg||rgba(c.hot,.14);c.warnInk=c.warnInk||c.ink;c.tabLine=c.tabLine||c.hot;
 const s=t.s;s.border=s.border||`1px solid ${c.line}`;s.shadow=s.shadow||'none';s.btnShadow=s.btnShadow||'none';s.btnBorder=s.btnBorder||'none';s.ff=s.ff||'none';s.div=s.div||`1px solid ${c.line}`;
 s.slotEmpty=s.slotEmpty||`2px dashed ${c.line}`;s.avBorder=s.avBorder||'none';s.rDot=s.rDot||'50%';s.rTop=s.r==='0px'?'0':`${s.r} ${s.r} 0 0`;s.rBot=s.r==='0px'?'0':`0 0 ${s.r} ${s.r}`;
 s.dragShadow=s.dragShadow||(t.id.includes('pixel')||t.id==='pixel'?'8px 12px 0 rgba(0,0,0,.45)':s.shadow.includes('0 0')||s.shadow==='none'?'0 18px 30px rgba(0,0,0,.45)':s.shadow);
 const f=t.f;f.th=f.th||f.h;f.thw=f.thw||f.hw;f.thc=f.thc||f.hc;f.ths=f.ths||'15px';
 t.i=Object.assign({sw:2,cap:'round',join:'round',offset:false,filter:'none',pixel:false,fill:false},t.i);
 t.m=Object.assign({h:f.h,hw:f.hw,hc:f.hc,n:f.n,nw:f.nw,nsize:'56px',wl:'13px',wheelStroke:c.bg,wheelStrokeW:3,pointer:c.ink,vetoBg:c.hot,vetoInk:c.hotInk,vetoR:s.rBtn,vetoShadow:s.btnShadow,vetoBorder:s.btnBorder,ringW:8,ringCap:'butt',ringTrack:c.line,ringColor:c.hot,frame:s.shadow,frameBorder:s.border,r:s.r,scan:false,pixel:false},t.m||{});
 t.m.vetoFill=hx(t.m.vetoInk.length>4?t.m.vetoInk:'#fff')[0]>128?'rgba(255,255,255,.28)':'rgba(0,0,0,.18)';
 t.m.scanImg=t.m.scan?'repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 2px, transparent 2px 4px)':'none';
 t.x=Object.assign({marquee:false,note:null},t.x);t.x.hasNote=!!t.x.note;t.x.lab=Object.assign({kicker:'Lobby',bench:'Bench',stands:'Tribüne'},t.x.lab);
 t.score=Object.values(t.ratings).reduce((a,b)=>a+b,0);
 return t;}
Object.values(T).forEach(fin);

// ---------- mascot rig ----------
const e=(cx,cy,rx,ry)=>`M${cx-rx} ${cy}a${rx} ${ry} 0 1 0 ${2*rx} 0a${rx} ${ry} 0 1 0 ${-2*rx} 0Z`;
const RIG={spikes:'M72 100 L 78 87 L 86 97 Z M87 94 L 95 80 L 102 92 Z M103 90 L 111 77 L 117 89 Z M124 47 L 131 33 L 139 44 Z',
 tail:'M78 116 C 54 122, 30 114, 14 94 C 9 87, 17 82, 22 89 C 36 104, 56 108, 80 102 Z',
 legB:'M72 130 C 64 144 66 158 70 168 L 60 172 L 60 176 L 82 176 L 80 166 C 78 156 80 146 86 138 Z',
 body:e(96,118,32,24),neck:'M106 106 C 110 92 116 84 126 80 L 138 92 C 128 98 122 106 120 118 Z',
 head:'M110 70 C 110 50 128 40 148 44 C 168 48 183 62 183 76 C 183 90 168 97 150 97 C 130 98 110 90 110 70 Z',
 belly:e(104,127,18,11),legF:'M86 128 C 104 122 114 138 108 152 L 110 168 L 122 170 L 122 176 L 98 176 L 96 156 C 84 150 80 136 86 128 Z',
 arm:'M120 114 C 130 114 136 122 134 132 L 128 133 C 128 126 125 122 118 121 Z'};
function mascotLayers(mc){
 const st=mc.style,ink=mc.ink,body=mc.body,dark=shade(body,-0.22);
 const sil=[['spikes',mc.spike],['tail',body],['legB',dark],['body',body],['neck',body],['head',body]];
 const fr=[['legF',body],['arm',dark]];
 const it=(d,fill,stroke='none',sw=0,op=1)=>({d,fill,stroke,sw,op});
 const big=st==='toon'||st==='pixel';const eyeR=big?12:10.5;
 const det=(sw)=>[it(e(158,79,6,4),mc.blush,'none',0,st==='cozy'?.8:.55),it(e(143,64,eyeR,eyeR),mc.eye,ink,sw*0.7),it(e(146,65,big?6:5,big?6.6:5.6),ink),it(e(148.5,62,2,2),'#ffffff'),
  it('M130 50 Q 142 42 155 50','none',ink,3.5),it('M150 85 Q 165 93 179 80','none',ink,3),it('M159 88 L 162 94 L 165 89 Z','#ffffff',ink,1.2),it(e(173,69,1.8,1.8),ink)];
 const L=[];
 if(st==='geo'){L.push({tf:'',f:'none',items:sil.map(([k,c])=>it(RIG[k],c)).concat([it(RIG.belly,mc.belly)],fr.map(([k,c])=>it(RIG[k],k==='legF'?dark:c)))});
  L.push({tf:'',f:'none',items:[it(e(143,64,10,10),mc.eye),it(e(146,65,4.6,4.6),ink),it('M131 49 L 154 49','none',ink,4),it('M150 85 L 178 82','none',ink,3.5),it(e(173,69,2,2),ink)]});return L;}
 if(st==='hand'){L.push({tf:'translate(-4 3)',f:'none',items:sil.map(([k,c])=>it(RIG[k],c,'none',0,.92)).concat([it(RIG.belly,mc.belly,'none',0,.95)],fr.map(([k,c])=>it(RIG[k],c,'none',0,.92)))});
  L.push({tf:'',f:'url(#cp-wob)',items:sil.concat(fr).map(([k])=>it(RIG[k],'none',ink,2.6)).concat([it(RIG.belly,'none',ink,1.6)])});
  L.push({tf:'',f:'url(#cp-wob)',items:det(2.4)});return L;}
 if(st==='riso'){L.push({tf:'translate(5 4)',f:'none',items:sil.concat(fr).map(([k])=>it(RIG[k],mc.spike,'none',0,.8))});
  L.push({tf:'',f:'none',items:sil.map(([k,c])=>it(RIG[k],c,'none',0,.88)).concat([it(RIG.belly,mc.belly,'none',0,.95)],fr.map(([k,c])=>it(RIG[k],c,'none',0,.88)))});
  L.push({tf:'',f:'none',items:det(2.2)});return L;}
 const sw=st==='memphis'?3.2:st==='cozy'?3.6:st==='clay'?3:st==='pixel'?6:4.4;
 if(st==='memphis')L.push({tf:'translate(6 6)',f:'none',items:sil.concat(fr).map(([k])=>it(RIG[k],ink,ink,sw*2))});
 L.push({tf:'',f:'none',items:sil.map(([k])=>it(RIG[k],ink,ink,sw*2))});
 L.push({tf:'',f:'none',items:sil.map(([k,c])=>it(RIG[k],c))});
 const extra=[it(RIG.belly,mc.belly)];
 if(st==='toon')extra.unshift(it(e(98,128,28,14),dark,'none',0,.35));
 if(st==='clay')extra.push(it(e(150,56,16,7),'#ffffff','none',0,.5),it(e(92,104,16,6),'#ffffff','none',0,.45),it(e(100,134,26,8),dark,'none',0,.35));
 if(st==='memphis')extra.push(it('M86 112 h0.1 M96 106 h0.1 M90 122 h0.1 M78 118 h0.1','none',ink,4));
 L.push({tf:'',f:'none',items:extra.concat(fr.map(([k,c])=>it(RIG[k],c,ink,sw)))});
 L.push({tf:'',f:'none',items:det(sw)});
 return L;}
function mascotSVG(mc,vb){const L=mascotLayers(Object.assign({},mc,{style:'pixel'}));
 return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'>`+L.map(l=>`<g transform='${l.tf}'>`+l.items.map(i=>`<path d='${i.d}' fill='${i.fill}' stroke='${i.stroke}' stroke-width='${i.sw}' stroke-linecap='round' stroke-linejoin='round' opacity='${i.op}'/>`).join('')+'</g>').join('')+'</svg>';}
function pixelate(canvas,mc,vb,res){
 const img=new Image();const s=mascotSVG(mc,vb);
 img.onload=()=>{const [,, w,h]=vb.split(' ').map(Number);const cw=res,ch=Math.round(res*h/w);canvas.width=cw;canvas.height=ch;const x=canvas.getContext('2d');x.imageSmoothingEnabled=true;x.clearRect(0,0,cw,ch);x.drawImage(img,0,0,cw,ch);
  const pal=[mc.ink,mc.body,shade(mc.body,-0.22),mc.belly,mc.spike,mc.eye,'#ffffff',mc.blush].map(hx);const d=x.getImageData(0,0,cw,ch);const a=d.data;
  for(let i=0;i<a.length;i+=4){if(a[i+3]<120){a[i+3]=0;continue;}let b=0,bd=1e9;for(let k=0;k<pal.length;k++){const p=pal[k];const dd=(a[i]-p[0])**2+(a[i+1]-p[1])**2+(a[i+2]-p[2])**2;if(dd<bd){bd=dd;b=k;}}a[i]=pal[b][0];a[i+1]=pal[b][1];a[i+2]=pal[b][2];a[i+3]=255;}
  x.putImageData(d,0,0);};
 img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);}

// ---------- icons ----------
const IC=[{n:'Host',d:['M3 19h18','M4 16 3 7l5 4 4-7 4 7 5-4-1 9z']},{n:'Chat',d:['M4 5h16v11H9l-5 4z']},{n:'Emote',d:[e(12,12,9,9),'M8.5 14.5c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2','M9 9.5v.5','M15 9.5v.5']},{n:'Rad',d:[e(12,12,9,9),'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4']},{n:'Veto',d:[e(12,12,9,9),'M5.6 5.6l12.8 12.8']},{n:'Ton',d:['M4 9h4l5-4v14l-5-4H4z','M16.5 9c1.4 1.6 1.4 4.4 0 6','M19 6.5c2.8 3 2.8 8 0 11']}];
const BM={Host:['........','X..X..X.','XX.X.XX.','XXXXXXX.','XXXXXXX.','.XXXXX..','........','XXXXXXX.'],Chat:['........','XXXXXXX.','X.....X.','X.X.X.X.','X.....X.','XXXXXXX.','XX......','X.......'],Emote:['.XXXXX..','X.....X.','X.X.X.X.','X.....X.','X.X.X.X.','X..X..X.','X.....X.','.XXXXX..'],Rad:['..XXX...','.X.X.X..','X..X..X.','XXXXXXX.','X..X..X.','.X.X.X..','..XXX...','...X....'],Veto:['.XXXXX..','XX...XX.','X.X...X.','X..X..X.','X...X.X.','XX...XX.','.XXXXX..','........'],Ton:['...X..X.','..XX...X','XXXX.X.X','XXXX.X.X','XXXX.X.X','..XX...X','...X..X.','........']};
function icons(t){return IC.map(ic=>({n:ic.n,paths:ic.d.map(d=>({d})),pix:(BM[ic.n]||[]).flatMap((r,y)=>[...r].map((ch,x)=>ch==='X'?{x,y}:null).filter(Boolean))}));}

// ---------- shared demo data ----------
const INIT={Kitty:'KI',Mo:'MO',Larsi:'LA',Jule:'JU',Ben:'BE','Ayşe':'AY',Tobi:'TO',Fynn:'FY',Paula:'PA',Deniz:'DE',Nils:'NI',Ricarda:'RI',Olli:'OL',Mara:'MA',Hakan:'HA',Lea:'LE',Jonas:'JO',Emre:'EM',Chris:'CH',Sanne:'SA',Vicky:'VI',Pit:'PI',Marlene:'ML',Kalle:'KA',Ute:'UT',Raffi:'RA'};
const OFF=['Fynn','Ute'];
const TD=[[['Wilde','Kartoffel'],['Kitty','Mo']],[['Turbo','Dackel'],['Larsi','Jule']],[['Schildkröten','Überraschung'],['Ben','Ayşe']],[['Grantige','Gurke'],['Tobi','Fynn']],[['Laser','Waschbär'],['Paula','Deniz']],[['Käsekuchen','Kommando'],['Nils','Hakan']],[['Donner'],['Ricarda']],[['Nacho','Nebel'],['Mara','Emre']]];
function av(t,n,ring){const idx=[...n].reduce((a,ch)=>a+ch.charCodeAt(0),0)%t.c.av.length;const sh=ring?`0 0 0 3px ${ring}`:'none';
 return {n,i:INIT[n]||n.slice(0,2).toUpperCase(),bg:t.c.av[idx],fg:t.c.avInk,dot:OFF.includes(n)?t.c.off:t.c.ok,sh,host:n==='Sanne'};}
function lobby(t){
 const tm=TD.map(([w,mem],k)=>{const T_=t.teams[k];const name=w.join(' ');return {name,full:'Team '+name,c:T_.c,ink:T_.ink,g:T_.g,cn:T_.n,cnt:mem.length+'/2',vetos:mem.length+(mem.length===1?' Veto':' Vetos'),
  slots:[0,1].map(i=>mem[i]?{filled:true,empty:false,drop:false,p:av(t,mem[i],T_.c)}:{filled:false,empty:true,drop:k===6,eb:k===6?`2px dashed ${T_.c}`:t.s.slotEmpty,ebg:k===6?rgba(T_.c,.16):'transparent'})};});
 const where=n=>{const k=TD.findIndex(x=>x[1].includes(n));return k>=0?{c:t.teams[k].c,w:'Team '+t.teams[k].n}:{c:t.c.ink2,w:n==='Sanne'?'Host · Tribüne':['Olli','Lea','Jonas'].includes(n)?'Bench':'Tribüne'};};
 const msg=(n,txt,time)=>Object.assign({msg:true,sys:false,n,txt,time,p:av(t,n)},where(n));
 const sys=(txt,time)=>({sys:true,msg:false,txt,time});
 return {teams:tm,mteams:tm,drag:av(t,'Olli'),bench:['Lea','Jonas'].map(n=>av(t,n)),stands:['Chris','Sanne','Vicky','Pit','Marlene','Kalle','Ute','Raffi'].map(n=>av(t,n)),
  chat:[msg('Kitty','Wer hat Snacks? Ich hab nur Gurken.','20:02'),msg('Larsi','Bitte, bitte kein Trackmania heute','20:03'),sys('Ricarda ist Team Lila beigetreten','20:04'),msg('Chris','Ich bleib auf der Tribüne und buh euch aus','20:05'),msg('Mo','Teamwort steht: Kartoffel. Keine Diskussion.','20:05'),msg('Sanne','Start um 20:15 – Olli, ab ins Team Lila!','20:06'),msg('Olli','bin dabei, zieh mich rein','20:06')],
  emotes:[{l:'Klatsch!'},{l:'Hahaha'},{l:'Grrr'},{l:'ROAAR'}]};}
function wheel(t){
 const g=['Counter-Strike 2','Rocket League','Overcooked 2','Codenames','Tetris 99','Gang Beasts','Catan','Mario Kart 8'];
 const N=g.length,cx=200,cy=200,R=184,step=360/N;const cols=t.m.wheel||t.teams;
 const pt=(a,r)=>[cx+r*Math.cos(a*Math.PI/180),cy+r*Math.sin(a*Math.PI/180)];
 const slices=g.map((label,i)=>{const a0=-90-step/2+i*step,a1=a0+step,mid=a0+step/2;const [x0,y0]=pt(a0,R),[x1,y1]=pt(a1,R);
  const d=`M${cx} ${cy}L${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z`;const flip=mid>90&&mid<270;const col=cols[(i*3)%8];
  const off=i===0?pt(mid,12).map((v,j)=>v-(j?cy:cx)):[0,0];
  return {d,label,fill:col.c,ink:col.ink,dim:i===0?0:.5,tx:`translate(${off[0].toFixed(1)} ${off[1].toFixed(1)})`,tf:`translate(${(off[0]*.81).toFixed(1)}px,${(off[1]*.81).toFixed(1)}px) rotate(${mid+(flip?180:0)}deg) translateX(${flip?-92:92}px)`,win:i===0,sw:i===0?5:t.m.wheelStrokeW,sc:i===0?t.m.pointer:t.m.wheelStroke};});
 const L=2*Math.PI*52;
 return {slices,ringDash:`${(L*47/60).toFixed(1)} ${L.toFixed(1)}`,clipPct:'43%',holdPct:'45%',
  vchips:t.teams.map((x,k)=>({g:x.g,c:x.c,ink:x.ink,n:x.n,s:k===5?'Ihr: offen':'?',own:k===5})),
  act:[{time:'20:41',txt:'Glücksrad: Counter-Strike 2',hi:true},{time:'20:41',txt:'Sanne hat das Rad gedreht'},{time:'20:38',txt:'Team Rot gewinnt Spiel 2'},{time:'20:12',txt:'Veto von Larsi (Team Orange)'},{time:'20:11',txt:'Glücksrad: Trackmania'},{time:'20:07',txt:'Chris ist auf die Tribüne gewechselt'},{time:'20:01',txt:'Kitty ist der Session beigetreten'}]};}

window.COMPIES_THEMES=T;
window.COMPIES_ORDER2=R2;
window.COMPIES_ORDER3=R3;
window.COMPIES_ORDER=['swiss','memphis','hand','pixel','picnic','kofi','swissmemphis','swisspixel','kofihand','picnicpixel','memphispixel','swisshand'];
window.COMPIES_DATA={lobby,wheel,icons,mascotLayers,pixelate,shade,rgba};
window.dispatchEvent(new Event('compies-themes'));
})();
