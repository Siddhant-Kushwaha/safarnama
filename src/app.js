(function(){
'use strict';
const R=ROUTE,P=R.places,N=P.length;
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const LANG={hi:'Hindi',en:'English',bn:'Bengali',ur:'Urdu',pa:'Punjabi'};
const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---- time model: minutes since IST midnight of the boarding date ---- */
const [Y,MO,DD]=R.train.date.split('-').map(Number);
const D0=Date.UTC(Y,MO-1,DD)-330*60000;
const mins=(hhmm,day)=>{const [h,m]=hhmm.split(':').map(Number);return ((day||1)-1)*1440+h*60+m;};
P.forEach((p,i)=>{
  const arr=p.arr||p.est_pass||p.dep,dep=p.dep||p.arr||p.est_pass;
  p.t=mins(i===0?dep:arr,p.day);
  p.td=p.kind==='halt'?Math.max(p.t,mins(dep,p.day)):p.t;
  if(p.td<p.t-600)p.td+=1440;
  p.kmo=p.km-P[0].km;p._lg=p.kind==='halt';
});
const T0=P[0].t,T1=P[N-1].t,DUR=T1-T0,TOTAL=P[N-1].kmo,last=P[N-1];
const fmt=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const dateOf=day=>{const d=new Date(Date.UTC(Y,MO-1,DD+day-1));return d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear();};
const short=p=>p.name_en.replace(/\s+Jn$/,'');
const durTxt=m=>Math.floor(m/60)+' h '+String(Math.round(m%60)).padStart(2,'0')+' min';
const SR=R.sun&&R.sun.sunrise_18&&R.sun.sunrise_18.time?mins(R.sun.sunrise_18.time,2):1440+390;
const dates=dateOf(1).slice(0,2)+'–'+dateOf(last.day);
const store={
  get(k,d){try{const v=localStorage.getItem('js12313:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{localStorage.setItem('js12313:'+k,JSON.stringify(v));}catch(e){}}
};
const state={delay:store.get('delay',0)|0,notes:store.get('notes',{})||{},replay:0};
const testNow=document.documentElement.getAttribute('data-test-now');
const nowMin=()=>((testNow?Date.parse(testNow):Date.now())-D0)/60000;
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;};

/* ---- sound: synthesised, only after a tap ---- */
let AC=null,hush=false,soundOn=store.get('snd3',true)!==false;
/* phones in silent mode mute Web Audio unless a media element is playing, so keep a silent one looping while sound is on */
let keep=null;
function keepAlive(){
  if(keep)return;
  try{const n=4000,b=new Uint8Array(44+n),dv=new DataView(b.buffer),w=(o,s)=>{for(let i=0;i<s.length;i++)b[o+i]=s.charCodeAt(i);};
    w(0,'RIFF');dv.setUint32(4,36+n,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,8000,true);dv.setUint32(28,8000,true);dv.setUint16(32,1,true);dv.setUint16(34,8,true);w(36,'data');dv.setUint32(40,n,true);b.fill(128,44);
    keep=new Audio(URL.createObjectURL(new Blob([b],{type:'audio/wav'})));keep.loop=true;keep.setAttribute('playsinline','');const pr=keep.play();if(pr&&pr.catch)pr.catch(()=>{});}catch(e){keep=null;}
}
function unlock(){if(!soundOn)return;try{keepAlive();if(!AC){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;AC=new C();}
  if(AC.state!=='running'){const r=AC.resume();if(r&&r.then)r.then(startMusic,()=>{});}else startMusic();}catch(e){}}
['touchend','pointerup','keydown'].forEach(ev=>document.addEventListener(ev,unlock,true));
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),4200);}
/* music: one looped track, only while sound is on. Gapless through Web Audio; a plain audio element is the fallback */
let music=null,musicGain=null,musicBuf=null,musicBusy=false,musicEl=null;
function startMusic(){
  if(!soundOn||!AC||music||musicEl)return;
  const go=()=>{if(music||!soundOn)return;music=AC.createBufferSource();music.buffer=musicBuf;music.loop=true;musicGain=AC.createGain();
    musicGain.gain.setValueAtTime(0.0001,AC.currentTime);musicGain.gain.exponentialRampToValueAtTime(0.55,AC.currentTime+1.4);music.connect(musicGain);musicGain.connect(AC.destination);music.start();};
  if(musicBuf){go();return;}
  if(musicBusy)return;musicBusy=true;
  fetch('art/theme.mp3').then(r=>{if(!r.ok)throw new Error('no track');return r.arrayBuffer();}).then(b=>new Promise((res,rej)=>AC.decodeAudioData(b,res,rej))).then(buf=>{musicBuf=buf;musicBusy=false;go();})
    .catch(()=>{musicBusy=false;startChip();});
}
/* built-in loop: a mellow four-bar chip tune, scheduled a little ahead of the clock */
let chip=null;
function startChip(){
  if(chip||!AC||!soundOn)return;
  const st=60/88/2,out=AC.createGain(),lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2600;out.gain.setValueAtTime(0.0001,AC.currentTime);out.gain.exponentialRampToValueAtTime(0.5,AC.currentTime+1.2);out.connect(lp);lp.connect(AC.destination);
  const F={C3:130.81,F3:174.61,G3:196,A3:220,B3:246.94,C4:261.63,D4:293.66,E4:329.63,G4:392,A4:440,C5:523.25,D5:587.33,E5:659.25,G5:783.99,A5:880};
  const bars=[['C3',['C4','E4','G4','E4']],['A3',['A3','C4','E4','C4']],['F3',['F3','A3','C4','A3']],['G3',['G3','B3','D4','B3']]];
  const lead={0:['E5',2],2:['G5',2],4:['A5',2],6:['G5',2],8:['E5',2],10:['D5',2],12:['C5',4],16:['A4',2],18:['C5',2],20:['D5',2],22:['E5',2],24:['D5',6]};
  const nb=AC.createBuffer(1,AC.sampleRate*0.2|0,AC.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  const tn=(f,t,d,p,type,f1)=>{const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f1)o.frequency.exponentialRampToValueAtTime(f1,t+d);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(p,t+0.008);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);g.connect(out);o.start(t);o.stop(t+d+0.03);};
  const ns=(t,d,p,hz)=>{const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=nb;f.type='highpass';f.frequency.value=hz;g.gain.setValueAtTime(p,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);s.connect(f);f.connect(g);g.connect(out);s.start(t);s.stop(t+d+0.02);};
  let n=0,next=AC.currentTime+0.08;
  const tick=()=>{while(next<AC.currentTime+0.3){const k=n%8,bar=(n>>3)%4,m=n%64,b=bars[bar];
    tn(F[b[1][k%4]],next,st*0.9,0.1,'triangle');
    if(k===0||k===4)tn(F[b[0]],next,st*1.8,0.26,'triangle');
    if(k===0||k===4)tn(150,next,0.12,0.5,'sine',50);
    if(k===2||k===6)ns(next,0.07,0.07,1500);
    if(k%2)ns(next,0.025,0.04,6000);
    if(m>=32&&lead[m-32])tn(F[lead[m-32][0]],next,lead[m-32][1]*st*0.92,0.085,'square');
    next+=st;n++;}};
  tick();chip={out,iv:setInterval(tick,70)};
}
function stopChip(){if(!chip)return;clearInterval(chip.iv);try{chip.out.gain.cancelScheduledValues(AC.currentTime);chip.out.gain.setTargetAtTime(0.0001,AC.currentTime,0.1);}catch(e){}chip=null;}
const hap=p=>{if(hush)return;try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}};
function stopMusic(){
  stopChip();
  if(musicEl){try{musicEl.pause();}catch(e){}musicEl=null;}
  if(!music)return;const m=music,g=musicGain;music=null;
  try{g.gain.cancelScheduledValues(AC.currentTime);g.gain.setTargetAtTime(0.0001,AC.currentTime,0.12);m.stop(AC.currentTime+0.6);}catch(e){}
}
document.addEventListener('click',unlock,true);
const audible=()=>!hush&&soundOn&&AC&&AC.state!=='closed';
/* retro arcade blips: short square and triangle notes */
function note(f,at,dur,peak,type){const t=AC.currentTime+at,o=AC.createOscillator(),g=AC.createGain();o.type=type||'square';o.frequency.setValueAtTime(f,t);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+0.004);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+dur+0.03);}
function seq(notes,step,dur,peak,type){notes.forEach((f,i)=>note(f,i*step,i===notes.length-1?dur*2.4:dur,peak,type));}
const C5=523.25,E5=659.25,G5=783.99,C6=1046.5,E6=1318.5,G6=1567.98,C7=2093;
const sfx={
  thunk(){if(!audible())return;try{seq([C6,E6,G6],0.045,0.08,0.13);}catch(e){}},
  flap(){if(!audible())return;try{seq([G5,C6],0.05,0.07,0.16,'triangle');}catch(e){}},
  chime(){if(!audible())return;try{seq([C5,E5,G5,C6,E6,G6],0.05,0.08,0.13);}catch(e){}},
  fanfare(){if(!audible())return;try{seq([G5,C6,E6,G6,E6,G6,C7],0.09,0.12,0.14);seq([C5,E5,G5,C6,G5,C6,E6],0.09,0.12,0.1,'triangle');}catch(e){}},
  pick(i){if(!audible())return;try{note(480+i*52,0,0.035,0.11);}catch(e){}},
  card(k){if(!audible())return;try{note(k%2?1100:880,0,0.02,0.1);}catch(e){}},
  dealt(i){if(!audible())return;try{const d=[0,2,4,7,9][i%5]+12*Math.floor(i/5);note(392*Math.pow(2,d/12),0,0.07,0.13,'triangle');}catch(e){}},
  clack(){if(!audible())return;try{note(330,0,0.03,0.07);note(262,0.085,0.03,0.06);}catch(e){}},
  blip(){if(!audible())return;try{note(E6,0,0.05,0.08);}catch(e){}},
  horn(){this.chime();}
};
function petals(){
  if(RM)return;const fx=$('fx'),cols=['#f39a1e','#f6c81e','#e8791a','#d8452b'];
  for(let i=0;i<54;i++){const s=document.createElement('i');s.className='petal';
    s.style.cssText='left:'+(Math.random()*100).toFixed(1)+'%;background:'+cols[i%4]+';width:'+(7+Math.random()*8).toFixed(0)+'px;height:'+(9+Math.random()*9).toFixed(0)+'px;animation-duration:'+(2.4+Math.random()*2).toFixed(2)+'s;animation-delay:'+(Math.random()*0.7).toFixed(2)+'s;--dx:'+(Math.random()*140-70).toFixed(0)+'px;--r:'+(Math.random()*720-360).toFixed(0)+'deg';
    fx.appendChild(s);setTimeout(()=>s.remove(),5600);}
}
function countUp(b,delay){
  const m=b.textContent.match(/^[\d,]+$/);if(!m||RM)return;const to=+b.textContent.replace(/,/g,'');b.textContent='0';
  setTimeout(()=>{const t0=performance.now(),tick=n=>{const f=Math.min(1,(n-t0)/1000);b.textContent=Math.round(to*(1-Math.pow(1-f,3))).toLocaleString('en-IN');if(f<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);},delay||0);
}

/* ---- hero ---- */
const stage=$('stage'),track=$('track'),journey=$('journey');
(function hero(){
  $('h-eyebrow').textContent=(R.train.number+' · '+R.train.name).toUpperCase();
  $('h-date').textContent=dates.toUpperCase()+' · DEP '+fmt(T0)+' · ARR '+fmt(T1);
  /* short keys need a final mix or the stars bunch up in one corner */
  const hs=s=>{let h=hash(s)*4294967296>>>0;h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h>>>0)/4294967296;};
  let st='';for(let k=0;k<70;k++)st+='<circle '+(k%3===0?'class="tw" style="animation-delay:-'+(k*0.41%3.4).toFixed(2)+'s" ':'')+'cx="'+(hs('x'+k)*100).toFixed(1)+'%" cy="'+(hs('y'+k)*62).toFixed(1)+'%" r="'+(0.5+hs('r'+k)*0.9).toFixed(2)+'" fill="#fff" opacity="'+(0.3+hs('o'+k)*0.6).toFixed(2)+'"/>';
  $('hero-stars').innerHTML=st;
  /* split-flap title */
  const A=short(P[0]).toUpperCase(),B=short(last).toUpperCase(),fl=$('flaps'),W=Math.min(428,fl.clientWidth||340);
  fl.setAttribute('aria-label',A+' to '+B);
  const tw=Math.floor(Math.min(36,(W-(Math.max(A.length,B.length)-1)*3)/Math.max(A.length,B.length)));
  fl.style.setProperty('--tw',tw+'px');
  const row=s=>'<span class="row" aria-hidden="true">'+s.split('').map(c=>c===' '?'<span class="tile sp"></span>':'<span class="tile" data-c="'+esc(c)+'">'+(RM?esc(c):'')+'</span>').join('')+'</span>';
  fl.innerHTML=row(A)+'<span class="to" aria-hidden="true">TO</span>'+row(B);
  if(!RM){const AB='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    [].forEach.call(fl.querySelectorAll('.tile[data-c]'),(t,i)=>{let n=5+i;const iv=setInterval(()=>{
      n--;t.textContent=n<=0?t.dataset.c:AB[Math.random()*26|0];t.classList.remove('tick');void t.offsetWidth;t.classList.add('tick');if(n<=0)clearInterval(iv);},62);});}
  /* fan of stamps */
  const step=52/Math.max(1,N-1);
  const fan=$('fan'),hint=$('deckhint');
  fan.innerHTML=P.map((p,i)=>'<button type="button" data-i="'+i+'" aria-label="'+esc(p.name_en)+'"><img alt="" width="96" height="128" src="'+(p.has_art!==false?'art/'+esc(p.slug)+'.webp':'')+'"></button>').join('');
  const cards=[].slice.call(fan.children),ang=i=>(i-(N-1)/2)*step,jit=i=>hash('j'+i)*3-1.5,setA=(c,a)=>{c.style.transform='rotate('+a.toFixed(2)+'deg)';};
  let dealt=false,busy=false;
  const ready=()=>{dealt=true;busy=false;fan.classList.add('dealt');hint.hidden=false;};
  cards.forEach((c,i)=>{c.style.zIndex=N-i;setA(c,RM?ang(i):jit(i));if(RM)c.style.zIndex=i;});
  /* cut the deck, riffle it, deal the fan. Runs by itself on load; browsers only allow its sound and buzz once the page has been touched */
  function shuffle(){
    if(busy)return;busy=true;unlock();
    setTimeout(()=>{hap(12);sfx.card(0);cards.forEach((c,i)=>setA(c,(i%2?17:-17)+jit(i)));},0);
    setTimeout(()=>cards.forEach((c,i)=>setTimeout(()=>{setA(c,jit(i));sfx.card(i);hap(4);},i*42)),380);
    setTimeout(()=>cards.forEach((c,i)=>setTimeout(()=>{c.style.zIndex=i;setA(c,ang(i));sfx.dealt(i);hap(6);if(i===N-1)setTimeout(ready,380);},i*62)),380+N*42+260);
  }
  if(RM)ready();else setTimeout(shuffle,1250);
  fan.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&dealt&&!busy)jumpTo(+b.dataset.i);});
  /* surprise me: a light runs to and fro across the laid-out cards, slows, and lands on one; the page then rides there and flips it */
  const lift=(i,on)=>{const c=cards[i];c.style.zIndex=on?99:i;c.style.transform='rotate('+ang(i).toFixed(2)+'deg)'+(on?' translateY(-20px) scale(1.14)':'');c.classList.toggle('hot',on);};
  hint.addEventListener('click',()=>{
    if(busy||!dealt)return;busy=true;unlock();fan.classList.add('fast');fan.classList.remove('dealt');
    const target=Math.random()*N|0,per=2*(N-1),pos=k=>{const m=k%per;return m<N?m:per-m;};
    let K=RM?0:22+(Math.random()*6|0),k=0,prev=-1;while(pos(K)!==target)K++;
    const step=()=>{
      const i=pos(k);if(prev>=0)lift(prev,false);lift(i,true);prev=i;
      if(k<K){sfx.pick(i);hap(5);k++;setTimeout(step,55+240*Math.pow(k/K,2.6));return;}
      sfx.chime();hap([18,40,30]);cards[i].classList.add('win');
      setTimeout(()=>{cards[i].classList.remove('win');lift(i,false);fan.classList.remove('fast');fan.classList.add('dealt');busy=false;jumpTo(i,()=>openCard(i));},RM?0:950);
    };
    step();
  });
  const states=new Set(P.map(p=>p.state).filter(Boolean)).size;
  $('h-stats').innerHTML=[[TOTAL.toLocaleString('en-IN'),'km'],[Math.floor(DUR/60)+'h'+String(DUR%60).padStart(2,'0'),'on the train'],[states,'states'],[N,'stamps']].map(s=>'<div><b>'+esc(s[0])+'</b><span>'+esc(s[1])+'</span></div>').join('');
  [].forEach.call($('h-stats').querySelectorAll('b'),b=>countUp(b,2300));
  /* the train that passes */
  let t='<polygon points="4,25 -90,8 -90,42" fill="#f6c81e" opacity=".22"/><path d="M4 40V17q0-9 10-9h92v32z" fill="#d8452b" stroke="#141414" stroke-width="1.5"/><rect x="4" y="23" width="102" height="5" fill="#f3e9d2"/><rect x="10" y="12" width="15" height="8" rx="1" fill="#f6c81e" stroke="#141414"/><path d="M58 8l-9-7h22l-9 7" fill="none" stroke="#141414" stroke-width="1.5"/>';
  [20,36,78,94].forEach(x=>{t+='<circle cx="'+x+'" cy="41" r="4.5" fill="#141414"/>';});
  for(let k=0;k<5;k++){const x=112+k*143;t+='<rect x="'+x+'" y="10" width="139" height="30" rx="3" fill="#d8452b" stroke="#141414" stroke-width="1.5"/><rect x="'+x+'" y="24" width="139" height="4" fill="#f3e9d2"/>';
    for(let w=0;w<9;w++)t+='<rect x="'+(x+9+w*14)+'" y="14" width="9" height="7" rx="1" fill="#f6c81e"/>';
    [16,30,109,123].forEach(q=>{t+='<circle cx="'+(x+q)+'" cy="41" r="4.5" fill="#141414"/>';});}
  const ht=$('hero-train');ht.innerHTML=t;ht.style.overflow='visible';
})();

