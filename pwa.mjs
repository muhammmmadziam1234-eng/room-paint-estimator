// Registers the service worker that makes the app work offline. The worker file sits next to this module,
// so its address is resolved from here, not from the page: that stays correct under a sub-path.
// If registration is refused (private browsing, an insecure address) the app simply keeps working online.
export function registerOffline(){
  if(!('serviceWorker' in navigator))return;
  const register=()=>navigator.serviceWorker.register(new URL('./sw.js',import.meta.url).href).catch(()=>{});
  if(document.readyState==='complete')register();else addEventListener('load',register,{once:true});
}
