"""Synthetic browser QA for shared line interpolation. No Home Assistant writes."""
import pathlib,json,mimetypes
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-evidence/interpolation';OUT.mkdir(parents=True,exist_ok=True)
report={'checks':[],'errors':[],'provenance':'Synthetic QA fixtures; built modules'}
def route(r):
 f=ROOT/urlparse(r.request.url).path.lstrip('/')
 if f.is_file():r.fulfill(status=200,content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
 else:r.fulfill(status=404,body='not found')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args=['--no-sandbox'])
 for kind,folder in [('energy','dynamic-energy-price-card'),('history','history-graph-card')]:
  for width in [1280,390,320]:
   for dark in [False,True]:
    ctx=b.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce');ctx.route('http://eleven.test/**',route)
    page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.goto(f'http://eleven.test/cards/{folder}/qa/index.html')
    page.wait_for_function("document.querySelector('eleven-dynamic-energy-price-card')?.shadowRoot.querySelector('.price-line')" if kind=='energy' else "window.card?._status==='ready'")
    page.evaluate("kind=>{window.target=kind==='energy'?document.querySelector('eleven-dynamic-energy-price-card'):window.card}",kind)
    if kind=='energy':page.evaluate('dark=>qaTheme(!dark)',dark)
    else:page.evaluate("dark=>document.documentElement.classList.toggle('dark',dark)",dark)
    for mode,command in [('smooth',' C '),('linear',' L '),('step',' V ')]:
     page.evaluate("([kind,mode])=>{target._config={...target._config,line_interpolation:mode,...(kind==='history'?{show_fill:true}:{show_import_fill:true,show_export_fill:true})};target._render()}",[kind,mode])
     result=page.evaluate("""()=>{const s=target.shadowRoot,lines=[...s.querySelectorAll('.price-line,.series-line')],fills=[...s.querySelectorAll('.price-area,.series-fill')];return {lines:lines.map(x=>({d:x.getAttribute('d'),width:getComputedStyle(x).strokeWidth,dash:getComputedStyle(x).strokeDasharray,cap:getComputedStyle(x).strokeLinecap})),fills:fills.map(x=>x.getAttribute('d')),overflow:document.documentElement.scrollWidth>innerWidth}}""")
     assert result['lines'] and all(command in x['d'] for x in result['lines']),(kind,mode,result)
     assert not result['overflow'],(kind,width)
     if kind=='history':
      assert result['lines'][1]['d'].count('M ')==2
      assert len(result['fills'])==3 and result['fills'][1].count(' Z')==2
      page.evaluate("()=>target._showTooltip(target._start+(target._end-target._start)*44/96)")
      assert 'Unavailable' in page.evaluate("target.shadowRoot.querySelector('.tooltip').textContent")
      page.evaluate('target._hideTooltip()')
     if mode=='smooth':assert all(' V ' not in x['d'] for x in result['lines'])
     if mode=='linear':assert all(' C ' not in x['d'] and ' V ' not in x['d'] for x in result['lines'])
     if mode=='step':assert all(' C ' not in x['d'] for x in result['lines'])
     report['checks'].append({'card':kind,'width':width,'dark':dark,'mode':mode,'result':result})
     if width in [1280,390] and dark:page.screenshot(path=str(OUT/f'{kind}-{width}-{mode}.png'),full_page=True)
    ctx.close()
 b.close()
assert not report['errors'],report['errors']
(OUT/'results.json').write_text(json.dumps(report,indent=2))
print('VERIFIED',len(report['checks']),'interpolation render cases; no browser errors')