/* ---- stamps, nodes and markers (built once) ---- */
function natHtml(p){return (p.board_langs||[]).filter(l=>l!=='en'&&p.names&&p.names[l]).map(l=>'<span lang="'+l+'"'+(l==='ur'?' dir="rtl"':'')+'>'+esc(p.names[l])+'</span>').join(' · ');}
function postmark(p,i){
  const code=esc((p.code||p.name_en).toUpperCase().slice(0,10)),waves=[34,47,60,73,86].map(y=>'<path d="M112 '+y+' q9 -6 18 0 t18 0 t18 0 t18 0"/>').join('');
  return '<svg class="pm" viewBox="0 0 190 120" aria-hidden="true" style="--rot:'+(hash(p.slug)*36-18).toFixed(1)+'deg">'+
    '<defs><path id="pa'+i+'" d="M27 60 A33 33 0 0 1 93 60"/><path id="pb'+i+'" d="M20 60 A40 40 0 0 0 100 60"/></defs>'+
    '<circle cx="60" cy="60" r="41" fill="#f3e9d2" fill-opacity=".68"/><g fill="none" stroke="currentColor"><circle class="ring" cx="60" cy="60" r="46" stroke-width="2.4"/><circle cx="60" cy="60" r="42" stroke-width="1"/><g stroke-width="2.2">'+waves+'</g></g>'+
    '<g fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" text-anchor="middle">'+
    '<text font-size="10" letter-spacing="1.5" font-weight="500"><textPath href="#pa'+i+'" startOffset="50%">'+code+'</textPath></text>'+
    '<text font-size="8" letter-spacing="1"><textPath href="#pb'+i+'" startOffset="50%">'+dateOf(p.day)+'</textPath></text>'+
    '<text class="pmt" x="60" y="66" font-size="17" font-weight="500">'+fmt(p.t)+'</text></g></svg>';
}
const stamps=P.map((p,i)=>{
  const lg=p._lg,b=document.createElement('button'),nat=lg?natHtml(p):'';
  b.type='button';b.className='stamp '+(lg?'lg':'sm')+(i%2===0?' side-r':' side-l');
  b.setAttribute('aria-label',p.name_en+', '+fmt(p.t)+', '+p.kmo+' km from '+short(P[0])+'. Flip for details');
  b.style.setProperty('--tilt',(hash(p.slug+'t')*3-1.5).toFixed(2)+'deg');
  b.innerHTML='<span class="paper" style="--ink:'+esc(p.ink||'#23233a')+'">'+
    '<img class="art" alt="" width="480" height="640" decoding="async"'+(i>0?' loading="lazy"':'')+'>'+
    '<span class="row"><span class="nm">'+esc(p.name_en)+'</span>'+(lg?'<span class="km">'+p.kmo+' KM</span>':'')+'</span>'+
    (lg?(nat?'<span class="nat">'+nat+'</span>':''):'<span class="row2"><span>'+fmt(p.t)+'</span><span>'+p.kmo+' KM</span></span>')+
    '</span>'+postmark(p,i);
  const img=b.querySelector('img');img.addEventListener('error',()=>img.removeAttribute('src'));
  if(p.has_art!==false&&p.slug)img.src='art/'+p.slug+'.webp';
  b.addEventListener('click',()=>openCard(i));
  stage.appendChild(b);p._nat=!!nat;
  const node=document.createElement('div');node.className='node';
  node.innerHTML='<b>'+(lg?'':'≈')+fmt(p.t)+'</b>'+(i===0?'board':i===N-1?'arrive':lg?'halt '+Math.max(1,p.td-p.t)+' min':'passes');
  stage.appendChild(node);
  return{el:b,node,pmt:b.querySelector('.pmt'),was:false,tf:''};
});
const marks=[];
(R.borders||[]).forEach(b=>marks.push({k:b.km_approx,type:'border',b}));
(R.rivers||[]).forEach(r=>marks.push({k:r.km_approx+0.5,type:'river',r}));
if(R.sun&&R.sun.sunrise_18)marks.push({k:R.sun.sunrise_18.km,type:'sun',s:R.sun.sunrise_18});
marks.sort((a,b)=>a.k-b.k);
marks.forEach(m=>{
  m.gap=clamp(P.findIndex((p,i)=>i<N-1&&m.k>=p.km&&m.k<P[i+1].km),0,N-2);
  const d=document.createElement('div');
  if(m.type==='border'){
    const before=P[m.gap].board_langs||[],after=P[m.gap+1].board_langs||[];
    d.className='mark border';
    d.innerHTML='<span class="lbl a">'+esc(m.b.from)+'</span><span class="lbl b">'+esc(m.b.to)+(before.join()!==after.join()?'<small>Boards: '+after.map(l=>LANG[l]||l).join(', ')+'</small>':'')+'</span>';
  }else if(m.type==='river'){
    d.className='mark river';
    d.innerHTML='<svg viewBox="0 0 400 24" preserveAspectRatio="none"><path d="M-50 12 q12.5 -9 25 0'+' t25 0'.repeat(19)+'" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" opacity=".7"/></svg>'+
      '<span class="lbl" style="left:0;transform:translateY(40%)">'+esc(m.r.name)+' river'+(m.r.bridge?' · '+esc(m.r.bridge):'')+'</span>';
  }else{
    let rays='';for(let k=0;k<12;k++)rays+='<line x1="0" y1="-15" x2="0" y2="-'+(k%2?21:24)+'" transform="rotate('+k*30+')"/>';
    d.className='mark sun';
    d.innerHTML='<span class="lbl" style="left:0">Sunrise '+esc(m.s.time)+(m.s.near?' · near '+esc(m.s.near):'')+'</span><svg class="sunny" viewBox="-27 -27 54 54"><g class="rays" stroke="#141414" stroke-width="2" stroke-linecap="round">'+rays+'</g><circle r="11" fill="#f6c81e" stroke="#141414" stroke-width="2"/></svg>';
  }
  m.el=d;stage.appendChild(d);
});

