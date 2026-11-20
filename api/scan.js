/* Vercel serverless function: reads a bill photo with Claude and returns structured JSON.
   Needs the ANTHROPIC_API_KEY environment variable. Optional: SCAN_PASSCODE (shared code staff must enter). */
const crypto = require('crypto');
const MODEL = process.env.SCAN_MODEL || 'claude-sonnet-5-5';
const RATES = [0, 5, 12, 18, 28];
const UNITS = ['Nos', 'Pcs', 'Kg', 'MT', 'Ltr', 'Mtr', 'Box', 'Set', 'Pair', 'Hrs', 'Job'];
const hits = new Map(); // best-effort rate limit per instance

// Pull the first complete JSON object out of the model's reply (handles code fences, extra text, trailing commas).
function extractJson(t) {
  t = String(t || '').replace(/```(?:json)?/gi, '');
  const s = t.indexOf('{'); if (s < 0) return null;
  let d = 0, inStr = false, esc = false;
  for (let i = s; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{') d++; else if (ch === '}') { d--; if (d === 0) return t.slice(s, i + 1); }
  }
  return null;
}
function parseLoose(txt) {
  try { return JSON.parse(txt); } catch (e) { /* try again after cleanup */ }
  try { return JSON.parse(txt.replace(/,\s*([}\]])/g, '$1')); } catch (e) { return null; }
}

function prompt(heads) {
  return 'You read Indian business bills and invoices for an accounting app. Look at the attached bill photo and return ONLY JSON, no prose:\n'
    + '{"kind":"purchase"|"expense","vendorName":string,"vendorGstin":string|null,"billNo":string|null,"date":"YYYY-MM-DD"|null,'
    + '"lines":[{"desc":string,"hsn":string|null,"qty":number,"unit":string,"rate":number,"discPct":number,"gstPct":number}],'
    + '"expenseHead":string|null,"narration":string|null,"grandTotal":number|null,"confidence":"high"|"medium"|"low"}\n'
    + 'Rules:\n'
    + '- kind "purchase" = goods or services bought for resale or stock, usually several items. kind "expense" = running costs such as electricity, fuel, rent, repairs, courier, phone, stationery, food, travel.\n'
    + '- rate is the price per unit BEFORE GST. If the bill only shows GST-inclusive prices, divide by (1 + gstPct/100). qty must be a number (use 1 if the bill is a single charge). unit is one of: ' + UNITS.join(', ') + '.\n'
    + '- gstPct is the total GST rate for the line (e.g. 18 when CGST 9 + SGST 9, or IGST 18). Allowed values: ' + RATES.join(', ') + '. Use 0 if no GST is charged.\n'
    + '- discPct is the line discount percent, 0 if none. For an expense, return one line with the amount before GST as qty 1 and rate.\n'
    + '- vendorGstin is the SELLER\'s GSTIN (15 characters), not the buyer\'s. Copy it exactly; null if unreadable or absent.\n'
    + '- billNo is the vendor\'s invoice or bill number as printed. date is the bill date, ISO format.\n'
    + '- For an expense, expenseHead must be the closest match from this list, or a short new head name if none fits: ' + JSON.stringify(heads) + '.\n'
    + '- grandTotal is the final payable amount printed on the bill, after tax and round-off.\n'
    + '- Never invent values. Use null for anything you cannot read, and set confidence "low" if the photo is blurry or partial. If the image is not a bill, return {"kind":null}.';
}

const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 501, { error: 'Bill scanning is not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings.' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Not allowed.' }); } catch (e) { return send(res, 403, { error: 'Not allowed.' }); } }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body.image !== 'string') return send(res, 400, { error: 'No photo received.' });

  const pass = process.env.SCAN_PASSCODE;
  if (pass && !same(body.passcode || '', pass)) return send(res, 401, { error: body.passcode ? 'Wrong passcode.' : 'Enter the scan passcode.', code: 'passcode' });

  const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim(), now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= 40) return send(res, 429, { error: 'Too many scans in the last hour. Try again later.' });
  recent.push(now); hits.set(ip, recent);

  const image = body.image.replace(/^data:[^,]*,/, '');
  if (image.length > 6 * 1024 * 1024) return send(res, 413, { error: 'Photo is too large.' });
  const heads = (Array.isArray(body.heads) ? body.heads : []).slice(0, 80).map((h) => String(h).slice(0, 60));

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: prompt(heads) }] }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = r.status === 401 ? 'The API key is not valid.' : r.status === 429 ? 'The AI service is busy. Try again in a minute.' : r.status === 402 || (j.error && /credit/i.test(j.error.message || '')) ? 'The AI account has no credit left.' : 'The AI service could not read this photo.';
      return send(res, r.status === 429 ? 429 : 502, { error: msg });
    }
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const raw = extractJson(text);
    const data = raw ? parseLoose(raw) : null;
    if (!data) {
      console.error('scan: unreadable reply', j.stop_reason, text.length, JSON.stringify(text.slice(0, 200)));
      if (j.stop_reason === 'max_tokens') return send(res, 502, { error: 'This bill has too many items to read in one go. Scan it in parts or enter it by hand.' });
      return send(res, 502, { error: 'Could not understand the AI reply. Please try the photo again, a bit clearer or straighter.' });
    }
    return send(res, 200, { data });
  } catch (e) {
    return send(res, 502, { error: 'Could not reach the AI service.' });
  }
};
