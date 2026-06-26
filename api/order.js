// Vercel serverless: nhận đơn từ form web → tạo đơn Pancake POS (shop Vikora Group)
// + bắn sự kiện Purchase về Meta qua Conversions API (server-side, không bị iOS/adblock chặn).
// Bí mật từ biến môi trường: POS_API_KEY, CAPI_TOKEN (KHÔNG hard-code, không lộ ra client).

const crypto = require('crypto');

const SHOP_ID = '20100144';
const VARIATION_ID = 'c860bf5b-a592-4ef8-83b1-387803a1fb6a'; // Kem chống nắng Love The Sun SPF50+ PA+++ 40ml
const API_BASE = 'https://pos.pages.fm/api/v1';
const PIXEL_ID = '1389341576259188';
const CAPI_BASE = 'https://graph.facebook.com/v21.0';

function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function normPhone(p){
  var d = (p || '').replace(/\D/g, '');
  if (d.indexOf('0') === 0) d = '84' + d.slice(1);
  else if (d.indexOf('84') !== 0 && d.length >= 9) d = '84' + d;
  return d;
}
async function sendCapiPurchase(o){
  try{
    var token = process.env.CAPI_TOKEN;
    if (!token) return;
    var ud = {};
    if (o.email) ud.em = [sha256(o.email.trim().toLowerCase())];
    var ph = normPhone(o.phone);
    if (ph) ud.ph = [sha256(ph)];
    if (o.ip) ud.client_ip_address = o.ip;
    if (o.ua) ud.client_user_agent = o.ua;
    var ev = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now()/1000),
      action_source: 'website',
      event_source_url: 'https://lovethesun.ba12days.com/thankyou.html',
      user_data: ud,
      custom_data: {
        currency: 'VND',
        value: o.total || 0,
        contents: [{ id: VARIATION_ID, quantity: o.qty || 1 }],
        content_name: o.product || 'Love The Sun',
        num_items: o.qty || 1
      }
    };
    if (o.eid) ev.event_id = o.eid;
    await fetch(CAPI_BASE + '/' + PIXEL_ID + '/events?access_token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [ev] })
    });
  }catch(e){ /* best-effort, không chặn đơn */ }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok:false, error:'method_not_allowed' }); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const qty = Math.max(1, parseInt(body.qty, 10) || 1);
    const name = ((body.fullname || '') + '').trim().slice(0, 200) || 'Khách web';
    const phone = ((body.phone || '') + '').trim().slice(0, 30);
    const address = ((body.address || '') + '').trim().slice(0, 500);
    const email = ((body.email || '') + '').trim().slice(0, 120);
    const product = ((body.product || 'Love The Sun') + '').trim().slice(0, 200);
    const total = Math.max(0, parseInt(body.total, 10) || 0);
    const eid = ((body.eid || '') + '').trim().slice(0, 120);

    // Bắn Purchase qua Conversions API (song song, không chặn tạo đơn POS)
    const ip = (((req.headers['x-forwarded-for'] || '') + '').split(',')[0] || '').trim();
    const ua = (req.headers['user-agent'] || '') + '';
    const capiPromise = sendCapiPurchase({ email, phone, total, qty, product, eid, ip, ua });

    const key = process.env.POS_API_KEY;
    if (!key) { await capiPromise; res.status(200).json({ ok:false, error:'no_key' }); return; }

    const unit = (total > 0) ? Math.round(total / qty) : 0;
    const item = { variation_id: VARIATION_ID, quantity: qty };
    if (unit > 0) { item.variation_info = { retail_price: unit }; }

    const order = {
      items: [item],
      bill_full_name: name,
      bill_phone_number: phone,
      shipping_address: { full_name: name, phone_number: phone, address: address },
      note: 'Đơn từ web lovethesun.ba12days.com'
        + (email ? (' | Email: ' + email) : '')
        + ' | SP: ' + product,
      status: 0
    };

    const r = await fetch(API_BASE + '/shops/' + SHOP_ID + '/orders?api_key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    const data = await r.json().catch(() => ({}));
    await capiPromise;

    if (data && data.success) {
      res.status(200).json({ ok:true, id: (data.data && data.data.id) || null });
    } else {
      res.status(200).json({ ok:false, error:'pos_failed' });
    }
  } catch (e) {
    res.status(200).json({ ok:false, error:'exception' });
  }
};