/* ---- train-window strip ---- */
const win=$('win');
(function(){
  const svg=(w,h,body)=>'url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">'+body+'</svg>')+'")';
  win.style.setProperty('--m-far',svg(240,58,'<path d="M0 58V36q30-20 60-6t60-8t60 10t60 4V58z"/>'));
  win.style.setProperty('--m-mid',svg(200,46,'<path d="M0 46V39h200v7z"/><circle cx="26" cy="24" r="12"/><rect x="24" y="30" width="4" height="12"/><circle cx="58" cy="29" r="8"/><rect x="56.500" y="32" width="3" height="10"/><path d="M96 40V27l13-9l13 9v13z"/><circle cx="158" cy="20" r="14"/><rect x="156" y="28" width="4" height="14"/><path d="M178 40V10q-10 2-14 8q8-5 13-3q-9 0-11 7q7-5 12-3z"/>'));
  win.style.setProperty('--m-near',svg(150,96,'<path d="M17 96V8h4v88z"/><path d="M21 14h34v2.500H21z"/><path d="M53 14v12h2V14z"/><path d="M0 27q75 10 150 0v2q-75 10-150 0z"/><path d="M0 40h150v1.600H0z"/><path d="M40 33.500v7h1v-7zM75 34.500v6h1v-6zM110 33.500v7h1v-7z"/>'));
  $('wboards').innerHTML=P.map(p=>'<div class="wboard"><b>'+esc(p.name_en)+'</b>'+(p.names&&p.names.hi?'<span lang="hi">'+esc(p.names.hi)+'</span>':'')+'</div>').join('');
})();
const wb=[].slice.call($('wboards').children).map(el=>({el,w:0,x:-9999})),lay={far:$('l-far'),mid:$('l-mid'),near:$('l-near')};

