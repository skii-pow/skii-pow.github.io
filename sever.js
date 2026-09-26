const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_API_URL = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const AI_PROVIDER = (process.env.AI_PROVIDER || (GEMINI_API_KEY ? 'gemini' : 'openai')).toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PORT = Number(process.env.PORT) || 3000;
const PRIVATE_DIR = process.env.AUTH_DATA_DIR || path.join(__dirname, '.private');
const USERS_FILE = path.join(PRIVATE_DIR, 'users.json');
const SESSIONS_FILE = path.join(PRIVATE_DIR, 'sessions.json');
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);

const DATA_FILE = path.join(__dirname, 'data.json');
const app = express();
fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => req.path.startsWith('/.private') ? res.sendStatus(404) : next());
app.use(express.static(__dirname, { dotfiles: 'deny' }));

const readStore = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
const writeStore = (file, value) => { fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.chmodSync(file, 0o600); };
const authAttempts = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    let entry = authAttempts.get(key);
    if (!entry || now - entry.startedAt >= windowMs) entry = { startedAt: now, count: 0 };
    entry.count += 1;
    authAttempts.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: 'Bạn thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.' });
    next();
  };
}
const authRateLimit = rateLimit(10, 15 * 60 * 1000);
const cookieOptions = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
function issueSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const sessions = readStore(SESSIONS_FILE, []).filter(session => session.expiresAt > Date.now());
  sessions.push({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: Date.now() + SESSION_MAX_AGE });
  writeStore(SESSIONS_FILE, sessions);
  res.setHeader('Set-Cookie', `hn_session=${token}; ${cookieOptions}`);
}
function requestUser(req) {
  const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('hn_session='))?.slice('hn_session='.length);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const sessions = readStore(SESSIONS_FILE, []);
  const session = sessions.find(item => item.expiresAt > Date.now() && item.tokenHash.length === tokenHash.length && crypto.timingSafeEqual(Buffer.from(item.tokenHash), Buffer.from(tokenHash)));
  if (!session) return null;
  const user = readStore(USERS_FILE, []).find(item => item.id === session.userId);
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}
function clearSession(req, res) {
  const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('hn_session='))?.slice('hn_session='.length);
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    writeStore(SESSIONS_FILE, readStore(SESSIONS_FILE, []).filter(item => item.tokenHash !== tokenHash));
  }
  res.setHeader('Set-Cookie', 'hn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
}

// Accounts and session tokens stay outside the publicly served directory.
app.get('/api/auth/me', (req, res) => res.json({ user: requestUser(req) }));
app.post('/api/auth/register', authRateLimit, async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim().slice(0, 20) : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Vui lòng nhập tên, email hợp lệ và mật khẩu từ 8 đến 128 ký tự.' });
    }
    const users = readStore(USERS_FILE, []);
    if (users.some(user => user.email === email)) return res.status(409).json({ error: 'Email này đã có tài khoản. Hãy đăng nhập.' });
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { id: crypto.randomUUID(), name, email, phone, salt, passwordHash, createdAt: new Date().toISOString() };
    users.push(user);
    writeStore(USERS_FILE, users);
    issueSession(res, user);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('[auth register]', error.message);
    res.status(500).json({ error: 'Chưa thể tạo tài khoản lúc này.' });
  }
});
app.post('/api/auth/login', authRateLimit, async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = readStore(USERS_FILE, []).find(item => item.email === email);
    if (!user || password.length > 128) return res.status(401).json({ error: 'Email hoặc mật khẩu chưa chính xác.' });
    const submitted = await scrypt(password, user.salt, 64);
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (submitted.length !== expected.length || !crypto.timingSafeEqual(submitted, expected)) return res.status(401).json({ error: 'Email hoặc mật khẩu chưa chính xác.' });
    issueSession(res, user);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('[auth login]', error.message);
    res.status(500).json({ error: 'Chưa thể đăng nhập lúc này.' });
  }
});
app.post('/api/auth/logout', (req, res) => { clearSession(req, res); res.json({ ok: true }); });

const readData = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeData = d => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

// ---------- CRUD ----------
app.get('/api/data', (req,res)=> res.json(readData()));
app.get('/api/schools', (req,res)=> res.json(readData().schools));
app.get('/api/students', (req,res)=> res.json(readData().students));
app.post('/api/students', (req,res)=>{
  const d=readData(); d.students.push(req.body); writeData(d); res.json(req.body);
});
app.put('/api/students/:id', (req,res)=>{
  const d=readData(); const i=d.students.findIndex(s=>s.id==req.params.id);
  if(i>-1){d.students[i]=Object.assign(d.students[i],req.body); writeData(d);}
  res.json(d.students[i]||null);
});
app.delete('/api/students/:id', (req,res)=>{
  const d=readData(); d.students=d.students.filter(s=>s.id!=req.params.id);
  writeData(d); res.json({ok:true});
});

