// ============================================================
//  server.js — Hướng Nghiệp Đà Nẵng + Gemini AI
//  Key giấu trong .env, KHÔNG bao giờ lộ ra frontend
// ============================================================
require('dotenv').config();
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { promisify } = require('util');
const scrypt  = promisify(crypto.scrypt);

// 🔑 Đọc key từ .env — KHÔNG ghi cứng trong code
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
const geminiUrl = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
const PORT       = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PRIVATE_DIR = process.env.AUTH_DATA_DIR || path.join(__dirname, '.private');
const USERS_FILE = path.join(PRIVATE_DIR, 'users.json');
const SESSIONS_FILE = path.join(PRIVATE_DIR, 'sessions.json');
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const app = express();
fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
fs.chmodSync(PRIVATE_DIR, 0o700);
app.use(express.json({ limit: '20kb' }));
app.use((req,res,next)=>req.path.startsWith('/.private') ? res.sendStatus(404) : next());
app.use(express.static(__dirname, { dotfiles: 'deny' }));

const readStore = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
const writeStore = (file, value) => {
  const temporaryFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, file);
  fs.chmodSync(file, 0o600);
};
function rateLimit(max, windowMs, errorMessage) {
  const attempts = new Map();
  return (req,res,next)=>{
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = attempts.get(key);
    if (!entry || now - entry.startedAt >= windowMs) entry = { startedAt: now, count: 0 };
    entry.count += 1;
    attempts.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: errorMessage });
    next();
  };
}
const authRateLimit = rateLimit(10, 15 * 60 * 1000, 'Bạn thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.');
const aiRateLimit = rateLimit(20, 60 * 60 * 1000, 'Bạn đã dùng hết lượt AI trong giờ này. Hãy thử lại sau.');
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
  const session = readStore(SESSIONS_FILE, []).find(item => item.expiresAt > Date.now() && item.tokenHash.length === tokenHash.length && crypto.timingSafeEqual(Buffer.from(item.tokenHash), Buffer.from(tokenHash)));
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
  res.setHeader('Set-Cookie', `hn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
function requireUser(req,res,next) {
  req.user = requestUser(req);
  if (!req.user) return res.status(401).json({ error: 'Vui lòng đăng nhập để sử dụng tính năng này.' });
  next();
}

app.get('/api/auth/me', (req,res)=>res.json({ user: requestUser(req) }));
app.post('/api/auth/register', authRateLimit, async (req,res)=>{
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim().slice(0, 20) : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Vui lòng nhập tên, email hợp lệ và mật khẩu từ 8 đến 128 ký tự.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const users = readStore(USERS_FILE, []);
    if (users.some(user => user.email === email)) return res.status(409).json({ error: 'Email này đã có tài khoản. Hãy đăng nhập.' });
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
app.post('/api/auth/login', authRateLimit, async (req,res)=>{
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
app.post('/api/auth/logout', (req,res)=>{ clearSession(req, res); res.json({ ok: true }); });
app.use('/api/ai', requireUser, aiRateLimit);

const readData  = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeData = d  => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

// ---------- CRUD ----------
app.get('/api/data',     (req,res)=> res.json(readData()));
app.get('/api/schools',  (req,res)=> res.json(readData().schools));
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

// ---------- GỌI GEMINI (key CHỈ ở server, hông bao giờ gửi ra browser) ----------
function aiErrorMessage(error) {
  if (error.message === 'AI_NOT_CONFIGURED') return 'AI chưa được cấu hình trên máy chủ.';
  if (error.code === 'GEMINI_AUTH') return 'Khóa Gemini bị từ chối. Hãy cập nhật GEMINI_API_KEY bằng khóa mới từ Google AI Studio trên máy chủ.';
  if (error.code === 'GEMINI_MODEL') return 'Không tìm thấy model Gemini. Hãy kiểm tra biến GEMINI_MODEL trên máy chủ.';
  if (error.code === 'GEMINI_RATE_LIMIT') return 'Gemini đang giới hạn lượt gọi. Hãy thử lại sau hoặc kiểm tra hạn mức API.';
  return 'Gemini chưa kết nối được. Vui lòng thử lại sau.';
}

async function askGemini(systemPrompt, userMsg, maxTokens=200){
  if (!GEMINI_KEY) {
    const error = new Error('AI_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_KEY          // ← key nằm ở đây, phía server
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${systemPrompt}\n\n${userMsg}` }]
      }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 1,
        thinkingConfig: { thinkingLevel: 'LOW' }
      }
    })
  };
  let r = await fetch(geminiUrl(GEMINI_MODEL), requestOptions);
  if ((r.status === 429 || r.status === 503) && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
    console.warn(`[Gemini] ${GEMINI_MODEL} returned HTTP ${r.status}; retrying ${GEMINI_FALLBACK_MODEL}`);
    r = await fetch(geminiUrl(GEMINI_FALLBACK_MODEL), requestOptions);
  }

  if (!r.ok) {
    const body = await r.json().catch(()=>null);
    const error = new Error(`Gemini HTTP ${r.status}`);
    error.status = 502;
    error.code = r.status === 401 || r.status === 403 ? 'GEMINI_AUTH'
      : r.status === 404 ? 'GEMINI_MODEL'
      : r.status === 429 ? 'GEMINI_RATE_LIMIT'
      : 'GEMINI_UPSTREAM';
    if (body?.error?.status) error.message += ` (${body.error.status})`;
    throw error;
  }

  const j = await r.json();
  const candidate = j.candidates?.[0];
  const text = candidate?.content?.parts?.map(part => part.text || '').join('') || '';
  if (!text.trim()) {
    const error = new Error(`Gemini returned no text (${candidate?.finishReason || j.promptFeedback?.blockReason || 'NO_CANDIDATE'})`);
    error.status = 502;
    error.code = candidate?.finishReason === 'MAX_TOKENS' ? 'GEMINI_MAX_TOKENS' : 'GEMINI_EMPTY';
    throw error;
  }
  return text.trim();
}

