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
    const pdi=100*P/T, mdi=100*M/T, s=pdi+mdi;
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
  const line=lines.at(-1), signal=ema(lines,9);
  return {line,signal,histogram:line-signal};
}

function parse(raw){
  return raw.map(x=>({
    open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]
  }));
}

function roundPrice(x){
  if(x>=1000) return +x.toFixed(2);
  if(x>=1) return +x.toFixed(4);
  if(x>=.01) return +x.toFixed(6);
  return +x.toFixed(8);
}

function structure(c){
  const x=c.slice(-8);
  if(x.length<8) return {bull:false,bear:false};
  return {
    bull:x.at(-1).high>x.at(-4).high && x.at(-1).low>x.at(-4).low,
    bear:x.at(-1).high<x.at(-4).high && x.at(-1).low<x.at(-4).low
  };
}

function isChoppy(c){
  const x=c.slice(-24);
  if(x.length<24) return false;
  let changes=0,prev=0;
  for(let i=1;i<x.length;i++){
    const d=Math.sign(x[i].close-x[i-1].close);
    if(d&&prev&&d!==prev) changes++;
    if(d) prev=d;
  }
  return changes/22>.64;
}

function diagnostic(status, value=null, detail=""){
  return {status,value,detail};
}

export async function buildSignal(symbol){
  const [a,b]=await Promise.all([
    fetch(`${BASE}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=15m&limit=250`),
    fetch(`${BASE}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=250`)
  ]);
  if(!a.ok||!b.ok) throw new Error("Binance Futures candle data unavailable.");

  const [raw15,raw1h]=await Promise.all([a.json(),b.json()]);
  const c15=parse(raw15).slice(0,-1);
  const c1h=parse(raw1h).slice(0,-1);
  if(c15.length<210||c1h.length<210) throw new Error("Not enough candle history.");

  // Live price is used only for entry-timing protection.
  // The existing indicator/scoring engine still uses closed candles.
  const tickerResponse = await fetch(
    `${BASE}/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`
  );
  if(!tickerResponse.ok) throw new Error("Binance Futures live price unavailable.");
  const ticker = await tickerResponse.json();
  const livePrice = Number(ticker?.price);
  if(!Number.isFinite(livePrice) || livePrice<=0)
    throw new Error("Binance Futures live price unavailable.");

  const v=c15.map(x=>x.close), h=c1h.map(x=>x.close);
  const price=v.at(-1);

  const e20=ema(v,20),e50=ema(v,50),e200=ema(v,200);
  const h20=ema(h,20),h50=ema(h,50),h200=ema(h,200);
  const R=rsi(v), A=atr(c15), D=adx(c15), M=macd(v), S=structure(c15);

  const volumeAvg=avg(c15.slice(-21,-1).map(x=>x.volume));
  const volumeRatio=volumeAvg?c15.at(-1).volume/volumeAvg:1;

  const last=c15.at(-1);
  const range=Math.max(last.high-last.low,Number.EPSILON);
  const body=Math.abs(last.close-last.open);
  const closePos=(last.close-last.low)/range;
  const bullCandle=body/range>=.45&&closePos>=.65;
  const bearCandle=body/range>=.45&&closePos<=.35;

  const move4h=((price-v.at(-17))/v.at(-17))*100;
  const atrPct=A&&price?A/price*100:0;
  const extensionLimit=Math.max(5,Math.min(9,atrPct*7));
  const extensionPct=+Math.abs(move4h).toFixed(2);
  const choppy=isChoppy(c15);

  const hBull=price>h20&&h20>h50&&h50>h200;
  const hBear=price<h20&&h20<h50&&h50<h200;
  const tBull=price>e20&&e20>e50&&e50>e200;
  const tBear=price<e20&&e20<e50&&e50<e200;

  const touched=c15.slice(-7,-1).some(
    x=>x.low<=e20+Math.max(range*.8,price*.0015)&&
       x.high>=e20-Math.max(range*.8,price*.0015)
  );

  const buy=[],sell=[];
  if(hBull) buy.push(["1H trend",18]); else if(hBear) sell.push(["1H trend",18]);
  if(tBull) buy.push(["15M trend",16]); else if(tBear) sell.push(["15M trend",16]);

  if(R>=50&&R<=68) buy.push(["RSI strong",10]);
  else if(R>68&&R<=70) buy.push(["RSI acceptable",5]);
  else if(R>=30&&R<50) sell.push(["RSI strong",10]);
  else if(R>=28&&R<30) sell.push(["RSI acceptable",5]);

  if(M?.histogram>0&&M.line>M.signal) buy.push(["MACD",11]);
  else if(M?.histogram<0&&M.line<M.signal) sell.push(["MACD",11]);

  if(D>=30){buy.push(["ADX strong",7]);sell.push(["ADX strong",7]);}
  else if(D>=25){buy.push(["ADX tradable",5]);sell.push(["ADX tradable",5]);}

  if(volumeRatio>=1.25){buy.push(["Volume confirmed",6]);sell.push(["Volume confirmed",6]);}
  else if(volumeRatio>=1){buy.push(["Volume normal",2]);sell.push(["Volume normal",2]);}

  if(S.bull) buy.push(["Structure",7]);
  if(S.bear) sell.push(["Structure",7]);

  if(bullCandle) buy.push(["Candle close",5]);
  if(bearCandle) sell.push(["Candle close",5]);

  if(touched&&last.close>last.open&&last.close>e20) buy.push(["Pullback",6]);
  if(touched&&last.close<last.open&&last.close<e20) sell.push(["Pullback",6]);

  const buyScore=buy.reduce((a,x)=>a+x[1],0);
  const sellScore=sell.reduce((a,x)=>a+x[1],0);
  const edge=Math.abs(buyScore-sellScore);
  const best=Math.max(buyScore,sellScore);

  // V12: confidence is calibrated to the actual score + directional edge.
  // This avoids making the confidence gate stricter than the score gate.
  const confidence=Math.max(
    0,Math.min(100,Math.round(best*.88+Math.min(edge,20)*.4))
  );

  const trend=hBull?"BULLISH":hBear?"BEARISH":
    buyScore>sellScore?"BULLISH":sellScore>buyScore?"BEARISH":"NEUTRAL";

  const buyReasons=[];
  const sellReasons=[];

  if(!hBull) buyReasons.push("1H trend not aligned");
  if(!hBear) sellReasons.push("1H trend not aligned");
  if(!tBull) buyReasons.push("15M trend not aligned");
  if(!tBear) sellReasons.push("15M trend not aligned");
  if(R>70) buyReasons.push("RSI too high for BUY");
  if(R<30) sellReasons.push("RSI too low for SELL");
  if(D<30){buyReasons.push("ADX below 30");sellReasons.push("ADX below 30");}
  if(volumeRatio<1){buyReasons.push("Volume below 1.00x");sellReasons.push("Volume below 1.00x");}
  if(!S.bull) buyReasons.push("Bullish structure not confirmed");
  if(!S.bear) sellReasons.push("Bearish structure not confirmed");
  if(!(bullCandle||touched)) buyReasons.push("Candle/pullback confirmation missing");
  if(!(bearCandle||touched)) sellReasons.push("Candle/pullback confirmation missing");
  if(choppy){buyReasons.push("Choppy market");sellReasons.push("Choppy market");}
  if(move4h>extensionLimit) buyReasons.push("BUY move extended");
  if(move4h<-extensionLimit) sellReasons.push("SELL move extended");
  if(edge<10){buyReasons.push("Directional edge too small");sellReasons.push("Directional edge too small");}

  // V12 BALANCED QUALITY GATE
  // Keep the indicator/scoring structure unchanged.
  // The gate is relaxed only enough to expose genuine high-quality setups.
  const buyQuality =
    hBull &&
    tBull &&
    M?.histogram > 0 &&
    M.line > M.signal &&
    D >= 25 &&
    edge >= 10 &&
    buyScore >= 72 &&
    confidence >= 70 &&
    volumeRatio >= 0.80 &&
    R >= 50 &&
    R <= 68 &&
    S.bull &&
    (bullCandle || touched) &&
    !choppy &&
    move4h <= extensionLimit;

  const sellQuality =
    hBear &&
    tBear &&
    M?.histogram < 0 &&
    M.line < M.signal &&
    D >= 25 &&
    edge >= 10 &&
    sellScore >= 72 &&
    confidence >= 70 &&
    volumeRatio >= 0.80 &&
    R >= 32 &&
    R <= 50 &&
    S.bear &&
    (bearCandle || touched) &&
    !choppy &&
    move4h >= -extensionLimit;

  const buyGate = buyQuality;
  const sellGate = sellQuality;

  // V12 GATE AUDIT
  // Explain exactly why a BUY/SELL candidate is blocked.
  // This is diagnostic-only: it does not change the signal decision.
  const buyAuditChecks = [
    ["1H trend", hBull],
    ["15M trend", tBull],
    ["MACD bullish", M?.histogram > 0 && M.line > M.signal],
    ["ADX >= 25", D >= 25],
    ["Directional edge >= 10", edge >= 10],
    ["BUY score >= 72", buyScore >= 72],
    ["Confidence >= 70", confidence >= 70],
    ["Volume >= 0.80x", volumeRatio >= 0.8],
    ["RSI 50-68", R >= 50 && R <= 68],
    ["Bullish structure", S.bull],
    ["Candle or EMA20 pullback", bullCandle || touched],
    ["Not choppy", !choppy],
    ["4H move within limit", move4h <= extensionLimit]
  ];

  const sellAuditChecks = [
    ["1H trend", hBear],
    ["15M trend", tBear],
    ["MACD bearish", M?.histogram < 0 && M.line < M.signal],
    ["ADX >= 25", D >= 25],
    ["Directional edge >= 10", edge >= 10],
    ["SELL score >= 72", sellScore >= 72],
    ["Confidence >= 70", confidence >= 70],
    ["Volume >= 0.80x", volumeRatio >= 0.8],
    ["RSI 32-50", R >= 32 && R <= 50],
    ["Bearish structure", S.bear],
    ["Candle or EMA20 pullback", bearCandle || touched],
    ["Not choppy", !choppy],
    ["4H move within limit", move4h >= -extensionLimit]
  ];

  const makeGateAudit = (checks, score) => ({
    passed: checks.filter(x=>x[1]).map(x=>x[0]),
    failed: checks.filter(x=>!x[1]).map(x=>x[0]),
    passedCount: checks.filter(x=>x[1]).length,
    totalCount: checks.length,
    score,
    scoreGap: Math.max(0, 74-score),
    ready: checks.every(x=>x[1])
  });

  const gateAudit = {
    BUY: makeGateAudit(buyAuditChecks, buyScore),
    SELL: makeGateAudit(sellAuditChecks, sellScore),
    nearestSide: buyScore >= sellScore ? "BUY" : "SELL"
  };

  const rawSide=buyGate?"BUY":sellGate?"SELL":"WAIT";

  // ENTRY TIMING PROTECTION
  // A valid setup can become too extended before the user sees it.
  // Do not chase it. The strategy/gates above remain unchanged; this is a
  // separate execution-safety gate based on live price vs the latest closed candle.
  const entryTolerance = Math.max((A || price*.002) * 0.60, price*0.0015);
  const buyEntryMax = price + entryTolerance;
  const buyEntryMin = price - entryTolerance*0.50;
  const sellEntryMin = price - entryTolerance;
  const sellEntryMax = price + entryTolerance*0.50;

  const buyEntryValid =
    livePrice >= buyEntryMin && livePrice <= buyEntryMax;
  const sellEntryValid =
    livePrice >= sellEntryMin && livePrice <= sellEntryMax;

  const entryStatus =
    rawSide === "BUY"
      ? (buyEntryValid ? "VALID" : "MISSED")
      : rawSide === "SELL"
        ? (sellEntryValid ? "VALID" : "MISSED")
        : "WAIT";

  const side =
    rawSide === "BUY" && buyEntryValid ? "BUY" :
    rawSide === "SELL" && sellEntryValid ? "SELL" :
    "WAIT";

  if(rawSide === "BUY" && !buyEntryValid)
    buyReasons.unshift("Entry missed — price moved outside the BUY entry zone");
  if(rawSide === "SELL" && !sellEntryValid)
    sellReasons.unshift("Entry missed — price moved outside the SELL entry zone");

  const risk=Math.max((A||livePrice*.002)*1.2,livePrice*.002);
  const reward=risk*1.6;

  const entry=side==="BUY"||side==="SELL"?roundPrice(livePrice):null;
  const sl=side==="BUY"?roundPrice(livePrice-risk):side==="SELL"?roundPrice(livePrice+risk):null;
  const tp=side==="BUY"?roundPrice(livePrice+reward):side==="SELL"?roundPrice(livePrice-reward):null;

  // IMPORTANT: every diagnostic value below is calculated from the SAME
  // variables used by the final gate. UI must display this object directly.
  const diagnostics={
    "1H Trend":diagnostic(hBull||hBear?"PASS":"FAIL",hBull?"BULLISH":hBear?"BEARISH":"NEUTRAL"),
    "15M Trend":diagnostic(tBull||tBear?"PASS":"FAIL",tBull?"BULLISH":tBear?"BEARISH":"NEUTRAL"),
    "RSI":diagnostic(
      side==="BUY"
        ? (R>=50&&R<=68?"PASS":"FAIL")
        : side==="SELL"
          ? (R>=32&&R<=50?"PASS":"FAIL")
          : (R>=32&&R<=68?"PASS":"CHECK"),
      +R.toFixed(1),
      side==="BUY"
        ? (R>=50&&R<=68?"BUY quality zone":"BUY RSI quality failed")
        : side==="SELL"
          ? (R>=32&&R<=50?"SELL quality zone":"SELL RSI quality failed")
          : (R>70?"Overbought":R<30?"Oversold":"Waiting for direction")
    ),
    "MACD":diagnostic(
      side==="BUY"
        ? (M?.histogram>0&&M.line>M.signal?"PASS":"FAIL")
        : side==="SELL"
          ? (M?.histogram<0&&M.line<M.signal?"PASS":"FAIL")
          : ((M?.histogram>0&&M.line>M.signal)||(M?.histogram<0&&M.line<M.signal)?"CHECK":"FAIL"),
      M?.histogram!=null?+M.histogram.toFixed(8):null,
      side==="BUY"?"Bullish confirmation":side==="SELL"?"Bearish confirmation":"Directional confirmation required"
    ),
    "ADX":diagnostic(D>=30?"PASS":"FAIL",+D.toFixed(1),D>=30?"Strong":"Below quality threshold"),
    "Volume":diagnostic(
      volumeRatio>=1?"PASS":"FAIL",
      +volumeRatio.toFixed(2),
      `${volumeRatio.toFixed(2)}x average`
    ),
    "Structure":diagnostic(S.bull||S.bear?"PASS":"FAIL",S.bull?"BULLISH":S.bear?"BEARISH":"UNCLEAR"),
    "Candle":diagnostic(bullCandle||bearCandle?"PASS":"CHECK",bullCandle?"BULLISH":bearCandle?"BEARISH":"NEUTRAL"),
    "Pullback":diagnostic(touched?"PASS":"CHECK",touched?"EMA20 retest":"No recent EMA20 retest"),
    "Extension":diagnostic(
      Math.abs(move4h)<=extensionLimit?"PASS":"FAIL",
      extensionPct,
      `Limit ${extensionLimit.toFixed(2)}%`
    ),
    "Entry Timing":diagnostic(
      rawSide==="WAIT" ? "CHECK" : entryStatus==="VALID" ? "PASS" : "FAIL",
      +livePrice.toFixed(8),
      rawSide==="WAIT"
        ? "No trade setup"
        : entryStatus==="VALID"
          ? "Entry still valid"
          : "Entry zone missed — do not chase"
    )
  };

  const blockers=
    rawSide==="BUY"?buyReasons:
    rawSide==="SELL"?sellReasons:
    (buyScore>=sellScore?buyReasons:sellReasons);

  return {
    symbol, timeframe:"15M", higherTimeframe:"1H",
    side, signal:side, rawSide,
    entryStatus, livePrice:roundPrice(livePrice),
    entryZone: {
      min: roundPrice(rawSide==="SELL" ? sellEntryMin : buyEntryMin),
      max: roundPrice(rawSide==="SELL" ? sellEntryMax : buyEntryMax)
    },
    trend, strength:side==="WAIT"?"WAIT":"HIGH",
    score:Math.max(buyScore,sellScore),
    confidence,
    marketQuality:Math.max(0,Math.min(100,Math.round(
      best*0.85 + Math.min(edge,25)*0.6
    ))),
    entry, sl, tp,
    expectedMove:side==="WAIT"?0:+((reward/price)*100*(side==="SELL"?-1:1)).toFixed(2),
    rsi:+R.toFixed(1),
    adx:+D.toFixed(1),
    volumeRatio:+volumeRatio.toFixed(2),
    diagnostics,
    gateAudit,
    confirmations:(side==="BUY"?buy:sell).map(x=>x[0]),
    blockers:[...new Set(blockers)].slice(0,8),
    reason: entryStatus==="MISSED"
      ? (rawSide==="BUY"
          ? "Entry missed — price moved above the BUY entry zone. Do not chase."
          : "Entry missed — price moved below the SELL entry zone. Do not chase.")
      : [...new Set(blockers)].slice(0,5).join(" • ") ||
        (side==="WAIT"?"Quality gate not satisfied.":"Confirmed")
  };
}

export default async function handler(req,res){
  // A signal is time-sensitive. Never serve a cached/stale decision.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  const symbol=String(req.query.symbol||"").trim().toUpperCase();

  if(!/^[A-Z0-9]{5,20}$/.test(symbol))
    return res.status(400).json({error:"Enter a valid Binance Futures symbol."});

  try{
    const r=await fetch(`${BASE}/fapi/v1/exchangeInfo`);
    if(!r.ok) throw new Error("Binance Futures exchange info unavailable.");
    const info=await r.json();

    const ok=info.symbols.some(s=>
      s.symbol===symbol &&
      s.status==="TRADING" &&
      s.quoteAsset==="USDT"
    );

    if(!ok)
      return res.status(404).json({
        error:`${symbol} is not an active Binance USDT Futures symbol.`
      });

    return res.status(200).json(await buildSignal(symbol));
  }catch(e){
    console.error("SignalX V12 Gate Audit",e);
    return res.status(500).json({error:e.message||"Signal generation failed."});
  }
}
