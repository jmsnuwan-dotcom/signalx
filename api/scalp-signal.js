const BASE = "https://fapi.binance.com";

const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;

function ema(v,p){
  if(v.length<p) return null;
  const k=2/(p+1);
  let e=v.slice(0,p).reduce((a,b)=>a+b,0)/p;
  for(let i=p;i<v.length;i++) e=v[i]*k+e*(1-k);
  return e;
}

function rsi(v,p=14){
  if(v.length<=p) return null;
  let g=0,l=0;
  for(let i=v.length-p;i<v.length;i++){
    const d=v[i]-v[i-1];
    if(d>0) g+=d; else l-=d;
  }
  return l===0 ? 100 : 100-100/(1+g/l);
}

function atr(c,p=14){
  if(c.length<p+1) return null;
  const tr=[];
  for(let i=1;i<c.length;i++){
    const x=c[i],q=c[i-1];
    tr.push(Math.max(x.high-x.low,Math.abs(x.high-q.close),Math.abs(x.low-q.close)));
  }
  return avg(tr.slice(-p));
}

function adx(c,p=14){
  if(c.length<p*2+1) return null;
  const tr=[],po=[],mi=[];
  for(let i=1;i<c.length;i++){
    const x=c[i],q=c[i-1];
    tr.push(Math.max(x.high-x.low,Math.abs(x.high-q.close),Math.abs(x.low-q.close)));
    const up=x.high-q.high,down=q.low-x.low;
    po.push(up>down&&up>0?up:0);
    mi.push(down>up&&down>0?down:0);
  }
  const dx=[];
  for(let i=p;i<=tr.length;i++){
    const T=avg(tr.slice(i-p,i))*p;
    const P=avg(po.slice(i-p,i))*p;
    const M=avg(mi.slice(i-p,i))*p;
    if(!T) continue;
    const pdi=100*P/T,mdi=100*M/T,s=pdi+mdi;
    dx.push(s?100*Math.abs(pdi-mdi)/s:0);
  }
  return dx.length>=p ? avg(dx.slice(-p)) : null;
}

function macd(v){
  if(v.length<40) return null;
  const lines=[];
  for(let i=26;i<=v.length;i++){
    const s=v.slice(0,i);
    lines.push(ema(s,12)-ema(s,26));
  }
  const line=lines.at(-1),signal=ema(lines,9);
  return {line,signal,histogram:line-signal};
}

