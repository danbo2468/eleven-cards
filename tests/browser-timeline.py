import asyncio,json,pathlib
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/timeline';OUT.mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args=['--no-sandbox'])
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content('<style>body{margin:24px;background:#101418;font-family:Arial;--ha-card-background:#20252b;--primary-text-color:#e5e7eb;--secondary-text-color:#a5adb7;--divider-color:#39414a}eleven-timeline-card{max-width:620px}</style>')
  await page.add_script_tag(content=(ROOT/'cards/timeline-card/dist/eleven-timeline-card.js').read_text())
  await page.evaluate('''() => {const card=document.createElement('eleven-timeline-card');card.setConfig({title:'Statustijdlijn · synthetische test',entities:['binary_sensor.light','person.test','switch.heater'],bar_height:24,state_colors:[{state:'on',color:[38,166,154],label:'Aan'},{state:'off',color:[96,125,148],label:'Uit'},{state:'home',color:[38,166,154],label:'Thuis'},{state:'not_home',color:[231,138,20],label:'Afwezig'}]});card.hass={locale:{language:'nl'},config:{time_zone:'Europe/Amsterdam'},states:{'binary_sensor.light':{attributes:{friendly_name:'Verlichting'}},'person.test':{attributes:{friendly_name:'Aanwezigheid'}},'switch.heater':{attributes:{friendly_name:'Verwarming'}}},callApi:async(method,url)=>{window.request={method,url};const end=Date.parse(new URL('http://fixture/'+url).searchParams.get('end_time')),start=end-86400000;return [['binary_sensor.light',['off','on','off','on']],['person.test',['home','not_home','home']],['switch.heater',['off','on','unavailable','off']]].map(([id,states])=>states.map((state,i)=>({...(i===0?{entity_id:id}:{}),state,last_changed:new Date(start+i*86400000/states.length).toISOString()})));}};document.body.append(card);window.card=card;}''')
  await page.wait_for_function("card._status==='ready'")
  assert await page.locator('eleven-timeline-card .row').count()==3
  assert await page.locator('eleven-timeline-card .gap').count()==1
  assert await page.locator('eleven-timeline-card .track').first.evaluate('(e)=>getComputedStyle(e).height')=='24px'
  await page.locator('eleven-timeline-card .segment').first.click()
  assert await page.locator('eleven-timeline-card .detail').is_visible()
  await page.locator('eleven-timeline-card .segment').first.focus();await page.keyboard.press('Escape')
  assert not await page.locator('eleven-timeline-card .detail').is_visible()
  for width,label in [(1000,'desktop-dark'),(390,'mobile-dark')]:
   await page.set_viewport_size({'width':width,'height':600})
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   await page.screenshot(path=str(OUT/(label+'.png')))
  await page.evaluate("document.body.style.setProperty('--ha-card-background','#fff');document.body.style.setProperty('--primary-text-color','#20252b');document.body.style.setProperty('--secondary-text-color','#666');document.body.style.background='#f4f5f7'")
  await page.screenshot(path=str(OUT/'mobile-light.png'))
  await page.evaluate("card.remove();window.disconnected=card._timer;card.setConfig({...card._config,bar_height:32,show_labels:false,show_axis:false,show_legend:false});document.body.append(card)")
  await page.wait_for_function("card._status==='ready'")
  assert await page.locator('eleven-timeline-card .row-label').count()==0
  assert await page.locator('eleven-timeline-card .axis').count()==0
  assert await page.locator('eleven-timeline-card .legend').count()==0
  assert await page.locator('eleven-timeline-card .track').first.evaluate('(e)=>getComputedStyle(e).height')=='32px'
  await page.evaluate('card.remove()')
  assert not errors,errors
  (OUT/'verified.json').write_text(json.dumps({'synthetic':True,'desktop_mobile_light_dark':True,'tap_keyboard':True,'appearance':True,'console_errors':errors},indent=2))
  print('VERIFIED timeline browser: dark/light, desktop/mobile, appearance, tap/keyboard, no console errors')
  await browser.close()
asyncio.run(main())