/* ---- layout ---- */
let L=null,VH=window.innerHeight,VW=window.innerWidth,stageTop=0;
const SKY=[[T0-30,'#3b2647'],[T0+25,'#2a2140'],[T0+80,'#121628'],[SR-100,'#0e1122'],[SR-55,'#232a4d'],[SR-24,'#5a4766'],[SR-7,'#d98a5f'],[SR+9,'#f0c383'],[SR+45,'#cfe0e6'],[T1+30,'#e1ebee']];
function yOf(t){
  if(t<=P[0].td)return L.ny[0]-(P[0].td-t)*1.2;
  for(let i=0;i<N-1;i++){const a=P[i],b=P[i+1];if(t<b.t)return L.ny[i]+(L.ny[i+1]-L.ny[i])*Math.max(0,(t-a.td)/(b.t-a.td));}
  return L.ny[N-1]+(t-T1)*1.2;
}
function layout(){
  const W=stage.clientWidth,r12=v=>Math.round(v/12)*12,nx=[],ny=[];
  let y=96;
  P.forEach((p,i)=>{
    const lg=p._lg,w=r12(W*(lg?0.6:0.42)),pad=lg?10:9,ih=(w-2*pad)*4/3,cap=lg?(p._nat?57:30):38;
    const h=Math.ceil((2*pad+ih+cap)/12)*12,right=i%2===0,left=right?W-w:0,free=W-w,k=lg?0.38:0.46,x=right?Math.max(24,free*k):W-Math.max(24,free*k),s=stamps[i];
    s.el.style.left=left+'px';s.el.style.top=y+'px';s.el.style.width=w+'px';s.el.style.height=h+'px';
    nx[i]=x;ny[i]=y+h/2;p._edge=right?left:w;
    s.node.style.left=(right?x+14:x-14)+'px';s.node.style.top=(ny[i]-41)+'px';
    const here=marks.filter(m=>m.gap===i);
    here.forEach((m,q)=>{m.y=y+h+44+q*46;m.el.style.top=(m.y-20)+'px';});
    y+=h+(i<N-1?88+here.length*46:0);
  });
  const H=y+90;stage.style.height=H+'px';
  L={W,H,nx,ny};
  const dayY=yOf(SR-12);L.dayY=dayY;
  stamps.forEach((s,i)=>{s.node.className='node '+(i%2?'r ':'')+(ny[i]>dayY?'on-day':'on-night');
    const nm=s.el.querySelector('.nm');nm.style.fontSize='';let fs=parseFloat(getComputedStyle(nm).fontSize);while(nm.scrollWidth>nm.clientWidth+0.5&&fs>10){fs-=0.5;nm.style.fontSize=fs+'px';}});
  marks.forEach(m=>{const day=m.type==='sun'||m.y>dayY;m.el.classList.toggle('on-day',day);m.el.classList.toggle('on-night',!day);});
  let prev=0;
  $('sky').style.background='linear-gradient(180deg,'+['#3b2647 0px'].concat(SKY.map(([t,c])=>{prev=Math.max(prev+1,Math.min(H,Math.max(30,yOf(t))));return c+' '+Math.round(prev)+'px';})).join(',')+')';
  $('sky').style.setProperty('--night',Math.round(yOf(SR-45))+'px');

  /* sample the line once: everything that moves reads this table, not the DOM */
  const PX=[],PY=[],PL=[],nodeLen=[],LEAD=140,S=30;
  PX.push(nx[0]);PY.push(ny[0]-LEAD);PL.push(0);
  let len=LEAD;PX.push(nx[0]);PY.push(ny[0]);PL.push(len);nodeLen[0]=len;
  for(let i=0;i<N-1;i++){
    const x0=nx[i],y0=ny[i],x3=nx[i+1],y3=ny[i+1],c=(y3-y0)/2;
    for(let s=1;s<=S;s++){const t=s/S,u=1-t,x=u*u*u*x0+3*u*u*t*x0+3*u*t*t*x3+t*t*t*x3,yy=u*u*u*y0+3*u*u*t*(y0+c)+3*u*t*t*(y3-c)+t*t*t*y3,q=PX.length-1;
      len+=Math.hypot(x-PX[q],yy-PY[q]);PX.push(x);PY.push(yy);PL.push(len);}
    nodeLen[i+1]=len;
  }
  PX.push(nx[N-1]);PY.push(H-8);PL.push(len+(H-8-ny[N-1]));
  L.PX=PX;L.PY=PY;L.PL=PL;L.nodeLen=nodeLen;
  let ra='',rb='';
  for(let q=0;q<PX.length;q++){const a=Math.max(0,q-1),b=Math.min(PX.length-1,q+1),dx=PX[b]-PX[a],dy=PY[b]-PY[a],m=Math.hypot(dx,dy)||1,ox=-dy/m*3.4,oy=dx/m*3.4;
    ra+=(q?'L':'M')+(PX[q]+ox).toFixed(1)+' '+(PY[q]+oy).toFixed(1);rb+=(q?'L':'M')+(PX[q]-ox).toFixed(1)+' '+(PY[q]-oy).toFixed(1);}
  let d='';for(let q=0;q<PX.length;q++)d+=(q?'L':'M')+PX[q].toFixed(1)+' '+PY[q].toFixed(1);

  const sr=clamp(dayY/H,0.02,0.98),rnd=(()=>{let a=12313;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();
  const nightTop=yOf(T0+30),nightEnd=yOf(SR-45);L.nightEnd=nightEnd;
  let stars='';
  for(let k=0;k<150;k++){
    const sy=20+rnd()*(nightEnd-20),sx=-14+rnd()*(W+28),fade=Math.min(1,Math.max(0.3,(sy-20)/Math.max(1,nightTop-20)))*Math.min(1,(nightEnd-sy)/160);
    stars+='<circle '+(k%5===0?'class="tw" style="animation-delay:-'+(k*0.37%3.4).toFixed(2)+'s" ':'')+'cx="'+sx.toFixed(1)+'" cy="'+sy.toFixed(1)+'" r="'+(0.5+rnd()*0.9).toFixed(2)+'" opacity="'+(fade*(0.35+rnd()*0.6)).toFixed(2)+'"/>';
  }
  const mi=P.findIndex(p=>!p._lg&&p.t>T0+60&&p.t<T0+300);
  let moon='';
  if(mi>=0){const right=mi%2===0,mx=right?P[mi]._edge*0.74:W-(W-P[mi]._edge)*0.74;moon='<g transform="translate('+mx.toFixed(1)+' '+(ny[mi]-66).toFixed(1)+')"><circle r="13" fill="#f2e3b3"/><path d="M0 -13 A13 13 0 0 0 0 13 Z" fill="#141a30"/></g>';}
  let clouds='';
  if(H-dayY>420)[0.22,0.5,0.8].forEach((f,k)=>{clouds+='<g transform="translate('+[W*0.12,W*0.62,W*0.3][k].toFixed(0)+' '+(dayY+140+f*(H-dayY-320)).toFixed(0)+') scale('+(1.5+k*0.3)+')"><g class="cloud" style="animation-delay:-'+k*5+'s"><path d="M0 14 q-8 -1 -6 -8 q2 -6 9 -4 q3 -8 13 -6 q8 -6 15 2 q10 -1 9 8 q6 3 1 8 z" fill="#fff" stroke="#232838" stroke-width=".8" opacity=".9"/></g></g>';});
  let conn='',dots='';
  P.forEach((p,i)=>{
    conn+='<line x1="'+nx[i]+'" y1="'+ny[i]+'" x2="'+p._edge+'" y2="'+ny[i]+'"/>';
    dots+=p._lg?'<circle cx="'+nx[i]+'" cy="'+ny[i]+'" r="7" fill="#f6c81e" stroke="#141414" stroke-width="2"/>':'<circle cx="'+nx[i]+'" cy="'+ny[i]+'" r="4.5" fill="url(#railg)" stroke="'+(ny[i]>dayY?'#e1ebee':'#121628')+'" stroke-width="1.5"/>';
  });
  const coach='<rect x="-10" y="-5" width="20" height="10" rx="2" fill="#d8452b" stroke="#141414" stroke-width="1"/><path class="lit" d="M-7 -2.600h14M-7 2.600h14" stroke="#f6c81e" stroke-width="1.6" stroke-dasharray="2 1.500"/>';
  track.setAttribute('width',W);track.setAttribute('height',H);track.setAttribute('viewBox','0 0 '+W+' '+H);
  track.innerHTML='<defs><linearGradient id="railg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="'+H+'"><stop offset="0" stop-color="#d8d2c2"/><stop offset="'+(sr-0.004)+'" stop-color="#d8d2c2"/><stop offset="'+(sr+0.004)+'" stop-color="#232838"/><stop offset="1" stop-color="#232838"/></linearGradient></defs>'+
    '<g fill="#fff">'+stars+'</g>'+moon+clouds+'<g id="shootg"><line id="shoot" x1="0" y1="0" x2="210" y2="0"/></g>'+
    '<path d="'+d+'" fill="none" stroke="url(#railg)" stroke-width="14" stroke-dasharray="2 7" opacity=".5"/>'+
    '<path d="'+ra+'" fill="none" stroke="url(#railg)" stroke-width="1.7"/><path d="'+rb+'" fill="none" stroke="url(#railg)" stroke-width="1.7"/>'+
    '<path id="prog" d="'+d+'" fill="none" stroke="#f6c81e" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0 99999"/>'+
    '<g stroke="url(#railg)" stroke-width="1.5" stroke-dasharray="2 3" opacity=".8">'+conn+'</g>'+dots+
    '<g id="train-g"><g class="car">'+coach+'</g><g class="car">'+coach+'</g><g class="car">'+coach+'</g><g class="car">'+coach+'</g>'+
    '<g class="car"><g id="loco"><path id="beam" d="M12 -3 L64 -19 L64 19 L12 3 Z" fill="#f6c81e" opacity=".3"/><rect x="-13" y="-6.500" width="26" height="13" rx="3" fill="#d8452b" stroke="#141414" stroke-width="1.3"/><rect x="5" y="-6.500" width="3" height="13" fill="#f3e9d2"/><path d="M10 -4v8" stroke="#141414" stroke-width="2" stroke-linecap="round"/><path d="M-6 -3l5 3l-5 3" fill="none" stroke="#141414" stroke-width="1"/></g></g></g>';
  L.prog=track.querySelector('#prog');L.cars=[].slice.call(track.querySelectorAll('.car')).reverse();L.beam=track.querySelector('#beam');L.tg=track.querySelector('#train-g');
  stageTop=stage.getBoundingClientRect().top+window.scrollY;VH=window.innerHeight;VW=window.innerWidth;
  wb.forEach(b=>{b.w=b.el.offsetWidth;b.x=-9999;});
  stamps.forEach(s=>{s.tf='?';});
}
/* table lookups */
function idxFor(arr,v){let lo=0,hi=arr.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(arr[m]<=v)lo=m;else hi=m;}return lo;}
function yToLen(y){const i=idxFor(L.PY,y),f=clamp((y-L.PY[i])/((L.PY[i+1]-L.PY[i])||1),0,1);return L.PL[i]+f*(L.PL[i+1]-L.PL[i]);}
function lenToPt(l){const i=idxFor(L.PL,l),f=clamp((l-L.PL[i])/((L.PL[i+1]-L.PL[i])||1),0,1),dx=L.PX[i+1]-L.PX[i],dy=L.PY[i+1]-L.PY[i];
  return{x:L.PX[i]+f*dx,y:L.PY[i]+f*dy,a:Math.atan2(dy,dx)*180/Math.PI};}
function timeToLen(t){
  if(t<=P[0].td)return L.nodeLen[0];
  for(let i=0;i<N-1;i++){const a=P[i],b=P[i+1];if(t<b.t)return L.nodeLen[i]+Math.max(0,(t-a.td)/(b.t-a.td))*(L.nodeLen[i+1]-L.nodeLen[i]);}
  return L.nodeLen[N-1];
}
/* ride to a stamp quietly, then call back once the scroll has settled */
function jumpTo(i,then){
  hush=true;goLen(L.nodeLen[i]+2,true);let lastY=-1,still=0,n=0;
  const iv=setInterval(()=>{const y=window.scrollY;still=Math.abs(y-lastY)<1?still+1:0;lastY=y;if(still>=2||++n>32){clearInterval(iv);hush=false;if(then)then();}},110);
}
function goLen(l,smooth){window.scrollTo({top:Math.max(0,stageTop+lenToPt(l).y-VH*0.45+2),behavior:smooth&&!RM?'smooth':'auto'});}

/* ---- the ride: everything here follows the scroll position ---- */
const el={n1:$('now-1'),n2:$('now-2'),late:$('late-val'),you:$('you'),youT:$('you-t'),goto:$('goto'),tonow:$('tonow')};
let ready=false,lastL1='',lastLen=-1,lastSc=0,phase='',celebrated=false,acc=0,lastClack=0;
function ride(){
  const sc=window.scrollY,y=sc+VH*0.45-stageTop,y0=L.ny[0],y1=L.ny[N-1];
  const len=y<=y0?L.nodeLen[0]:y>=y1?L.nodeLen[N-1]:yToLen(y);
  /* train: loco and four coaches trail along the curve */
  if(len!==lastLen){
    L.cars.forEach((c,k)=>{const p=lenToPt(Math.max(0,len-k*24-(k?3:0)));c.setAttribute('transform','translate('+p.x.toFixed(1)+' '+p.y.toFixed(1)+') rotate('+p.a.toFixed(1)+')');});
    L.prog.setAttribute('stroke-dasharray',(y<y0?0:len).toFixed(1)+' 99999');
  }
  let seg=0;while(seg<N-2&&len>=L.nodeLen[seg+1])seg++;
  const a=P[seg],b=P[seg+1],f=clamp((len-L.nodeLen[seg])/(L.nodeLen[seg+1]-L.nodeLen[seg]),0,1),t=a.td+f*(b.t-a.td),atEnd=y>=y1;
  /* stamps: slam as the train passes, and lean in as they scroll into view */
  stamps.forEach((s,i)=>{
    /* a postmark is earned once and then stays, whichever way you scroll */
    const below=y>=L.ny[i]-1;
    if(!s.was&&below){
      s.was=true;s.el.classList.add('passed');
      if(ready){s.el.classList.remove('slam');void s.el.offsetWidth;s.el.classList.add('slam');sfx.thunk();hap(14);}
    }else if(ready&&s.side!==undefined&&below!==s.side)sfx.blip();
    s.side=below;
    if(RM)return;
    const p=(L.ny[i]-(sc-stageTop))/VH;let tf='';
    if(p>-0.6&&p<1.6){
      const k=clamp((p-0.76)/0.36,0,1),k2=clamp((0.1-p)/0.3,0,1),dir=i%2===0?1:-1;
      if(k>0||k2>0)tf='perspective(900px) translate3d('+(dir*k*52).toFixed(1)+'px,'+(-k2*16).toFixed(1)+'px,0) rotateY('+(dir*k*-46).toFixed(1)+'deg) rotate(var(--tilt,0deg)) scale('+((1-k*0.12)*(1-k2*0.06)).toFixed(3)+')';
    }
    if(tf!==s.tf){s.tf=tf;s.el.style.transform=tf;}
  });
  /* station board */
  let l1,l2;
  if(y<y0){l1=short(P[0])+' → '+short(last);l2='Scroll to drive the train · '+TOTAL.toLocaleString('en-IN')+' km';}
  else if(atEnd){l1='Arrived '+last.name_en;l2=TOTAL.toLocaleString('en-IN')+' km · '+durTxt(DUR)+' · '+N+' stamps';}
  else{l1=short(a)+' → '+short(b);l2=fmt(t)+' · '+Math.max(0,Math.round((b.km-a.km)*(1-f)))+' km to '+short(b)+' · '+Math.round((b.km-a.km)/((b.t-a.td)/60))+' km/h';}
  if(l1!==lastL1){el.n1.textContent=l1;lastL1=l1;if(ready&&!RM){el.n1.classList.remove('flip');void el.n1.offsetWidth;el.n1.classList.add('flip');}}
  if(el.n2.textContent!==l2)el.n2.textContent=l2;
  L.beam.style.display=t<SR-10&&y>y0&&!atEnd?'':'none';
  /* window strip */
  const ph=t<SR-40?'night':t<SR+25?'dawn':'day';
  if(ph!==phase){phase=ph;win.className=ph==='night'?'':ph;}
  if(!RM){
    lay.far.style.transform='translate3d('+(-(sc*0.1%240)).toFixed(1)+'px,0,0)';
    lay.mid.style.transform='translate3d('+(-(sc*0.28%200)).toFixed(1)+'px,0,0)';
    lay.near.style.transform='translate3d('+(-(sc*0.9%150)).toFixed(1)+'px,0,0)';
  }
  const cx=Math.min(L.W+32,460)/2;
  wb.forEach((w,i)=>{const dx=(L.nodeLen[i]-len)*1.5,x=Math.abs(dx)>VW/2+200||y<y0-VH*0.2?-9999:Math.round(cx+dx-w.w/2);
    if(x!==w.x){w.x=x;w.el.style.transform='translate3d('+x+'px,0,0)';}});
  /* the rail tick keeps time with how fast you scroll */
  if(ready&&y>y0&&!atEnd){acc+=Math.abs(sc-lastSc);const now=performance.now();if(acc>95&&now-lastClack>100){acc=0;lastClack=now;sfx.clack();}}
  if(atEnd&&!celebrated){celebrated=true;if(ready){petals();sfx.fanfare();hap([20,50,20,50,40]);}}
  lastSc=sc;lastLen=len;ready=true;
}
let raf=0;const onScroll=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;ride();});};
window.addEventListener('scroll',onScroll,{passive:true});