function parse(raw){
  return raw.map(x=>({open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));
}

function roundPrice(x){
  if(x>=1000) return +x.toFixed(2);
  if(x>=1) return +x.toFixed(4);
  if(x>=.01) return +x.toFixed(6);
  return +x.toFixed(8);
}

function structure(c,n=12){
  const x=c.slice(-n);
  if(x.length<n) return {bull:false,bear:false};
  const a=x.slice(0,Math.floor(n/2)),b=x.slice(Math.floor(n/2));
  const ah=Math.max(...a.map(z=>z.high)),al=Math.min(...a.map(z=>z.low));
  const bh=Math.max(...b.map(z=>z.high)),bl=Math.min(...b.map(z=>z.low));
  return {bull:bh>ah&&bl>al,bear:bh<ah&&bl<al};
}

function trend(c){
  const v=c.map(x=>x.close), p=v.at(-1);
  const e9=ema(v,9),e21=ema(v,21),e50=ema(v,50);
  if(p>e9&&e9>e21&&e21>e50) return "BULLISH";
  if(p<e9&&e9<e21&&e21<e50) return "BEARISH";
  return "NEUTRAL";
}

function momentumSlope(v,p=5){
  if(v.length<p+1) return 0;
  return v.at(-1)-v.at(-1-p);
}

function candleQuality(last){
  const range=Math.max(last.high-last.low,Number.EPSILON);
  const body=Math.abs(last.close-last.open);
  const pos=(last.close-last.low)/range;
  return {
    bull:body/range>=.55&&pos>=.72,
    bear:body/range>=.55&&pos<=.28,
    bodyRatio:body/range,
    closePos:pos,
    range
  };
}

function isChoppy(c){
  const x=c.slice(-20);
  if(x.length<20) return false;
  let changes=0,prev=0;
  for(let i=1;i<x.length;i++){
    const d=Math.sign(x[i].close-x[i-1].close);
    if(d&&prev&&d!==prev) changes++;
    if(d) prev=d;
  }
  return changes/18>.67;
}

function vwap(c,n=60){
  const x=c.slice(-n);
  let pv=0,vol=0;
  for(const z of x){
    const typical=(z.high+z.low+z.close)/3;
    pv+=typical*z.volume; vol+=z.volume;
  }
  return vol?pv/vol:null;
}

function analyzeTF(c){
  const v=c.map(x=>x.close), p=v.at(-1);
  const A=atr(c),D=adx(c),M=macd(v),R=rsi(v);
  const e9=ema(v,9),e21=ema(v,21),e50=ema(v,50);
  const S=structure(c), C=candleQuality(c.at(-1));
  const volAvg=avg(c.slice(-21,-1).map(x=>x.volume));
  const vr=volAvg?c.at(-1).volume/volAvg:1;
  return {price:p,atr:A,adx:D,macd:M,rsi:R,e9,e21,e50,structure:S,candle:C,volumeRatio:vr,vwap:vwap(c),slope:momentumSlope(v)};
}

async function fetchKlines(symbol,interval,limit=180){
  const r=await fetch(`${BASE}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`);
  if(!r.ok) throw new Error(`Binance Futures ${interval} candle data unavailable.`);
  const raw=await r.json();
  return parse(raw).slice(0,-1);
}

async function livePrice(symbol){
  const r=await fetch(`${BASE}/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`);
  if(!r.ok) throw new Error("Binance Futures live price unavailable.");
  const j=await r.json();
  return +j.price;
}

export async function buildScalpSignal(symbol){
  const [c1,c3,c5,c15]=await Promise.all([
    fetchKlines(symbol,"1m",180),
    fetchKlines(symbol,"3m",180),
    fetchKlines(symbol,"5m",180),
    fetchKlines(symbol,"15m",180)
  ]);
  if(c1.length<120||c3.length<120||c5.length<120||c15.length<120) throw new Error("Not enough MTF candle history.");

  const a1=analyzeTF(c1),a3=analyzeTF(c3),a5=analyzeTF(c5),a15=analyzeTF(c15);
  const p=a1.price;

  const bull1=p>a1.e9&&a1.e9>a1.e21&&a1.e21>a1.e50;
  const bear1=p<a1.e9&&a1.e9<a1.e21&&a1.e21<a1.e50;
  const bull3=a3.price>a3.e9&&a3.e9>a3.e21&&a3.e21>a3.e50;
  const bear3=a3.price<a3.e9&&a3.e9<a3.e21&&a3.e21<a3.e50;
  const bull5=a5.price>a5.e9&&a5.e9>a5.e21&&a5.e21>a5.e50;
  const bear5=a5.price<a5.e9&&a5.e9<a5.e21&&a5.e21<a5.e50;
  const bull15=a15.price>a15.e21&&a15.e21>a15.e50;
  const bear15=a15.price<a15.e21&&a15.e21<a15.e50;

  const bullMTF=(bull1?1:0)+(bull3?1:0)+(bull5?1:0)+(bull15?1:0);
  const bearMTF=(bear1?1:0)+(bear3?1:0)+(bear5?1:0)+(bear15?1:0);

  const microBull=a1.macd?.histogram>0&&a1.macd.line>a1.macd.signal;
  const microBear=a1.macd?.histogram<0&&a1.macd.line<a1.macd.signal;
  const midBull=a3.macd?.histogram>0&&a3.macd.line>a3.macd.signal;
  const midBear=a3.macd?.histogram<0&&a3.macd.line<a3.macd.signal;

  const buy=[]; const sell=[];
  if(bull1) buy.push(["1M trend",12]); else if(bear1) sell.push(["1M trend",12]);
  if(bull3) buy.push(["3M trend",12]); else if(bear3) sell.push(["3M trend",12]);
  if(bull5) buy.push(["5M trend",14]); else if(bear5) sell.push(["5M trend",14]);
  if(bull15) buy.push(["15M context",8]); else if(bear15) sell.push(["15M context",8]);

  if(microBull) buy.push(["1M MACD",8]); else if(microBear) sell.push(["1M MACD",8]);
  if(midBull) buy.push(["3M MACD",7]); else if(midBear) sell.push(["3M MACD",7]);

  if(a1.rsi>=52&&a1.rsi<=68) buy.push(["1M RSI",8]);
  else if(a1.rsi>=32&&a1.rsi<=48) sell.push(["1M RSI",8]);

  if(a3.rsi>=50&&a3.rsi<=70) buy.push(["3M RSI",5]);
  else if(a3.rsi>=30&&a3.rsi<=50) sell.push(["3M RSI",5]);

  if(a1.adx>=25) { if(bull1) buy.push(["1M ADX",6]); if(bear1) sell.push(["1M ADX",6]); }
  if(a3.adx>=22) { if(bull3) buy.push(["3M ADX",5]); if(bear3) sell.push(["3M ADX",5]); }

  if(a1.volumeRatio>=1.20) { buy.push(["1M volume",5]); sell.push(["1M volume",5]); }
  else if(a1.volumeRatio>=0.90) { buy.push(["1M volume",2]); sell.push(["1M volume",2]); }

  if(a1.structure.bull) buy.push(["1M structure",5]);
  if(a1.structure.bear) sell.push(["1M structure",5]);

  if(a1.candle.bull) buy.push(["Entry candle",5]);
  if(a1.candle.bear) sell.push(["Entry candle",5]);

  const buyScore=buy.reduce((a,x)=>a+x[1],0), sellScore=sell.reduce((a,x)=>a+x[1],0);
  const edge=Math.abs(buyScore-sellScore), best=Math.max(buyScore,sellScore);

  const atrPct=a1.atr&&p?a1.atr/p*100:0;
  const recentMove=((p-c1.at(-6).close)/c1.at(-6).close)*100;
  const extension=Math.max(.35,Math.min(1.5,atrPct*2.2));
  const vwap1=a1.vwap;
  const vwapBull=p>=vwap1, vwapBear=p<=vwap1;
  const choppy=isChoppy(c1);

  const live=await livePrice(symbol);
  const liveDrift=((live-p)/p)*100;
  const entryBand=Math.max(atrPct*.45,.10);
  const liveEntryOk=Math.abs(live-p)<=p*entryBand/100;

  // Pullback/retest logic: avoid buying the top of a one-minute impulse.
  const nearE21=Math.abs(p-a1.e21)/p*100 <= Math.max(atrPct*.65,.12);
  const nearE9=Math.abs(p-a1.e9)/p*100 <= Math.max(atrPct*.45,.10);
  const buyPullback=nearE21||nearE9;
  const sellPullback=nearE21||nearE9;

  const buyQuality=
    bullMTF>=3 && bull1 && bull3 && bull5 &&
    microBull && midBull &&
    a1.adx>=25 && a3.adx>=22 &&
    edge>=12 && buyScore>=72 &&
    a1.rsi>=52 && a1.rsi<=68 &&
    a3.rsi>=48 && a3.rsi<=72 &&
    a1.volumeRatio>=.90 &&
    a1.structure.bull &&
    (a1.candle.bull||buyPullback) &&
    vwapBull &&
    recentMove<=extension &&
    !choppy &&
    liveEntryOk;

  const sellQuality=
    bearMTF>=3 && bear1 && bear3 && bear5 &&
    microBear && midBear &&
    a1.adx>=25 && a3.adx>=22 &&
    edge>=12 && sellScore>=72 &&
    a1.rsi>=32 && a1.rsi<=48 &&
    a3.rsi>=28 && a3.rsi<=52 &&
    a1.volumeRatio>=.90 &&
    a1.structure.bear &&
    (a1.candle.bear||sellPullback) &&
    vwapBear &&
    recentMove>=-extension &&
    !choppy &&
    liveEntryOk;

  const side=buyQuality?"BUY":sellQuality?"SELL":"WAIT";
  const confidence=Math.max(0,Math.min(100,Math.round(best*.86+Math.min(edge,25)*.55+Math.max(bullMTF,bearMTF)*2)));
  const trend=bullMTF>bearMTF?"BULLISH":bearMTF>bullMTF?"BEARISH":"NEUTRAL";

  const risk=Math.max((a1.atr||live*.0015)*1.35,live*.0012);
  const reward=risk*1.45;
  const entry=roundPrice(live);
  const sl=side==="BUY"?roundPrice(live-risk):side==="SELL"?roundPrice(live+risk):null;
  const tp=side==="BUY"?roundPrice(live+reward):side==="SELL"?roundPrice(live-reward):null;

  const blockers=[];
  if(Math.max(bullMTF,bearMTF)<3) blockers.push("MTF alignment < 3/4");
  if(!microBull&&!microBear) blockers.push("1M MACD not confirmed");
  if(!midBull&&!midBear) blockers.push("3M MACD not confirmed");
  if(a1.adx<25) blockers.push("1M ADX below 25");
  if(a3.adx<22) blockers.push("3M ADX below 22");
  if(edge<12) blockers.push("Directional edge too small");
  if(best<72) blockers.push("Score below 72");
  if(a1.volumeRatio<.90) blockers.push("1M volume weak");
  if(!(a1.structure.bull||a1.structure.bear)) blockers.push("1M structure unclear");
  if(!(a1.candle.bull||a1.candle.bear||nearE21||nearE9)) blockers.push("Entry/retest confirmation missing");
  if(!vwapBull&&!vwapBear) blockers.push("VWAP neutral");
  if(choppy) blockers.push("1M market choppy");
  if(side==="WAIT" && Math.abs(liveDrift)>entryBand) blockers.push("Entry moved — do not chase");
  if(side==="WAIT" && recentMove>extension) blockers.push("BUY impulse extended");
  if(side==="WAIT" && recentMove<-extension) blockers.push("SELL impulse extended");

  return {
    symbol,timeframe:"SCALP",higherTimeframes:["1M","3M","5M","15M"],side,signal:side,trend,
    strength:side==="WAIT"?"WAIT":"HIGH",score:best,confidence,marketQuality:Math.max(0,Math.min(100,Math.round(best*1.02))),
    entry,sl,tp,expectedMove:side==="WAIT"?0:+((reward/live)*100*(side==="SELL"?-1:1)).toFixed(2),
    livePrice:roundPrice(live),liveDrift:+liveDrift.toFixed(3),
    rsi:+a1.rsi.toFixed(1),adx:+a1.adx.toFixed(1),volumeRatio:+a1.volumeRatio.toFixed(2),
    mtf:{"1M":bull1?"BULLISH":bear1?"BEARISH":"NEUTRAL","3M":bull3?"BULLISH":bear3?"BEARISH":"NEUTRAL","5M":bull5?"BULLISH":bear5?"BEARISH":"NEUTRAL","15M":bull15?"BULLISH":bear15?"BEARISH":"NEUTRAL"},
    indicators:{"1M RSI":+a1.rsi.toFixed(1),"1M ADX":+a1.adx.toFixed(1),"1M Volume":+a1.volumeRatio.toFixed(2),"1M VWAP":roundPrice(a1.vwap),"1M ATR%":+atrPct.toFixed(3),"3M RSI":+a3.rsi.toFixed(1),"3M ADX":+a3.adx.toFixed(1)},
    diagnostics:{
      "MTF Alignment":{status:Math.max(bullMTF,bearMTF)>=3?"PASS":"FAIL",value:`${Math.max(bullMTF,bearMTF)}/4`,detail:"1M + 3M + 5M + 15M"},
      "1M Momentum":{status:(microBull||microBear)?"PASS":"FAIL",value:microBull?"BULLISH":microBear?"BEARISH":"NEUTRAL",detail:"MACD + EMA"},
      "3M Momentum":{status:(midBull||midBear)?"PASS":"FAIL",value:midBull?"BULLISH":midBear?"BEARISH":"NEUTRAL",detail:"MACD + EMA"},
      "1M RSI":{status:(a1.rsi>=32&&a1.rsi<=68)?"PASS":"FAIL",value:+a1.rsi.toFixed(1),detail:"Scalp zone"},
      "1M ADX":{status:a1.adx>=25?"PASS":"FAIL",value:+a1.adx.toFixed(1),detail:">=25"},
      "3M ADX":{status:a3.adx>=22?"PASS":"FAIL",value:+a3.adx.toFixed(1),detail:">=22"},
      "Volume":{status:a1.volumeRatio>=.9?"PASS":"WARN",value:+a1.volumeRatio.toFixed(2),detail:"1M vs 20-candle average"},
      "VWAP":{status:(vwapBull||vwapBear)?"PASS":"CHECK",value:vwapBull?"ABOVE":vwapBear?"BELOW":"NEUTRAL",detail:"1M VWAP"},
      "Structure":{status:(a1.structure.bull||a1.structure.bear)?"PASS":"FAIL",value:a1.structure.bull?"BULLISH":a1.structure.bear?"BEARISH":"UNCLEAR",detail:"Recent 1M swing structure"},
      "Entry Timing":{status:liveEntryOk?"PASS":"FAIL",value:`${liveDrift>=0?"+":""}${liveDrift.toFixed(3)}%`,detail:`Allowed ±${entryBand.toFixed(2)}%`},
      "Chop Filter":{status:!choppy?"PASS":"FAIL",value:choppy?"CHOPPY":"CLEAN",detail:"1M price action"}
    },
    confirmations:(side==="BUY"?buy:sell).map(x=>x[0]),
    blockers:[...new Set(blockers)].slice(0,8),
    reason:side==="WAIT"?[...new Set(blockers)].slice(0,5).join(" • ")||"Scalp quality gate not satisfied.":"MTF scalp confirmation passed."
  };
}

export default async function handler(req,res){
  const symbol=String(req.query.symbol||"").trim().toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({error:"Enter a valid Binance Futures symbol."});
  try{
    const r=await fetch(`${BASE}/fapi/v1/exchangeInfo`);
    if(!r.ok) throw new Error("Binance Futures exchange info unavailable.");
    const info=await r.json();
    const ok=info.symbols.some(s=>s.symbol===symbol&&s.status==="TRADING"&&s.quoteAsset==="USDT");
    if(!ok) return res.status(404).json({error:`${symbol} is not an active Binance USDT Futures symbol.`});
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json(await buildScalpSignal(symbol));
  }catch(e){
    console.error("SignalX SCALP",e);
    return res.status(500).json({error:e.message||"Scalp signal generation failed."});
  }
}
