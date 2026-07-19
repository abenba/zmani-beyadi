// netlify/functions/generate-image.js
// שומר את מפתח ה-API בצד השרת בלבד (משתנה סביבה ב-Netlify), לא בקוד הגלוי לדפדפן.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY לא מוגדר בהגדרות הסביבה של Netlify' }) };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body || '{}');
    prompt = body.prompt;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'גוף בקשה לא תקין' }) };
  }

  if (!prompt || typeof prompt !== 'string' || prompt.length > 600) {
    return { statusCode: 400, body: JSON.stringify({ error: 'prompt חסר או ארוך מדי' }) };
  }

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || 'שגיאה מצד Gemini API' })
      };
    }

    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const imagePart = parts.find(p => p.inlineData && p.inlineData.data);

    if (!imagePart) {
      return { statusCode: 502, body: JSON.stringify({ error: 'לא התקבלה תמונה מהמודל' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType || 'image/png'
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || 'שגיאה לא צפויה' }) };
  }
};
