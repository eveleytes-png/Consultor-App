/* Separate local demo storage; never reads or overwrites the Google binding. */
(function(root){
  const key='consultor-excel-20261001-v1';
  function validate(value){
    if(value?.version!==1||!['sellers','activities','links','actions','assignments','equipment'].every(k=>Array.isArray(value[k])))throw Error('Los datos locales no tienen un formato compatible. No se reemplazaron.');
    return value;
  }
  function load(storage,seed){
    const saved=storage.getItem(key);
    return validate(saved===null?JSON.parse(JSON.stringify(seed)):JSON.parse(saved));
  }
  function save(storage,value){storage.setItem(key,JSON.stringify(validate(value)));}
  root.DemoStore={key,load,save};
  if(typeof module!=='undefined')module.exports=root.DemoStore;
})(typeof window==='undefined'?globalThis:window);
