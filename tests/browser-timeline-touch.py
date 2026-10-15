"""Synthetic touch regression: focus must not replace the tapped timestamp."""
import asyncio,json,pathlib,os
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':390,'height':700},has_touch=True,is_mobile=True)
  await page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:14px Arial}eleven-timeline-card{display:block}</style>')
  # HA's ha-card creates its shadow slot asynchronously (Lit updateComplete).
  await page.add_script_tag(content="""customElements.define('ha-card',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});this.updateComplete=new Promise(resolve=>this._resolveUpdate=resolve)}connectedCallback(){queueMicrotask(()=>{this.shadowRoot.innerHTML='<slot></slot>';this._resolveUpdate(true)})}})""")
  await page.add_script_tag(content=pathlib.Path(os.environ.get('TIMELINE_BUNDLE',str(ROOT/'cards/timeline-card/dist/eleven-timeline-card.js'))).read_text())
  await page.evaluate('''()=>{window.card=document.createElement('eleven-timeline-card');card.setConfig({entities:['switch.test']});card.hass={locale:{language:'nl'},states:{},callApi:async(_,url)=>[[{entity_id:'switch.test',state:'on',last_changed:url.split('?')[0].replace('history/period/','')}]]};document.body.append(card);window.events=[];for(const type of ['pointerdown','pointerup','focusin','click'])card.shadowRoot.addEventListener(type,e=>events.push({type,target:e.target.className,cursor:card._cursor}),true);}''')
  await page.wait_for_function("card._status==='ready'")
  client=await page.context.new_cdp_session(page)
  failures=[]
  for ratio in [.75,.35,.9]:
   await page.evaluate('card._hideTooltip();card.shadowRoot.activeElement?.blur()')
   box=await page.locator('.track').bounding_box();x=box['x']+box['width']*ratio;y=box['y']+9
   await client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
   await client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   await page.wait_for_timeout(100)
   result=await page.evaluate('''()=>({ratio:(card._cursor-card._viewStart)/(card._viewEnd-card._viewStart),guide:card.shadowRoot.querySelector('.guide').getBoundingClientRect().x,events})''')
   print(json.dumps({'tap':ratio,'result':result}))
   if abs(result['ratio']-ratio)>.015:failures.append(f'tap {ratio} changed timestamp to {result["ratio"]}')
   before=await page.locator('.tooltip').bounding_box()
   await card_update(page)
   updated=await page.evaluate('(card._cursor-card._viewStart)/(card._viewEnd-card._viewStart)')
   if abs(updated-ratio)>.015:failures.append(f'hass update changed tap {ratio} to {updated}')
   after=await page.locator('.tooltip').bounding_box()
   guide=await page.locator('.guide').bounding_box()
   print(json.dumps({'tap':ratio,'before':before,'after':after,'guide':guide}))
   if abs(before['x']-after['x'])>1:failures.append(f'hass update moved tooltip from {before["x"]} to {after["x"]}')
   if abs(guide['x']-x)>1:failures.append(f'hass update moved guide from {x} to {guide["x"]}')
  await page.screenshot(path='/opt/data/cache/scratch/timeline-touch.png')
  await browser.close()
  assert not failures,failures
async def card_update(page):
 await page.evaluate('card.hass=card.hass')
asyncio.run(main())
