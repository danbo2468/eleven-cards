export function calendarCardStyles(){return `
:host{display:block;height:100%;min-width:0;min-height:0;container-type:inline-size}
ha-card{display:block;height:100%;min-width:0;min-height:0;color:var(--primary-text-color,#20252b);background:var(--ha-card-background,var(--card-background-color,#fff));font:inherit}
.content{display:flex;flex-direction:column;height:100%;padding:16px;min-width:0;min-height:0;box-sizing:border-box}
.content>.header,.content>.legend,.content>.status{flex-shrink:0}
.calendar-body{flex:1;min-height:0;overflow:auto;scrollbar-width:thin}
.legend-error{display:inline-grid;place-items:center;width:13px;height:13px;border:1px solid currentColor;border-radius:50%;color:var(--error-color,#db4437);font-size:10px;line-height:1;flex:none}
.event-button[data-next-event],.month-chip[data-next-event],.popup-more li[data-next-event]{background:color-mix(in srgb,var(--event-color) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--event-color) 50%,transparent)}
.event-button[data-next-event] .event-title{font-weight:650}
.header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 12px;margin-bottom:12px}
.header h2{font-size:18px;line-height:1.25;font-weight:650;margin:0;min-width:72px;flex:1}
.header-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;margin-inline-start:auto}
.navigation{display:flex;align-items:center;min-width:0;border-radius:5px;background:var(--secondary-background-color,#f3f3f3)}
.navigation .range{padding:0 9px;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums;border-inline-end:1px solid var(--divider-color,#ddd)}
.navigation [data-nav=now]{width:auto;padding:0 9px}
.header-actions svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.info-button{background:var(--secondary-background-color,#f3f3f3);border-radius:5px}
.legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 15px;margin:0 0 12px;font-size:11px;color:var(--secondary-text-color,#666)}
.legend-item{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;min-height:26px;padding:3px 0;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}.legend-item[aria-pressed="false"]{opacity:.45}.legend-item[aria-pressed="false"] span{text-decoration:line-through}.legend-item:focus-visible{outline:2px solid var(--primary-color,#2196f3);outline-offset:2px}.legend-item span{overflow-wrap:anywhere}.dot{width:7px;height:7px;border-radius:2px;flex:none;background:var(--event-color)}
.status{font-size:12px;line-height:1.45;color:var(--secondary-text-color,#666);margin:6px 0 12px}
.status.error{color:var(--error-color,#db4437)}.status button{font:inherit;cursor:pointer;margin-inline-start:8px;padding:3px 8px;border:1px solid var(--divider-color,#ddd);border-radius:5px;background:transparent;color:inherit}
.day-list{display:grid}.list-day+.list-day{border-top:1px solid var(--divider-color,#ddd);margin-top:12px;padding-top:12px}
.day-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px}
.day-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 7px;font-size:12px;font-weight:600}.day-title time{font-size:11px;font-weight:400;color:var(--secondary-text-color,#666)}
.weather{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums}
.weather svg{width:21px;height:21px;flex:none;stroke:currentColor;stroke-width:1.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
.weather b{font-weight:600;color:var(--primary-text-color,#20252b)}
.list-event{display:grid;grid-template-columns:59px minmax(0,1fr);gap:10px;align-items:start;padding:6px 0}
.event-time{font-size:11px;color:var(--secondary-text-color,#666);font-variant-numeric:tabular-nums;line-height:1.4}.list-event>.event-time small{display:block;font-size:10px}
.event-button{display:block!important;min-width:0;width:100%;text-align:start;padding:0 0 0 9px!important;border-inline-start:3px solid var(--event-color)!important;border-radius:0!important;line-height:1.35}
.event-button .event-title{display:block;font-size:12px;font-weight:500;overflow-wrap:anywhere}.event-button .event-meta{display:block;margin-top:2px;color:var(--secondary-text-color,#666);font-size:10px;overflow-wrap:anywhere}
.empty-day{font-size:11px;color:var(--secondary-text-color,#666);padding:7px 0;margin:0}
.horizontal{overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--divider-color,#ddd) transparent}
.day-columns{display:grid;grid-template-columns:repeat(var(--days),minmax(132px,1fr));min-width:calc(var(--days)*132px)}
.column{min-width:0;padding:0 10px 10px}.column:first-child{padding-left:0}.column:last-child{padding-right:0}.column+.column{border-inline-start:1px solid var(--divider-color,#ddd)}
.column-heading{display:flex;flex-direction:column;gap:6px;min-height:64px;margin-bottom:9px;font-size:12px;font-weight:600}.column-heading time{font-size:11px;color:var(--secondary-text-color,#666);font-weight:400;margin-inline-start:4px}
.column .event-button{padding:7px 7px 7px 9px!important;background:color-mix(in srgb,var(--event-color) 9%,transparent);border-radius:0 5px 5px 0!important;margin-bottom:7px}
.column .event-button:hover,.month-chip:hover{background:color-mix(in srgb,var(--event-color) 17%,transparent)}
.column .event-time{display:block;margin-bottom:4px;color:var(--event-color);font-size:10px}.column .event-title{font-size:11px}.column .event-meta{font-size:10px}
.month-grid{display:grid;grid-template-columns:repeat(7,minmax(95px,1fr));min-width:665px;border-top:1px solid var(--divider-color,#ddd);border-inline-start:1px solid var(--divider-color,#ddd)}
.month-weekday{padding:7px 5px;text-align:center;color:var(--secondary-text-color,#666);font-size:10px;font-weight:600;border-inline-end:1px solid var(--divider-color,#ddd);border-bottom:1px solid var(--divider-color,#ddd)}
.month-cell{min-width:0;min-height:108px;padding:7px 7px 9px;border-inline-end:1px solid var(--divider-color,#ddd);border-bottom:1px solid var(--divider-color,#ddd)}
.month-cell.outside{background:color-mix(in srgb,var(--secondary-text-color,#666) 4%,transparent)}
.month-cell.today{box-shadow:inset 0 0 0 1px var(--primary-color,#2196f3)}
.month-cell-head{display:flex;align-items:center;justify-content:space-between;gap:2px;min-height:22px;margin-bottom:3px;font-size:11px}
.month-cell-head time{font-weight:600}.month-cell.outside .month-cell-head time{color:var(--secondary-text-color,#666)}
.month-cell .weather{gap:2px;font-size:10px}.month-cell .weather svg{width:17px;height:17px}.month-cell .weather .low{display:none}
.month-chip{display:block!important;width:100%;min-height:30px!important;min-width:0;text-align:start;margin:0 0 4px;padding:5px 6px!important;border:0!important;border-inline-start:3px solid var(--event-color)!important;border-radius:0 4px 4px 0!important;background:color-mix(in srgb,var(--event-color) 9%,transparent);font-size:12px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.month-more{display:block;min-height:26px;padding:4px 6px;border:0;background:transparent;color:var(--secondary-text-color,#666);font:inherit;font-size:11px;cursor:pointer;text-align:start}
.compact .content{padding:12px 14px}.compact .header{margin-bottom:8px}.compact .legend{margin-bottom:7px}
.compact .list-day+.list-day{margin-top:7px;padding-top:7px}.compact .day-heading{margin-bottom:2px}
.compact .list-event{grid-template-columns:54px minmax(0,1fr);gap:7px;align-items:center;padding:2px 0}.compact .list-event>.event-time{font-size:10px}.compact .list-event .event-button{min-height:24px!important;padding-inline-start:7px!important}.compact .list-event .event-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.compact .event-meta{display:none}.compact .empty-day{padding:3px 0}
.compact .column{padding-bottom:6px}.compact .column-heading{min-height:48px;margin-bottom:5px;gap:3px}.compact .column .event-button{min-height:24px!important;margin-bottom:4px;padding:4px 6px 4px 8px!important}.compact .column .event-time{margin-bottom:2px}
.compact .month-cell{min-height:74px;padding:3px 4px 5px}.compact .month-cell-head{min-height:19px;margin-bottom:2px}.compact .month-chip{min-height:24px!important;margin-bottom:2px;padding:2px 4px!important;font-size:10px;line-height:1.2}.compact .month-more{min-height:23px;padding:3px 5px;font-size:10px}
.calendar-event-popup{width:min(380px,calc(100vw - 16px))}.calendar-event-popup .ui-popup-heading>strong{min-width:0;overflow-wrap:anywhere}
.popup-calendar{display:flex;align-items:center;gap:7px;margin:5px 0 12px;color:var(--secondary-text-color,#666);font-size:11px}
.popup-when{padding:10px 12px;background:var(--secondary-background-color,#f3f3f3);border-radius:6px}
.popup-date,.popup-date-range{display:flex;flex-wrap:wrap;gap:3px 6px;overflow-wrap:anywhere;font-size:12px;font-weight:600}
.popup-date-range{display:grid;gap:2px}.popup-date-range .popup-date-separator{color:var(--secondary-text-color,#666)}
.popup-time{margin-top:3px;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}.popup-field{padding:10px 0 0;margin-top:10px;border-top:1px solid var(--divider-color,#ddd)}
.popup-field-label{display:block;margin-bottom:3px;color:var(--secondary-text-color,#666);font-size:10px}.popup-location,.popup-description{font-size:12px;overflow-wrap:anywhere}.popup-description{white-space:pre-wrap}
.popup-more{list-style:none;padding:0;margin:9px 0}.popup-more li{padding:5px 0;border-top:1px solid var(--divider-color,#ddd);font-size:11px}.popup-more summary{cursor:pointer}.popup-more small{display:block;color:var(--secondary-text-color,#666)}.popup-more-detail{padding:8px 0 10px 12px}
.calendar-info .insight-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 8px}
.calendar-info .calendar-agenda-metrics{grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px 12px;margin:6px 0 0}
.calendar-info .insight-metrics>div{min-width:0}.calendar-info dt{font-size:10px;color:var(--secondary-text-color,#666)}.calendar-info dd{margin:2px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.calendar-info .calendar-agenda-metrics dd small{display:block;margin-top:2px;font-size:10px;font-weight:400;color:var(--secondary-text-color,#666)}
.calendar-info .insight-sensor{padding:8px 0}
.calendar-info .insight-sensor+.insight-sensor{border-top:1px solid var(--divider-color,#ddd)}
.calendar-info .insight-sensor-heading{display:flex;align-items:center;gap:8px;min-width:0}.calendar-info .insight-sensor-heading strong{flex:1;min-width:0;overflow-wrap:anywhere}
.calendar-info .insight-states{font-size:10px;color:var(--secondary-text-color,#666);margin-top:4px}
@container(max-width:420px){.content{padding:12px}.header{align-items:flex-start}.header-actions{gap:5px}.navigation .range{font-size:10px;padding:0 6px}.navigation [data-nav=now]{padding:0 6px}.list-event{grid-template-columns:50px minmax(0,1fr);gap:8px}.weather{font-size:10px}}
`;}
