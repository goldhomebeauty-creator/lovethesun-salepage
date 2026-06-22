// Vercel serverless function: nhận đơn từ form web → tạo đơn trong Pancake POS (shop Vikora Group)
// API key lấy từ biến môi trường POS_API_KEY (không hard-code, không lộ ra client).

const SHOP_ID = '20100144';
const VARIATION_ID = 'c860bf5b-a592-4ef8-83b1-387803a1fb6a'; // Kem chống nắng Love The Sun SPF50+ PA+++ 40ml
const API_BASE = 'https://pos.pages.fm/api/v1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
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

    const key = process.env.POS_API_KEY;
    if (!key) { res.status(200).json({ ok: false, error: 'no_key' }); return; }

    // POS theo GIÁ TRÊN TRANG: gửi đơn giá (total/qty) qua variation_info.retail_price.
    // Đổi giá / chạy KM chỉ cần sửa trên trang, POS tự khớp. Nếu thiếu total thì POS dùng giá gốc SP.
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

    if (data && data.success) {
      res.status(200).json({ ok: true, id: (data.data && data.data.id) || null });
    } else {
      res.status(200).json({ ok: false, error: 'pos_failed' });
    }
  } catch (e) {
    res.status(200).json({ ok: false, error: 'exception' });
  }
};
