// ブラウザ操作とは別に、UIイベントと決済をDOMスタブ上で検証する。
const vm=require('node:vm'), fs=require('node:fs'), assert=require('node:assert/strict');
const elements=new Map();let frame=null,random=.2;
function element(id){
  if(elements.has(id))return elements.get(id);
  const e={id,hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',handlers:{},classList:{toggle(){}},
    setAttribute(){},querySelector(){return element('hint-strong');},addEventListener(type,f){this.handlers[type]=f;},
    setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return true;},
    getBoundingClientRect(){return {left:0,top:0,width:1000,height:1000};},
    showModal(){this.open=true;},close(){this.open=false;}};
  elements.set(id,e);return e;
}
const context=new Proxy({}, {get:(o,k)=>k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>{o[k]=v;return true;}});
element('canvas').getContext=()=>context;
const s=vm.createContext({console,document:{getElementById:element},window:{devicePixelRatio:1,matchMedia:()=>({matches:false})},ResizeObserver:class{constructor(f){this.f=f;}observe(){this.f();}},performance:{now:()=>0},crypto:{getRandomValues:a=>{a[0]=Math.floor(random*4294967296);return a;}},requestAnimationFrame:f=>{frame=f;return 1;},cancelAnimationFrame:()=>{frame=null;}});
for(const file of ['config.js','engine.js','app.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),s);
const read=expr=>vm.runInContext(expr,s);
const click=id=>element(id).onclick();
function draw(points,close=true){
  const event=p=>({pointerId:1,button:0,clientX:p[0]*1000,clientY:p[1]*1000});
  element('canvas').handlers.pointerdown(event(points[0]));
  for(const p of points.slice(1))element('canvas').handlers.pointermove(event(p));
  if(close)element('canvas').handlers.pointermove(event(points[0]));
  element('canvas').handlers.pointerup(event(close?points[0]:points.at(-1)));
}
const square=[[.1,.1],[.3,.1],[.3,.3],[.1,.3]];
assert.equal(read('coins'),1000);click('primary');assert.equal(read('coins'),900);
assert.equal(element('primary').disabled,true);
draw(square,false);assert.equal(read('polygons.length'),0);assert.match(element('message').textContent,/閉じていません/);assert.equal(read('coins'),900);
draw(square);assert.equal(read('polygons.length'),1);assert.equal(read('G.quote(polygons,config).cost'),16);
assert.equal(element('primary').disabled,false);
draw([[.2,.05],[.4,.05],[.4,.35],[.2,.35]]);assert.equal(read('polygons.length'),1);
click('primary');assert.equal(read('coins'),884);assert.equal(read('phase'),'dropping');
frame(1200);assert.equal(read('coins'),1884);assert.equal(read('phase'),'result');assert.equal(read('history.length'),1);
click('primary');assert.equal(read('coins'),1784);assert.equal(read('polygons.length'),0);assert.equal(read('history.length'),1);
draw(square);click('undo');assert.equal(read('polygons.length'),0);
draw(square);click('clear');assert.equal(read('polygons.length'),0);
draw([[.1,.1],[.4,.4],[.1,.4],[.4,.1]]);assert.equal(read('polygons.length'),1);click('clear');
draw([[.01,.01],[.99,.01],[.99,.99],[.01,.99]]);assert.equal(read('polygons.length'),0);
element('unit-length').onchange({target:{value:'.5'}});assert.equal(read('config.drawingCostUnitLength'),.25);
draw(square);random=.8;click('primary');frame(1200);assert.equal(read('coins'),1768);
click('primary');assert.equal(read('config.drawingCostUnitLength'),.5);
draw(square);assert.equal(read('G.quote(polygons,config).cost'),8);
vm.runInContext('coins=1',s);draw([[.6,.6],[.8,.6],[.8,.8],[.6,.8]]);assert.equal(element('primary').disabled,true);
click('reset');click('confirm-reset');assert.equal(read('coins'),1000);assert.equal(read('history.length'),0);
// 最後のラウンドで外れ、次のブラインドを払えなくなった場合。
click('primary');vm.runInContext('coins=9',s);draw(square);random=.8;click('primary');frame(1200);
assert.equal(read('coins'),1);assert.equal(element('primary').disabled,true);assert.match(element('primary').innerHTML,/コイン不足/);
click('reset');click('confirm-reset');click('primary');
draw([[0,0],[.33,0],[.33,1],[0,1]]);
assert.equal(read('G.quote(polygons,config).payout'),303);
assert.match(element('profit').innerHTML,/303/);
random=.2;click('primary');frame(1200);
assert.equal(read('coins'),1177);assert.ok(Number.isInteger(read('coins')));
assert.match(element('profit').innerHTML,/303/);assert.equal(element('profit-label').textContent,'当選時の払戻');
click('reset');click('confirm-reset');click('primary');
draw([[.1,.1],[.3,.1],[.3,.3],[.1,.3],[.1,.12]],false);
assert.equal(read('polygons.length'),1); // 始点から20pxなら吸着して閉じる。
assert.equal(read('G.quote(polygons,config).area').toFixed(2),'0.04');
click('clear');
draw([[.1,.1],[.3,.1],[.3,.3],[.1,.3],[.1,.13]],false);
assert.equal(read('polygons.length'),0); // 30px離れていれば自動で閉じない。
// 始点を通り越して交差。手前のしっぽと交点以降の線は領域に含めない。
draw([[.05,.3],[.3,.3],[.3,.6],[.6,.6],[.6,.3],[.2,.3]],false);
assert.equal(read('polygons.length'),1);
assert.equal(read('G.area(polygons[0])').toFixed(2),'0.09');
assert.equal(read('G.contains(polygons[0],{x:.1,y:.3})'),false);
console.log('PASS: start, draw, reject overlap/crossing/oversize, undo, clear, hit/miss settlement, history, deferred settings, insufficient coins, reset');
