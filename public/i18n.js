// Minimal English / Urdu (RTL) support. Covers navigation, greeting, dashboards and quick actions.
// Other screens stay in English for now. t(key, englishFallback) is safe to call anywhere.
const I18N={ur:{
 'nav.overview':'جائزہ','nav.dashboard':'ڈیش بورڈ','nav.institutions':'ادارے','nav.audit':'آڈٹ ٹریل','nav.manage':'اسکول کا انتظام','nav.school':'اسکول مینجمنٹ','nav.attendance':'حاضری لگائیں','nav.fees':'فیس مینجمنٹ','nav.finance':'مالیات اور تنخواہیں','nav.users':'اسٹاف لاگ اِن','nav.portal':'میرے بچے',
 'top.signout':'لاگ آؤٹ',
 'greet.morning':'صبح بخیر','greet.afternoon':'دوپہر بخیر','greet.evening':'شام بخیر',
 'dash.overview':'آپ کا جائزہ','dash.quick':'فوری اقدامات',
 'dash.students':'طلبہ','dash.classes':'کلاسیں','dash.att_today':'آج کی حاضری','dash.present':'حاضر','dash.absent':'غیر حاضر','dash.late':'تاخیر','dash.leave':'رخصت','dash.not_marked':'ابھی حاضری نہیں لگی',
 'dash.fees_month':'اس ماہ کی فیس','dash.of':'میں سے','dash.expected':'متوقع','dash.no_challans':'ابھی چالان نہیں بنے','dash.overdue':'واجب الادا فیس','dash.students_lc':'طلبہ','dash.none_overdue':'کوئی نادہندہ نہیں',
 'dash.unmarked':'جن کلاسوں کی حاضری باقی ہے','dash.absent_today':'آج غیر حاضر','dash.no_absent':'آج کوئی غیر حاضر نہیں','dash.attention':'توجہ طلب','dash.all_clear':'سب ٹھیک ہے','dash.per_class':'ہر کلاس میں طلبہ','dash.activity':'حالیہ سرگرمی','dash.trend':'فیس وصولی (آخری 14 دن)','dash.collected':'اس ماہ وصول','dash.outstanding':'کل بقایا','dash.call':'کال','dash.whatsapp':'واٹس ایپ','dash.open':'کھولیں',
 'dash.p_institutions':'ادارے','dash.p_students':'پلیٹ فارم پر طلبہ','dash.p_trials':'7 دن میں ختم ہونے والے ٹرائل','dash.p_inactive':'غیر فعال (14+ دن)','dash.p_recent':'حالیہ ادارے','dash.p_growth':'نئے ادارے (ماہانہ)',
 'qa.attendance':'حاضری لگائیں','qa.student':'طالب علم شامل کریں','qa.fee':'فیس وصول کریں','qa.voucher':'ووچر جمع کریں','qa.salary':'تنخواہ ادا کریں','qa.challans':'فیس چالان بنائیں','qa.defaulters':'فیس نادہندگان'}};
let LANG='en';try{LANG=localStorage.getItem('edu_lang')==='ur'?'ur':'en'}catch{}
function t(key,fallback){return(LANG==='ur'&&I18N.ur[key])||fallback||key}
function applyLang(){
  document.documentElement.lang=LANG;document.documentElement.dir=LANG==='ur'?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{if(!el.dataset.en)el.dataset.en=el.textContent;el.textContent=LANG==='ur'&&I18N.ur[el.dataset.i18n]?I18N.ur[el.dataset.i18n]:el.dataset.en});
  const b=document.getElementById('lang-toggle');if(b)b.textContent=LANG==='ur'?'English':'اردو';
}
function setLang(l){LANG=l==='ur'?'ur':'en';try{localStorage.setItem('edu_lang',LANG)}catch{}applyLang()}
