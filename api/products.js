// Vercel Serverless Function — /api/products
// Lưu danh mục sản phẩm dùng chung cho tất cả người truy cập, dùng Upstash Redis
// (miễn phí) làm nơi lưu trữ — thay cho localStorage của từng trình duyệt như trước.
//
// Cần khai báo 2 biến môi trường trong Vercel Project Settings > Environment Variables
// (dùng chung với api/invoices.js, không cần tạo database Upstash thứ 2):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// Lấy 2 giá trị này khi tạo database miễn phí tại https://upstash.com (mục REST API).

const REDIS_KEY = "product_catalog";

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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const list = await redisGet();
      return res.status(200).json({ ok: true, products: list });
    }

    // PUT/POST đều dùng để ghi đè toàn bộ danh mục — client (main.js) luôn giữ
    // toàn bộ mảng sản phẩm trong bộ nhớ, sửa xong thì gửi cả mảng lên đây.
    if (req.method === "PUT" || req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const list = Array.isArray(body) ? body : (body && Array.isArray(body.products) ? body.products : null);
      if (!list) {
        return res.status(400).json({ ok: false, error: "Thiếu dữ liệu danh mục (mảng products)." });
      }
      await redisSet(list);
      return res.status(200).json({ ok: true, products: list });
    }

    if (req.method === "DELETE") {
      await redisSet([]);
      return res.status(200).json({ ok: true, products: [] });
    }

    return res.status(405).json({ ok: false, error: "Phương thức không hỗ trợ." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
