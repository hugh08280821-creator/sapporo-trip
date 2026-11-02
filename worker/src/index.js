// 삿포로 여행기 API — 사진과 메모를 받아 Claude로 일기·에세이를 써 주는 Cloudflare Worker
// 비밀값(wrangler secret): ANTHROPIC_API_KEY, FAMILY_CODE
import Anthropic from '@anthropic-ai/sdk';

const ALLOWED_ORIGINS = [
  'https://hugh08280821-creator.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const MODEL = 'claude-opus-5-5';
const MAX_PHOTOS = { day: 12, essay: 10 };
const MAX_IMAGE_B64 = 900_000; // 사진 한 장당 약 650KB까지

const SYSTEM = `너는 결혼기념일을 맞아 삿포로를 여행하는 60대 한국인 부부의 여행기를 대신 써 주는 작가다.
- 부부의 1인칭 복수("우리") 시점으로, 따뜻하고 담백한 한국어 일기체("~했다", "~였다")로 쓴다.
- 사진에 실제로 보이는 것, 그리고 함께 받은 날짜·시간·장소·메모만 사실로 쓴다. 나눈 대화, 정확한 기온, 가게 이름처럼 받지 않은 사실은 지어내지 않는다. 사진에서 확실하지 않은 것은 구체적으로 단정하지 않는다.
- 과장된 수식어나 광고 같은 문장은 피하고, 부모님이 읽고 미소 지을 만한 자연스러운 문장으로 쓴다.
- 본문은 문단 사이에 빈 줄을 넣는다. 마크다운 기호(#, *, -)는 쓰지 않는다.`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '여행기 제목 (20자 이내)' },
    body: { type: 'string', description: '본문' },
    captions: {
      type: 'array',
      description: '사진마다 한 줄 설명. 사진 번호(index)는 입력의 [사진 N] 번호',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, caption: { type: 'string' } },
        required: ['index', 'caption'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'body', 'captions'],
  additionalProperties: false,
};

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
}

const clip = (s, n) => String(s ?? '').slice(0, n);

function buildContent(body) {
  const { mode, trip, day, photos = [], diaries = [] } = body;
  const content = [];
  if (mode === 'day') {
    content.push({
      type: 'text',
      text: `${clip(trip, 80)}\n${clip(day.label, 20)} (${clip(day.date, 20)})의 일기를 써 줘.
분량은 400~700자. 사진 순서대로 하루의 흐름이 느껴지게 쓰고, 사진마다 한 줄 설명(20~40자)도 붙여 줘.
${day.plan ? `이 날 계획했던 일정: ${clip(day.plan, 400)}` : ''}`,
    });
  } else {
    content.push({
      type: 'text',
      text: `${clip(trip, 80)}\n2박 3일 여행 전체를 하나의 이야기로 담은 에세이를 써 줘.
분량은 1,200~1,800자. 아래 하루 일기와 대표 사진을 바탕으로 쓰고, 마지막 문단은 결혼기념일을 맞은 두 사람이 서로에게 건네는 짧은 마음으로 마무리해 줘. 사진마다 한 줄 설명(20~40자)도 붙여 줘.
${diaries.map((d) => `\n[${clip(d.label, 20)} 일기] ${clip(d.title, 60)}\n${clip(d.body, 2000)}`).join('\n')}`,
    });
  }
  photos.forEach((p, i) => {
    const info = [p.time && `시간 ${clip(p.time, 20)}`, p.place && `장소 ${clip(p.place, 60)}`, p.memo && `메모: ${clip(p.memo, 200)}`].filter(Boolean).join(' · ');
    content.push({ type: 'text', text: `[사진 ${i + 1}] ${info || '정보 없음'}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } });
  });
  return content;
}

function validate(body) {
  if (!body || (body.mode !== 'day' && body.mode !== 'essay')) return '잘못된 요청이에요.';
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length > MAX_PHOTOS[body.mode]) return `사진은 최대 ${MAX_PHOTOS[body.mode]}장까지 보낼 수 있어요.`;
  if (body.mode === 'day' && !photos.length) return '사진이 한 장 이상 필요해요.';
  if (body.mode === 'day' && !body.day) return '날짜 정보가 없어요.';
  for (const p of photos) {
    if (typeof p.data !== 'string' || p.data.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(p.data.slice(0, 200))) return '사진 형식이 올바르지 않아요.';
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Family-Code',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(request.url);
    if (pathname === '/ping' && request.method === 'POST') {
      // 비밀번호 확인용
      const ok = !!env.FAMILY_CODE && request.headers.get('X-Family-Code') === env.FAMILY_CODE;
      return json({ ok }, ok ? 200 : 401, cors);
    }
    if (pathname !== '/diary' || request.method !== 'POST') return json({ error: 'not_found' }, 404, cors);
    if (!env.FAMILY_CODE || request.headers.get('X-Family-Code') !== env.FAMILY_CODE) {
      return json({ error: '가족 비밀번호가 맞지 않아요.' }, 401, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: '잘못된 요청이에요.' }, 400, cors); }
    const invalid = validate(body);
    if (invalid) return json({ error: invalid }, 400, cors);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: buildContent(body) }],
      });
      if (response.stop_reason === 'refusal') return json({ error: '이 사진들로는 여행기를 쓰지 못했어요. 사진을 바꿔서 다시 시도해 주세요.' }, 422, cors);
      if (response.stop_reason === 'max_tokens') return json({ error: '글이 너무 길어져서 끊겼어요. 다시 시도해 주세요.' }, 502, cors);
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const out = JSON.parse(text);
      return json({ title: out.title, body: out.body, captions: out.captions || [] }, 200, cors);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return json({ error: '요청이 몰렸어요. 1분 뒤에 다시 시도해 주세요.' }, 429, cors);
      if (error instanceof Anthropic.AuthenticationError) return json({ error: '서버의 API 키 설정을 확인해 주세요.' }, 500, cors);
      if (error instanceof Anthropic.BadRequestError) return json({ error: '요청을 처리하지 못했어요. 사진 수를 줄여 다시 시도해 주세요.' }, 400, cors);
      if (error instanceof Anthropic.APIError) return json({ error: `AI 서버 오류(${error.status})예요. 잠시 후 다시 시도해 주세요.` }, 502, cors);
      if (error instanceof SyntaxError) return json({ error: '여행기를 읽지 못했어요. 다시 시도해 주세요.' }, 502, cors);
      return json({ error: '알 수 없는 오류가 났어요.' }, 500, cors);
    }
  },
};