/* ---- the real clock: which stamps are truly earned, and where you are ---- */
let liveNext=0,inJourney=false;
function renderLive(){
  const n=nowMin(),t=n-state.delay,over=t>=T1;
  inJourney=t>=T0&&!over;liveNext=N;
  P.forEach((p,i)=>{const reached=over||t>=p.t;if(!reached&&liveNext===N)liveNext=i;
    stamps[i].el.classList.toggle('due',!reached);
    const txt=fmt(p.t+(over?0:state.delay));if(stamps[i].pmt.textContent!==txt)stamps[i].pmt.textContent=txt;});
  el.goto.hidden=!inJourney;el.tonow.hidden=!inJourney;
  if(inJourney){const pt=lenToPt(timeToLen(t));el.you.style.display='block';el.you.style.left=pt.x+'px';el.you.style.top=pt.y+'px';el.you.classList.toggle('flip',pt.x>L.W/2);el.youT.textContent='YOU · '+fmt(n);}
  else el.you.style.display='none';
  el.late.textContent=(state.delay<0?'−'+(-state.delay):state.delay)+' min';
}
function setDelay(v){state.delay=clamp(Math.round(v),-30,600);store.set('delay',state.delay);renderLive();}
$('late-minus').addEventListener('click',()=>setDelay(state.delay-5));
$('late-plus').addEventListener('click',()=>setDelay(state.delay+5));
const toNow=()=>goLen(timeToLen(nowMin()-state.delay),true);
el.goto.addEventListener('click',toNow);el.tonow.addEventListener('click',toNow);
$('ride').addEventListener('click',()=>{sfx.horn();goLen(L.nodeLen[0]+40,true);});
setInterval(renderLive,15000);

