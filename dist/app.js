'use strict';
const $=id=>document.getElementById(id);
const G=GameMath;
const money=n=>Math.trunc(n).toLocaleString('ja-JP');
const cents=n=>Math.round(n*100)/100;
let selectedUnit=GAME_CONFIG.drawingCostUnitLength;
let config={...GAME_CONFIG};
let coins=GAME_CONFIG.initialCoins, round=0, phase='ready', polygons=[], draft=[], history=[], latest=null;
let pointer=null, animationId=null, animationStart=0, dropPoint=null, settledQuote=null, currentMessage='';
const canvas=$('canvas'), ctx=canvas.getContext('2d');
let boardWidth=0, boardHeight=0, lastNet=null;
let pendingPurchase=null;
const screenDistance=(a,b)=>Math.hypot((a.x-b.x)*boardWidth,(a.y-b.y)*boardHeight);

function message(text,error=false){currentMessage=text;$('message').textContent=text;$('message').classList.toggle('error',error);}
function metrics(){
  const q=G.quote(polygons,config);
  const openLength=draft.reduce((sum,p,i)=>i?sum+G.segmentLength(draft[i-1],p,config.boardAspectRatio||1):sum,0);
  q.cost=Math.floor((q.length+openLength)/config.drawingCostUnitLength*config.drawingCostPerUnit+1e-9);
  return q;
}
function update(){
  const q=metrics(), has=q.area>0, drawing=phase==='drawing';
  $('balance').textContent=money(coins);
  $('shop-open').disabled=phase==='dropping' || pointer!==null;
  $('shop-open-bottom').disabled=phase==='dropping' || pointer!==null;
  $('area').innerHTML=`${has?(q.area*100).toFixed(1):'—'}<small>％</small>`;
  $('multiplier').innerHTML=`${has?q.multiplier.toFixed(2):'—'}<small>倍</small>`;
  $('cost').innerHTML=`${money(q.cost)}<small>coins</small>`;
  $('clear').disabled=!drawing || !polygons.length || pointer!==null;
  $('history-count').textContent=`落下履歴 ${history.length}`;
  $('board-hint').hidden=has || history.length>0 || phase==='dropping' || phase==='result';
  $('primary').disabled=phase==='dropping' || drawing && (!polygons.length || q.cost>coins || pointer!==null) || !drawing && phase!=='dropping' && coins<config.blind;
  if(drawing){
    $('primary').innerHTML=`抽選する <span>−${money(q.cost)} coins</span>`;
  }else{
    $('primary').innerHTML=coins<config.blind?'コイン不足で終了':`${phase==='ready'?'ラウンド開始':'次のラウンド'} <span>−${config.blind} coins</span>`;
  }
  $('profit-label').textContent='当選時の払戻';
  $('profit').innerHTML=has?`${money(phase==='dropping'||phase==='result'?settledQuote.payout:q.payout)}<small> coins</small>`:'—<small> coins</small>';
  if(phase==='ready') $('board-hint').querySelector('strong').textContent='開始して、好きな場所を囲む';
  else $('board-hint').querySelector('strong').textContent='好きな場所を囲む';
}
function drawPolygon(poly,preview=false){
  if(!poly.length)return;
  const near=preview && poly.length>=3 && screenDistance(poly[0],poly[poly.length-1])<=config.closureTolerancePx;
  // 終点だけを始点へ吸着表示。遠く離れた線を自動で閉じない。
  const visible=near?[...poly.slice(0,-1),poly[0]]:poly;
  ctx.beginPath();ctx.moveTo(poly[0].x*boardWidth,poly[0].y*boardHeight);
  for(let i=1;i<visible.length;i++)ctx.lineTo(visible[i].x*boardWidth,visible[i].y*boardHeight);
  if(!preview){ctx.closePath();ctx.fillStyle='rgba(64,128,255,.36)';ctx.fill();}
  ctx.strokeStyle=preview?'#6798fa':'#397af4';ctx.lineWidth=preview?1.5:1.8;ctx.setLineDash(preview?[4,3]:[]);ctx.stroke();ctx.setLineDash([]);
  if(preview){
    const start=poly[0];
    ctx.beginPath();ctx.arc(start.x*boardWidth,start.y*boardHeight,config.closureTolerancePx,0,Math.PI*2);
    ctx.fillStyle=near?'rgba(36,95,240,.2)':'rgba(36,95,240,.07)';ctx.fill();ctx.strokeStyle='#245ff0';ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();ctx.arc(start.x*boardWidth,start.y*boardHeight,3,0,Math.PI*2);ctx.fillStyle='#245ff0';ctx.fill();
  }
}
function ball(point,radius,alpha,shadow=false){
  const x=point.x*boardWidth,y=point.y*boardHeight;
  ctx.save();ctx.globalAlpha=alpha;
  if(shadow){ctx.shadowColor='#192a4350';ctx.shadowBlur=9;ctx.shadowOffsetY=3;}
  const grad=ctx.createRadialGradient(x-radius*.3,y-radius*.4,0,x,y,radius);
  grad.addColorStop(0,'#7d8ba0');grad.addColorStop(.4,'#34465f');grad.addColorStop(1,'#142238');
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,Math.max(.1,radius),0,Math.PI*2);ctx.fill();ctx.restore();
}
function render(t){
  ctx.clearRect(0,0,boardWidth,boardHeight);
  polygons.forEach(p=>drawPolygon(p));
  drawPolygon(draft,true);
  history.forEach((p,i)=>{
    if(p===latest && phase==='result')return;
    ball(p,4,.08+.15*(i+1)/Math.max(history.length,1));
  });
  if(latest && phase==='result')ball(latest,6,1,true);
  if(phase==='dropping' && dropPoint){
    const progress=Math.min(1,Math.max(0,(t-animationStart)/config.dropDuration));
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let radius=6;
    if(!reduced){
      if(progress<.72)radius=6+37*Math.pow(1-progress/.72,1.8);
      else radius=6+4*Math.sin((progress-.72)/.28*Math.PI);
    }
    // 足元の影と収縮で、着地点を変えずに「落下」を表す。
    ctx.save();ctx.globalAlpha=.15;ctx.fillStyle='#15263e';ctx.beginPath();ctx.ellipse(dropPoint.x*boardWidth,dropPoint.y*boardHeight+4,Math.max(4,radius*.65),Math.max(2,radius*.2),0,0,Math.PI*2);ctx.fill();ctx.restore();
    ball(dropPoint,radius,.4+.6*progress,true);
    if(progress<1)animationId=requestAnimationFrame(render);
    else settle();
  }
}
function resize(){
  const bounds=canvas.getBoundingClientRect();
  boardWidth=bounds.width;boardHeight=bounds.height;
  config.boardAspectRatio=boardHeight/boardWidth;
  const dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(boardWidth*dpr);canvas.height=Math.round(boardHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  if(phase!=='dropping')refresh();
}
new ResizeObserver(resize).observe(canvas);
function point(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
function refresh(){update();render(performance.now());}
canvas.addEventListener('pointerdown',e=>{
  if(phase!=='drawing' || pointer!==null || e.button!==0)return;
  if(polygons.length){message('囲めるのは一つです。変更する場合は「描き直す」を押してください');return;}
  const p=point(e);
  if(polygons.some(poly=>G.contains(poly,p))){message('青い領域の外から描き始めてください',true);return;}
  pointer=e.pointerId;draft=[p];canvas.setPointerCapture(pointer);message('一周描いて線を交差させるか、始点まで戻ってください');refresh();
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  const samples=e.getCoalescedEvents?.()||[];
  for(const sample of samples.length?samples:[e]){
    const p=point(sample);
    if(G.distance(draft[draft.length-1],p)>=.004 && draft.length<650){
      draft.push(p);
      const loop=G.closedLoop(draft);
      if(loop){complete(loop,e);return;}
    }
  }
  const p=point(e);
  message(draft.length>=3 && screenDistance(draft[0],p)<=config.closureTolerancePx?'始点につながりました。指を離して確定':'一周描いて線を交差させるか、始点まで戻ってください');
  refresh();
});
function finish(e){
  if(e.pointerId!==pointer)return;
  const p=point(e);
  if(G.distance(draft[draft.length-1],p)>.002)draft.push(p);
  const loop=G.closedLoop(draft);
  if(loop){complete(loop,e);return;}
  const closed=draft.length>=3 && screenDistance(draft[0],p)<=config.closureTolerancePx;
  // 吸着範囲内の終端を整理し、始点にぴったりつながる輪郭で判定する。
  if(closed)while(draft.length>3 && screenDistance(draft[0],draft[draft.length-1])<=config.closureTolerancePx)draft.pop();
  complete(draft,e,closed?null:'線が閉じていません。一周して線を交差させるか、始点まで戻ってください');
}
function complete(poly,e,initialError=null){
  const error=initialError||G.validate(poly,polygons,config);
  if(!error)polygons.push(poly);
  draft=[];pointer=null;
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  const q=G.quote(polygons,config);
  message(error || (q.cost>coins?'コストが残高を超えています。「描き直す」で輪郭を短くしてください':'抽選するか、「描き直す」で変更してください'),!!error || q.cost>coins);
  refresh();
}
canvas.addEventListener('pointerup',finish);
canvas.addEventListener('pointercancel',e=>{if(e.pointerId!==pointer)return;draft=[];pointer=null;message('描画を中断しました');refresh();});
canvas.addEventListener('lostpointercapture',()=>{if(pointer!==null){draft=[];pointer=null;refresh();}});
$('clear').onclick=()=>{if(phase!=='drawing' || pointer!==null)return;polygons=[];message('好きな場所に描き直してください。追加料金はかかりません');refresh();};
function uniform(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
function start(){
  if(coins<GAME_CONFIG.blind)return;
  config={...GAME_CONFIG,drawingCostUnitLength:selectedUnit,boardAspectRatio:boardHeight/boardWidth||1};
  lastNet=null;coins=cents(coins-config.blind);round++;polygons=[];draft=[];latest=null;dropPoint=null;phase='drawing';$('result').hidden=true;
  message(`ブラインド${config.blind}を支払いました。好きな場所を囲んでください`);refresh();
}
function drop(){
  const q=G.quote(polygons,config);
  if(!polygons.length || q.cost>coins || pointer!==null)return;
  coins=cents(coins-q.cost);settledQuote=q;phase='dropping';dropPoint={x:uniform(),y:uniform()};
  message('抽選中…');update();animationStart=performance.now();animationId=requestAnimationFrame(render);
}
function settle(){
  animationId=null;
  const hit=polygons.some(p=>G.contains(p,dropPoint));
  const payout=hit?settledQuote.payout:0;
  coins=cents(coins+payout);history.push(dropPoint);history=history.slice(-config.historyLimit);latest=dropPoint;phase='result';
  const net=cents(payout-config.blind-settledQuote.cost);lastNet=net;
  $('result').hidden=false;$('result').classList.toggle('win',hit);
  $('result').textContent=hit?'HIT! あたり':'MISS — はずれ';
  message(`このラウンド ${net>=0?'+':''}${money(net)} coins${coins<config.blind?' ／ コイン不足で終了':''}`);
  refresh();
}
$('primary').onclick=()=>{if(phase==='ready' || phase==='result')start();else if(phase==='drawing')drop();};
$('rules-toggle').onclick=()=>{$('rules').showModal();$('rules-toggle').setAttribute('aria-expanded','true');};
$('rules-close').onclick=()=>$('rules').close();
$('rules').addEventListener('close',()=>$('rules-toggle').setAttribute('aria-expanded','false'));
$('unit-length').value=String(selectedUnit);
$('unit-length').onchange=e=>{selectedUnit=Number(e.target.value);if(phase==='ready')config={...GAME_CONFIG,drawingCostUnitLength:selectedUnit,boardAspectRatio:boardHeight/boardWidth||1};};
$('reset').onclick=()=>{if(phase!=='dropping')$('reset-dialog').showModal();};
$('cancel-reset').onclick=()=>$('reset-dialog').close();
$('confirm-reset').onclick=()=>{
  if(animationId!==null)cancelAnimationFrame(animationId);
  coins=GAME_CONFIG.initialCoins;lastNet=null;round=0;phase='ready';polygons=[];draft=[];history=[];latest=null;dropPoint=null;pointer=null;
  config={...GAME_CONFIG,drawingCostUnitLength:selectedUnit,boardAspectRatio:boardHeight/boardWidth||1};$('result').hidden=true;$('reset-dialog').close();message('ブラインド100でラウンド開始');refresh();
};
function shopStep(step){
  for(const name of ['select','confirm','success'])$('shop-'+name).hidden=name!==step;
}
function openShop(){
  if(phase==='dropping' || pointer!==null)return;
  pendingPurchase=null;shopStep('select');$('shop').showModal();
}
$('shop-open').onclick=openShop;
$('shop-open-bottom').onclick=openShop;
function closeShop(){pendingPurchase=null;$('shop').close();}
$('shop-close').onclick=closeShop;
$('purchase-done').onclick=closeShop;
$('shop').addEventListener('close',()=>{pendingPurchase=null;});
for(const amount of GAME_CONFIG.topUpAmounts)$('pack-'+amount).onclick=()=>{
  if(!$('shop').open)return;
  pendingPurchase=amount;
  $('purchase-points').textContent=money(amount)+'pt';
  $('purchase-price').textContent='¥'+money(amount);
  $('purchase-balance').textContent=money(coins+amount)+' coins';
  $('purchase-confirm').textContent=`¥${money(amount)}で購入（モック）`;
  $('purchase-confirm').disabled=false;shopStep('confirm');$('purchase-confirm').focus();
};
$('purchase-back').onclick=()=>{pendingPurchase=null;shopStep('select');$('pack-500').focus();};
$('purchase-confirm').onclick=()=>{
  if(!$('shop').open || !GAME_CONFIG.topUpAmounts.includes(pendingPurchase))return;
  const amount=pendingPurchase;
  pendingPurchase=null;$('purchase-confirm').disabled=true;
  coins+=amount;
  $('purchase-added').textContent='＋'+money(amount)+' coins';
  $('purchase-total').textContent='所持コイン '+money(coins);
  shopStep('success');message(`モック購入で${money(amount)}コイン追加しました`);refresh();$('purchase-done').focus();
};
update();
