// Sum elapsed time by the original state, keeping missing history separate
// even when it shares a display label with a recorded unknown state.
export function timelineStateDurations(series,start,end){
 const totals=new Map();
 for(const s of series){
  const duration=Math.max(0,Math.min(end,s.end)-Math.max(start,s.start));
  if(!duration)continue;
  const key=s.missing?null:s.state;
  if(!totals.has(key))totals.set(key,{state:s.state,missing:!!s.missing,duration:0});
  totals.get(key).duration+=duration;
 }
 return [...totals.values()];
}
export function segments(rows,start,end){
 const points=rows.map((r,i)=>({t:Date.parse(r.last_changed??r.last_updated),state:String(r.state??'unknown'),i})).filter(p=>Number.isFinite(p.t)&&p.t<=end).sort((a,b)=>a.t-b.t||a.i-b.i);
 let state='unknown',cursor=start;const result=[];
 for(const p of points){if(p.t<=start){state=p.state;continue;}if(p.state===state)continue;if(p.t>cursor)result.push({start:cursor,end:p.t,state});cursor=p.t;state=p.state;}
 if(cursor<end)result.push({start:cursor,end,state});return result;
}