/* ---- replay: the page rides itself ---- */
const rp=$('replay');
function stopReplay(){if(state.replay){cancelAnimationFrame(state.replay);state.replay=0;rp.textContent='Replay';}}
rp.addEventListener('click',()=>{
  if(state.replay){stopReplay();return;}
  const a=stageTop+L.ny[0]-VH*0.45-60,b=stageTop+L.ny[N-1]-VH*0.45+6,t0=performance.now(),total=RM?1:28000;
  rp.textContent='Stop';sfx.chime();celebrated=false;stamps.forEach(s=>{s.was=false;s.el.classList.remove('passed','slam');});window.scrollTo(0,a);
  const step=n=>{const f=Math.min(1,(n-t0)/total),e=f<0.5?2*f*f:1-Math.pow(-2*f+2,2)/2;window.scrollTo(0,a+(b-a)*(0.15*e+0.85*f));if(f<1)state.replay=requestAnimationFrame(step);else stopReplay();};
  state.replay=requestAnimationFrame(step);
});
['touchstart','wheel'].forEach(ev=>window.addEventListener(ev,e=>{if(state.replay&&!(e.target.closest&&e.target.closest('#replay')))stopReplay();},{passive:true}));

/* ---- flip a stamp into the back of a postcard ---- */
const flip=$('flip'),card=$('card3d'),back=$('flip-back');let openI=-1,from='';
function openCard(i){
  if(openI>=0)return;stopReplay();
  const p=P[i],lg=p._lg,sp=p.speciality,n=nowMin(),r=stamps[i].el.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight;
  const w=Math.min(vw-24,420),h=Math.min(vh-36,680),left=(vw-w)/2,top=Math.max(12,(vh-h)/2-6);
  const board=(p.board_langs||['en']).map(l=>l==='en'?'<div class="en">'+esc(p.name_en)+'</div>':(p.names&&p.names[l]?'<div lang="'+l+'"'+(l==='ur'?' dir="rtl"':'')+'>'+esc(p.names[l])+'</div>':'')).join('');
  const canMark=n>T0-60&&n<T1+600&&Math.abs(i-liveNext)<=1;
  back.style.setProperty('--ink',p.ink||'#23233a');
  back.innerHTML='<div class="top"><h2 id="sh-title">'+esc(p.name_en)+'</h2><button class="x" id="sh-close" type="button" aria-label="Close">✕</button></div>'+
    '<div class="corner"><img alt="" src="'+(p.has_art!==false?'art/'+esc(p.slug)+'.webp':'')+'"></div>'+
    '<p class="sch">'+(lg?(i===0?'Board '+fmt(p.td):i===N-1?'Arrive '+fmt(p.t):'Arr '+fmt(p.t)+' · Dep '+fmt(p.td)):'Passes about '+fmt(p.t)+' (estimate)')+'<br>'+dateOf(p.day)+'<br>'+p.kmo+' km from '+esc(short(P[0]))+'<br>'+esc([p.district,p.state].filter(Boolean).join(', '))+(p.elev_m!=null?'<br>'+p.elev_m+' m above sea level':'')+'</p>'+
    '<div class="sboard">'+board+(p.elev_m!=null?'<small>MSL '+p.elev_m+' m</small>':'')+'</div>'+
    (p.board_verified?'':'<p class="q">Board languages shown are the usual ones for this state.</p>')+
    (sp?'<h3>'+esc(sp.label)+(sp.osop?'<span class="tag">One Station One Product</span>':'')+'</h3><p>'+esc(sp.line)+'</p>':'')+
    (p.fact?'<p class="q">'+esc(p.fact)+'</p>':'')+
    '<label for="sh-note">Your line for this stamp</label><textarea id="sh-note" maxlength="140" placeholder="What you saw, ate or slept through">'+esc(state.notes[p.slug]||'')+'</textarea>'+
    '<div class="acts">'+(canMark?'<button class="btn" id="sh-here" type="button">I’m here now</button>':'')+'<span class="ok" id="sh-ok" role="status"></span></div>';
  $('sh-close').addEventListener('click',closeCard);
  $('sh-note').addEventListener('input',e=>{const v=e.target.value.trim();if(v)state.notes[p.slug]=v;else delete state.notes[p.slug];store.set('notes',state.notes);});
  if(canMark)$('sh-here').addEventListener('click',()=>{setDelay(nowMin()-p.t);$('sh-ok').textContent='Clock set: running '+(state.delay===0?'on time':Math.abs(state.delay)+' min '+(state.delay>0?'late':'early'));});
  card.style.left=left+'px';card.style.top=top+'px';card.style.width=w+'px';card.style.height=h+'px';
  const src=stamps[i].el,sw=src.offsetWidth,sh=src.offsetHeight,tilt=(getComputedStyle(src).getPropertyValue('--tilt')||'0deg').trim(),cl=src.cloneNode(true),front=$('flip-front');
  cl.classList.remove('open','slam');cl.removeAttribute('aria-label');cl.tabIndex=-1;
  cl.style.cssText='width:'+sw+'px;height:'+sh+'px;transform-origin:0 0;transform:scale('+(w/sw).toFixed(4)+','+(h/sh).toFixed(4)+');animation:none;pointer-events:none';
  front.innerHTML='';front.appendChild(cl);
  from='translate3d('+(r.left+r.width/2-left-w/2).toFixed(1)+'px,'+(r.top+r.height/2-top-h/2).toFixed(1)+'px,0) rotate('+tilt+') scale('+(sw/w).toFixed(4)+','+(sh/h).toFixed(4)+') rotateY(0deg)';
  card.style.transition='none';card.style.transform=from;
  flip.classList.add('on');flip.setAttribute('aria-hidden','false');stamps[i].el.classList.add('open');document.documentElement.classList.add('lock');
  void card.offsetWidth;card.style.transition='';
  requestAnimationFrame(()=>{flip.classList.add('show');card.style.transform='translate3d(0,0,0) rotate(0deg) scale(1,1) rotateY(180deg)';});hap(8);
  openI=i;back.scrollTop=0;sfx.flap();setTimeout(()=>{if(openI===i)back.focus({preventScroll:true});},RM?0:640);
}
function closeCard(){
  if(openI<0)return;const i=openI;openI=-1;
  flip.classList.remove('show');card.style.transform=from;
  setTimeout(()=>{flip.classList.remove('on');flip.setAttribute('aria-hidden','true');stamps[i].el.classList.remove('open');document.documentElement.classList.remove('lock');stamps[i].el.focus({preventScroll:true});},RM?0:600);
}
$('scrim').addEventListener('click',closeCard);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCard();});

