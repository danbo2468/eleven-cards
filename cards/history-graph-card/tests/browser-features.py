"""Network-isolated synthetic history feature QA. No HA calls, server or deployment.
Run from collection root: uv run --offline --with playwright --with pillow python cards/history-graph-card/tests/browser-features.py
"""
import hashlib,json,mimetypes,pathlib,traceback
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from PIL import Image,ImageChops
ROOT=pathlib.Path(__file__).resolve().parents[3]
OUT=ROOT/'qa-evidence/history-features';OUT.mkdir(parents=True,exist_ok=True)
BASE=pathlib.Path('/opt/data/cache/scratch/history-features-work/before/dist/eleven-history-graph-card.js')
REPORT={'provenance':'Synthetic recorder-held data; network-isolated local bundle, not live HA or native HA editor','checks':[],'screenshots':[],'errors':[]}
HTML='''<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{font-family:system-ui;--primary-text-color:#212121;--secondary-text-color:#616161;--card-background-color:#fff;--secondary-background-color:#f2f3f4;--divider-color:#ddd;--primary-color:#2196f3;background:#f1f3f5;color:var(--primary-text-color)}
:root.dark{--primary-text-color:#e8e8e8;--secondary-text-color:#aaa;--card-background-color:#1c1c1c;--secondary-background-color:#282828;--divider-color:#444;background:#111}
body{margin:12px}p{font-size:12px}main{max-width:720px;height:420px;margin:auto}eleven-history-graph-card,baseline-history-card{display:block;width:100%;height:100%}
</style><p>Synthetic history feature QA — no live Home Assistant readings</p><main></main><script type="module">
customElements.define('ha-card',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>:host{border:1px solid var(--divider-color);border-radius:12px;box-sizing:border-box;overflow:hidden}</style><slot></slot>'}});
await import('/cards/history-graph-card/dist/eleven-history-graph-card.js');await import('/baseline.js');
window.requests=0;window.ids=['sensor.a','sensor.b','sensor.c'];window.hassFixture={language:'en',config:{time_zone:'Europe/Amsterdam'},states:Object.fromEntries(ids.map((id,i)=>[id,{state:'20',attributes:{friendly_name:['Living room','Bedroom','Outside'][i],unit_of_measurement:'W'}}])),callApi:async(_,url)=>{
requests++;const q=new URLSearchParams(url.split('?')[1]),end=Date.parse(q.get('end_time')),start=Date.parse(decodeURIComponent(url.split('?')[0].split('period/')[1]));
return ids.map((id,i)=>Array.from({length:97},(_,n)=>({...(n===0?{entity_id:id}:{}),state:i===1&&n>=40&&n<=48?'unavailable':String(i===0?20+10*Math.sin(n/8):i===1?12+5*Math.cos(n/6):-8-4*Math.sin(n/9)),last_changed:new Date(start+(end-start)*n/96).toISOString()}))).reverse();}};
window.card=document.createElement('eleven-history-graph-card');window.config={entities:ids,hours_to_show:24};card.setConfig(config);card.hass=hassFixture;document.querySelector('main').append(card);
window.configure=cfg=>{card.setConfig({...config,...cfg});card.hass=hassFixture;};
</script></html>'''
CLOCK="const R=Date;window.Date=class extends R{constructor(...a){super(...(a.length?a:['2026-10-14T12:00:00Z']))}static now(){return R.parse('2026-10-14T12:00:00Z')}}"
def route(r):
 path=urlparse(r.request.url).path
 if path=='/':r.fulfill(status=200,content_type='text/html',body=HTML)
 elif path=='/baseline.js':r.fulfill(status=200,content_type='application/javascript',body=BASE.read_text().replace('eleven-history-graph-card','baseline-history-card'))
 else:
  f=ROOT/path.lstrip('/')
  if f.is_file():r.fulfill(status=200,content_type=mimetypes.guess_type(str(f))[0] or 'text/plain',body=f.read_bytes())
  else:r.fulfill(status=404,body='not found')
def record(name,result):
 REPORT['checks'].append({'name':name,'result':result});(OUT/'results.json').write_text(json.dumps(REPORT,indent=2))
def shot(page,name):
 p=OUT/(name+'.png');page.locator('main').screenshot(path=str(p));REPORT['screenshots'].append(str(p))
