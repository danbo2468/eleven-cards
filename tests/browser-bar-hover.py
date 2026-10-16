import asyncio,json,pathlib,os
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/bar-hover';OUT.mkdir(parents=True,exist_ok=True)
BUNDLE=pathlib.Path(os.environ.get('BAR_BUNDLE',ROOT/'cards/bar-chart/dist/eleven-bar-chart.js'))
EXE='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=EXE,args=['--no-sandbox']);page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   is_js=r.request.url.endswith('.js');path=BUNDLE if is_js else ROOT/'cards/bar-chart/qa/index.html'
   await r.fulfill(body=path.read_bytes(),content_type='text/javascript' if is_js else 'text/html')
  await page.route('http://bar.test/**',route);await page.goto('http://bar.test/qa/');await page.wait_for_function("card?._status==='ready'")
  results=[]
  for period in ['minute','quarter_hour','hour','day','week','month','none']:
   await page.evaluate('''period=>{card.setConfig({...qaConfig,aggregation_period:period,hours_to_show:period==='month'?24*70:period==='week'?24*21:period==='day'?24*4:12,sync_hover:false});}''',period)
   await page.wait_for_function("card._status==='ready'")
   result=await page.evaluate('''()=>{const t=card._viewStart+(card._viewEnd-card._viewStart)*.55,i=card._hoverInterval(t);window.hoverProbe=i;const s=card.shadowRoot;card._showTooltip(i.start+(i.end-i.start)*.2);const first={title:s.querySelector('.tooltip strong').textContent,guide:s.querySelector('.guide').style.left,text:s.querySelector('.tooltip').textContent};card._showTooltip(i.start+(i.end-i.start)*.8);const second={title:s.querySelector('.tooltip strong').textContent,guide:s.querySelector('.guide').style.left,text:s.querySelector('.tooltip').textContent};return {first,second,start:i.start,end:i.end,label:i.labelTime};}''')
   assert result['first']==result['second'],(period,result)
   title=result['first']['title'];assert (':' in title)==(period not in ['day','week','month']),(period,title)
   # Actual pointer movement must remain on the same guide within a bar.
   box=await page.locator('eleven-bar-chart .plot').bounding_box()
   ratios=await page.evaluate('[(hoverProbe.start-card._viewStart)/(card._viewEnd-card._viewStart),(hoverProbe.end-card._viewStart)/(card._viewEnd-card._viewStart)]')
   await page.mouse.move(0,0)
   for f in [.2,.8]:
    await page.mouse.move(box['x']+box['width']*(ratios[0]+(ratios[1]-ratios[0])*f),box['y']+box['height']*.9)
    assert await page.locator('eleven-bar-chart .guide').evaluate('e=>e.style.left')==result['first']['guide']
   results.append({'period':period,'title':title,'stable_inside_bar':True})
  await page.evaluate("card.setConfig({...qaConfig,sync_hover:false})");await page.wait_for_function("card._status==='ready'")
  await page.locator('eleven-bar-chart .chart').focus();await page.keyboard.press('Home');first=await page.evaluate('card._cursor');await page.keyboard.press('ArrowRight');assert await page.evaluate('card._cursor')>first
  await page.keyboard.press('End');assert await page.locator('eleven-bar-chart .tooltip').is_visible();await page.keyboard.press('Escape');assert not await page.locator('eleven-bar-chart .tooltip').is_visible()
  for width in [1280,390,320]:
   await page.set_viewport_size({'width':width,'height':760})
   await page.wait_for_timeout(150)  # Resize now intentionally dismisses hover.
   for dark in [False,True]:
    await page.evaluate('d=>document.documentElement.classList.toggle("dark",d)',dark)
    for ratio in [.03,.5,.97]:
     box=await page.locator('eleven-bar-chart .plot').bounding_box();await page.mouse.move(box['x']+box['width']*ratio,box['y']+box['height']*.85)
     fit=await page.locator('eleven-bar-chart').evaluate('''e=>{const s=e.shadowRoot,t=s.querySelector('.tooltip'),b=s.querySelector('.chart').getBoundingClientRect(),r=t.getBoundingClientRect();return {visible:!t.hidden,inside:r.left>=b.left&&r.right<=b.right+1&&r.top>=b.top&&r.bottom<=b.bottom+1}}''');assert fit['visible'] and fit['inside'],fit
    await page.screenshot(path=str(OUT/f'hover-{width}-{dark}.png'))
  # Incoming synchronization also snaps; it must never publish back.
  assert await page.evaluate('''()=>{card._showTooltip(card._viewStart+12345,false);const a=card.shadowRoot.querySelector('.guide').style.left;card._receiveHover(card._viewStart+23456);return a===card.shadowRoot.querySelector('.guide').style.left}''')
  # Native touch dispatch enters the same interval-based path.
  box=await page.locator('eleven-bar-chart .plot').bounding_box();cdp=await page.context.new_cdp_session(page)
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']*.4,'y':box['y']+box['height']*.8}]});await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  assert await page.locator('eleven-bar-chart .tooltip').is_visible()
  assert not errors,errors
  report={'bundle':str(BUNDLE),'synthetic':True,'periods':results,'keyboard':True,'native_touch':True,'responsive_tooltip_bounds':True,'incoming_sync':True,'errors':errors}
  (OUT/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));await browser.close()
asyncio.run(main())
