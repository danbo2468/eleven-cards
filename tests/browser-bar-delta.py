"""Delta QA in the native HA editor/temporary preview; no dashboard writes."""
import asyncio,json,pathlib,sys,time,urllib.request
sys.path.insert(0,'/opt/data/cache/scratch')
import history_card_install as h
from eleven_inventory import configs
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/bar-chart/delta';OUT.mkdir(parents=True,exist_ok=True)
BUNDLE=ROOT/'cards/bar-chart/dist/eleven-bar-chart.js'
INSTALLED='--installed' in sys.argv
PHASE='installed' if INSTALLED else 'local'
EXE='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
async def main():
 async with await h.connect() as w:
  before=await configs(w);resources=await h.cmd(w,'lovelace/resources')
  if INSTALLED:
   resource=next(r for r in resources if r['url'].split('?')[0]=='/local/eleven-cards/eleven-bar-chart.js')
   assert urllib.request.urlopen(h.BASE+resource['url']).read()==BUNDLE.read_bytes()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=EXE,args=['--no-sandbox']);page=await browser.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  tokens={'access_token':h.TOKEN,'token_type':'Bearer','expires_in':31536000,'expires':int(time.time()*1000)+31536000000,'hassUrl':h.BASE,'clientId':h.BASE+'/'}
  await page.add_init_script('localStorage.setItem("hassTokens",'+json.dumps(json.dumps(tokens))+');')
  if not INSTALLED:
   await page.route('**/local/eleven-cards/eleven-bar-chart.js*',lambda r:r.fulfill(body=BUNDLE.read_bytes(),content_type='text/javascript'))
  await page.goto(h.BASE+'/energie-prijzen/0');await page.wait_for_function("customElements.get('eleven-bar-chart') && document.querySelector('home-assistant').hass",timeout=45000)
  await page.get_by_role('button',name='Edit dashboard',exact=False).click();await page.wait_for_timeout(400)
  await page.locator('eleven-history-graph-card').first.evaluate('(e)=>{let n=e;while(n&&n.tagName!=="HUI-CARD-EDIT-MODE")n=n.parentElement||n.getRootNode().host;n.shadowRoot.querySelector(".control").click();}')
  await page.wait_for_selector('hui-dialog-edit-card eleven-history-graph-editor')
  await page.evaluate('''()=>{window.deltaWalk=(root,fn)=>{for(const e of root.querySelectorAll('*')){fn(e);if(e.shadowRoot)deltaWalk(e.shadowRoot,fn)}};deltaWalk(document,e=>{if(e.localName==='hui-dialog-edit-card')window.deltaDialog=e});window.deltaParams={...deltaDialog._params,saveCardConfig:cfg=>{window.deltaCaptured=structuredClone(cfg)}};window.deltaBase={type:'custom:eleven-bar-chart',title:'Delta per uur',entities:['sensor.anna_temperature','sensor.quooker_power'],hours_to_show:24,aggregation_period:'hour'};deltaDialog.showDialog({...deltaParams,cardConfig:deltaBase});}''')
  editor=page.locator('hui-dialog-edit-card eleven-bar-chart-editor');await editor.wait_for()
  await page.evaluate("()=>{const app=document.querySelector('home-assistant');app._updateHass({locale:{...app.hass.locale,language:'nl'},language:'nl'});deltaDialog.hass=app.hass}")
  await page.wait_for_timeout(500)
  await editor.evaluate("e=>deltaWalk(e.shadowRoot,n=>{if(n.localName==='ha-selector'&&n.schema?.name)n.setAttribute('data-delta-field',n.schema.name)})")
  processing=editor.locator('ha-form-expandable').filter(has=editor.locator('[data-delta-field="aggregation_method"]'))
  # Open the actual native expansion before selecting the option.
  field=editor.locator('[data-delta-field="aggregation_method"]')
  await field.evaluate("e=>{let n=e;while(n){if(n.localName==='ha-expansion-panel')n.expanded=true;n=n.parentElement||n.getRootNode().host}}")
  await page.wait_for_timeout(400)
  await field.click()
  print('SELECTOR',await field.aria_snapshot(),flush=True)
  option=field.get_by_role('menuitem',name='Delta (eind − begin)',exact=True)
  await option.click();await page.wait_for_timeout(500)
  cfg=await page.locator('hui-dialog-edit-card').evaluate('e=>e._cardConfig');assert cfg['aggregation_method']=='delta',cfg
  await page.locator('hui-dialog-edit-card').get_by_role('button',name='Save',exact=True).click();await page.wait_for_timeout(1400)
  captured=await page.evaluate('deltaCaptured');assert captured['aggregation_method']=='delta' and captured['aggregation_period']=='hour'
  await page.evaluate('()=>deltaDialog.showDialog({...deltaParams,cardConfig:deltaCaptured})');await editor.wait_for();await page.wait_for_timeout(600)
  assert (await page.locator('hui-dialog-edit-card').evaluate('e=>e._cardConfig'))['aggregation_method']=='delta'
  await page.keyboard.press('Escape');await page.wait_for_timeout(400)
  await page.evaluate('''()=>{window.deltaPreview=document.createElement('div');deltaPreview.style.cssText='position:fixed;inset:16px;z-index:10000;overflow:auto;background:var(--primary-background-color);padding:16px;box-sizing:border-box';window.deltaLive=document.createElement('eleven-bar-chart');deltaLive.style.cssText='display:block;max-width:850px;height:420px;margin:auto';deltaLive.setConfig(deltaCaptured);deltaLive.hass=document.querySelector('home-assistant').hass;deltaPreview.append(deltaLive);document.querySelector('home-assistant').shadowRoot.append(deltaPreview);}''')
  await page.wait_for_function("deltaLive._status==='ready'",timeout=45000)
  # Independent oracle: evaluate held boundary values from the actual raw cache,
  # rejecting any unavailable reading in the interval, not first/last samples.
  oracle=await page.evaluate('''()=>{let checked=0,nonzero=0,negative=0,missing=0;const value=(ps,t)=>ps.filter(p=>p.t<=t).at(-1)?.v??null;deltaLive._series.forEach((s,i)=>{const raw=deltaLive._rawSeries[i].points;s.points.forEach((p,j)=>{const end=s.points[j+1]?.t??deltaLive._end,a=value(raw,p.t),b=value(raw,end),gap=raw.some(q=>q.t>p.t&&q.t<=end&&q.v===null),expected=a===null||b===null||gap?null:b-a;if(p.v!==expected)throw Error(JSON.stringify({p,expected,end}));checked++;if(p.v===null)missing++;else {if(p.v!==0)nonzero++;if(p.v<0)negative++;}})});return {checked,nonzero,negative,missing,raw:deltaLive._rawSeries.map(s=>({id:s.id,points:s.points.length}))}}''')
  assert oracle['checked']>0 and oracle['nonzero']>0,oracle
  views=[]
  for width in [1280,390,320]:
   await page.set_viewport_size({'width':width,'height':1000})
   for dark in [False,True]:
    await page.evaluate("dark=>{const app=document.querySelector('home-assistant');app._updateHass({selectedTheme:{theme:'default',dark}});app._applyTheme(dark);deltaLive.hass=app.hass}",dark);await page.wait_for_timeout(700)
    fit=await page.evaluate("({client:deltaLive.clientWidth,scroll:deltaLive.scrollWidth,bars:deltaLive.shadowRoot.querySelectorAll('.series-bar').length,paths:[...deltaLive.shadowRoot.querySelectorAll('.series-bar')].map(p=>p.getAttribute('d'))})")
    assert fit['scroll']<=fit['client'] and fit['bars']==2 and all('NaN' not in d for d in fit['paths']),fit
    box=await page.locator('eleven-bar-chart .plot').last.bounding_box();await page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
    assert await page.locator('eleven-bar-chart .tooltip').last.is_visible()
    await page.mouse.move(0,0)
    shot=OUT/f'{PHASE}-{width}-{"dark" if dark else "light"}.png';await page.screenshot(path=str(shot));views.append(str(shot))
  await page.evaluate("deltaLive.setConfig({...deltaCaptured,aggregation_period:'quarter_hour'})");await page.wait_for_function("deltaLive._status==='ready'")
  assert await page.evaluate("deltaLive._config.aggregation_period==='quarter_hour' && deltaLive._config.aggregation_method==='delta'")
  await page.evaluate('deltaPreview.remove()');await browser.close()
  relevant=[e for e in errors if 'mushroom' not in e and 'garmin-polyline' not in e];assert not relevant,relevant
 async with await h.connect() as w:
  assert await configs(w)==before and await h.cmd(w,'lovelace/resources')==resources,'Preview persisted changes'
 report={'installed_module':INSTALLED,'native_delta_selection_save_reopen':True,'live_boundary_oracle':oracle,'quarter_hour':True,'dashboards_resources_unchanged':True,'views':views,'errors':relevant}
 (OUT/f'{PHASE}-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
asyncio.run(main())
