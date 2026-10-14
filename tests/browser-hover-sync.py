import pathlib, threading, time, json, sys, os
from playwright.sync_api import sync_playwright
sys.path.insert(0,'/opt/data/cache/scratch')
ROOT=pathlib.Path('/opt/data/workspace/eleven-cards')
OUT=pathlib.Path('/opt/data/cache/scratch/eleven-hover-qa');OUT.mkdir(exist_ok=True)
source=pathlib.Path('/opt/data/cache/scratch/eleven_live_qa.py').read_text()
source=source.replace("URLS=json.loads((ROOT/'verified.json').read_text())['urls']", "URLS={}")
source=source.replace("MODULES={name:urllib.request.urlopen(h.BASE+url,timeout=30).read() for name,url in URLS.items()}", "MODULES={slug:pathlib.Path('/opt/data/workspace/eleven-cards/cards/'+slug+'/dist/eleven-'+slug+'.js').read_bytes() for slug in ['history-graph-card','dynamic-energy-price-card']}")
if os.environ.get('HOVER_INSTALLED'):
 source=pathlib.Path('/opt/data/cache/scratch/eleven_live_qa.py').read_text().replace('/opt/data/cache/scratch/eleven-deploy','/opt/data/cache/scratch/eleven-hover-install')
threading.Thread(target=lambda:exec(compile(source,'hover_fixture','exec'),{}),daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/opt/hermes/.playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for _ in range(45):
  try:page.goto('http://127.0.0.1:18768/');break
  except Exception:time.sleep(1)
 page.wait_for_function('window.ready===true')
 page.wait_for_function("instances.every(x=>x.element.shadowRoot.querySelector('.price-line,.series-line'))",timeout=90000)
 result=page.evaluate('''() => {
  const histories=instances.map(x=>x.element).filter(c=>c.localName.includes('history'));
  const energies=instances.map(x=>x.element).filter(c=>c.localName.includes('energy'));
  const h=histories[0], e=energies[0];
  const start=Math.max(h._start,e._chart.start),end=Math.min(h._end,e._chart.start+e._chart.span);
  const t=start+(end-start)*0.53;
  h._showTooltip(t);
  return {t,energy:e._hoverTimestamp,history:histories.map(c=>c._cursor),counts:[histories.length,energies.length]};
 }''')
 assert result.get('energy')==result['t'],result
 print('CROSS-CARD HOVER VERIFIED',json.dumps(result))
 touch=page.evaluate('''() => {
  const h=instances.find(x=>x.element.localName.includes('history')).element;
  const chart=h.shadowRoot.querySelector('.chart'),box=chart.querySelector('.plot').getBoundingClientRect();
  chart.dispatchEvent(new PointerEvent('pointerdown',{clientX:box.left+box.width*.6,clientY:box.top+30,pointerType:'touch',bubbles:true,composed:true}));
  return instances.map(({element:c})=>({type:c.localName,time:c.localName.includes('history')?c._cursor:c._hoverTimestamp,hidden:c.shadowRoot.querySelector('.tooltip').hidden}));
 }''')
 assert all(not r['hidden'] for r in touch),touch
 result['touch']=touch
 checks=page.evaluate('''() => {
  const cards=instances.map(x=>x.element),h=cards.find(c=>c.localName.includes('history')),e=cards.find(c=>c.localName.includes('energy'));
  const t=Math.max(h._start,e._chart.start)+(Math.min(h._end,e._chart.start+e._chart.span)-Math.max(h._start,e._chart.start))*.53;
  const check=(ok,label)=>{if(!ok)throw Error(label);return label;},passed=[];
  h._showTooltip(t);
  passed.push(check(cards.filter(c=>c!==h).every(c=>c._hoverTimestamp===t),'all live instances follow exact timestamp'));
  passed.push(check(Math.abs(Number(e.shadowRoot.querySelector('.hover-line').getAttribute('x1'))-e._chart.xFor(t))<.001,'energy guide uses exact timestamp rather than snapping to tariff interval'));
  const index=e._chart.timeline.findIndex(p=>p.timestamp<=t&&t<p.timestamp+e._chart.intervalMs);
  e._showPoint(index);passed.push(check(h._cursor===e._hoverTimestamp,'energy to history'));
  const box=e.shadowRoot.querySelector('.chart').getBoundingClientRect();
  e.shadowRoot.querySelector('.chart').dispatchEvent(new PointerEvent('pointermove',{clientX:box.left+e._chart.xFor(t)/e._chart.svgWidth*box.width,clientY:box.top+30,pointerType:'mouse',bubbles:true,composed:true}));
  passed.push(check(h._cursor===e._hoverTimestamp&&h._cursor!==null,'mouse movement shares timestamp'));
  const chart=e.shadowRoot.querySelector('.chart');chart.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  passed.push(check(h._cursor===e._hoverTimestamp,'keyboard shares timestamp'));
  chart.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  passed.push(check(cards.every(c=>c.shadowRoot.querySelector('.tooltip').hidden),'Escape clears group'));
  h._showTooltip(t);e._render();passed.push(check(e._hoverTimestamp===t&&!e.shadowRoot.querySelector('.tooltip').hidden,'receiver rerender restores shared hover'));
  e._config={...e._config,show_hover_line:false};e._render();h._showTooltip(t+1000);
  passed.push(check(!e.shadowRoot.querySelector('.hover-line')&&!e.shadowRoot.querySelector('.tooltip').hidden,'hidden guide preserves synced tooltip'));
  e._config={...e._config,show_hover_line:true,sync_hover:false};e._hideTooltip(false);h._showTooltip(t);
  passed.push(check(e._hoverTimestamp===null,'opt out does not receive'));
  e._showPoint(index);passed.push(check(h._cursor===t,'opt out does not publish'));
  e._config={...e._config,sync_hover:true,hover_sync_group:'separate'};e._hideTooltip(false);h._showTooltip(t+2000);
  passed.push(check(e._hoverTimestamp===null,'different groups stay independent'));
  e._config={...e._config,hover_sync_group:''};e._render();h._showTooltip(t);
  const source=e._chart.timeline.findIndex(p=>p.timestamp>h._end);
  if(source>=0){e._showPoint(source);passed.push(check(h._cursor===null&&h.shadowRoot.querySelector('.tooltip').hidden,'out of history range hides cursor instead of clamping'))}
  h._showTooltip(t);const parent=h.parentNode;h.remove();
  passed.push(check(cards.filter(c=>c!==h).every(c=>c._hoverTimestamp===null),'disconnect source clears group'));
  parent.append(h);
  return passed;
 }''')
 result['checks']=checks
 page.wait_for_function("instances.every(x=>x.element.shadowRoot.querySelector('.price-line,.series-line'))",timeout=90000)
 for width in [1280,390,320]:
  page.set_viewport_size({'width':width,'height':1100})
  for dark in [True,False]:
   page.evaluate('''dark=>{document.body.style.setProperty('--card-background-color',dark?'#20252b':'#ffffff');document.body.style.setProperty('--ha-card-background',dark?'#20252b':'#ffffff');document.body.style.setProperty('--primary-text-color',dark?'#eeeeee':'#222222');document.body.style.setProperty('--secondary-text-color',dark?'#aaaaaa':'#666666');document.body.style.background=dark?'#111827':'#f3f4f6';const cards=instances.map(x=>x.element),h=cards.find(c=>c.localName.includes('history')),e=cards.find(c=>c.localName.includes('energy'));h._showTooltip(Math.max(h._start,e._chart.start)+(Math.min(h._end,e._chart.start+e._chart.span)-Math.max(h._start,e._chart.start))*.53);}''',dark)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   assert page.evaluate("instances.every(({element:c})=>{const t=c.shadowRoot.querySelector('.tooltip'),r=t.getBoundingClientRect(),b=c.shadowRoot.querySelector('.chart').getBoundingClientRect();return t.hidden||(r.left>=b.left-1&&r.right<=b.right+1)})"),width
   page.screenshot(path=str(OUT/f'hover-{width}-{dark}.png'),full_page=True)
 print('INTERACTION CHECKS VERIFIED',json.dumps(checks))
 assert not errors and not page.evaluate('window.errors'),errors
 result['provenance']='Home Assistant-served installed modules with live read-only data and unchanged card configurations, rendered in a standalone browser fixture' if os.environ.get('HOVER_INSTALLED') else 'Local modules with read-only Home Assistant data in a standalone browser fixture'
 result['errors']=errors
 assert page.evaluate('instances.length==='+str(sum(result['counts'])))
 page.set_viewport_size({'width':1280,'height':1100})
 page.screenshot(path=str(OUT/'hover-desktop.png'),full_page=True)
 (OUT/'browser-verified.json').write_text(json.dumps(result,indent=2));browser.close()
