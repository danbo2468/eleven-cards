// Shared markup stays in each card's shadow root: native links and existing
// data-zoom handlers work without cross-bundle custom-element registration.
const headerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cardHeaderIcon(name){
 const paths={in:'M5 12h14M12 5v14',out:'M5 12h14',reset:'M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6',previous:'m15 6-6 6 6 6',next:'m9 6 6 6-6 6',history:'m9 6 6 6-6 6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
export function cardHeader({title,showTitle=true,ready=false,historyUrl,language='en'}){
 const nl=language.startsWith('nl'),label=nl?['Inzoomen','Uitzoomen','Zoom herstellen','Geschiedenis']:['Zoom in','Zoom out','Reset zoom','History'];
 const zoom=ready?`<div class="zoom-controls" role="group" aria-label="Zoom">${['in','out','reset'].map((action,i)=>`<button type="button" data-zoom="${action}" title="${label[i]}" aria-label="${label[i]}">${cardHeaderIcon(action)}</button>`).join('')}</div>`:'';
 return `<header class="card-header">${showTitle&&title?`<h2>${headerEscape(title)}</h2>`:''}<div class="header-actions">${zoom}<a class="history-link" href="${headerEscape(historyUrl)}" title="${label[3]}" aria-label="${label[3]}">${cardHeaderIcon('history')}</a></div></header>`;
}
export function cardHeaderStyles(){return `
.card-header{display:flex;align-items:flex-start;gap:8px;min-height:32px;flex:none;margin:-6px -4px 12px 0}
.card-header h2{flex:1;min-width:0;margin:4.75px 0 0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
.header-actions{display:flex;align-items:center;gap:2px;flex:none;margin-inline-start:auto}
.zoom-controls{display:flex;gap:2px}
.header-actions button,.history-link{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--secondary-text-color,#666);text-decoration:none;cursor:pointer}
.header-actions button:hover,.history-link:hover{background:var(--secondary-background-color,#eee)}
.header-actions button:focus-visible,.history-link:focus-visible{background:var(--secondary-background-color,#eee);outline:2px solid var(--primary-color,#2196f3);outline-offset:-2px}
.header-actions svg,.period-controls button svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
`;}
