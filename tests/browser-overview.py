import asyncio,json,pathlib,sys,time,urllib.request
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'qa-evidence/overview';OUT.mkdir(exist_ok=True)
BUNDLE=ROOT/'cards/overview-card/dist/eleven-overview-card.js'
EXE='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=EXE,args=['--no-sandbox']);page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('http://overview.test/**',lambda r:r.fulfill(body=(BUNDLE.read_bytes() if '.js' in r.request.url else (ROOT/'cards/overview-card/qa/index.html').read_bytes()),content_type='text/javascript' if '.js' in r.request.url else 'text/html'))
  await page.goto('http://overview.test/qa/');print('INITIAL',await page.evaluate('({card:!!window.card,status:window.card?._status,defined:!!customElements.get("eleven-overview-card"),text:document.body.innerText})'),errors);await page.wait_for_function("window.card?._status==='ready'")
  views=[]
  for width in [1280,390,320]:
   await page.set_viewport_size({'width':width,'height':960})
   for dark in [False,True]:
    await page.evaluate('d=>document.body.classList.toggle("dark",d)',dark)
    fit=await page.locator('eleven-overview-card').evaluate('(e)=>({client:e.clientWidth,scroll:e.scrollWidth,cells:e.shadowRoot.querySelectorAll(".metric").length,paths:e.shadowRoot.querySelectorAll("path").length,grid:getComputedStyle(e.shadowRoot.querySelector(".grid")).gridTemplateColumns})')
    assert fit['scroll']<=fit['client'] and fit['cells']==4 and fit['paths']==4,fit
    shot=OUT/f'synthetic-{width}-{"dark" if dark else "light"}.png';await page.screenshot(path=str(shot),full_page=True);views.append({'path':str(shot),**fit})
  await page.evaluate("card.addEventListener('hass-more-info',e=>window.more=e.detail.entityId)");await page.locator('eleven-overview-card .metric').first.focus();await page.keyboard.press('Enter');assert await page.evaluate('window.more')=='sensor.power'
  await page.evaluate("card.hass={...qaHass,states:{...qaStates,'sensor.power':{...qaStates['sensor.power'],state:'unavailable'}}}");assert await page.locator('eleven-overview-card .status').count()==1
  await page.evaluate("card.hass={...qaHass,callApi:async()=>{throw Error('offline')}};card._refresh()");await page.wait_for_function("card._status==='error'");assert await page.locator('eleven-overview-card .retry').count()==1
  await page.evaluate('card.hass=qaHass');await page.locator('eleven-overview-card .retry').click();await page.wait_for_function("card._status==='ready'")
  await page.evaluate("card.setConfig({title:'Long <script>untrusted</script> Overview (beta)',columns:'3',entities:Array.from({length:8},(_,i)=>({entity:'sensor.stress_'+i,name:'Extremely long sensor label '+String(i).repeat(50)}))});card.hass={...qaHass,states:Object.fromEntries(Array.from({length:8},(_,i)=>['sensor.stress_'+i,{state:'-123456789.00004',attributes:{unit_of_measurement:'VeryLongUnit'}}]))}")
  for width in [1280,390,320]:
   await page.set_viewport_size({'width':width,'height':960});fit=await page.locator('eleven-overview-card').evaluate('(e)=>({client:e.clientWidth,scroll:e.scrollWidth,script:e.shadowRoot.querySelectorAll("script").length})');assert fit['scroll']<=fit['client'] and fit['script']==0,fit
  await page.evaluate("card.setConfig({entities:['sensor.temperature'],show_graph:false,show_delta:false});card.hass=qaHass")
  assert await page.locator('eleven-overview-card .spark').count()==0 and await page.locator('eleven-overview-card .delta').count()==0
  assert not errors,errors;await browser.close()
 (OUT/'synthetic-results.json').write_text(json.dumps({'views':views,'errors':errors,'keyboard_more_info':True,'unavailable':True,'history_error_retry':True},indent=2));print(json.dumps({'views':views,'errors':errors}))
asyncio.run(main())