/* ---- small delights ---- */
track.addEventListener('click',e=>{const tr=e.target.closest&&e.target.closest('#train-g');if(!tr)return;e.stopPropagation();sfx.horn();tr.classList.remove('toot');void tr.getBBox();tr.classList.add('toot');});
journey.addEventListener('click',e=>{
  const sun=e.target.closest('.sunny');
  if(sun){sun.classList.remove('burst');void sun.getBBox();sun.classList.add('burst');return;}
  if(RM||e.target.closest('.stamp,.nowbar,#train-g,button'))return;
  const r=stage.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let rays='';
  for(let k=0;k<8;k++)rays+='<line x1="0" y1="-7" x2="0" y2="-16" transform="rotate('+k*45+')"/>';
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('class','spark');s.setAttribute('viewBox','-20 -20 40 40');
  s.style.left=x+'px';s.style.top=y+'px';s.innerHTML='<g stroke="'+(y>L.dayY?'#d8452b':'#f6c81e')+'" stroke-width="2.4" stroke-linecap="round">'+rays+'</g>';
  stage.appendChild(s);setTimeout(()=>s.remove(),650);
});
if(!RM)setTimeout(function go(){
  const g=track.querySelector('#shootg'),s=track.querySelector('#shoot');
  if(g&&s&&!document.hidden){const y=window.scrollY-stageTop+90+Math.random()*VH*0.45;
    if(y>40&&y<L.nightEnd-120){g.setAttribute('transform','translate('+(Math.random()*L.W*0.5).toFixed(0)+' '+y.toFixed(0)+') rotate(22)');s.classList.remove('go');void s.getBBox();s.classList.add('go');}}
  setTimeout(go,4500+Math.random()*5500);
},2500);
const snd=$('snd'),paintSnd=()=>{snd.setAttribute('aria-pressed',String(soundOn));snd.textContent='Sound';snd.setAttribute('aria-label',soundOn?'Music and sound on':'Music and sound off');};
snd.addEventListener('click',()=>{soundOn=!soundOn;store.set('snd3',soundOn);paintSnd();
  if(soundOn){unlock();setTimeout(()=>sfx.chime(),120);setTimeout(()=>toast(AC&&AC.state==='running'?'Sound on. If you hear nothing, turn up media volume and switch off silent mode.':'This viewer is blocking sound. Try opening the page in your browser.'),700);}
  else{stopMusic();if(keep){try{keep.pause();}catch(e){}keep=null;}toast('Sound off');}});
