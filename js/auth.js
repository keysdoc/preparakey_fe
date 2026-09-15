(function(){
 const accessButton=document.getElementById('accessButton');
 accessButton?.addEventListener('click',()=>localStorage.setItem('preparakey.session','active'));
})();
