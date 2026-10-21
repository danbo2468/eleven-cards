// Synthetic native-form contract fixture. This is not Home Assistant's ha-form.
class QAForm extends HTMLElement {
  set hass(value){this._hass=value;}
  set data(value){this._data=value;this.render();}
  set schema(value){this._schema=value;this.render();}
  set computeLabel(value){this._label=value;this.render();}
  set computeHelper(value){this._helper=value;this.render();}
  _change(name,value){
    this._data={...this._data,[name]:value};
    this.dispatchEvent(new CustomEvent('value-changed',{detail:{value:this._data},bubbles:true,composed:true}));
  }
  render(){if(this._data && this._schema)this._sync(this,this._schema);}
  _sync(container,schema){
    const wanted=new Set(schema.map(s=>s.name));
    for(const entry of [...container.children])if(!wanted.has(entry.dataset.field))entry.remove();
    schema.forEach((s,index)=>{
      let entry=[...container.children].find(node=>node.dataset.field===s.name);
      if(!entry){
        entry=document.createElement(s.type==='expandable'?'details':'div');entry.dataset.field=s.name;
        if(s.type==='expandable'){entry.innerHTML='<summary></summary><div class="form-body"></div>';entry.open=!!s.expanded;}
        else entry.innerHTML='<label><span class="field-label"></span></label><small class="field-helper"></small>';
      }
      if(container.children[index]!==entry)container.insertBefore(entry,container.children[index]??null);
      if(s.type==='expandable'){
        entry.querySelector('summary').textContent=s.title;
        this._sync(entry.querySelector('.form-body'),s.schema);return;
      }
      entry.querySelector('.field-label').textContent=this._label?.(s)??s.name;
      const helper=entry.querySelector('.field-helper');helper.textContent=this._helper?.(s)??'';helper.hidden=!helper.textContent;
      const selector=s.selector;
      if(selector.object){this._objects(entry,s);return;}
      const label=entry.querySelector('label');
      let input=label.querySelector('input,select');
      if(!input){
        input=document.createElement(selector.select?'select':'input');input.name=s.name;
        if(!selector.select)input.type=selector.boolean?'checkbox':selector.number?'number':selector.color_rgb?'color':'text';
        input.onchange=()=>this._change(s.name,input.type==='checkbox'?input.checked:input.type==='number'?(input.value===''?undefined:Number(input.value)):input.type==='color'?[1,3,5].map(i=>parseInt(input.value.slice(i,i+2),16)):input.value);
        label.append(input);
      }
      if(selector.select){
        const options=selector.select.options;
        if(JSON.stringify(input._options)!==JSON.stringify(options)){
          input.replaceChildren(...options.map(row=>{const option=document.createElement('option');option.value=row.value;option.textContent=row.label;return option;}));input._options=options;
        }
      }
      if(input.type==='checkbox')input.checked=!!this._data[s.name];
      else{
        const value=input.type==='color'?'#'+(this._data[s.name]??[0,0,0]).map(n=>n.toString(16).padStart(2,'0')).join(''):String(this._data[s.name]??'');
        if(input.value!==value)input.value=value;
      }
    });
  }
  _objects(entry,s){
    let list=entry.querySelector('.object-list');
    if(!list){
      list=document.createElement('div');list.className='object-list';entry.append(list);
      const add=document.createElement('button');add.type='button';add.dataset.objectAdd=s.name;add.textContent='Stop toevoegen';
      add.onclick=()=>{const rows=this._data[s.name]??[];this._change(s.name,[...rows,{value:(rows.at(-1)?.value??0)+1,color:[33,150,243]}]);};entry.append(add);
    }
    const rows=this._data[s.name]??[];
    while(list.children.length>rows.length)list.lastElementChild.remove();
    rows.forEach((row,index)=>{
      let item=list.children[index];
      if(!item){
        item=document.createElement('fieldset');list.append(item);
        const heading=document.createElement('legend');heading.textContent='Stop '+(index+1);item.append(heading);
        for(const [key,field] of Object.entries(s.selector.object.fields)){
          const label=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');
          caption.textContent=field.label;input.type=field.selector.color_rgb?'color':'number';input.name=`${s.name}.${index}.${key}`;
          input.onchange=()=>{
            const value=input.type==='color'?[1,3,5].map(i=>parseInt(input.value.slice(i,i+2),16)):input.value===''?undefined:Number(input.value);
            this._change(s.name,this._data[s.name].map((r,i)=>i===index?{...r,[key]:value}:r));
          };
          label.append(caption,input);item.append(label);
        }
        const remove=document.createElement('button');remove.type='button';remove.textContent='Verwijderen';remove.dataset.objectRemove=index;
        remove.onclick=()=>this._change(s.name,this._data[s.name].filter((_,i)=>i!==index));item.append(remove);
      }
      for(const [key,field] of Object.entries(s.selector.object.fields)){
        const input=item.querySelector(`[name="${s.name}.${index}.${key}"]`),color=row?.[key]??[0,0,0];
        const value=field.selector.color_rgb?'#'+color.map(n=>n.toString(16).padStart(2,'0')).join(''):String(row?.[key]??'');
        if(input.value!==value)input.value=value;
      }
    });
  }
}
customElements.define('ha-form',QAForm);
