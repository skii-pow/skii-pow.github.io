(function(){
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let DATA=null,schoolFilter='all',user=null;

const FALLBACK={schools:[{id:1,name:"THPT Phan Chu Trinh",type:"THPT",diemChuan:35.5,totNghiep:98,chatLuong:95},{id:2,name:"THPT Trần Phú",type:"THPT",diemChuan:33,totNghiep:97,chatLuong:93},{id:3,name:"THPT Lê Quý Đôn",type:"THPT",diemChuan:31.5,totNghiep:96,chatLuong:92},{id:4,name:"THPT Hoàng Hoa Thám",type:"THPT",diemChuan:29,totNghiep:95,chatLuong:88},{id:5,name:"THPT Ngũ Hành Sơn",type:"THPT",diemChuan:26.5,totNghiep:94,chatLuong:85},{id:6,name:"THPT Tôn Thất Tùng",type:"THPT",diemChuan:25,totNghiep:93,chatLuong:84},{id:7,name:"THPT Thái Phiên",type:"THPT",diemChuan:27.5,totNghiep:94,chatLuong:86},{id:8,name:"CĐ Công nghệ Việt-Hàn",type:"Nghề",diemChuan:18,totNghiep:92,chatLuong:90},{id:9,name:"CĐ CN & KT miền Trung",type:"9+",diemChuan:12,totNghiep:89,chatLuong:85},{id:10,name:"TT GDTX số 1 Đà Nẵng",type:"GDTX",diemChuan:10,totNghiep:88,chatLuong:80}],students:[],articles:[{id:1,title:"Điểm chuẩn lớp 10 Đà Nẵng 2025-2026",src:"https://danang.gov.vn",preview:"Sở GD&ĐT công bố điểm chuẩn tuyển sinh lớp 10 các trường THPT công lập trên địa bàn thành phố..."},{id:2,title:"Quy chế tuyển sinh THPT 2026 – BGD",src:"https://moet.gov.vn",preview:"Bộ GD&ĐT ban hành quy chế mới về tuyển sinh THPT, bổ sung phương thức xét tuyển kết hợp..."},{id:3,title:"Đà Nẵng: 98.2% HS tốt nghiệp THCS",src:"https://danang.gov.vn",preview:"Năm học 2024-2025, tỷ lệ tốt nghiệp THCS đạt 98.2%, tăng 0.5% so với năm trước..."},{id:4,title:"Hệ 9+: Lộ trình mới cho HS Đà Nẵng",src:"https://tuyensinh.edu.vn",preview:"Mô hình 9+ giúp học sinh vừa học văn hóa vừa học nghề từ lớp 10, tiết kiệm thời gian..."},{id:5,title:"Hướng nghiệp sớm: Chìa khóa thành công",src:"https://giaoducthoidai.vn",preview:"Các chuyên gia giáo dục nhấn mạnh tầm quan trọng của việc hướng nghiệp từ lớp 8, lớp 9..."}]};

async function api(p,o){try{const r=await fetch('/api'+p,Object.assign({headers:{'Content-Type':'application/json'},credentials:'same-origin'},o));const data=await r.json().catch(()=>null);return r.ok?data:{error:data&&data.error?data.error:'Yêu cầu chưa thực hiện được.'};}catch(e){return null;}}
async function loadData(){let d=await api('/data');if(!d||!Array.isArray(d.schools)){try{const r=await fetch(`data.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok)d=await r.json();}catch(e){}}DATA=(d&&Array.isArray(d.schools))?d:JSON.parse(JSON.stringify(FALLBACK));DATA.schools=DATA.schools.filter(s=>s.name!=='THPT Lê Quý Đôn');}

/* LOGIN */
let authMode='login';
window.showLogin=function(mode){const ov=$('#loginOverlay');if(!ov)return;setAuthMode(mode||'login');ov.classList.remove('hidden');setTimeout(()=>$('#loginEmail')?.focus(),50);};
function setAuthMode(mode){
  authMode=mode;const registering=mode==='register';
  $('#loginForm')?.classList.toggle('hidden',registering);$('#regForm')?.classList.toggle('hidden',!registering);
  const title=$('#authTitle'),switchText=$('#authSwitchText'),switchButton=$('#authSwitch');
  if(title)title.textContent=registering?'Tạo tài khoản mới':'Chào mừng bạn trở lại';
  if(switchText)switchText.textContent=registering?'Đã có tài khoản?':'Chưa có tài khoản?';
  if(switchButton)switchButton.textContent=registering?'Đăng nhập':'Đăng ký';
  ['#loginError','#regError'].forEach(selector=>{const el=$(selector);if(el)el.textContent='';});
}
function finishLogin(){
  const ov=$('#loginOverlay');if(ov)ov.classList.add('hidden');
  const badge=$('#userBadge'),uname=$('#userName'),lb=$('#loginBtn'),logout=$('#logoutBtn');
  if(badge){badge.classList.remove('hidden');uname.textContent='👤 '+user.name;}
  if(lb)lb.classList.add('hidden');if(logout)logout.classList.remove('hidden');
}
async function checkLogin(){localStorage.removeItem('hn_user');const result=await api('/auth/me');if(result&&result.user){user=result.user;finishLogin();}}
async function submitAuth(form,endpoint,errorSelector){
  const button=form.querySelector('button[type="submit"]'),error=$(errorSelector);if(button)button.disabled=true;if(error)error.textContent='';
  const payload=Object.fromEntries(new FormData(form));
  if(endpoint==='/auth/register'&&payload.password!==payload.passwordConfirm){if(error)error.textContent='Mật khẩu nhập lại chưa khớp.';if(button)button.disabled=false;return;}
  delete payload.passwordConfirm;
  const result=await api(endpoint,{method:'POST',body:JSON.stringify(payload)});
  if(result&&result.user){user=result.user;finishLogin();form.reset();toast(endpoint.endsWith('register')?'Tạo tài khoản thành công.':'Đăng nhập thành công.');}
  else if(error)error.textContent=result?result.error:'Không kết nối được máy chủ. Hãy thử lại.';
  if(button)button.disabled=false;
}

/* NEWS */
function renderNews(){const grid=$('#newsGrid');if(!grid)return;const articles=DATA.articles||FALLBACK.articles;grid.innerHTML=articles.map(a=>`<div class="news-card reveal-up" onclick="window.open('${a.src}','_blank')"><div class="news-titlebar"><i class="news-dot r"></i><i class="news-dot y"></i><i class="news-dot g"></i><span>${a.src}</span></div><div class="news-body"><h3>${a.title}</h3><p>${a.preview}</p><a class="news-open" href="${a.src}" target="_blank" onclick="event.stopPropagation()">Mở tab mới ↗</a></div></div>`).join('');initReveal();}

/* QUIZ */
const QUIZ_QS=[{q:"Bạn thích làm việc với con số hay con người hơn?",opts:["Con số 📊","Con người 🤝","Cả hai đều thích","Chưa rõ lắm"]},{q:"Cuối tuần rảnh, bạn sẽ làm gì?",opts:["Đọc sách / tự học 📖","Chơi thể thao / vẽ 🎨","Nấu ăn / sửa đồ 🔧","Đi chơi với bạn 🎉"]},{q:"Môn nào bạn thấy 'dễ thở' nhất?",opts:["Toán","Văn","Anh","KHTN"]},{q:"10 năm nữa, bạn hình dung mình sẽ?",opts:["Làm văn phòng 💼","Làm kỹ thuật / tay nghề 🔩","Sáng tạo / nghệ thuật 🎭","Kinh doanh tự do 🚀"]},{q:"Điều gì khiến bạn hào hứng nhất?",opts:["Giải được bài khó 🧩","Giúp đỡ người khác 💕","Tạo ra sản phẩm 🛠️","Khám phá điều mới 🌍"]}];
let quizIdx=0,quizAnswers=[];
window.openQuiz=function(){const s=$('#quiz');if(s)s.scrollIntoView({behavior:'smooth'});renderQuizQ();};
function renderQuizQ(){const qEl=$('#quizQ'),oEl=$('#quizOpts'),prog=$('#quizProgress');if(!qEl)return;const q=QUIZ_QS[quizIdx];qEl.textContent=q.q;oEl.innerHTML=q.opts.map((o,i)=>`<div class="quiz-opt ${quizAnswers[quizIdx]===i?'selected':''}" onclick="pickOpt(${i})">${o}</div>`).join('');prog.textContent=`${quizIdx+1}/${QUIZ_QS.length}`;}
window.pickOpt=function(i){quizAnswers[quizIdx]=i;renderQuizQ();};
window.quizNav=function(dir){quizIdx+=dir;if(quizIdx<0)quizIdx=0;if(quizIdx>=QUIZ_QS.length){submitQuiz();return;}renderQuizQ();};
function submitQuiz(){const short=$('#quizAnswer')?$('#quizAnswer').value:'';localStorage.setItem('hn_quiz',JSON.stringify({answers:quizAnswers,short}));toast('Đã lưu trắc nghiệm! AI sẽ dùng để gợi ý nghề~ 🎯');}

/* SCHOOLS */
function renderSchools(){const tb=$('#schoolTable');if(!tb)return;const q=normalizeSearchText((($('#searchSchool')||{}).value||''));const rows=DATA.schools.filter(s=>(schoolFilter==='all'||s.type===schoolFilter)&&normalizeSearchText(s.name).includes(q));tb.querySelector('tbody').innerHTML=rows.map(s=>`<tr><td><b>${s.name}</b></td><td><span class="badge b-${{'THPT':'blue','Nghề':'pink','9+':'orange','GDTX':'green'}[s.type]||'blue'}">${s.type}</span></td><td>${s.diemChuan}</td><td>${s.totNghiep}%</td><td>${s.chatLuong}%</td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center;opacity:.5;padding:20px">Không tìm thấy~</td></tr>';renderStats(rows);}
function normalizeSearchText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('vi').replace(/đ/g,'d').trim();}
function scrollToPageTarget(target,hash){
  if(!target)return;
  const headerHeight=$('.hdr')?.getBoundingClientRect().height||0;
  const top=target.getBoundingClientRect().top+window.scrollY-headerHeight-12;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  history.replaceState(null,'',location.pathname+location.search+(hash||''));
}
function searchPage(query){
  const term=normalizeSearchText(query);if(!term)return;
  history.replaceState(null,'',location.pathname+location.search);
  const schoolMatches=DATA.schools.filter(s=>normalizeSearchText(s.name).includes(term));
  if(schoolMatches.length){
    schoolFilter='all';$$('#typeChips .chip').forEach(chip=>chip.classList.toggle('active',chip.dataset.t==='all'));
    $('#searchSchool').value=query;renderSchools();scrollToPageTarget($('#schools'),'#schools');return;
  }
  schoolFilter='all';$$('#typeChips .chip').forEach(chip=>chip.classList.toggle('active',chip.dataset.t==='all'));
  const schoolSearch=$('#searchSchool');if(schoolSearch){schoolSearch.value='';renderSchools();}
  const candidates=[...$$('#info .info-card'),...$$('#newsGrid .news-card'),...$$('.section-full, .library-banner, .foot')];
  const match=candidates.find(item=>normalizeSearchText(`${item.innerText} ${[...item.querySelectorAll('img')].map(image=>image.alt).join(' ')}`).includes(term));
  if(match){const section=match.closest('.section-full')||match;scrollToPageTarget(section,section.id?'#'+section.id:'');}else toast('Không tìm thấy thông tin phù hợp.');
}
function renderStats(rows){const list=(rows&&rows.length)?rows:DATA.schools;const avg=Math.round(list.reduce((a,s)=>a+s.totNghiep,0)/list.length);tick($('#cSchools'),list.length);const cStudents=$('#cStudents');if(cStudents)cStudents.textContent='44 274';const ca=$('#cAvg');if(ca)ca.textContent=avg+'%';}
function tick(el,to){if(!el)return;const t0=performance.now();(function f(){const k=Math.min(1,(performance.now()-t0)/900);el.textContent=Math.round(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f);})();}

/* CHAT */
function bubble(cls,text){const log=$('#chatLog');if(!log)return null;const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
window.toggleChat=function(open){const b=$('#chatBox');if(!b)return;const w=open!==undefined?open:!b.classList.contains('open');b.classList.toggle('open',w);if(w&&!b.querySelector('.msg'))bubble('ai','Chào~ 🐰 Hỏi gọn nhé!');};
async function sendChat(m){bubble('me',m);const typing=bubble('ai','Đang tìm câu trả lời...');const quiz=JSON.parse(localStorage.getItem('hn_quiz')||'null');const res=await api('/ai/chat',{method:'POST',body:JSON.stringify({message:m,quiz})});if(typing)typing.remove();bubble('ai',(res&&res.reply)||(res&&res.error)||localReply(m));}
function localReply(m){const s=m.toLocaleLowerCase('vi');if(/chào|xin chào|hello|hi\b/.test(s))return 'Chào bạn! Bạn đang muốn tìm hiểu ngành nghề, trường học hay lộ trình sau lớp 9?';if(/9\+|hệ 9|lớp 9/.test(s))return 'Hệ 9+ kết hợp học văn hóa và học nghề sau THCS. Hãy xem mục Hệ 9+ và xác nhận điều kiện tuyển sinh trực tiếp với cơ sở đào tạo.';if(/tuyển sinh|hồ sơ|thời gian/.test(s))return 'Thông tin tuyển sinh có thể thay đổi theo từng năm. Hãy liên hệ cơ sở GDNN để xác nhận hồ sơ và thời hạn mới nhất.';if(/ngành|nghề|việc làm/.test(s))return 'Trang giới thiệu các nhóm nghề kỹ thuật, công nghệ, dịch vụ và sáng tạo. Hãy cho biết sở thích của bạn để mình gợi ý cụ thể hơn.';return 'Trợ lý AI chưa kết nối được. Vui lòng thử lại sau hoặc liên hệ nhà trường để được tư vấn.';}

/* PRACTICE PAGE */
const EXAM_RESOURCES={
  math:[{title:'Sở Giáo dục và Đào tạo TP. Đà Nẵng',detail:'Thông báo tuyển sinh và giáo dục địa phương',url:'https://danang.gov.vn/'},{title:'Bộ Giáo dục và Đào tạo',detail:'Chương trình, quy chế và văn bản giáo dục',url:'https://moet.gov.vn/'}],
  eng:[{title:'Sở Giáo dục và Đào tạo TP. Đà Nẵng',detail:'Thông báo tuyển sinh và giáo dục địa phương',url:'https://danang.gov.vn/'},{title:'Bộ Giáo dục và Đào tạo',detail:'Chương trình, quy chế và văn bản giáo dục',url:'https://moet.gov.vn/'}],
  lit:[{title:'Sở Giáo dục và Đào tạo TP. Đà Nẵng',detail:'Thông báo tuyển sinh và giáo dục địa phương',url:'https://danang.gov.vn/'},{title:'Bộ Giáo dục và Đào tạo',detail:'Chương trình, quy chế và văn bản giáo dục',url:'https://moet.gov.vn/'}]
};
let practiceSubject='',practiceQuestions=[],practiceGraded=false;
function renderExamResources(subject){
  const list=$('#examList');if(!list)return;list.replaceChildren();
  (EXAM_RESOURCES[subject]||EXAM_RESOURCES.math).forEach(resource=>{
    const item=document.createElement('article');item.className='resource-item';
    const icon=document.createElement('span');icon.className='resource-item-icon';icon.textContent='↗';
    const details=document.createElement('div');details.className='resource-item-copy';
    const title=document.createElement('b');title.textContent=resource.title;
    const description=document.createElement('small');description.textContent=resource.detail;
    const link=document.createElement('a');link.href=resource.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Mở cổng';link.setAttribute('aria-label',`Mở ${resource.title}`);
    details.append(title,description);item.append(icon,details,link);list.append(item);
  });
}
function renderPracticeQuestions(questions){
  const content=$('#aiQuizContent');if(!content)return;content.replaceChildren();
  questions.forEach((question,index)=>{
    const fieldset=document.createElement('fieldset');fieldset.className='practice-question';fieldset.dataset.correct=question.correct;
    const legend=document.createElement('legend'),number=document.createElement('span'),prompt=document.createElement('span');
    number.className='question-number';number.textContent=String(index+1).padStart(2,'0');prompt.textContent=question.q;legend.append(number,prompt);fieldset.append(legend);
    ['A','B','C','D'].forEach(letter=>{
      const option=document.createElement('button');option.type='button';option.className='quiz-option';option.dataset.option=letter;option.setAttribute('aria-pressed','false');
      const label=document.createElement('span');label.className='option-letter';label.textContent=letter;
      const text=document.createElement('span');text.textContent=question[letter.toLowerCase()];option.append(label,text);
      option.addEventListener('click',()=>{
        if(practiceGraded)return;
        fieldset.querySelectorAll('.quiz-option').forEach(button=>{button.classList.remove('is-selected');button.setAttribute('aria-pressed','false');});
        option.classList.add('is-selected');option.setAttribute('aria-pressed','true');
      });
      fieldset.append(option);
    });
    content.append(fieldset);
  });
}
function checkAIQuiz(){
  const result=$('#aiQuizResult');if(!result||!practiceQuestions.length)return;
  const fields=$$('#aiQuizContent .practice-question'),unanswered=fields.some(field=>!field.querySelector('.quiz-option.is-selected'));
  if(unanswered){result.textContent='Hãy chọn đáp án cho tất cả câu hỏi trước khi chấm.';result.className='quiz-result-message is-warning';return;}
  practiceGraded=true;let score=0;
  fields.forEach(field=>{
    const answer=field.dataset.correct,selected=field.querySelector('.quiz-option.is-selected');
    field.querySelectorAll('.quiz-option').forEach(option=>{
      option.disabled=true;if(option.dataset.option===answer)option.classList.add('is-correct');
    });
    if(selected.dataset.option===answer)score++;else selected.classList.add('is-incorrect');
  });
  result.textContent=`Bạn đạt ${score}/${practiceQuestions.length} câu đúng${score===practiceQuestions.length?' · Xuất sắc!':score>=3?' · Tiến bộ tốt, tiếp tục nhé!':' · Ôn lại phần chưa chắc rồi thử lại nhé.'}`;
  result.className='quiz-result-message '+(score>=3?'is-success':'is-review');
  $('#aiQuizCheck')?.setAttribute('disabled','');
}
window.checkAIQuiz=checkAIQuiz;
async function requestPracticeQuiz(subject){
  practiceSubject=subject;practiceQuestions=[];practiceGraded=false;
  const status=$('#practiceStatus'),box=$('#aiQuizBox'),grid=$('#subjectGrid'),check=$('#aiQuizCheck');
  if(grid){grid.setAttribute('aria-busy','true');grid.querySelectorAll('.subject-card').forEach(button=>{button.disabled=true;button.classList.toggle('is-active',button.dataset.sub===subject);});}
  if(status){status.hidden=false;status.textContent=`Đang soạn đề ${subject}...`;status.className='practice-status is-loading';}
  if(box)box.classList.add('hidden');if(check)check.removeAttribute('disabled');
  const response=await api('/ai/quiz',{method:'POST',body:JSON.stringify({subject,grade:9})});
  if(grid){grid.removeAttribute('aria-busy');grid.querySelectorAll('.subject-card').forEach(button=>{button.disabled=false;});}
  if(!response||!response.reply){if(status){status.hidden=false;status.textContent=(response&&response.error)||'Không kết nối được máy chủ. Hãy thử lại.';status.className='practice-status is-error';}return;}
  try{
    const raw=response.reply.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    const parsed=JSON.parse(raw),items=Array.isArray(parsed)?parsed:parsed.questions;
    if(!Array.isArray(items)||items.length<1||items.length>10)throw new Error('Đề chưa đúng định dạng. Hãy chọn môn để thử lại.');
    practiceQuestions=items.map(item=>{
      const answer=String(item.correct||'').trim().match(/^[A-D]/i)?.[0]?.toUpperCase();
      const question={q:String(item.q||item.question||'').trim(),correct:answer};
      ['a','b','c','d'].forEach(letter=>question[letter]=String(item[letter]||'').trim());
      if(!question.q||!question.correct||['a','b','c','d'].some(letter=>!question[letter]))throw new Error('Một câu hỏi bị thiếu đáp án. Hãy tạo đề khác.');
      return question;
    });
    renderPracticeQuestions(practiceQuestions);
    const subjectLabel=$('#quizSubjectLabel'),countLabel=$('#quizCountLabel');
    if(subjectLabel)subjectLabel.textContent=subject;
    if(countLabel)countLabel.textContent=`${practiceQuestions.length} câu · Lớp 9`;
    $('#aiQuizResult').textContent='';$('#aiQuizResult').className='';
    box?.classList.remove('hidden');if(status)status.hidden=true;
    box?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){if(status){status.hidden=false;status.textContent=error.message;status.className='practice-status is-error';}}
}
function bindPracticeUI(){
  const subjects=$('#subjectGrid');if(subjects)subjects.addEventListener('click',event=>{const button=event.target.closest('.subject-card');if(button&&!button.disabled)requestPracticeQuiz(button.dataset.sub);});
  const check=$('#aiQuizCheck');if(check)check.addEventListener('click',checkAIQuiz);
  const retry=$('#aiQuizRetry');if(retry)retry.addEventListener('click',()=>{if(practiceSubject)requestPracticeQuiz(practiceSubject);});
  const tabs=$$('.exam-tabs [data-exam]');
  tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(item=>{const selected=item===tab;item.classList.toggle('active',selected);item.setAttribute('aria-selected',String(selected));});renderExamResources(tab.dataset.exam);}));
  if(tabs.length)renderExamResources(tabs.find(tab=>tab.classList.contains('active'))?.dataset.exam||'math');
}

/* TOAST */
let toastT;function toast(m){const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2400);}

/* SCROLL REVEAL */
function initReveal(){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.1});$$('.reveal-up').forEach(el=>io.observe(el));}

