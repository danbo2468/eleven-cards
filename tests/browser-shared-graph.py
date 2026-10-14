"""Foreground, network-isolated synthetic QA; needs playwright and Pillow.
Run: uv run --with playwright --with pillow python tests/browser-shared-graph.py
Baseline is an immutable pre-refactor backup, not a live HA artifact.
"""
import json, pathlib, mimetypes, hashlib, traceback
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=pathlib.Path('/opt/data/cache/scratch/eleven-shared-graph-baseline')
OUT=ROOT/'qa-evidence/shared-graph'; OUT.mkdir(parents=True,exist_ok=True)
REPORT={'provenance':'Synthetic existing QA fixtures; frozen clock; no HA requests or deployment','baseline':str(BASE),'checks':[],'screenshots':[],'errors':[]}
def record(name, result):
    REPORT['checks'].append({'name':name,'result':result})
    (OUT/'results.json').write_text(json.dumps(REPORT,indent=2))
def route(request):
    path=urlparse(request.request.url).path
    if path=='/baseline-energy.js':
        body=(BASE/'cards/dynamic-energy-price-card/dist/eleven-dynamic-energy-price-card.js').read_text().replace('eleven-dynamic-energy-price-card','baseline-energy-card')
        request.fulfill(status=200,content_type='application/javascript',body=body);return
    f=ROOT/path.lstrip('/')
    if f.is_file():request.fulfill(status=200,content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else: request.fulfill(status=404,body='not found')
CLOCK="""const RealDate=Date; window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-14T12:00:00Z']))}static now(){return RealDate.parse('2026-10-14T12:00:00Z')}};"""
SNAP="""c=>{const s=c.shadowRoot, rect=e=>{let b=e.getBoundingClientRect(),o=c.getBoundingClientRect();return [b.x-o.x,b.y-o.y,b.width,b.height]};return {bounds:rect(c),paths:[...s.querySelectorAll('svg path')].map(p=>{let a=getComputedStyle(p);return {class:p.getAttribute('class'),d:p.getAttribute('d'),stroke:a.stroke,width:a.strokeWidth,dash:a.strokeDasharray,cap:a.strokeLinecap,join:a.strokeLinejoin,fill:a.fill,opacity:a.opacity,fillOpacity:a.fillOpacity,vector:a.vectorEffect}}),labels:[...s.querySelectorAll('.chart-label')].map(e=>({text:e.textContent,box:rect(e),color:getComputedStyle(e).color})),chart:rect(s.querySelector('.chart')),table:s.querySelector('.favorable-table')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth}}"""
LIFECYCLE="""async kind=>{let source=kind==='energy'?window.current:window.card,c=document.createElement(source.localName);let original=document.querySelector('main,.stage');let detached; if(kind==='energy'){c.setConfig(source._config);c.hass=source._hass;detached=c._graph?.loaded??false;}else{c.setConfig(source._config);c._hass=source._hass;c._series=source._series;c._start=source._start;c._end=source._end;c._status='ready';c._render();detached=c._graph?.loaded??false;c._refresh=async()=>c._render();} source.remove();original.append(c);if(kind==='history')c._render();let group=()=>c.shadowRoot.querySelector('.chart-series');let anim=()=>group()?.getAnimations().find(a=>a.animationName==='chart-reveal');await new Promise(r=>setTimeout(r,90));let a=anim(),first=a?.currentTime??null,initialClip=getComputedStyle(group()).clipPath;c._render();let resumed=anim()?.currentTime??null;await new Promise(r=>setTimeout(r,100));let later=anim()?.currentTime??null;await new Promise(r=>setTimeout(r,700));c._render();let replay=!!anim();c.remove();original.append(c);if(kind==='history')c._render();let reconnectReplay=!!anim();return {detached,first,resumed,later,initialClip,replay,reconnectReplay,dashes:[...c.shadowRoot.querySelectorAll('.price-line,.series-line')].map(p=>getComputedStyle(p).strokeDasharray)}}"""
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args=['--no-sandbox'])
  record('browser',{'version':browser.version})
  for width,label in [(1280,'desktop'),(390,'mobile'),(320,'narrow')]:
   for light in [False,True]:
    context=browser.new_context(viewport={'width':width,'height':1000},device_scale_factor=1)
    context.route('http://eleven.test/**',route);context.add_init_script(CLOCK)
    page=context.new_page();page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
    page.goto('http://eleven.test/cards/dynamic-energy-price-card/qa/index.html')
    page.wait_for_function("document.querySelector('#card').shadowRoot.querySelector('.price-line')")
    page.evaluate("async()=>{window.current=document.querySelector('#card');window.showcase={...current._config};await import('/baseline-energy.js');window.baseline=document.createElement('baseline-energy-card');baseline.setConfig(current._config);baseline.hass=current._hass;window.swap=c=>{document.querySelector('main').replaceChildren(c)};}")
    for mode in ['default','showcase','runtime-import','export-only']:
     page.evaluate("([light,mode])=>{qaTheme(light);let cfg=mode==='default'?qaBase:mode==='showcase'?showcase:mode==='runtime-import'?{entity:qaBase.entity}:{...qaBase,graph_mode:'export',current_price_mode:'export'};current.setConfig(cfg);current.hass=current._hass;baseline.setConfig(current._config);baseline.hass=current._hass;swap(current)}",[light,mode])
     page.wait_for_timeout(750)
     after=page.evaluate(f"({SNAP})(current)")
     name=f'energy-{label}-{ "light" if light else "dark"}-{mode}'
     af=OUT/(name+'-after.png');page.locator('main').screenshot(path=str(af))
     page.evaluate('swap(baseline)');page.wait_for_timeout(750)
     before=page.evaluate(f"({SNAP})(baseline)")
     bf=OUT/(name+'-baseline.png');page.locator('main').screenshot(path=str(bf))
     difference=ImageChops.difference(Image.open(af).convert('RGB'),Image.open(bf).convert('RGB'))
     pixels=difference.tobytes();nonzero=sum(1 for i in range(0,len(pixels),3) if pixels[i:i+3]!=b'\0\0\0')
     record(name,{'equalComputedGeometryAndStyles':after==before,'differingPixels':nonzero,'after':after,'baseline':before})
     REPORT['screenshots'] += [str(bf),str(af)]
     assert after==before,name+' DOM parity'
     assert nonzero==0,name+' pixel parity'
    page.evaluate('swap(current)')
    # Compare interaction output against the baseline in the exact same chart box.
    outputs=[]
    for which in ['current','baseline']:
     page.evaluate(f'swap({which})')
     chart=page.locator(f'{"#card" if which=="current" else "baseline-energy-card"} .chart')
     chart.focus();page.keyboard.press('Home');page.keyboard.press('ArrowRight')
     outputs.append(page.evaluate("which=>{let c=window[which],s=c.shadowRoot,t=s.querySelector('.tooltip'),cb=s.querySelector('.chart').getBoundingClientRect(),tb=t.getBoundingClientRect();return {visible:!t.hidden,text:t.textContent,inside:tb.left>=cb.left-1&&tb.right<=cb.right+1&&tb.top>=cb.top-1&&tb.bottom<=cb.bottom+1,markers:[...s.querySelectorAll('.hover-dot:not([hidden])')].map(e=>{let b=e.getBoundingClientRect();return [b.width,b.height]})}}",which))
     page.keyboard.press('Escape');assert page.evaluate(f"{which}.shadowRoot.querySelector('.tooltip').hidden")
    record(f'energy-interactions-{label}-{light}',{'baseline':outputs[1],'after':outputs[0],'equal':outputs[0]==outputs[1]})
    assert outputs[0]==outputs[1] and outputs[0]['visible']
    assert all(w==h for w,h in outputs[0]['markers'])
    page.evaluate('swap(current)')
    if width==1280 and not light:
     record('energy-existing-localization-interaction-suite',page.evaluate('checkLocalization(current)'))
     result=page.evaluate(LIFECYCLE,'energy');record('energy-animation-lifecycle',result)
     assert result['detached'] is False and result['first']>0 and abs(result['resumed']-result['first'])<25 and result['later']>result['resumed'] and not result['replay'] and not result['reconnectReplay']
    context.close()
  for width,label in [(1280,'desktop'),(390,'mobile'),(320,'narrow')]:
   for dark in [False,True]:
    context=browser.new_context(viewport={'width':width,'height':1000});context.route('http://eleven.test/**',route);context.add_init_script(CLOCK)
    page=context.new_page();page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
    page.goto('http://eleven.test/cards/history-graph-card/qa/index.html');page.wait_for_function("window.card?._status==='ready'")
    page.evaluate("dark=>document.documentElement.classList.toggle('dark',dark)",dark);page.wait_for_timeout(750)
    result=page.evaluate("runChecks()");record(f'history-default-{label}-{dark}',result)
    assert result['paths']==3 and result['tooltipVisible'] and result['tooltipInside'] and result['roundMarkers'] and result['escape'] and not result['overflow']
    default_shot=OUT/f'history-default-{label}-{"dark" if dark else "light"}.png';page.locator('.stage').screenshot(path=str(default_shot));REPORT['screenshots'].append(str(default_shot))
    for style in ['solid','dashed','dotted']:
     page.evaluate("style=>{card._config={...card._config,line_style:style,line_width:3.5,show_fill:true};card._render()}",style)
     result=page.evaluate("()=>{let s=card.shadowRoot,p=s.querySelectorAll('.series-line')[1],a=getComputedStyle(p),f=s.querySelectorAll('.series-fill')[1];card._showTooltip(card._start+(card._end-card._start)*44/96);return {stroke:a.strokeWidth,dash:a.strokeDasharray,cap:a.strokeLinecap,vector:a.vectorEffect,steps:/ H /.test(p.getAttribute('d'))&&!/ C /.test(p.getAttribute('d')),lineGap:p.getAttribute('d').split('M ').length-1,fillGap:f.getAttribute('d').split(' Z').length-1,gapTooltip:s.querySelector('.tooltip').textContent,markers:s.querySelectorAll('.hover-dot').length,fillMask:f.getAttribute('mask')}}")
     record(f'history-{label}-{dark}-{style}',result)
     assert result['stroke']=='3.5px' and result['vector']=='non-scaling-stroke' and result['steps'] and result['lineGap']==2 and result['fillGap']==2 and 'Unavailable' in result['gapTooltip'] and result['markers']==2
     assert result['dash']=={'solid':'none','dashed':'8px, 7px','dotted':'1px, 7px'}[style]
     assert result['cap']==('butt' if style=='dashed' else 'round')
    page.evaluate('card._hideTooltip()');shot=OUT/f'history-{label}-{"dark" if dark else "light"}.png';page.locator('.stage').screenshot(path=str(shot));REPORT['screenshots'].append(str(shot))
    page.evaluate("()=>{card._config={...card._config,show_hover_line:false,show_fill:false};card._render();}")
    result=page.evaluate("()=>({guide:!!card.shadowRoot.querySelector('.guide'),fills:card.shadowRoot.querySelectorAll('.series-fill').length,...runChecks()})")
    record(f'history-optional-off-{label}-{dark}',result);assert not result['guide'] and result['fills']==0 and result['tooltipVisible'] and result['escape']
    chart=page.locator('eleven-history-graph-card .chart');b=chart.bounding_box();page.mouse.click(b['x']+b['width']/2,b['y']+b['height']/2)
    assert page.evaluate('card._pinned');page.keyboard.press('Escape');assert page.evaluate("card.shadowRoot.querySelector('.tooltip').hidden")
    if width==1280 and not dark:
     result=page.evaluate(LIFECYCLE,'history');record('history-animation-lifecycle',result)
     assert result['detached'] is False and result['first']>0 and abs(result['resumed']-result['first'])<25 and result['later']>result['resumed'] and not result['replay'] and not result['reconnectReplay']
    context.close()
  for kind in ['energy','history']:
   context=browser.new_context(reduced_motion='reduce');context.route('http://eleven.test/**',route);context.add_init_script(CLOCK)
   page=context.new_page();folder='dynamic-energy-price-card' if kind=='energy' else 'history-graph-card'
   page.goto(f'http://eleven.test/cards/{folder}/qa/index.html');page.wait_for_function("document.querySelector('eleven-dynamic-energy-price-card,eleven-history-graph-card')?.shadowRoot.querySelector('.chart-series')")
   result=page.evaluate("()=>{let c=document.querySelector('eleven-dynamic-energy-price-card,eleven-history-graph-card'),g=c.shadowRoot.querySelector('.chart-series');return {animations:g.getAnimations().length,clip:getComputedStyle(g).clipPath,lines:c.shadowRoot.querySelectorAll('.price-line,.series-line').length}}")
   record(kind+'-reduced-motion',result);assert result['animations']==0 and result['clip']=='none' and result['lines']>0;context.close()
  browser.close()
 REPORT['passed']=True
except Exception:
 REPORT['passed']=False;REPORT['failure']=traceback.format_exc();print(REPORT['failure'])
finally:
 REPORT['checkCount']=len(REPORT['checks']);REPORT['screenshotCount']=len(REPORT['screenshots'])
 REPORT['artifacts']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.glob('cards/*/dist/*.js')}
 (OUT/'results.json').write_text(json.dumps(REPORT,indent=2))
 print(json.dumps({k:REPORT.get(k) for k in ['passed','checkCount','screenshotCount','errors']},indent=2))
if not REPORT['passed']:raise SystemExit(1)