paintSnd();
if('IntersectionObserver' in window){
  const once=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('seen');once.unobserve(e.target);
    if(e.target.id==='postcard')[].forEach.call(e.target.querySelectorAll('.stats b'),b=>countUp(b,0));}}),{threshold:0.25});
  ['profile','postcard'].forEach(id=>once.observe($(id)));
}

/* ---- charts, postcard, sources ---- */
(function(){
  const X=k=>34+k/TOTAL*352,pts=P.filter(p=>p.elev_m!=null);
  if(pts.length>1){
    const max=Math.max.apply(null,pts.map(p=>p.elev_m)),top=Math.ceil(max/100)*100,Yv=v=>122-v/top*100;
    const hi=pts.reduce((a,b)=>b.elev_m>a.elev_m?b:a),lo=pts.reduce((a,b)=>b.elev_m<a.elev_m?b:a);
    const line=pts.map(p=>X(p.kmo).toFixed(1)+','+Yv(p.elev_m).toFixed(1)).join(' ');
    const lab=(p,dy)=>'<text class="hi" x="'+clamp(X(p.kmo),52,348).toFixed(1)+'" y="'+(Yv(p.elev_m)+dy).toFixed(1)+'" text-anchor="middle">'+esc(short(p))+' '+p.elev_m+' m</text>';
    $('ch-elev').innerHTML='<line x1="34" y1="122" x2="386" y2="122" stroke="#343846"/><line x1="34" y1="22" x2="386" y2="22" stroke="#343846" stroke-dasharray="2 4"/>'+
      '<text x="30" y="126" text-anchor="end">0</text><text x="30" y="26" text-anchor="end">'+top+'</text>'+
      '<polygon points="'+X(pts[0].kmo)+',122 '+line+' '+X(pts[pts.length-1].kmo)+',122" fill="#f6c81e" opacity=".12"/>'+
      '<polyline pathLength="1" points="'+line+'" fill="none" stroke="#f6c81e" stroke-width="2"/>'+
      pts.map(p=>'<circle cx="'+X(p.kmo).toFixed(1)+'" cy="'+Yv(p.elev_m).toFixed(1)+'" r="'+(p===hi||p===lo?4:2.5)+'" fill="#f6c81e"/>').join('')+lab(hi,-9)+lab(lo,17)+
      '<text x="34" y="144">'+esc(P[0].code||short(P[0]))+'</text><text x="386" y="144" text-anchor="end">'+esc(last.code||short(last))+' · '+TOTAL+' km</text>';
    $('elev-note').textContent='Highest: '+short(hi)+', '+hi.elev_m+' m. Lowest: '+short(lo)+', '+lo.elev_m+' m.';
  }
  const Hs=P.filter(p=>p._lg),secs=[];
  for(let i=0;i<Hs.length-1;i++)secs.push({a:Hs[i],b:Hs[i+1],v:(Hs[i+1].km-Hs[i].km)/((Hs[i+1].t-Hs[i].td)/60)});
  if(secs.length){
    const top=Math.ceil(Math.max.apply(null,secs.map(s=>s.v))/20)*20,slot=352/secs.length,best=secs.reduce((a,b)=>b.v>a.v?b:a);
    $('ch-spd').innerHTML='<line x1="34" y1="118" x2="386" y2="118" stroke="#343846"/>'+secs.map((s,i)=>{
      const h=s.v/top*92,x=34+i*slot+slot*0.18,w=slot*0.64;
      return '<rect x="'+x.toFixed(1)+'" y="'+(118-h).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" style="animation-delay:'+i*90+'ms" fill="'+(s===best?'#d8452b':'#f6c81e')+'"/>'+
        '<text class="hi" x="'+(x+w/2).toFixed(1)+'" y="'+(112-h).toFixed(1)+'" text-anchor="middle">'+Math.round(s.v)+'</text>'+
        '<text x="'+(x+w/2).toFixed(1)+'" y="134" text-anchor="middle">'+esc((s.a.code||'')+'–'+(s.b.code||''))+'</text>';
    }).join('')+'<text x="34" y="148">km/h, average including slowdowns</text>';
    $('spd-note').textContent='Fastest stretch: '+short(best.a)+' to '+short(best.b)+', '+Math.round(best.v)+' km/h on average.';
  }
  $('pc-k').textContent=R.train.number+' · '+dates.toUpperCase()+' · '+N+' STAMPS';
  $('pc-title').textContent=short(P[0])+' → '+short(last);
  $('pc-grid').innerHTML=P.map((p,i)=>'<div class="mini" style="animation-delay:'+i*45+'ms"><img alt="" loading="lazy" width="96" height="128" src="'+(p.has_art!==false?'art/'+esc(p.slug)+'.webp':'')+'"><span>'+esc(short(p))+'</span><i></i></div>').join('');
  const states=new Set(P.map(p=>p.state).filter(Boolean)).size,dark=R.sun&&R.sun.km_in_darkness;
  $('pc-stats').innerHTML=[[TOTAL.toLocaleString('en-IN'),'km'],[Math.floor(DUR/60)+'h '+String(DUR%60).padStart(2,'0'),'on the train'],[states,'states'],dark!=null?[dark,'km in the dark']:[(R.rivers||[]).length,'rivers']].map(s=>'<div><b>'+esc(s[0])+'</b><span>'+esc(s[1])+'</span></div>').join('');
  const urls=[];[P,R.rivers||[],R.borders||[]].forEach(list=>list.forEach(o=>(o.src||[]).forEach(u=>{if(urls.indexOf(u)<0)urls.push(u);})));
  const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return u;}};
  $('src-body').innerHTML=(R.notes||[]).map(n=>'<p>'+esc(n)+'</p>').join('')+'<ul>'+urls.map(u=>'<li><a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(host(u))+esc(decodeURIComponent(u.replace(/^https?:\/\/[^/]+/,'')).replace(/_/g,' ').slice(0,60))+'</a></li>').join('')+'</ul>';
})();

function relayout(){layout();lastLen=-1;ride();renderLive();}
relayout();
let rz=0;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(relayout,150);});
window.addEventListener('load',()=>{stageTop=stage.getBoundingClientRect().top+window.scrollY;ride();});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(relayout);
})();
