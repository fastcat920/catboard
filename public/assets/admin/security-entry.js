(function(){
  function mount(){
    if(document.querySelector('.node-security-entry')||!window.settings||!window.settings.secure_path)return;
    var link=document.createElement('a');link.className='node-security-entry';link.textContent='节点安全';
    link.href='/'+window.settings.secure_path+'/security/dashboard';link.title='打开节点泄露追踪与风控中心';document.body.appendChild(link);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
