await import('../../dist/eleven-cards.js');
const H=3600000,now=Date.now(),day=new Date(now);day.setHours(0,0,0,0);
const prices=Array.from({length:72},(_,i)=>({start_time:new Date(day.getTime()+(i-24)*H).toISOString(),price_per_kwh:.2+Math.sin(i)*.1}));
const hass={language:'nl',locale:{language:'nl'},config:{time_zone:'Europe/Amsterdam'},states:{
 'sensor.a':{state:'120',attributes:{friendly_name:'Voorbeeldsensor A',unit_of_measurement:'W'}},
 'sensor.b':{state:'80',attributes:{friendly_name:'Voorbeeldsensor B',unit_of_measurement:'W'}},
 'sensor.prices':{state:'.2',attributes:{data:prices}},'calendar.family':{state:'off',attributes:{friendly_name:'Gezin'}}
},callWS:async()=>[],callApi:async(method,url)=>{
 const query=new URLSearchParams(url.split('?')[1]),end=Date.parse(query.get('end_time'))||now,start=Date.parse(decodeURIComponent(url.split('history/period/')[1]?.split('?')[0]))||end-24*H;
 return (query.get('filter_entity_id')||'sensor.a').split(',').map((entity_id,index)=>Array.from({length:49},(_,i)=>({entity_id,last_changed:new Date(start+(end-start)*i/48).toISOString(),state:String(100+index*50+(i%8)*20),attributes:{unit_of_measurement:'W'}})));
},connection:{subscribeMessage(callback,request){queueMicrotask(()=>callback({events:Array.from({length:16},(_,i)=>({start:new Date(now+i*H).toISOString(),end:new Date(now+(i+1)*H).toISOString(),summary:'Voorbeeldafspraak '+i}))}));return Promise.resolve(()=>{});}}};
const definitions=[
 ['history-graph-card',{entities:['sensor.a','sensor.b']}],['bar-chart',{entities:['sensor.a','sensor.b']}],
 ['dynamic-energy-price-card',{entity:'sensor.prices'}],['timeline-card',{entities:['sensor.a','sensor.b']}],
 ['overview-card',{entities:['sensor.a','sensor.b']}],['heatmap-card',{entity:'sensor.a',hours_to_show:672}],
 ['calendar-card',{entities:['calendar.family'],days_to_show:5}],
 ...['list','columns','month'].flatMap(view=>['expanded','compact'].filter(density=>view!=='list'||density!=='expanded').map(density=>['calendar-card',{entities:['calendar.family'],days_to_show:5,view,density}]))
];
window.sizingCards=[];
for(const [slug,config] of definitions){
 const heading=document.createElement('h2');heading.textContent=slug;const frame=document.createElement('div');frame.className='frame';
 const card=document.createElement('eleven-'+slug);card.setConfig({title:slug,...config});card.hass=hass;frame.append(card);document.querySelector('main').append(heading,frame);window.sizingCards.push({slug,card,frame});
}
const layout=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
window.runSizing=async()=>{
 const results=[];
 for(const {slug,card,frame} of window.sizingCards){
  const options=card.getGridOptions();
  for(const width of [340,720])for(const rows of [options.min_rows,options.rows,Math.max(options.rows,10)]){
   const height=rows*64-8;frame.style.width=width+'px';frame.style.height=height+'px';await layout();
   const surface=card.shadowRoot.querySelector('ha-card'),content=card.shadowRoot.querySelector('.content,.card-content'),bounds=surface.getBoundingClientRect(),style=getComputedStyle(content);
   const fits=Math.abs(bounds.height-height)<2&&Math.abs(card.getBoundingClientRect().height-height)<2;
   const scrolls=content.scrollHeight<=content.clientHeight+2||['auto','scroll'].includes(style.overflowY);
   results.push({slug,width,rows,height,actual:Math.round(bounds.height),fits,contained:scrolls,contentHeight:content.clientHeight,contentScroll:content.scrollHeight});
  }
  frame.style.width='720px';frame.style.height=options.rows*64-8+'px';
 }
 window.sizingResults=results;document.querySelector('#results').textContent=results.map(row=>`${row.fits&&row.contained?'✓':'✗'} ${row.slug}: ${row.width}px, ${row.rows} rijen, ${row.actual}px`).join('\n');return results;
};
document.querySelector('#run').onclick=()=>window.runSizing();
