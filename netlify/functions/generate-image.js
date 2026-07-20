// netlify/functions/generate-image.js
// שומר את מפתח ה-API בצד השרת בלבד (משתנה סביבה ב-Netlify), לא בקוד הגלוי לדפדפן.
// תומך בשני מצבים: טקסט-בלבד (רקע לאיגרת) וטקסט+תמונת קלט (עריכת סלפי — המשתמש במרכז הצילום).

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY לא מוגדר בהגדרות הסביבה של Netlify' }) };
  }

  let prompt, imageBase64, imageMimeType;
  try {
    const body = JSON.parse(event.body || '{}');
    prompt = body.prompt;
    imageBase64 = body.image || null;
    imageMimeType = body.mimeType || 'image/jpeg';
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'גוף בקשה לא תקין' }) };
  }

  if (!prompt || typeof prompt !== 'string' || prompt.length > 900) {
    return { statusCode: 400, body: JSON.stringify({ error: 'prompt חסר או ארוך מדי' }) };
  }
  if (imageBase64 && (typeof imageBase64 !== 'string' || imageBase64.length > 8000000)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'קובץ תמונת קלט לא תקין או גדול מדי' }) };
  }

  const parts = [];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
  }
  parts.push({ text: prompt });

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
          contents: [{ parts }]
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

    const outParts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const imagePart = outParts.find(p => p.inlineData && p.inlineData.data);

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
