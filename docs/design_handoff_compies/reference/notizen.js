/* COMPIES · Notizen: sample notes, renderer (read + edit), style pass, counter, link check.
   Reference only: the app renders the same rules with a scoped stylesheet (.cp-note) and TipTap. */
(function(){
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const MAX=2000, SHOW_FROM=1600, WARN_FROM=1800;
const ERR='Nur Adressen mit http oder https.';
/* sizes: sm = popover + round card · md = sheet, dialog, library · edit = editor (16 px, iOS never zooms) */
const SZ={
  sm:{fs:14,lh:1.45,h:17,pb:6,pl:20,li:2,hm:12,ic:12},
  md:{fs:15,lh:1.5,h:18,pb:8,pl:22,li:3,hm:14,ic:13},
  lg:{fs:16,lh:1.55,h:20,pb:10,pl:24,li:3,hm:16,ic:14},
  edit:{fs:16,lh:1.5,h:20,pb:8,pl:24,li:3,hm:14,ic:14}};
const SEL='background:color-mix(in srgb,var(--cp-primary) 62%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--cp-primary) 62%,transparent);border-radius:2px;';
const ST={
  p:(z,last)=>`margin:0 0 ${last?0:z.pb}px;`,
  h:(z,first,last)=>`margin:${first?0:z.hm}px 0 ${last?0:4}px;font-family:var(--cp-font-display);font-weight:400;font-size:${z.h}px;line-height:1.15;color:var(--cp-ink);text-wrap:balance;`,
  ul:(z,last)=>`margin:0 0 ${last?0:z.pb}px;padding-left:${z.pl}px;list-style-type:square;`,
  ol:(z,last)=>`margin:0 0 ${last?0:z.pb}px;padding-left:${z.pl+2}px;list-style-type:decimal;font-variant-numeric:tabular-nums;`,
  li:z=>`margin:${z.li}px 0;padding-left:2px;`,
  strong:'font-weight:800;',
  em:'font-style:italic;',
  a:'color:var(--cp-info-fg);font-weight:650;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px;overflow-wrap:anywhere;'};
function icon(name,size){const n=(window.CP_ICONS||{})[name]||[];return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:-.08em;margin-left:2px;fill:none;stroke:currentColor;stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round">'+n.map(([t,a])=>'<'+t+' '+Object.entries(a).map(([k,v])=>k+'="'+v+'"').join(' ')+'></'+t+'>').join('')+'</svg>';}
const SR='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
/* display rule for read-only: a link whose text is its own address loses scheme + www. */
const shortUrl=u=>u.replace(/^https?:\/\//i,'').replace(/^www\./i,'');
function inline(s,read,z){
  const re=/\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|\{caret\}|\{sel\}|\{\/sel\}/g;
  let out='',i=0,m;
  while((m=re.exec(s))){
    out+=esc(s.slice(i,m.index)); i=re.lastIndex; const t=m[0];
    if(m[1]!=null){ const href=m[2]; const txt=read&&m[1]===href?shortUrl(href):m[1];
      out+='<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer nofollow" title="'+esc(href)+'" style="'+ST.a+'">'+inline(txt,read,z)+(read?'\u2060'+icon('arrow-up-right',z.ic)+'<span style="'+SR+'"> (öffnet in neuem Tab)</span>':'')+'</a>'; }
    else if(m[3]!=null) out+='<strong style="'+ST.strong+'">'+inline(m[3],read,z)+'</strong>';
    else if(m[4]!=null) out+='<em style="'+ST.em+'">'+inline(m[4],read,z)+'</em>';
    else if(t==='{caret}') out+='<span data-caret="1" aria-hidden="true" style="display:inline-block;width:2px;height:1.2em;margin:0 -1px;vertical-align:-.22em;background:var(--cp-ink)"></span>';
    else if(t==='{sel}') out+='<span data-sel="1" style="'+SEL+'">';
    else if(t==='{/sel}') out+='</span>';
  }
  return out+esc(s.slice(i));
}
function blocks(md){
  const out=[];
  for(const l of String(md||'').split('\n')){
    if(!l.trim()) continue; let m;
    if(l.startsWith('## ')) out.push({t:'h',c:l.slice(3)});
    else if((m=l.match(/^- (.*)$/))){ const b=out[out.length-1]; b&&b.t==='ul'?b.items.push(m[1]):out.push({t:'ul',items:[m[1]]}); }
    else if((m=l.match(/^\d+\. (.*)$/))){ const b=out[out.length-1]; b&&b.t==='ol'?b.items.push(m[1]):out.push({t:'ol',items:[m[1]]}); }
    else out.push({t:'p',c:l});
  }
  return out;
}
function html(md,o){
  o=o||{}; const z=SZ[o.size||'md'], read=o.mode!=='edit', hl=o.hl||3; const bs=blocks(md);
  return bs.map((b,i)=>{ const f=i===0,l=i===bs.length-1;
    if(b.t==='h') return '<h'+hl+' style="'+ST.h(z,f,l)+'">'+inline(b.c,read,z)+'</h'+hl+'>';
    if(b.t==='ul'||b.t==='ol') return '<'+b.t+' style="'+ST[b.t](z,l)+'">'+b.items.map(it=>'<li style="'+ST.li(z)+'">'+inline(it,read,z)+'</li>').join('')+'</'+b.t+'>';
    return '<p style="'+ST.p(z,l)+'">'+inline(b.c,read,z)+'</p>';
  }).join('');
}
/* visible text only: no markup, no block breaks, links count their text, not the address */
function text(md){ return blocks(md).map(b=>(b.items?b.items:[b.c]).map(s=>s.replace(/\{\/?sel\}|\{caret\}/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1')).join('')).join(''); }
const count=md=>[...text(md)].length;
/* live editor style pass (the app uses CSS for this) */
function paint(root,size){
  const z=SZ[size||'edit']; const kids=[...root.children];
  kids.forEach((el,i)=>{ const f=i===0,l=i===kids.length-1,t=el.tagName;
    if(/^H[1-6]$/.test(t)) el.style.cssText=ST.h(z,f,l);
    else if(t==='UL') el.style.cssText=ST.ul(z,l); else if(t==='OL') el.style.cssText=ST.ol(z,l);
    else el.style.cssText=ST.p(z,l); });
  root.querySelectorAll('li').forEach(e=>e.style.cssText=ST.li(z));
  root.querySelectorAll('b,strong').forEach(e=>e.style.cssText=ST.strong);
  root.querySelectorAll('i,em').forEach(e=>e.style.cssText=ST.em);
  root.querySelectorAll('a').forEach(e=>{ e.style.cssText=ST.a; e.setAttribute('target','_blank'); e.setAttribute('rel','noopener noreferrer nofollow'); });
  root.querySelectorAll('span:not([data-sel]):not([data-caret]),font').forEach(e=>{ if(!e.attributes.length||e.tagName==='FONT'){ while(e.firstChild) e.parentNode.insertBefore(e.firstChild,e); e.remove(); } });
}
/* address check: http/https only; a bare domain gets https:// */
function validate(raw){
  let v=String(raw||'').trim(); if(!v) return {ok:false,empty:true,err:''};
  const m=v.match(/^([a-z][a-z0-9+.\-]*):/i);
  if(m){ const s=m[1].toLowerCase(); if(s!=='http'&&s!=='https') return {ok:false,err:ERR}; }
  else if(/^(\/\/)?[^\s\/]+\.[a-z]{2,}([\/?#].*)?$/i.test(v)) v='https://'+v.replace(/^\/\//,'');
  else return {ok:false,err:ERR};
  try{ const u=new URL(v); if(!/^https?:$/.test(u.protocol)||!u.hostname.includes('.')) return {ok:false,err:ERR}; return {ok:true,href:u.href}; }catch(e){ return {ok:false,err:ERR}; }
}
const URL1='https://docs.google.com/document/d/1x9QkHausregeln-RocketLeague-3v3/edit';
const show=`Privates Match, **3 gegen 3**, Arena *DFH Stadium*.
## Aufwärmen
- 5 Minuten freies Training
- Kickoffs üben, **jeder einmal**
## Siegbedingung
1. Best of 3, je **5 Minuten**
2. Bei Gleichstand *Golden Goal*
Hausregeln: [${URL1}](${URL1})`;
const long=`Privates Match, **3 gegen 3**, Arena *DFH Stadium*. Mutatoren aus, Spielzeit 5 Minuten.
## Aufwärmen
- 5 Minuten freies Training
- Kickoffs üben, **jeder einmal**
- Teams kurz absprechen: wer bleibt hinten?
## Siegbedingung
1. Best of 3, je **5 Minuten**
2. Bei Gleichstand *Golden Goal*
3. Danach Seiten tauschen
## Hausregeln
- Kein Demo-Spam in der ersten Minute
- Wer ein Eigentor schießt, holt die nächste Runde Getränke
- Pausen nur zwischen den Spielen, *nicht* mitten im Match
- Bei Verbindungsabbruch: Spiel neu starten, der Stand bleibt
## Strafen
1. Absichtlich warten: **eine Runde aussetzen**
2. Fluchen im Voice: *Kasse*, 50 Cent
Alles im Detail: [${URL1}](${URL1})`;
const FILL='Merken fürs nächste Mal: früher anfangen, Controller vorher laden, Headsets testen und die Teams vor dem ersten Spiel festlegen. ';
function pad(md,target,tail){ const need=target-count(md); if(need<=0) return md; let f=''; while(f.length<need) f+=FILL; f=f.slice(0,need); if(f.endsWith(' ')) f=f.slice(0,-1)+'.'; return md+'\n'+f+(tail||''); }
const docs={
  show, long,
  focus: show.replace('**jeder einmal**','**jeder einmal{caret}**'),
  heading: show.replace('## Siegbedingung','## Siegbedingung{caret}'),
  linkNew: show.replace(/\nHausregeln: .*$/,'\nAlles Weitere steht in den {sel}Hausregeln{/sel}.'),
  linkEdit: show.replace(/\nHausregeln: .*$/,`\nAlles Weitere steht in den {sel}[Hausregeln](${URL1}){/sel}.`),
  near: pad(long,1880,'{caret}'),
  over: pad(long,2037),
  event: `**Heute nur Bo1**, wir fangen spät an.
- Larsi kommt gegen 21 Uhr: *ab Spiel 2* einplanen`,
  eventFocus: `**Heute nur Bo1**, wir fangen spät an.
- Larsi kommt gegen 21 Uhr: *ab Spiel 2* einplanen{caret}`,
  eventLong: `**Heute nur Bo1**, wir fangen spät an.
- Larsi kommt gegen 21 Uhr: *ab Spiel 2* einplanen
- Arena heute *Mannfield*, Sanne hat sich das gewünscht`,
  empty:''
};
window.NZ={MAX,SHOW_FROM,WARN_FROM,ERR,SZ,SEL,ST,esc,html,text,count,paint,validate,docs,URL1,shortUrl,
  counter(n){ if(n>MAX) return {txt:(n-MAX)+' zu viel',tone:'error'}; if(n>=SHOW_FROM) return {txt:'noch '+(MAX-n)+' Zeichen',tone:n>=WARN_FROM?'warn':'calm'}; return null; }};
window.dispatchEvent(new Event('nz-ready'));
})();
