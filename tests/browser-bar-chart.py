import asyncio,json,pathlib
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/bar-chart'
EXE='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=EXE,args=['--no-sandbox'])
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   is_js=r.request.url.endswith('.js')
   path=ROOT/('cards/bar-chart/dist/eleven-bar-chart.js' if is_js else 'cards/bar-chart/qa/index.html')
   await r.fulfill(body=path.read_bytes(),content_type='text/javascript' if is_js else 'text/html')
  await page.route('http://bar.test/**',route)
  await page.goto('http://bar.test/qa/')
  await page.wait_for_function("window.card?._status==='ready'")
  views=[]
  for width in [1280,390,320]:
   await page.set_viewport_size({'width':width,'height':760})
   for dark in [False,True]:
    await page.evaluate('d=>document.documentElement.classList.toggle("dark",d)',dark)
    await page.wait_for_timeout(700)
    fit=await page.locator('eleven-bar-chart').evaluate('e=>({client:e.clientWidth,scroll:e.scrollWidth,bars:e.shadowRoot.querySelectorAll(".series-bar").length,paint:[...e.shadowRoot.querySelectorAll(".series-bar")].map(p=>({fill:getComputedStyle(p).fill,stroke:getComputedStyle(p).stroke,d:p.getAttribute("d")}))})')
    assert fit['scroll']<=fit['client'] and fit['bars']==2,fit
    assert all(x['fill']!='none' and x['stroke']=='none' and 'Z' in x['d'] for x in fit['paint']),fit
    for ratio in [.03,.5,.97]:
     box=await page.locator('eleven-bar-chart .plot').bounding_box();await page.mouse.move(box['x']+box['width']*ratio,box['y']+box['height']*.5)
     tip=await page.locator('eleven-bar-chart').evaluate('e=>{const s=e.shadowRoot,t=s.querySelector(".tooltip"),b=s.querySelector(".chart").getBoundingClientRect(),r=t.getBoundingClientRect();return {visible:!t.hidden,inside:r.left>=b.left&&r.right<=b.right+1&&r.top>=b.top&&r.bottom<=b.bottom+1,text:t.textContent};}')
     assert tip['visible'] and tip['inside'] and 'Solar' in tip['text'] and 'Grid' in tip['text'],tip
    await page.mouse.move(0,0)
    shot=OUT/f'synthetic-{width}-{"dark" if dark else "light"}.png';await page.screenshot(path=str(shot),full_page=True)
    views.append({'width':width,'dark':dark,'path':str(shot),'bars':fit['bars'],'fit':True})
  await page.locator('eleven-bar-chart .legend-item').nth(1).click()
  assert await page.locator('eleven-bar-chart .series-bar').count()==1
  await page.locator('eleven-bar-chart .legend-item').first.click()
  assert await page.locator('eleven-bar-chart .series-bar').count()==0
  assert await page.locator('eleven-bar-chart .empty-visibility').is_visible()
  await page.locator('eleven-bar-chart .legend-item').first.click()
  await page.locator('eleven-bar-chart .chart').focus();await page.keyboard.press('Home')
  assert await page.locator('eleven-bar-chart .tooltip').is_visible()
  await page.keyboard.press('Escape');assert not await page.locator('eleven-bar-chart .tooltip').is_visible()
  raw=await page.evaluate('card._rawSeries.length');await page.locator('eleven-bar-chart [data-zoom="in"]').click()
  assert await page.evaluate('card._rawSeries.length')==raw
  assert await page.evaluate('card._viewEnd-card._viewStart')==6*3600000
  await page.evaluate("card.setConfig({...qaConfig,graph_mode:'stacked',series_options:[{entity:'sensor.solar',color_mode:'gradient',gradient_stops:[{value:0,color:'#2196f3'},{value:600,color:'#e78a14'}]},{entity:'sensor.grid',color:'#26a69a'}]})")
  await page.wait_for_function("card._status==='ready'")
  fill=await page.locator('eleven-bar-chart .series-bar').first.evaluate('e=>getComputedStyle(e).fill');assert 'history-colors-0' in fill,fill
  await page.evaluate('card.setConfig({entities:[]})')
  assert await page.locator('eleven-bar-chart').evaluate('e=>e.shadowRoot.textContent.includes("Select a sensor")')
  assert not errors,errors
  version=browser.version;await browser.close()
 report={'browser':version,'synthetic':True,'views':views,'tooltip_bounds':True,'legend_recovery':True,'keyboard_escape':True,'zoom_preserves_raw':True,'stacked_gradients':True,'errors':errors}
 (OUT/'synthetic-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
asyncio.run(main())
