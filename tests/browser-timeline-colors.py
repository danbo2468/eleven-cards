"""Synthetic contrast and semantic-state browser regression."""
import asyncio,json,pathlib
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/timeline/colors';OUT.mkdir(parents=True,exist_ok=True)
CHROME='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=CHROME,args=['--no-sandbox'])
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content('<style>body{margin:16px;font:14px Arial}eleven-timeline-card{display:block;max-width:720px}</style>')
  await page.add_script_tag(content=(ROOT/'cards/timeline-card/dist/eleven-timeline-card.js').read_text())
  await page.evaluate('''()=>{
   window.card=document.createElement('eleven-timeline-card');
   const fixtures=[['switch.lights','Verlichting',['off','on','off','on'],{}],['person.test','Aanwezigheid',['home','not_home','home'],{}],['binary_sensor.smoke','Rookalarm',['off','on','off'],{device_class:'smoke'}],['binary_sensor.door','Deur',['off','on','off'],{device_class:'door'}],['sensor.mode','Bedrijfsmodus',['eco','comfort','boost'],{}],['sensor.history','Ontbrekende status',['unknown','unavailable','unknown'],{}]];
   card.setConfig({entities:fixtures.map(f=>f[0]),bar_height:28,show_state_labels:true});
   card.hass={locale:{language:'nl'},config:{time_zone:'Europe/Amsterdam'},states:Object.fromEntries(fixtures.map(([id,name,states,attributes])=>[id,{state:states[0],attributes:{friendly_name:name,...attributes}}])),callApi:async(_,url)=>{const start=Date.parse(url.split('?')[0].replace('history/period/','')),end=Date.parse(new URL('http://fixture/'+url).searchParams.get('end_time'));return fixtures.map(([entity_id,_,states])=>states.map((state,i)=>({entity_id,state,last_changed:new Date(start+(end-start)*i/states.length).toISOString()})));}};
   document.body.append(card);
  }''')
  await page.wait_for_function("card._status==='ready'")
  results=[]
  for width in [1000,390,320]:
   await page.set_viewport_size({'width':width,'height':1100})
   for dark in [False,True]:
    await page.evaluate('''dark=>{for(const [k,v] of Object.entries({'--ha-card-background':dark?'#20252b':'#fff','--primary-text-color':dark?'#e5e7eb':'#20252b','--secondary-text-color':dark?'#a5adb7':'#666','--divider-color':dark?'#39414a':'#ddd'}))document.body.style.setProperty(k,v);document.body.style.background=dark?'#101418':'#f4f5f7';card._render();}''',dark)
    stats=await page.evaluate('''()=>{
     const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number);
     const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
     const nodes=[...card.shadowRoot.querySelectorAll('.segment')];
     const ratios=nodes.map(n=>{const css=getComputedStyle(n),a=luminance(rgb(css.backgroundColor)),b=luminance(rgb(css.color));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
     const rows=[...card.shadowRoot.querySelectorAll('.track')].map(row=>[...new Set([...row.children].map(n=>getComputedStyle(n).backgroundColor))]);
     return {minimum_label_contrast:Math.min(...ratios),rows,overflow:document.documentElement.scrollWidth>innerWidth};
    }''')
    assert stats['minimum_label_contrast']>=4.5,stats
    assert all(len(row)>=2 for row in stats['rows']),stats
    assert len(stats['rows'][4])==3 and stats['rows'][0][0]!=stats['rows'][0][1]
    assert not stats['overflow']
    before=await page.evaluate("[...card.shadowRoot.querySelectorAll('.segment')].map(n=>n.style.backgroundColor)")
    await page.locator('[data-zoom="in"]').click();await page.locator('[data-zoom="reset"]').click()
    assert before==await page.evaluate("[...card.shadowRoot.querySelectorAll('.segment')].map(n=>n.style.backgroundColor)")
    await page.locator('eleven-timeline-card').screenshot(path=str(OUT/f'{width}-{"dark" if dark else "light"}.png'))
    results.append({'width':width,'dark':dark,**stats})
  await page.evaluate('''()=>{card._series=[Array.from({length:20},(_,i)=>({state:String(i),start:card._start+i*(card._end-card._start)/20,end:card._start+(i+1)*(card._end-card._start)/20}))];card._config={...card._config,entities:['sensor.numeric']};card._stateLimits=[];card._render();}''')
  assert await page.locator('.legend span').count()==20
  assert await page.locator('.segment').evaluate_all('(nodes)=>new Set(nodes.map(n=>n.style.backgroundColor)).size')==20
  assert not errors,errors
  (OUT/'verified.json').write_text(json.dumps({'synthetic':True,'views':results,'numeric_distinct':20,'errors':errors},indent=2))
  print('VERIFIED colors:',json.dumps({'views':len(results),'minimum_label_contrast':min(r['minimum_label_contrast'] for r in results),'numeric_distinct':20,'errors':errors}))
  await browser.close()
asyncio.run(main())