// ---------- CHAT AI ----------
app.post('/api/ai/chat', async (req,res)=>{
  try {
    const reply = await askGemini(
      'Bạn là "Sen Trắng" – AI hướng nghiệp TP. Đà Nẵng. Trả lời tiếng Việt, thân thiện. Cấm lan man. Không hỏi lại',
      req.body.message || '',
      256
    );
    res.json({reply});
  } catch(e){
    console.error('[AI chat]', e.code || e.message);
    res.status(e.status || 502).json({reply:null, error:aiErrorMessage(e)});
  }
});

// ---------- ĐÁNH GIÁ HỌC SINH ----------
app.post('/api/ai/evaluate', async (req,res)=>{
  try {
    const {student, schools, quiz} = req.body;
    const brief = (schools||[]).map(s=>
      `${s.name}(${s.type},DC${s.diemChuan},TN${s.totNghiep}%)`
    ).join('; ');
    const quizStr = quiz ? `\nTrắc nghiệm: ${JSON.stringify(quiz)}` : '';

    const reply = await askGemini(
      'AI hướng nghiệp Đà Nẵng. Trả lời TỐI ĐA 3 câu: (1) nhận xét học lực, (2) gợi ý lộ trình THPT/nghề/9+/GDTX kèm TÊN trường cụ thể, (3) động viên ngắn. Cấm lan man. Không hỏi lại.',
      `Học sinh: ${JSON.stringify(student)}\nTrường: ${brief}${quizStr}`,
      512
    );
    res.json({reply});
  } catch(e){
    console.error('[AI eval]', e.code || e.message);
    res.status(e.status || 502).json({reply:null, error:aiErrorMessage(e)});
  }
});

// ---------- TRẮC NGHIỆM TÍNH CÁCH / NĂNG LỰC ----------
app.post('/api/ai/personality', async (req,res)=>{
  try {
    if (!Array.isArray(req.body.answers) || req.body.answers.length !== 5) {
      return res.status(400).json({reply:null, error:'Vui lòng hoàn thành đủ 5 câu trước khi nhận xét.'});
    }
    const answers = req.body.answers.slice(0, 5).map(answer => ({
      question: String(answer.question || '').slice(0, 300),
      choice: String(answer.choice || '').slice(0, 200),
      shortAnswer: String(answer.shortAnswer || '').slice(0, 500)
    }));
    const summary = answers.map((answer,index)=>
      `Câu ${index+1}: ${answer.question}\nLựa chọn: ${answer.choice}\nTrả lời ngắn: ${answer.shortAnswer || '(bỏ trống)'}`
    ).join('\n\n');
    const reply = await askGemini(
      'Bạn là chuyên viên hướng nghiệp thân thiện. Dựa trên cả lựa chọn và câu trả lời ngắn, hãy đưa ra nhận xét bằng tiếng Việt trong 4-5 câu. Nêu điểm mạnh hoặc sở thích có dấu hiệu nổi bật, rồi gợi ý nhiều nhóm nghề hoặc lộ trình có thể khám phá (ví dụ đại học, học nghề, hệ 9+, GDTX tùy bối cảnh). Đây chỉ là gợi ý tham khảo, không phải kết luận hay bài kiểm tra quyết định tương lai; tuyệt đối không ép học sinh theo duy nhất một nghề, ngành hoặc con đường. Tôn trọng câu trả lời còn bỏ trống, không tự suy diễn học lực hay hoàn cảnh. Kết thúc bằng lời khuyến khích ngắn, không hỏi lại.',
      `Câu trả lời của học sinh:\n${summary}`,
      768
    );
    res.json({reply});
  } catch(e){
    console.error('[AI personality]', e.code || e.message);
    res.status(e.status || 502).json({reply:null, error:aiErrorMessage(e)});
  }
});

// ---------- AI SOẠN CÂU HỎI ÔN TẬP ----------
app.post('/api/ai/quiz', async (req,res)=>{
  try {
    const {subject} = req.body;
    const reply = await askGemini(
      `Soạn 5 câu trắc nghiệm lớp 9 môn ${subject}. Format JSON array: [{"q":"...","a":"A. ...","b":"B. ...","c":"C. ...","d":"D. ...","correct":"A"}]. CHỈ trả JSON, không giải thích.`,
      `Soạn 5 câu trắc nghiệm ${subject} lớp 9`,
      2048
    );
    res.json({reply});
  } catch(e){
    console.error('[AI quiz]', e.code || e.message);
    res.status(e.status || 502).json({reply:null, error:aiErrorMessage(e)});
  }
});

app.listen(PORT, ()=>
  console.log(`🌉 Server chạy tại http://localhost:${PORT} | AI: ${GEMINI_KEY ? 'Gemini đã cấu hình' : 'chưa cấu hình khóa API'}`)
);