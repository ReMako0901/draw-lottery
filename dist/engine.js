(function (root) {
  'use strict';
  const EPS = 1e-9;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cross = (a, b, c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  function onSegment(p,a,b) {
    return Math.abs(cross(a,b,p)) < EPS && p.x >= Math.min(a.x,b.x)-EPS && p.x <= Math.max(a.x,b.x)+EPS && p.y >= Math.min(a.y,b.y)-EPS && p.y <= Math.max(a.y,b.y)+EPS;
  }
  function intersects(a,b,c,d) {
    const x=cross(a,b,c), y=cross(a,b,d), z=cross(c,d,a), w=cross(c,d,b);
    return ((x>EPS && y<-EPS || x<-EPS && y>EPS) && (z>EPS && w<-EPS || z<-EPS && w>EPS)) || onSegment(c,a,b) || onSegment(d,a,b) || onSegment(a,c,d) || onSegment(b,c,d);
  }
  function contains(poly,p) {
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[j], b=poly[i];
      if(onSegment(p,a,b)) return true;
      if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  }
  function area(poly) {
    return Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.x*q.y-q.x*p.y;},0))/2;
  }
  const segmentLength=(a,b,aspect=1)=>Math.hypot(a.x-b.x,(a.y-b.y)*aspect);
  function perimeter(poly,aspect=1) {
    return poly.reduce((s,p,i)=>s+segmentLength(p,poly[(i+1)%poly.length],aspect),0);
  }
  function selfIntersects(poly) {
    for(let i=0;i<poly.length;i++) for(let j=i+1;j<poly.length;j++) {
      if(j===i+1 || i===0 && j===poly.length-1) continue;
      if(intersects(poly[i],poly[(i+1)%poly.length],poly[j],poly[(j+1)%poly.length])) return true;
    }
    return false;
  }
  function overlaps(a,b) {
    if(contains(a,b[0]) || contains(b,a[0])) return true;
    for(let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) if(intersects(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length])) return true;
    return false;
  }
  function multiplier(a,config) {
    if(a<=0) return 0;
    const anchors=config.returnAnchors;
    if(a<=anchors[0][0]) return config.maxMultiplier;
    let r=anchors[anchors.length-1][1];
    for(let i=1;i<anchors.length;i++) if(a<=anchors[i][0]) {
      const [x0,y0]=anchors[i-1], [x1,y1]=anchors[i];
      r=y0+(y1-y0)*(a-x0)/(x1-x0);break;
    }
    return r/a;
  }
  function quote(polys,config) {
    const a=polys.reduce((s,p)=>s+area(p),0);
    const length=polys.reduce((s,p)=>s+perimeter(p,config.boardAspectRatio||1),0);
    // 仮想コインは整数で決済。料金・払戻とも端数を切り捨てる。
    const cost=Math.floor(length/config.drawingCostUnitLength*config.drawingCostPerUnit+1e-9);
    const m=multiplier(a,config);
    return {area:a,length,cost,multiplier:m,payout:Math.floor(config.blind*m+1e-9)};
  }
  function validate(poly,polys,config) {
    if(poly.length<3 || area(poly)<0.0001) return '少し広めに囲んでください';
    if(selfIntersects(poly)) return '線が交差しています。描き直してください';
    if(polys.some(p=>overlaps(p,poly))) return '青い領域とは重ねられません';
    if(quote([...polys,poly],config).area>config.maxArea+EPS) return '囲める面積は85％までです';
    return null;
  }
  const api={distance,segmentLength,contains,area,perimeter,selfIntersects,overlaps,multiplier,quote,validate};
  if(typeof module!=='undefined') module.exports=api;
  else root.GameMath=api;
})(typeof globalThis!=='undefined'?globalThis:this);