// ---------- AI ----------
async function askAI(messages, maxTokens=150){
  let response;
  if(AI_PROVIDER==='gemini'){
    if(!GEMINI_API_KEY)throw new Error('AI_NOT_CONFIGURED');
    const system=messages.filter(message=>message.role==='system').map(message=>message.content).join('\n\n');
    const contents=messages.filter(message=>message.role!=='system').map(message=>({role:message.role==='assistant'?'model':'user',parts:[{text:String(message.content)}]}));
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    response=await fetch(url,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({systemInstruction:system?{parts:[{text:system}]}:undefined,contents,generationConfig:{maxOutputTokens:maxTokens,temperature:0.4}}),
      signal:AbortSignal.timeout(30000)
    });
  }else if(AI_PROVIDER==='openai'){
    if(!AI_API_KEY)throw new Error('AI_NOT_CONFIGURED');
    response=await fetch(AI_API_URL,{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+AI_API_KEY},
      body:JSON.stringify({model:AI_MODEL,messages,max_tokens:maxTokens,temperature:0.4}),
      signal:AbortSignal.timeout(30000)
    });
  }else throw new Error('AI_PROVIDER_INVALID');
  if(!response.ok)throw new Error(`AI_PROVIDER_${response.status}`);
  const data=await response.json();
  const content=AI_PROVIDER==='gemini'
    ? (data.candidates?.[0]?.content?.parts||[]).map(part=>part.text||'').join('')
    : data.choices?.[0]?.message?.content||data.message?.content||data.content||data.text||'';
  if(typeof content !== 'string' || !content.trim()) throw new Error('AI_EMPTY_RESPONSE');
  return content.trim().slice(0, 5000);
}

const aiRateLimit = rateLimit(20, 60 * 60 * 1000);
app.post('/api/ai/chat', aiRateLimit, async (req,res)=>{
  try{
    const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
    if(!message) return res.status(400).json({error:'Hãy nhập câu hỏi trước nhé.'});
    const schools = readData().schools.map(s=>`${s.name} (${s.type})`).join(', ');
    const quiz = req.body.quiz&&typeof req.body.quiz==='object' ? JSON.stringify(req.body.quiz).slice(0, 1000) : '';
    const reply = await askAI([
      {role:'system',content:`Bạn là Sen Trắng, trợ lý hướng nghiệp cho học sinh THCS tại Đà Nẵng. Trả lời bằng tiếng Việt, trực tiếp trả lời đúng tất cả ý người dùng hỏi trước rồi mới gợi ý thêm nếu cần. Giữ câu trả lời rõ ràng, dễ hiểu (2–5 câu), thân thiện, tối đa một emoji. Dữ liệu trường hiện có: ${schools}.${quiz?` Kết quả trắc nghiệm tự nguyện của người dùng: ${quiz}. Chỉ dùng để cá nhân hóa khi phù hợp.`:''} Website chưa có thông tin chính xác về học phí, chỉ tiêu hay hạn tuyển sinh; nếu được hỏi hãy nói rõ chưa có dữ liệu và khuyên xác nhận trực tiếp với trường, tuyệt đối không tự bịa. Nếu câu hỏi không liên quan hướng nghiệp, vẫn trả lời ngắn gọn trong phạm vi phù hợp với học sinh.`},
      {role:'user', content:message}
    ], 400);
    res.json({reply});
  }catch(e){
    console.error('[AI chat]',e.message);
    const unavailable = e.message === 'AI_NOT_CONFIGURED';
    res.status(unavailable ? 503 : 502).json({error:unavailable ? 'Trợ lý AI chưa được kết nối. Hãy cấu hình khóa API của nhà cung cấp trên máy chủ.' : 'Trợ lý đang bận hoặc chưa kết nối được. Vui lòng thử lại sau.'});
  }
});

app.post('/api/ai/evaluate', aiRateLimit, async (req,res)=>{
  try{
    const {student, schools, quiz} = req.body;
    const brief = (schools||[]).map(s=>`${s.name}(${s.type},DC${s.diemChuan})`).join('; ');
    const quizStr = quiz ? `\nTrắc nghiệm HS: ${JSON.stringify(quiz)}` : '';
    const reply = await askAI([
      {role:'system',content:'AI hướng nghiệp Đà Nẵng. Trả lời TỐI ĐA 3 câu: nhận xét học lực → gợi ý lộ trình (THPT/nghề/9+/GDTX) kèm TÊN trường → động viên ngắn. Cấm lan man.'},
      {role:'user',content:`HS: ${JSON.stringify(student)}\nTrường: ${brief}${quizStr}`}
    ], 150);
    res.json({reply});
  }catch(e){ console.error('[AI eval]',e.message); res.status(e.message === 'AI_NOT_CONFIGURED' ? 503 : 502).json({error:e.message === 'AI_NOT_CONFIGURED' ? 'Trợ lý AI chưa được cấu hình trên máy chủ.' : 'Trợ lý đang bận hoặc chưa kết nối được.'}); }
});

app.post('/api/ai/quiz', aiRateLimit, async (req,res)=>{
  try{
    const {subject, grade} = req.body;
    const reply = await askAI([
      {role:'system',content:`Soạn 5 câu trắc nghiệm lớp ${grade||9} môn ${subject}. Format JSON array: [{"q":"câu hỏi","a":"A. ...","b":"B. ...","c":"C. ...","d":"D. ...","correct":"A"}]. CHỈ trả JSON, không giải thích.`},
      {role:'user',content:`Soạn 5 câu trắc nghiệm ${subject} lớp ${grade||9}`}
    ], 600);
    res.json({reply});
  }catch(e){ console.error('[AI quiz]',e.message); res.status(e.message === 'AI_NOT_CONFIGURED' ? 503 : 502).json({error:e.message === 'AI_NOT_CONFIGURED' ? 'Trợ lý AI chưa được cấu hình trên máy chủ.' : 'Trợ lý đang bận hoặc chưa kết nối được.'}); }
});

app.listen(PORT, '0.0.0.0', ()=> console.log(`Server chạy tại http://localhost:${PORT}`));