// Vercel Serverless Function — /api/invoices
// Lưu danh sách hoá đơn dùng chung cho tất cả người truy cập, dùng Upstash Redis
// (miễn phí) làm nơi lưu trữ vì Vercel Functions không có ổ đĩa bền vững.
//
// Cần khai báo 2 biến môi trường trong Vercel Project Settings > Environment Variables:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// Lấy 2 giá trị này khi tạo database miễn phí tại https://upstash.com (mục REST API).

const REDIS_KEY = "invoices_list";

function getEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Thiếu cấu hình UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. " +
      "Vào Vercel Project Settings > Environment Variables để thêm (xem README.md)."
    );
  }
  return { url, token };
}

async function redisGet() {
  const { url, token } = getEnv();
  const res = await fetch(`${url}/get/${REDIS_KEY}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Redis GET lỗi: ${res.status}`);
  const json = await res.json();
  if (!json.result) return [];
  try { return JSON.parse(json.result); }
  catch (e) { return []; }
}

async function redisSet(list) {
  const { url, token } = getEnv();
  const res = await fetch(`${url}/set/${REDIS_KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: JSON.stringify(list)
  });
  if (!res.ok) throw new Error(`Redis SET lỗi: ${res.status}`);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const list = await redisGet();
      return res.status(200).json({ ok: true, invoices: list });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ ok: false, error: "Thiếu dữ liệu hoá đơn." });
      }
      const list = await redisGet();
      const entry = {
        id: "saved_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        fileName: body.fileName || "",
        so_hoa_don: body.so_hoa_don || "",
        ngay_hoa_don: body.ngay_hoa_don || "",
        tong_thanh_toan: Number(body.tong_thanh_toan) || 0,
        tong_bang_chu: body.tong_bang_chu || "",
        data: body.data || null,
        saved_by: body.saved_by || "",
        saved_at: new Date().toISOString()
      };
      list.push(entry);
      await redisSet(list);
      return res.status(200).json({ ok: true, invoices: list, entry });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && JSON.parse(typeof req.body === "string" ? req.body : "{}").id);
      if (!id) return res.status(400).json({ ok: false, error: "Thiếu id cần xoá." });
      const list = await redisGet();
      const next = list.filter(x => x.id !== id);
      await redisSet(next);
      return res.status(200).json({ ok: true, invoices: next });
    }

    return res.status(405).json({ ok: false, error: "Phương thức không hỗ trợ." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
