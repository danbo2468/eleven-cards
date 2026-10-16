import asyncio,json,pathlib,os
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/tooltips';OUT.mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':700,'height':600});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content('<style>body{margin:20px;font-family:Arial}#space{height:1800px}</style><div id="holder"></div><div id="space"></div>')
  await page.add_script_tag(content=(ROOT/'cards/timeline-card/dist/eleven-timeline-card.js').read_text())
  await page.evaluate('''()=>{const outer=holder.attachShadow({mode:'open'});outer.innerHTML='<div id="scroller" style="height:380px;overflow:auto"><eleven-timeline-card></eleven-timeline-card><div style="height:1200px"></div></div>';window.scroller=outer.querySelector('#scroller');window.card=outer.querySelector('eleven-timeline-card');card.setConfig({entities:['switch.a'],show_navigation:false});card.hass={locale:{language:'en'},config:{time_zone:'UTC'},states:{'switch.a':{attributes:{friendly_name:'Light'}}},callApi:async(_,url)=>[[{entity_id:'switch.a',state:'on',last_changed:decodeURIComponent(url.split('?')[0].replace('history/period/',''))}]]};}''')
  await page.wait_for_function("card._status==='ready'")
  await page.evaluate('card._pinned=true;card._showTooltip(card._start+1000)')
  assert await page.evaluate("!card.shadowRoot.querySelector('.tooltip').hidden")
  await page.evaluate('scroller.scrollTop=600');await page.wait_for_timeout(150)
  assert await page.evaluate("card.shadowRoot.querySelector('.tooltip').hidden"),'Pinned tooltip survives native nested shadow-root scroll'
  await page.evaluate('card._receiveHover(card._start+2000)')
  assert await page.evaluate("card.shadowRoot.querySelector('.tooltip').hidden"),'Offscreen receiver resurrects tooltip'
  await page.evaluate('card.hass=card.hass');await page.wait_for_timeout(100)
  assert await page.evaluate("card.shadowRoot.querySelector('.tooltip').hidden"),'Hass update resurrects offscreen tooltip'
  await page.evaluate('scroller.scrollTop=0');await page.wait_for_timeout(100)
  await page.evaluate('card._showTooltip(card._start+3000)')
  assert await page.evaluate("!card.shadowRoot.querySelector('.tooltip').hidden"),'Hover must recover after scrolling back'
  await page.evaluate('window.scrollTo(0,900)');await page.wait_for_timeout(100)
  assert await page.evaluate("card.shadowRoot.querySelector('.tooltip').hidden"),'Page scroll must dismiss'
  await page.evaluate('window.scrollTo(0,0)');await page.wait_for_timeout(100)
  await page.evaluate('''()=>{card._showTooltip(card._start+4000);const t=card.shadowRoot.querySelector('.tooltip');t.style.maxHeight='35px';t.innerHTML+='<div style="height:200px">More details</div>';t.scrollTop=20;}''');await page.wait_for_timeout(100)
  assert await page.evaluate("!card.shadowRoot.querySelector('.tooltip').hidden"),'Tooltip internal scroll must not dismiss'
  await page.evaluate('card.remove()');assert await page.evaluate('!card._sharedScrollTargets?.length'),'Disconnect must remove scroll listeners'
  assert not errors,errors
  print('VERIFIED nested shadow scroll, offscreen sync, hass refresh, recovery, page scroll, internal scroll, cleanup');await browser.close()
asyncio.run(main())