/* BIND */
function bindUI(){
  const header=$('.hdr');
  if(header){const updateScrollOffset=()=>document.documentElement.style.setProperty('--sticky-header-height',`${Math.ceil(header.getBoundingClientRect().height)}px`);updateScrollOffset();new ResizeObserver(updateScrollOffset).observe(header);}
  const ss=$('#searchSchool');if(ss)ss.addEventListener('input',renderSchools);
  const siteSearchForm=$('#siteSearchForm');if(siteSearchForm)siteSearchForm.addEventListener('submit',event=>{event.preventDefault();const query=$('#siteSearch').value;if(document.body.dataset.page==='practice'){location.href='index.html?search='+encodeURIComponent(query);return;}if(nav?.classList.contains('mobile-open')){nav.classList.remove('mobile-open');$('#mobileNavToggle')?.setAttribute('aria-expanded','false');$('#mobileNavToggle')?.setAttribute('aria-label','Mở menu');}searchPage(query);});
  const tc=$('#typeChips');if(tc)tc.addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;$$('#typeChips .chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');schoolFilter=c.dataset.t;renderSchools();});
  const nav=$('#siteNav'),glider=$('#navGlider'),navLinks=nav?[...nav.querySelectorAll('a')]:[];
  const localNavLinks=navLinks.filter(link=>{const target=new URL(link.href,location.href);return target.origin===location.origin&&target.pathname===location.pathname&&target.hash;});
  const setActiveNav=link=>{
    if(!link||!nav||!glider)return;
    navLinks.forEach(item=>item.classList.toggle('active',item===link));
    const navRect=nav.getBoundingClientRect(),linkRect=link.getBoundingClientRect();
    glider.style.width=linkRect.width+'px';
    glider.style.transform=`translateX(${linkRect.left-navRect.left-4}px)`;
    nav.classList.add('ready');
  };
  if(navLinks.length){
    const initial=navLinks.find(link=>link.classList.contains('active'))||navLinks[0];
    navLinks.forEach(link=>link.addEventListener('click',event=>{
      setActiveNav(link);
      if(nav.classList.contains('mobile-open')){nav.classList.remove('mobile-open');$('#mobileNavToggle')?.setAttribute('aria-expanded','false');}
      if(localNavLinks.includes(link)){event.preventDefault();const hash=new URL(link.href,location.href).hash;scrollToPageTarget(document.getElementById(hash.slice(1)),hash);}
    }));
    const resizeObserver=new ResizeObserver(()=>setActiveNav(navLinks.find(link=>link.classList.contains('active'))||initial));
    resizeObserver.observe(nav);
    setActiveNav(initial);
    let scrollPending=false;
    window.addEventListener('scroll',()=>{
      if(scrollPending)return;scrollPending=true;
      requestAnimationFrame(()=>{
        const marker=(document.querySelector('.hdr')?.getBoundingClientRect().height||70)+60;
        const current=localNavLinks.map(link=>({link,target:document.getElementById(new URL(link.href,location.href).hash.slice(1))})).filter(item=>item.target&&item.target.getBoundingClientRect().top<=marker).sort((a,b)=>b.target.getBoundingClientRect().top-a.target.getBoundingClientRect().top)[0];
        if(current)setActiveNav(current.link);scrollPending=false;
      });
    },{passive:true});
  }
  const menuButton=$('#mobileNavToggle');
  if(menuButton&&nav)menuButton.addEventListener('click',()=>{
    const open=nav.classList.toggle('mobile-open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Đóng menu':'Mở menu');
    if(open)setActiveNav(navLinks.find(link=>link.classList.contains('active'))||navLinks[0]);
  });
  $$('.quick-tab').forEach(button=>button.addEventListener('click',()=>{
    const target=document.getElementById(button.dataset.target);if(target)target.scrollIntoView({behavior:'smooth',block:'center'});
    const link=navLinks.find(item=>item.getAttribute('href')==='#'+button.dataset.target);if(link)setActiveNav(link);
  }));
  const fab=$('#chatFab');if(fab){fab.onclick=()=>toggleChat();fab.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleChat();}};}
  const cf=$('#chatForm');if(cf)cf.addEventListener('submit',e=>{e.preventDefault();const i=$('#chatInput');const m=i.value.trim();if(!m)return;i.value='';sendChat(m);});
  $('#loginBtn')?.addEventListener('click',()=>showLogin('login'));
  $('#closeLogin')?.addEventListener('click',()=>$('#loginOverlay')?.classList.add('hidden'));
  $('#authSwitch')?.addEventListener('click',()=>setAuthMode(authMode==='login'?'register':'login'));
  const loginForm=$('#loginForm');if(loginForm)loginForm.addEventListener('submit',e=>{e.preventDefault();submitAuth(loginForm,'/auth/login','#loginError');});
  const reg=$('#regForm');if(reg)reg.addEventListener('submit',e=>{e.preventDefault();submitAuth(reg,'/auth/register','#regError');});
  $('#logoutBtn')?.addEventListener('click',async()=>{await api('/auth/logout',{method:'POST'});user=null;$('#userBadge')?.classList.add('hidden');$('#logoutBtn')?.classList.add('hidden');$('#loginBtn')?.classList.remove('hidden');toast('Bạn đã đăng xuất.');});
  $('#loginOverlay')?.addEventListener('click',e=>{if(e.target.id==='loginOverlay')e.currentTarget.classList.add('hidden');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$$('.overlay').forEach(overlay=>overlay.classList.remove('open'));$('#loginOverlay')?.classList.add('hidden');}});
}

/* INIT */
document.addEventListener('DOMContentLoaded',async()=>{bindUI();bindPracticeUI();await Promise.all([checkLogin(),loadData()]);renderNews();renderSchools();renderQuizQ();const requestedSearch=new URLSearchParams(location.search).get('search');if(requestedSearch){$('#siteSearch').value=requestedSearch;searchPage(requestedSearch);}else if(location.hash){scrollToPageTarget(document.getElementById(location.hash.slice(1)),location.hash);}
  // Thêm reveal-up cho info cards + sections
  $$('.info-card,.quiz-container,.table-card,.stat-card').forEach(el=>el.classList.add('reveal-up'));
  initReveal();
});
})();