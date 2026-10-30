'use strict';
const $=id=>document.getElementById(id);
const G=GameMath;
const money=n=>n.toLocaleString('ja-JP',{maximumFractionDigits:2});
const cents=n=>Math.round(n*100)/100;
let selectedUnit=GAME_CONFIG.drawingCostUnitLength;
let config={...GAME_CONFIG};
let coins=GAME_CONFIG.initialCoins, round=0, phase='ready', polygons=[], draft=[], history=[], latest=null;
let pointer=null, animationId=null, animationStart=0, dropPoint=null, settledQuote=null, currentMessage='';
const canvas=$('canvas'), ctx=canvas.getContext('2d');
let boardSize=0;

function message(text,error=false){currentMessage=text;$('message').textContent=text;$('message').classList.toggle('error',error);}
function metrics(){return G.quote(draft.length>=3?[...polygons,draft]:polygons,config);}
function update(){
  const q=metrics(), has=q.area>0, drawing=phase==='drawing';
  $('balance').textContent=money(coins);
  $('round').textContent=`ROUND ${String(Math.max(1,round)).padStart(2,'0')}`;
  $('phase-label').textContent=({ready:'READY',drawing:'DRAW YOUR AREA',dropping:'DROPPING',result:'RESULT'})[phase];
  $('instruction').textContent=({ready:'自分の当たりを、描こう。',drawing:'どこを当たりにする？',dropping:'運の行方を、見届けよう。',result:'次は、どこを囲む？'})[phase];
  $('area').innerHTML=`${has?(q.area*100).toFixed(1):'—'}<small>％</small>`;
  $('multiplier').innerHTML=`${has?q.multiplier.toFixed(2):'—'}<small>倍</small>`;
  $('cost').innerHTML=`${money(q.cost)}<small>coins</small>`;
  $('payout').textContent=has?money(q.payout):'—';
  $('undo').disabled=!drawing || !polygons.length || pointer!==null;
  $('clear').disabled=!drawing || !polygons.length || pointer!==null;
  $('history-count').textContent=`落下履歴 ${history.length}`;
  $('board-hint').hidden=has || history.length>0 || phase==='dropping' || phase==='result';
  $('primary').disabled=phase==='dropping' || drawing && (!polygons.length || q.cost>coins || pointer!==null) || !drawing && phase!=='dropping' && coins<config.blind;
  if(drawing){
    $('primary').innerHTML=`抽選する <span>−${money(q.cost)} coins</span>`;
    const net=cents(q.payout-config.blind-q.cost);
    $('profit').textContent=has?`当選時の純利益 ${net>=0?'+':''}${money(net)} coins`:'指で囲んで当たりを作ろう';
  }else{
    $('primary').innerHTML=coins<config.blind?'コイン不足で終了':`${phase==='ready'?'ラウンド開始':'次のラウンド'} <span>−${config.blind} coins</span>`;
    $('profit').textContent=coins<config.blind?'リセットすると1000コインから再開できます':`ブラインド ${config.blind} / 持ちコインから支払い`;
  }
  if(phase==='ready') $('board-hint').querySelector('strong').textContent='開始して、好きな場所を囲む';
  else $('board-hint').querySelector('strong').textContent='好きな場所を囲む';
}
function drawPolygon(poly,preview=false){
  if(!poly.length)return;
  ctx.beginPath();ctx.moveTo(poly[0].x*boardSize,poly[0].y*boardSize);
  for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i].x*boardSize,poly[i].y*boardSize);
  ctx.closePath();ctx.fillStyle=preview?'rgba(64,128,255,.18)':'rgba(64,128,255,.36)';ctx.fill();
  ctx.strokeStyle=preview?'#6798fa':'#397af4';ctx.lineWidth=preview?1.5:1.8;ctx.setLineDash(preview?[4,3]:[]);ctx.stroke();ctx.setLineDash([]);
}
function ball(point,radius,alpha,shadow=false){
  const x=point.x*boardSize,y=point.y*boardSize;
  ctx.save();ctx.globalAlpha=alpha;
  if(shadow){ctx.shadowColor='#192a4350';ctx.shadowBlur=9;ctx.shadowOffsetY=3;}
  const grad=ctx.createRadialGradient(x-radius*.3,y-radius*.4,0,x,y,radius);
  grad.addColorStop(0,'#7d8ba0');grad.addColorStop(.4,'#34465f');grad.addColorStop(1,'#142238');
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,Math.max(.1,radius),0,Math.PI*2);ctx.fill();ctx.restore();
}
function render(t){
  ctx.clearRect(0,0,boardSize,boardSize);
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
    ctx.save();ctx.globalAlpha=.15;ctx.fillStyle='#15263e';ctx.beginPath();ctx.ellipse(dropPoint.x*boardSize,dropPoint.y*boardSize+4,Math.max(4,radius*.65),Math.max(2,radius*.2),0,0,Math.PI*2);ctx.fill();ctx.restore();
    ball(dropPoint,radius,.4+.6*progress,true);
    if(progress<1)animationId=requestAnimationFrame(render);
    else settle();
  }
}
function resize(){
  boardSize=canvas.getBoundingClientRect().width;
  const dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(boardSize*dpr);canvas.height=Math.round(boardSize*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  if(phase!=='dropping')render(performance.now());
}
new ResizeObserver(resize).observe(canvas);
function point(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
function refresh(){update();render(performance.now());}
canvas.addEventListener('pointerdown',e=>{
  if(phase!=='drawing' || pointer!==null || e.button!==0)return;
  const p=point(e);
  if(polygons.some(poly=>G.contains(poly,p))){message('青い領域の外から描き始めてください',true);return;}
  pointer=e.pointerId;draft=[p];canvas.setPointerCapture(pointer);message('指を離すと囲みが閉じます');refresh();
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  const p=point(e);
  if(G.distance(draft[draft.length-1],p)>=.004 && draft.length<650){draft.push(p);refresh();}
});
function finish(e){
  if(e.pointerId!==pointer)return;
  const p=point(e);
  if(G.distance(draft[draft.length-1],p)>.002)draft.push(p);
  if(draft.length>3 && G.distance(draft[0],draft[draft.length-1])<.006)draft.pop();
  const error=G.validate(draft,polygons,config);
  if(!error)polygons.push(draft);
  draft=[];pointer=null;
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  const q=G.quote(polygons,config);
  message(error || (q.cost>coins?'描画コストが残高を超えています。囲みを減らしてください':'囲みを追加するか、抽選してください'),!!error || q.cost>coins);
  refresh();
}
canvas.addEventListener('pointerup',finish);
canvas.addEventListener('pointercancel',e=>{if(e.pointerId!==pointer)return;draft=[];pointer=null;message('描画を中断しました');refresh();});
canvas.addEventListener('lostpointercapture',()=>{if(pointer!==null){draft=[];pointer=null;refresh();}});
$('undo').onclick=()=>{if(phase!=='drawing')return;polygons.pop();message('最後の囲みを取り消しました');refresh();};
$('clear').onclick=()=>{if(phase!=='drawing')return;polygons=[];message('囲みをすべて消しました');refresh();};
function uniform(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
function start(){
  if(coins<GAME_CONFIG.blind)return;
  config={...GAME_CONFIG,drawingCostUnitLength:selectedUnit};
  coins=cents(coins-config.blind);round++;polygons=[];draft=[];latest=null;dropPoint=null;phase='drawing';$('result').hidden=true;
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
  const net=cents(payout-config.blind-settledQuote.cost);
  $('result').hidden=false;$('result').classList.toggle('win',hit);
  $('result').textContent=hit?`HIT! 払戻 ${money(payout)} coins`:'MISS — はずれ';
  message(`このラウンド ${net>=0?'+':''}${money(net)} coins${coins<config.blind?' ／ コイン不足で終了':''}`);
  refresh();
}
$('primary').onclick=()=>{if(phase==='ready' || phase==='result')start();else if(phase==='drawing')drop();};
$('rules-toggle').onclick=()=>{$('rules').showModal();$('rules-toggle').setAttribute('aria-expanded','true');};
$('rules-close').onclick=()=>$('rules').close();
$('rules').addEventListener('close',()=>$('rules-toggle').setAttribute('aria-expanded','false'));
$('unit-length').value=String(selectedUnit);
$('unit-length').onchange=e=>{selectedUnit=Number(e.target.value);if(phase==='ready')config={...GAME_CONFIG,drawingCostUnitLength:selectedUnit};};
$('reset').onclick=()=>{if(phase!=='dropping')$('reset-dialog').showModal();};
$('cancel-reset').onclick=()=>$('reset-dialog').close();
$('confirm-reset').onclick=()=>{
  if(animationId!==null)cancelAnimationFrame(animationId);
  coins=GAME_CONFIG.initialCoins;round=0;phase='ready';polygons=[];draft=[];history=[];latest=null;dropPoint=null;pointer=null;
  config={...GAME_CONFIG,drawingCostUnitLength:selectedUnit};$('result').hidden=true;$('reset-dialog').close();message('ブラインド100でラウンド開始');refresh();
};
update();