SNAP="""c=>{const s=c.shadowRoot,box=s.querySelector('.chart').getBoundingClientRect();return {box:[box.x,box.y,box.width,box.height],paths:[...s.querySelectorAll('.series-line')].map(p=>({d:p.getAttribute('d'),stroke:getComputedStyle(p).stroke,width:getComputedStyle(p).strokeWidth,dash:getComputedStyle(p).strokeDasharray,cap:getComputedStyle(p).strokeLinecap})),legend:s.querySelector('.legend').textContent,range:c._range}}"""
TIP="""ratio=>{const c=card,s=c.shadowRoot,a=c._viewStart,b=c._viewEnd,t=a+(b-a)*ratio;c._showTooltip(t);const chart=s.querySelector('.chart').getBoundingClientRect(),plot=s.querySelector('.plot').getBoundingClientRect(),tip=s.querySelector('.tooltip').getBoundingClientRect();return {time:t,text:s.querySelector('.tooltip').textContent,inside:tip.left>=chart.left-1&&tip.right<=chart.right+1&&tip.top>=chart.top-1&&tip.bottom<=chart.bottom+1,guide:parseFloat(s.querySelector('.guide').style.left),expectedX:plot.left-chart.left+ratio*plot.width,markers:[...s.querySelectorAll('.hover-dot')].map(e=>{const b=e.getBoundingClientRect();return {width:b.width,height:b.height,top:parseFloat(e.style.top),left:parseFloat(e.style.left)}}),overflow:document.documentElement.scrollWidth>innerWidth}}"""
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args=['--no-sandbox']);record('browser',browser.version)
  for width,label in [(1280,'desktop'),(390,'mobile'),(320,'narrow')]:
   for dark in [False,True]:
    ctx=browser.new_context(viewport={'width':width,'height':760});ctx.route('http://history.test/**',route);ctx.add_init_script(CLOCK)
    p=ctx.new_page();p.on('pageerror',lambda e:REPORT['errors'].append(str(e)));p.goto('http://history.test/');p.wait_for_function("window.card?._status==='ready'");p.evaluate('dark=>document.documentElement.classList.toggle("dark",dark)',dark);p.wait_for_timeout(750)
    key=f'{label}-'+('dark' if dark else 'light')
    after=p.evaluate(f'({SNAP})(card)');shot(p,'default-'+key)
    p.locator('eleven-history-graph-card .chart').screenshot(path=str(OUT/('chart-after-'+key+'.png')))
    p.evaluate("()=>{window.baseline=document.createElement('baseline-history-card');baseline.setConfig(config);baseline.hass=hassFixture;card.remove();document.querySelector('main').append(baseline)}");p.wait_for_function("baseline._status==='ready'");p.wait_for_timeout(750)
    before=p.evaluate(f'({SNAP})(baseline)');p.locator('baseline-history-card .chart').screenshot(path=str(OUT/('chart-baseline-'+key+'.png')))
    pixels=ImageChops.difference(Image.open(OUT/('chart-after-'+key+'.png')).convert('RGB'),Image.open(OUT/('chart-baseline-'+key+'.png')).convert('RGB')).getbbox()
    record('default-parity-'+key,{'equal':after==before,'chartPixelsEqual':pixels is None});assert after==before and pixels is None
    p.evaluate("()=>{baseline.remove();card._refresh=async()=>card._render();document.querySelector('main').append(card)}")
    # Reconfigure via real asynchronous source, then freeze refresh for viewport tests.
    p.evaluate("()=>{delete card._refresh;configure({graph_mode:'stacked',aggregation_period:'hour',aggregation_method:'avg',series_options:[{entity:'sensor.b',name:'Custom bedroom',color:[240,90,40]}],show_fill:true})}");p.wait_for_function("card._status==='ready'");p.wait_for_timeout(750)
    result=p.evaluate("()=>{let s=card.shadowRoot;return {name:s.querySelector('.legend').textContent,color:getComputedStyle(s.querySelectorAll('.series-line')[1]).stroke,raw:card._rawSeries[0].points.length,aggregated:card._series[0].points.length,gaps:(s.querySelectorAll('.series-line')[1].getAttribute('d').match(/M /g)||[]).length,fills:s.querySelectorAll('.series-fill').length}}")
    record('stacked-aggregate-'+key,result);assert 'Custom bedroom' in result['name'] and result['color']=='rgb(240, 90, 40)' and result['raw']==97 and result['aggregated']<97 and result['gaps']==2 and result['fills']==3
    for ratio in [0,0.2,0.45,0.8,1]:
     result=p.evaluate(TIP,ratio);record(f'tooltip-{key}-{ratio}',result);assert result['inside'] and not result['overflow'] and abs(result['guide']-result['expectedX'])<0.01 and all(m['width']==m['height']==12 for m in result['markers'])
    # Check original values and cumulative marker heights explicitly.
    result=p.evaluate("()=>{card._showTooltip(card._start);const s=card.shadowRoot;const values=card._series.map(x=>x.points[0].v),heights=card._plotSeries.map(x=>x.points[0].v),plot=s.querySelector('.plot').getBoundingClientRect(),chart=s.querySelector('.chart').getBoundingClientRect();return {text:s.querySelector('.tooltip').textContent,values,heights,actual:[...s.querySelectorAll('.hover-dot')].map(d=>parseFloat(d.style.top)),expected:heights.map(v=>plot.top-chart.top+(card._range[1]-v)/(card._range[1]-card._range[0])*plot.height)}}")
    record('stacked-marker-values-'+key,result);assert result['heights'][1]>result['values'][1] and all(abs(a-b)<0.01 for a,b in zip(result['actual'],result['expected']))
    p.evaluate('card._hideTooltip()');shot(p,'stacked-hour-'+key)
    requests=p.evaluate('requests');p.locator('eleven-history-graph-card [data-zoom="in"]').click();assert p.evaluate('requests')==requests
    result=p.evaluate(TIP,0.2);record('zoom-coordinates-'+key,result);assert result['inside'] and abs(result['guide']-result['expectedX'])<0.01
    assert p.evaluate("card._config.aggregation_period==='hour' && card._rawSeries[0].points.length===97")
    shot(p,'zoomed-hour-'+key)
    p.locator('eleven-history-graph-card [data-zoom="out"]').click();p.locator('eleven-history-graph-card [data-zoom="reset"]').click();assert p.evaluate('card._viewport===null')
    if width==1280:
     plot=p.locator('eleven-history-graph-card .plot').bounding_box();x=plot['x'];y=plot['y']+plot['height']/2
     p.mouse.move(x+plot['width']*0.2,y);p.mouse.down();p.mouse.move(x+plot['width']*0.7,y,steps=8);assert p.evaluate("!card.shadowRoot.querySelector('.zoom-selection').hidden");p.mouse.up();assert p.evaluate('card._viewport!==null');assert p.evaluate('requests')==requests;record('desktop-drag-'+key,p.evaluate('card._viewport'))
    p.locator('eleven-history-graph-card .chart').focus();p.keyboard.press('Home');p.keyboard.press('ArrowRight');p.keyboard.press('Escape');assert p.evaluate("card.shadowRoot.querySelector('.tooltip').hidden")
    # Monthly aggregation over a useful 90-day history range.
    p.evaluate("configure({hours_to_show:2160,aggregation_period:'month',aggregation_method:'max'})");p.wait_for_function("card._status==='ready'");result=p.evaluate("()=>({period:card._config.aggregation_period,points:card._series[0].points.length,raw:card._rawSeries[0].points.length})");record('month-'+key,result);assert 3<=result['points']<=4 and result['raw']==97
    # Native selector schema is checked, not a claim of installed ha-form integration.
    result=p.evaluate("()=>{const f=card.constructor.getConfigForm(),s=f.schema.find(x=>x.name==='entities');return {multiple:s.selector.object.multiple,required:s.selector.object.fields.entity.required,nl:f.computeLabel.call({hass:{language:'nl'}},{name:'aggregation_period'}),en:f.computeLabel.call({hass:{language:'en'}},{name:'aggregation_method'})}}")
    record('native-schema-'+key,result);assert result=={'multiple':True,'required':True,'nl':'Aggregatieperiode','en':'Aggregation method'}
    p.evaluate("configure({graph_mode:'lines',hours_to_show:24,aggregation_period:'none',line_style:'dotted',line_width:6,show_fill:true,series_options:[{entity:'sensor.a',gradient_stops:[{value:0,color:[0,0,255]},{value:20,color:[0,255,0]},{value:40,color:[255,0,0]}]},{entity:'sensor.b',gradient_mode:'steps',gradient_stops:[{value:0,color:[255,0,255]},{value:15,color:[0,255,255]}]}]})");p.wait_for_function("card._status==='ready'");p.wait_for_timeout(750)
    result=p.evaluate("()=>{const s=card.shadowRoot;card._showTooltip(card._start);return {strokes:[...s.querySelectorAll('.series-line')].map(e=>e.getAttribute('stroke')),fills:[...s.querySelectorAll('.series-fill')].map(e=>e.getAttribute('fill')),a:card._appearance(0,10).color,b:card._appearance(1,10).color,hard:s.querySelector('#history-colors-1').querySelectorAll('stop').length,gaps:(s.querySelectorAll('.series-fill')[1].getAttribute('d').match(/M /g)||[]).length,widths:[...s.querySelectorAll('.series-line')].map(e=>getComputedStyle(e).strokeWidth),overflow:document.documentElement.scrollWidth>innerWidth}}")
    record('per-sensor-gradients-'+key,result);assert result['strokes'][:2]==['url(#history-colors-0)','url(#history-colors-1)'] and result['fills']==result['strokes'] and result['a']=='rgb(0,128,128)' and result['b']=='rgb(255,0,255)' and result['hard']==5 and result['gaps']==2 and all(w=='6px' for w in result['widths']) and not result['overflow']
    p.evaluate('card._hideTooltip()');shot(p,'per-sensor-gradients-'+key)
    ctx.close()
  browser.close()
 REPORT['passed']=not REPORT['errors']
except Exception:
 REPORT['passed']=False;REPORT['failure']=traceback.format_exc();print(REPORT['failure'])
finally:
 REPORT['checkCount']=len(REPORT['checks']);REPORT['screenshotCount']=len(list(OUT.glob('*.png')));REPORT['bundleSha256']=hashlib.sha256((ROOT/'cards/history-graph-card/dist/eleven-history-graph-card.js').read_bytes()).hexdigest();(OUT/'results.json').write_text(json.dumps(REPORT,indent=2));print(json.dumps({k:REPORT.get(k) for k in ['passed','checkCount','screenshotCount','errors']},indent=2))
if not REPORT['passed']:raise SystemExit(1)
