import asyncio,json,pathlib,os
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/timeline';OUT.mkdir(parents=True,exist_ok=True)
CHROME='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=CHROME,args=['--no-sandbox'])
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content('<style>body{margin:24px;background:#101418;font-family:Arial;--ha-card-background:#20252b;--primary-text-color:#e5e7eb;--secondary-text-color:#a5adb7;--divider-color:#39414a}eleven-timeline-card{max-width:620px}</style>')
  await page.add_script_tag(content=(ROOT/'cards/timeline-card/dist/eleven-timeline-card.js').read_text())
  await page.evaluate('''() => {const card=document.createElement('eleven-timeline-card');window.requests=[];window.config={title:'Statustijdlijn',entities:['binary_sensor.light','person.test','switch.heater'],bar_height:24,state_colors:[{state:'on',color:[38,166,154],label:'Aan'},{state:'off',color:[96,125,148],label:'Uit'},{state:'home',color:[38,166,154],label:'Thuis'},{state:'not_home',color:[231,138,20],label:'Afwezig'}]};card.setConfig(config);card.hass={locale:{language:'nl'},config:{time_zone:'Europe/Amsterdam'},states:{'binary_sensor.light':{attributes:{friendly_name:'Verlichting'}},'person.test':{attributes:{friendly_name:'Aanwezigheid'}},'switch.heater':{attributes:{friendly_name:'Verwarming'}}},callApi:async(method,url)=>{requests.push({method,url});const end=Date.parse(new URL('http://fixture/'+url).searchParams.get('end_time')),start=Date.parse(url.split('?')[0].replace('history/period/',''));return [['binary_sensor.light',['off','on','off','on']],['person.test',['home','not_home','home']],['switch.heater',['off','on','unavailable','off']]].map(([id,states])=>states.map((state,i)=>({...(i===0?{entity_id:id}:{}),state,last_changed:new Date(start+i*(end-start)/states.length).toISOString()})));}};document.body.append(card);window.card=card;}''')
  await page.wait_for_function("card._status==='ready'")
  assert await page.locator('eleven-timeline-card .row').count()==3
  assert await page.locator('eleven-timeline-card .gap').count()==1
  results=[]
  for width in [1000,390,320]:
   await page.set_viewport_size({'width':width,'height':700})
   for dark in [True,False]:
    await page.evaluate('''dark=>{document.body.style.setProperty('--ha-card-background',dark?'#20252b':'#fff');document.body.style.setProperty('--primary-text-color',dark?'#e5e7eb':'#20252b');document.body.style.setProperty('--secondary-text-color',dark?'#a5adb7':'#666');document.body.style.setProperty('--divider-color',dark?'#39414a':'#ddd');document.body.style.background=dark?'#101418':'#f4f5f7';card._render();card._hideTooltip();}''',dark)
    host=page.locator('eleven-timeline-card');box=await host.bounding_box();height=box['height']
    chart=await page.locator('eleven-timeline-card .chart').bounding_box()
    for ratio in [.01,.5,.99]:
     await page.mouse.move(chart['x']+chart['width']*ratio,chart['y']+30)
     assert await page.locator('eleven-timeline-card .tooltip').is_visible()
     assert await page.locator('eleven-timeline-card .guide').is_visible()
     assert abs((await host.bounding_box())['height']-height)<.1,'Hover changes card height'
     tooltip=await page.locator('eleven-timeline-card .tooltip').bounding_box()
     assert tooltip['x']>=chart['x'] and tooltip['x']+tooltip['width']<=chart['x']+chart['width']+.5,'Tooltip out of horizontal bounds'
     assert await page.locator('eleven-timeline-card .tooltip').evaluate('(e)=>e.scrollHeight<=e.clientHeight+1'),'Tooltip content clipped'
    await page.screenshot(path=str(OUT/f'{width}-{"dark" if dark else "light"}-hover.png'))
    await page.mouse.move(1,1);assert not await page.locator('eleven-timeline-card .tooltip').is_visible()
    await page.evaluate('window.beforeSeries=card._series;window.beforeRequests=requests.length')
    await page.locator('[data-zoom="in"]').click()
    assert await page.evaluate('card._viewEnd-card._viewStart===43200000&&card._series===beforeSeries&&requests.length===beforeRequests')
    await page.locator('[data-zoom="reset"]').click()
    chart=await page.locator('eleven-timeline-card .chart').bounding_box()
    await page.mouse.move(chart['x']+chart['width']*.2,chart['y']+30);await page.mouse.down();await page.mouse.move(chart['x']+chart['width']*.7,chart['y']+30,steps=8)
    assert await page.locator('.zoom-selection').is_visible()
    await page.mouse.up()
    assert await page.evaluate('Math.abs((card._viewEnd-card._viewStart)-43200000)<10000&&requests.length===beforeRequests')
    await page.locator('[data-zoom="reset"]').click()
    await page.locator('.segment').first.focus();assert await page.locator('.tooltip').is_visible()
    await page.keyboard.press('Escape');assert not await page.locator('.tooltip').is_visible()
    await page.locator('.chart').focus();await page.keyboard.press('End');assert await page.locator('.tooltip').is_visible();await page.keyboard.press('Escape')
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    results.append({'width':width,'dark':dark,'height_stable':True,'tooltip_bounds':True,'zoom_and_drag':True})
  await page.locator('.period-controls select').select_option('6');await page.wait_for_function("card._status==='ready'")
  assert await page.evaluate('card._end-card._start===21600000&&card._config.hours_to_show===24')
  await page.evaluate('window.previousEnd=card._end')
  await page.locator('[data-period="previous"]').click();await page.wait_for_function("card._status==='ready'")
  assert await page.evaluate('card._end===previousEnd-21600000')
  await page.locator('[data-period="next"]').click();await page.wait_for_function("card._status==='ready'")
  assert await page.evaluate('card._end===previousEnd')
  await page.locator('[data-period="now"]').click();await page.wait_for_function("card._status==='ready'")
  await page.evaluate("card.setConfig({...config,show_summary:true})");await page.wait_for_function("card._status==='ready'")
  assert await page.locator('.summary').count()==3
  await page.evaluate("card.setConfig({...config,entities:['binary_sensor.light'],show_labels:false,show_axis:false,show_legend:false,show_grid:false,show_navigation:false})");await page.wait_for_function("card._status==='ready'")
  assert await page.locator('.row-label,.axis,.legend,.grid-line,.period-controls').count()==0
  chart=await page.locator('.chart').bounding_box();height=(await page.locator('eleven-timeline-card').bounding_box())['height']
  await page.mouse.move(chart['x']+chart['width']*.5,chart['y']+12)
  assert await page.locator('.tooltip').evaluate('(e)=>e.scrollHeight<=e.clientHeight+1'),'Single-row tooltip clipped'
  assert abs((await page.locator('eleven-timeline-card').bounding_box())['height']-height)<.1
  client=await page.context.new_cdp_session(page)
  await page.evaluate('card._hideTooltip()')
  for point in [{'x':chart['x']+chart['width']*.25,'y':chart['y']+12},{'x':5,'y':5}]:
   await client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]});await client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   if point['x']==5:assert not await page.locator('.tooltip').is_visible(),'Outside touch must dismiss pinned tooltip'
   else:assert await page.locator('.tooltip').is_visible(),'Touch must show tooltip'
  await page.evaluate('''() => {window.stateCount=21;card._hass.callApi=async(_,url)=>{const start=Date.parse(url.split('?')[0].replace('history/period/',''));return [Array.from({length:stateCount},(_,i)=>({entity_id:'sensor.limit',state:String(i),last_changed:new Date(start+i*1000).toISOString()})),[{entity_id:'switch.valid',state:'on',last_changed:new Date(start).toISOString()}]];};card.setConfig({entities:['sensor.limit','switch.valid'],show_summary:true});}''')
  await page.wait_for_function("card._status==='ready'")
  assert await page.locator('.state-limit').count()==1
  assert await page.locator('.segment').count()==1
  assert await page.locator('.legend span').count()==1
  await page.evaluate('card._showTooltip(card._start)')
  assert 'Maximaal 20' in await page.locator('.tooltip').inner_text()
  await page.evaluate('card._zoom(.5)')
  assert await page.locator('.state-limit').count()==1
  await page.screenshot(path=str(OUT/'state-limit-320.png'))
  await page.evaluate('stateCount=20;card._zoom(0);card._refresh()')
  await page.wait_for_function("card._status==='ready' && card._series[0].length===20")
  assert await page.locator('.state-limit').count()==0
  assert await page.locator('.segment').count()==21
  await page.evaluate('stateCount=50000;card._refresh()')
  await page.wait_for_function("card._stateLimits[0]===true")
  assert await page.locator('.segment').count()==1
  await page.evaluate('card.remove()');assert not errors,errors
  (OUT/'verified.json').write_text(json.dumps({'synthetic':True,'views':results,'navigation':True,'keyboard':True,'console_errors':errors},indent=2))
  print('VERIFIED',json.dumps(results));await browser.close()
asyncio.run(main())
