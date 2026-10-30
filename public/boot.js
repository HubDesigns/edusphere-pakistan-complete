// Starts the app once every script above has loaded.
applyLang();
document.getElementById('lang-toggle').addEventListener('click',()=>{setLang(LANG==='ur'?'en':'ur');if(currentUser){applyRoleUI(currentUser);loadDashboard()}});
bootstrap();
