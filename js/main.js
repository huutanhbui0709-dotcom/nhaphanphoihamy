
/* ===================== Vietnamese number-to-words ===================== */
const CHUSO = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function docSo3ChuSo(baso) {
    let tram = Math.floor(baso / 100), chuc = Math.floor((baso % 100) / 10), donvi = baso % 10, chuoi = "";
    if (tram === 0 && chuc === 0 && donvi === 0) return "";
    if (tram !== 0) {
        chuoi += CHUSO[tram] + " trăm";
        if (chuc === 0 && donvi !== 0) chuoi += " linh";
    }
    if (chuc !== 0 && chuc !== 1) chuoi += " " + CHUSO[chuc] + " mươi";
    else if (chuc === 1) chuoi += " mười";
    if (donvi === 1) {
        if (chuc === 0) chuoi += (tram !== 0 ? " một" : "một");
        else if (chuc === 1) chuoi += " một";
        else chuoi += " mốt";
    } else if (donvi === 5) {
        if (chuc === 0) chuoi += (tram !== 0 ? " năm" : "năm");
        else chuoi += " lăm";
    } else if (donvi !== 0) {
        chuoi += " " + CHUSO[donvi];
    }
    return chuoi.trim();
}
function docTienBangChu(soTien) {
    soTien = Math.round(Number(soTien) || 0);
    if (soTien === 0) return "Không đồng";
    const neg = soTien < 0;
    soTien = Math.abs(soTien);
    const dvBlock = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
    let groups = [], n = soTien;
    while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
    let parts = [];
    for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i];
        if (g === 0) continue;
        let txt = docSo3ChuSo(g);
        if (dvBlock[i]) txt += " " + dvBlock[i];
        parts.push(txt);
    }
    let result = parts.join(" ").replace(/\s+/g, " ").trim();
    result = result.charAt(0).toUpperCase() + result.slice(1);
    result += " đồng";
    return neg ? "Âm " + result : result;
}

/* ===================== state ===================== */
let pendingFiles = [];   // File objects waiting to be processed
let invoices = [];       // {id, fileName, status:'pending'|'loading'|'done'|'error', data, error, previewUrl}
let uidCounter = 0;
let savedInvoices = []; // populated from shared /api/invoices backend, see fetchSavedInvoices()

const $ = (sel) => document.querySelector(sel);
const settingsPanel = $("#settingsPanel");
const settingsToggle = $("#settingsToggle");
const apiKeyInput = $("#apiKeyInput");
const modelSelect = $("#modelSelect");
const dropzone = $("#dropzone");
const fileInput = $("#fileInput");
const fileListEl = $("#fileList");
const toolbar = $("#toolbar");
const resultsEl = $("#results");
const emptyState = $("#emptyState");
const processBtn = $("#processBtn");

/* ===================== settings ===================== */
apiKeyInput.value = localStorage.getItem("gemini_api_key") || "";
modelSelect.value = localStorage.getItem("gemini_model") || "gemini-3.5-flash";
if (!apiKeyInput.value) settingsPanel.classList.add("open");

settingsToggle.addEventListener("click", () => settingsPanel.classList.toggle("open"));
$("#saveKeyBtn").addEventListener("click", () => {
    localStorage.setItem("gemini_api_key", apiKeyInput.value.trim());
    localStorage.setItem("gemini_model", modelSelect.value);
    showToast("Đã lưu cấu hình.");
    settingsPanel.classList.remove("open");
});

/* ===================== tabs ===================== */
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        $("#tabProcess").style.display = tab === "process" ? "" : "none";
        $("#tabSaved").style.display = tab === "saved" ? "" : "none";
        $("#tabSearch").style.display = tab === "search" ? "" : "none";
        if (tab === "saved") fetchSavedInvoices();
        if (tab === "search") { renderCatalogTable(); renderSearchResults(); }
    });
});

/* ===================== saved invoices (shared backend via /api/invoices) ===================== */
let savedLoading = false;
let savedLoadError = null;

async function fetchSavedInvoices() {
    savedLoading = true;
    savedLoadError = null;
    renderSavedTable();
    try {
        const res = await fetch("/api/invoices");
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không tải được danh sách.");
        savedInvoices = json.invoices || [];
    } catch (err) {
        savedLoadError = err.message || String(err);
    }
    savedLoading = false;
    updateSavedCount();
    renderSavedTable();
}

async function saveInvoiceToList(inv) {
    const d = inv.data;
    const payload = {
        fileName: inv.fileName,
        so_hoa_don: d.so_hoa_don,
        ngay_hoa_don: d.ngay_hoa_don,
        tong_thanh_toan: d.tong_thanh_toan,
        tong_bang_chu: d.tong_bang_chu,
        data: d
    };
    try {
        const res = await fetch("/api/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Lưu thất bại.");
        savedInvoices = json.invoices || [];
        updateSavedCount();
        showToast("Đã lưu hoá đơn — mọi người xem trang này đều thấy.");
    } catch (err) {
        showToast("Không lưu được: " + (err.message || err));
    }
}

async function deleteSavedInvoice(id) {
    try {
        const res = await fetch(`/api/invoices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Xoá thất bại.");
        savedInvoices = json.invoices || [];
        renderSavedTable();
        updateSavedCount();
    } catch (err) {
        showToast("Không xoá được: " + (err.message || err));
    }
}

function updateSavedCount() {
    $("#savedCount").textContent = savedInvoices.length;
}
function renderSavedTable() {
    const tbody = $("#savedTbody");
    tbody.innerHTML = "";
    const table = $("#savedTable");
    const empty = $("#savedEmpty");

    if (savedLoading) {
        table.style.display = "none";
        empty.style.display = "block";
        empty.innerHTML = `<div class="status-line" style="justify-content:center;"><div class="spinner"></div> Đang tải danh sách dùng chung…</div>`;
        return;
    }
    if (savedLoadError) {
        table.style.display = "none";
        empty.style.display = "block";
        empty.innerHTML = `<div class="err-box">${escapeHtml(savedLoadError)}</div>`;
        return;
    }
    empty.style.display = savedInvoices.length ? "none" : "block";
    empty.innerHTML = `<p>Chưa lưu hoá đơn nào. Sang tab "Xử lý hoá đơn" và bấm "💾 Lưu" trên hoá đơn bạn muốn giữ lại.</p>`;
    table.style.display = savedInvoices.length ? "table" : "none";

    let grand = 0;
    savedInvoices.forEach(s => {
        grand += Number(s.tong_thanh_toan) || 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${escapeHtml(s.so_hoa_don || "—")}</td>
      <td>${escapeHtml(s.ngay_hoa_don || "—")}</td>
      <td class="num">${formatNumber(s.tong_thanh_toan)}</td>
      <td><button class="saved-del" title="Xoá khỏi danh sách">✕</button></td>`;
        tr.querySelector(".saved-del").onclick = () => deleteSavedInvoice(s.id);
        tbody.appendChild(tr);
    });
    $("#savedGrandTotal").textContent = formatNumber(grand);
}
function formatNumber(n) {
    return (Number(n) || 0).toLocaleString("vi-VN");
}
$("#exportSavedBtn").addEventListener("click", () => {
    if (!savedInvoices.length) { showToast("Chưa có hoá đơn nào trong danh sách."); return; }
    const aoa = [["Số HĐ", "Ngày", "Tổng tiền"]];
    savedInvoices.forEach(s => aoa.push([s.so_hoa_don, s.ngay_hoa_don, s.tong_thanh_toan]));
    aoa.push(["", "Tổng cộng", savedInvoices.reduce((a, s) => a + (Number(s.tong_thanh_toan) || 0), 0)]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Danh sach hoa don");
    XLSX.writeFile(wb, `danh_sach_hoa_don_${new Date().toISOString().slice(0, 10)}.xlsx`);
});
fetchSavedInvoices();
$("#refreshSavedBtn").addEventListener("click", fetchSavedInvoices);

/* ===================== file intake ===================== */
dropzone.addEventListener("click", () => fileInput.click());
["dragenter", "dragover"].forEach(evt =>
    dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach(evt =>
    dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("drag"); })
);
dropzone.addEventListener("drop", e => addFiles(e.dataTransfer.files));
fileInput.addEventListener("change", e => { addFiles(e.target.files); fileInput.value = ""; });

function addFiles(fileArr) {
    Array.from(fileArr).forEach(f => {
        if (!/^image\//.test(f.type) && f.type !== "application/pdf") return;
        pendingFiles.push(f);
    });
    renderFileList();
}

/* ---- paste image from clipboard (Ctrl+V) ---- */
function handlePasteEvent(e) {
    // don't hijack paste while user is typing in a text field
    const active = document.activeElement;
    const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (isTyping && active !== apiKeyInput) return;

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const found = [];
    for (const item of items) {
        if (item.kind === "file" && /^image\//.test(item.type)) {
            const file = item.getAsFile();
            if (file) {
                // clipboard image blobs often come with a generic name; give a readable one
                const ext = (item.type.split("/")[1] || "png").replace("jpeg", "jpg");
                const named = new File([file], `dan-anh-${Date.now()}.${ext}`, { type: item.type });
                found.push(named);
            }
        }
    }
    if (found.length) {
        e.preventDefault();
        addFiles(found);
        flashDropzone();
        showToast(found.length > 1 ? `Đã dán ${found.length} ảnh.` : "Đã dán ảnh.");
    }
}
function flashDropzone() {
    dropzone.classList.add("paste-flash");
    setTimeout(() => dropzone.classList.remove("paste-flash"), 500);
}
dropzone.addEventListener("paste", handlePasteEvent);
document.addEventListener("paste", handlePasteEvent);
function renderFileList() {
    fileListEl.innerHTML = "";
    pendingFiles.forEach((f, i) => {
        const chip = document.createElement("div");
        chip.className = "file-chip";
        chip.innerHTML = `<span>${f.type === "application/pdf" ? "📄" : "🖼"} ${escapeHtml(f.name)}</span>`;
        const btn = document.createElement("button");
        btn.textContent = "✕";
        btn.onclick = () => { pendingFiles.splice(i, 1); renderFileList(); };
        chip.appendChild(btn);
        fileListEl.appendChild(chip);
    });
    toolbar.style.display = (pendingFiles.length || invoices.length) ? "flex" : "none";
    processBtn.style.display = pendingFiles.length ? "inline-flex" : "none";
    processBtn.textContent = `Trích xuất dữ liệu (${pendingFiles.length})`;
}

/* ===================== Gemini call ===================== */
const RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        so_hoa_don: { type: "STRING", description: "Số hoá đơn / số phiếu ghi trên chứng từ" },
        ngay_hoa_don: { type: "STRING", description: "Ngày trên hoá đơn, định dạng dd/mm/yyyy" },
        ten_nguoi_ban: { type: "STRING" },
        ten_khach_hang: { type: "STRING" },
        danh_sach_san_pham: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    stt: { type: "INTEGER" },
                    ma_hang: { type: "STRING" },
                    ten_hang: { type: "STRING" },
                    dvt: { type: "STRING", description: "Đơn vị tính" },
                    so_luong: { type: "NUMBER" },
                    don_gia: { type: "NUMBER" },
                    thanh_tien: { type: "NUMBER" }
                },
                required: ["ten_hang", "so_luong", "don_gia", "thanh_tien"]
            }
        },
        cong_tien_hang: { type: "NUMBER", description: "Tổng cộng tiền hàng trước khi cộng nợ cũ" },
        no_cu: { type: "NUMBER", description: "Nợ cũ nếu có, mặc định 0" },
        tong_thanh_toan: { type: "NUMBER", description: "Tổng số tiền cần thanh toán cuối cùng" }
    },
    required: ["danh_sach_san_pham", "tong_thanh_toan"]
};

const PROMPT = `Bạn là trợ lý kế toán. Đây là ảnh hoặc PDF của một phiếu báo giá / hoá đơn / bảng kê hàng hoá tiếng Việt.
Hãy đọc kỹ toàn bộ bảng sản phẩm và các thông tin tổng tiền, rồi trả về đúng theo schema JSON đã cho.
Quy tắc:
- Giữ nguyên số liệu như trên chứng từ, không tự làm tròn hay suy diễn.
- so_luong, don_gia, thanh_tien là số thuần (không có dấu chấm/phẩy ngăn cách hàng nghìn, không có ký hiệu tiền tệ).
- Nếu một dòng sản phẩm bị gạch ngang / gạch bỏ (hàng trả lại, hàng huỷ), vẫn liệt kê dòng đó nhưng thêm "[Đã gạch bỏ]" vào đầu ten_hang.
- cong_tien_hang là tổng tiền hàng (tổng các thanh_tien), no_cu là nợ cũ nếu chứng từ có ghi (mặc định 0 nếu không có), tong_thanh_toan là số tiền cuối cùng khách phải trả (thường là cong_tien_hang + no_cu, hoặc số viết tay cuối phiếu nếu có).
- Nếu không tìm thấy số hoá đơn hoặc ngày, để chuỗi rỗng.`;

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(",")[1]);
        r.onerror = () => reject(new Error("Không đọc được tệp"));
        r.readAsDataURL(file);
    });
}

async function callGemini(apiKey, model, file) {
    const base64 = await fileToBase64(file);
    const body = {
        contents: [{
            role: "user",
            parts: [
                { text: PROMPT },
                { inlineData: { mimeType: file.type || "application/octet-stream", data: base64 } }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.1
        }
    };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok) {
        const msg = json?.error?.message || `Lỗi HTTP ${res.status}`;
        throw new Error(msg);
    }
    const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (!text) throw new Error("Không nhận được nội dung trả về từ model.");
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error("Không phân tích được JSON trả về: " + text.slice(0, 200)); }
    return data;
}

/* ===================== processing ===================== */
processBtn.addEventListener("click", async () => {
    const apiKey = (localStorage.getItem("gemini_api_key") || apiKeyInput.value).trim();
    const model = localStorage.getItem("gemini_model") || modelSelect.value;
    if (!apiKey) {
        showToast("Vui lòng nhập và lưu API key trước.");
        settingsPanel.classList.add("open");
        return;
    }
    const filesToRun = pendingFiles.slice();
    pendingFiles = [];
    renderFileList();
    processBtn.disabled = true;

    for (const file of filesToRun) {
        const id = "inv_" + (++uidCounter);
        const inv = { id, fileName: file.name, status: "loading", data: null, error: null };
        invoices.push(inv);
        renderAll();
        try {
            const raw = await callGemini(apiKey, model, file);
            inv.data = normalizeInvoice(raw);
            inv.status = "done";
        } catch (err) {
            inv.status = "error";
            inv.error = err.message || String(err);
        }
        renderAll();
    }
    processBtn.disabled = false;
});

function normalizeInvoice(raw) {
    const items = (raw.danh_sach_san_pham || []).map((it, idx) => ({
        stt: it.stt ?? (idx + 1),
        ma_hang: it.ma_hang || "",
        ten_hang: it.ten_hang || "",
        dvt: it.dvt || "",
        so_luong: numOrZero(it.so_luong),
        don_gia: numOrZero(it.don_gia),
        thanh_tien: numOrZero(it.thanh_tien)
    }));
    const data = {
        so_hoa_don: raw.so_hoa_don || "",
        ngay_hoa_don: raw.ngay_hoa_don || "",
        ten_nguoi_ban: raw.ten_nguoi_ban || "",
        ten_khach_hang: raw.ten_khach_hang || "",
        items,
        cong_tien_hang: numOrZero(raw.cong_tien_hang),
        no_cu: numOrZero(raw.no_cu),
        tong_thanh_toan: numOrZero(raw.tong_thanh_toan)
    };
    recalcTotals(data, { keepGrand: true });
    return data;
}
function numOrZero(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

function recalcTotals(data, opts = {}) {
    data.cong_tien_hang = data.items.reduce((s, it) => s + (Number(it.thanh_tien) || 0), 0);
    if (!opts.keepGrand) {
        data.tong_thanh_toan = data.cong_tien_hang + (Number(data.no_cu) || 0);
    }
    data.tong_bang_chu = docTienBangChu(data.tong_thanh_toan);
}

/* ===================== rendering ===================== */
function renderAll() {
    toolbar.style.display = (pendingFiles.length || invoices.length) ? "flex" : "none";
    emptyState.style.display = invoices.length ? "none" : "block";
    resultsEl.innerHTML = "";
    invoices.forEach(inv => resultsEl.appendChild(renderInvoiceCard(inv)));
}

function renderInvoiceCard(inv) {
    const card = document.createElement("div");
    card.className = "paper-card invoice-card";

    if (inv.status === "loading") {
        card.innerHTML = `<div class="status-line"><div class="spinner"></div> Đang đọc "${escapeHtml(inv.fileName)}"…</div>`;
        return card;
    }
    if (inv.status === "error") {
        card.innerHTML = `
      <div class="inv-head">
        <div><strong>${escapeHtml(inv.fileName)}</strong></div>
        <div class="stamp err">LỖI</div>
      </div>
      <div class="err-box">${escapeHtml(inv.error)}</div>`;
        return card;
    }

    const d = inv.data;
    const head = document.createElement("div");
    head.className = "inv-head";
    head.innerHTML = `
    <div class="meta-grid">
      <div class="meta-field"><label>Số hoá đơn</label><input data-field="so_hoa_don" value="${escapeAttr(d.so_hoa_don)}"></div>
      <div class="meta-field"><label>Ngày hoá đơn</label><input data-field="ngay_hoa_don" value="${escapeAttr(d.ngay_hoa_don)}"></div>
      <div class="meta-field"><label>Người bán</label><input data-field="ten_nguoi_ban" value="${escapeAttr(d.ten_nguoi_ban)}"></div>
      <div class="meta-field"><label>Khách hàng</label><input data-field="ten_khach_hang" value="${escapeAttr(d.ten_khach_hang)}"></div>
    </div>
    <div class="stamp">ĐÃ TRÍCH XUẤT<br>${escapeHtml(inv.fileName).slice(0, 14)}</div>
  `;
    card.appendChild(head);

    const table = document.createElement("table");
    table.className = "items";
    table.innerHTML = `
    <thead><tr>
      <th style="width:36px;">STT</th><th style="width:90px;">Mã hàng</th><th>Tên hàng</th>
      <th style="width:70px;">ĐVT</th><th style="width:70px;">SL</th>
      <th style="width:100px;">Đơn giá</th><th style="width:110px;">Thành tiền</th><th style="width:32px;"></th>
    </tr></thead>
    <tbody></tbody>`;
    const tbody = table.querySelector("tbody");
    d.items.forEach((it, idx) => tbody.appendChild(renderItemRow(inv, it, idx)));
    card.appendChild(table);

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-ghost btn-sm add-row-btn";
    addBtn.textContent = "+ Thêm dòng";
    addBtn.onclick = () => {
        d.items.push({ stt: d.items.length + 1, ma_hang: "", ten_hang: "", dvt: "", so_luong: 0, don_gia: 0, thanh_tien: 0 });
        recalcTotals(d);
        renderAll();
    };
    card.appendChild(addBtn);

    const totals = document.createElement("div");
    totals.className = "totals";
    totals.innerHTML = `
    <div class="totals-box">
      <div class="totals-line"><label>Cộng tiền hàng</label><input data-field="cong_tien_hang" value="${d.cong_tien_hang}"></div>
      <div class="totals-line"><label>Nợ cũ</label><input data-field="no_cu" value="${d.no_cu}"></div>
      <div class="totals-line grand"><label>Tổng thanh toán</label><input data-field="tong_thanh_toan" value="${d.tong_thanh_toan}"></div>
      <div class="words-box">Bằng chữ: <b>${escapeHtml(d.tong_bang_chu)}</b></div>
    </div>`;
    card.appendChild(totals);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.innerHTML = `
    <button class="btn btn-ghost btn-sm" data-act="remove">🗑 Xoá</button>
    <button class="btn btn-ghost btn-sm" data-act="copy">📋 Sao chép bảng</button>
    <button class="btn btn-gold btn-sm" data-act="export">⬇ Xuất Excel</button>
    <button class="btn btn-primary btn-sm" data-act="save">💾 Lưu hoá đơn</button>`;
    card.appendChild(actions);

    // wire head + totals inputs
    card.querySelectorAll("[data-field]").forEach(inp => {
        inp.addEventListener("change", () => {
            const field = inp.dataset.field;
            if (["cong_tien_hang", "no_cu", "tong_thanh_toan"].includes(field)) {
                d[field] = numOrZero(inp.value);
                if (field !== "tong_thanh_toan") recalcTotals(d, { keepGrand: false });
                else d.tong_bang_chu = docTienBangChu(d.tong_thanh_toan);
            } else {
                d[field] = inp.value;
            }
            renderAll();
        });
    });

    actions.querySelector('[data-act="remove"]').onclick = () => {
        invoices = invoices.filter(x => x.id !== inv.id);
        renderAll();
    };
    actions.querySelector('[data-act="copy"]').onclick = () => copyInvoice(inv);
    actions.querySelector('[data-act="export"]').onclick = () => exportInvoiceExcel(inv);
    actions.querySelector('[data-act="save"]').onclick = () => saveInvoiceToList(inv);

    return card;
}

function renderItemRow(inv, it, idx) {
    const d = inv.data;
    const tr = document.createElement("tr");
    const strike = /^\[Đã gạch bỏ\]/.test(it.ten_hang);
    tr.innerHTML = `
    <td class="num"><input data-idx="${idx}" data-f="stt" value="${it.stt}" style="width:34px;"></td>
    <td><input data-idx="${idx}" data-f="ma_hang" value="${escapeAttr(it.ma_hang)}"></td>
    <td class="name-cell"><input data-idx="${idx}" data-f="ten_hang" value="${escapeAttr(it.ten_hang)}" style="${strike ? "text-decoration:line-through;color:#a35;" : ""}"></td>
    <td><input data-idx="${idx}" data-f="dvt" value="${escapeAttr(it.dvt)}"></td>
    <td class="num"><input data-idx="${idx}" data-f="so_luong" value="${it.so_luong}"></td>
    <td class="num"><input data-idx="${idx}" data-f="don_gia" value="${it.don_gia}"></td>
    <td class="num"><input data-idx="${idx}" data-f="thanh_tien" value="${it.thanh_tien}"></td>
    <td><button class="del-row" title="Xoá dòng">✕</button></td>`;
    tr.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("change", () => {
            const f = inp.dataset.f;
            const item = d.items[idx];
            if (["stt", "so_luong", "don_gia", "thanh_tien"].includes(f)) item[f] = numOrZero(inp.value);
            else item[f] = inp.value;
            if (f === "so_luong" || f === "don_gia") {
                item.thanh_tien = Math.round(item.so_luong * item.don_gia * 100) / 100;
            }
            recalcTotals(d);
            renderAll();
        });
    });
    tr.querySelector(".del-row").onclick = () => {
        d.items.splice(idx, 1);
        recalcTotals(d);
        renderAll();
    };
    return tr;
}

/* ===================== copy / export ===================== */
function invoiceToRows(d) {
    const header = ["STT", "Mã hàng", "Tên hàng", "ĐVT", "SL", "Đơn giá", "Thành tiền"];
    const rows = d.items.map(it => [it.stt, it.ma_hang, it.ten_hang, it.dvt, it.so_luong, it.don_gia, it.thanh_tien]);
    return { header, rows };
}

function copyInvoice(inv) {
    const d = inv.data;
    const { header, rows } = invoiceToRows(d);
    let out = `Số hoá đơn:\t${d.so_hoa_don}\nNgày:\t${d.ngay_hoa_don}\n\n`;
    out += header.join("\t") + "\n";
    rows.forEach(r => out += r.join("\t") + "\n");
    out += `\nCộng tiền hàng\t${d.cong_tien_hang}\nNợ cũ\t${d.no_cu}\nTổng thanh toán\t${d.tong_thanh_toan}\nBằng chữ\t${d.tong_bang_chu}\n`;
    copyText(out);
}

function copyAll() {
    if (!invoices.filter(i => i.status === "done").length) { showToast("Chưa có hoá đơn nào để sao chép."); return; }
    let out = "";
    invoices.filter(i => i.status === "done").forEach((inv, i) => {
        const d = inv.data;
        const { header, rows } = invoiceToRows(d);
        out += `=== Hoá đơn ${d.so_hoa_don || inv.fileName} (${d.ngay_hoa_don}) ===\n`;
        out += header.join("\t") + "\n";
        rows.forEach(r => out += r.join("\t") + "\n");
        out += `Cộng tiền hàng\t${d.cong_tien_hang}\nNợ cũ\t${d.no_cu}\nTổng thanh toán\t${d.tong_thanh_toan}\nBằng chữ\t${d.tong_bang_chu}\n\n`;
    });
    copyText(out);
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(
        () => showToast("Đã sao chép — dán trực tiếp vào Excel hoặc Google Sheets."),
        () => showToast("Không thể sao chép tự động, vui lòng thử lại.")
    );
}

function exportInvoiceExcel(inv) {
    const d = inv.data;
    const wb = XLSX.utils.book_new();
    appendInvoiceSheet(wb, d, inv.fileName, "Hoa_don");
    XLSX.writeFile(wb, `hoa_don_${(d.so_hoa_don || inv.fileName).replace(/[^\w-]+/g, "_")}.xlsx`);
    showToast("Đã tải file Excel.");
}

function exportAll() {
    const done = invoices.filter(i => i.status === "done");
    if (!done.length) { showToast("Chưa có hoá đơn nào để xuất."); return; }
    const wb = XLSX.utils.book_new();
    done.forEach((inv, i) => {
        const sheetName = (inv.data.so_hoa_don || `HD${i + 1}`).replace(/[\\/*?:\[\]]/g, "").slice(0, 28) || `HD${i + 1}`;
        appendInvoiceSheet(wb, inv.data, inv.fileName, sheetName);
    });
    XLSX.writeFile(wb, `hoa_don_tong_hop_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Đã tải file Excel tổng hợp.");
}

function appendInvoiceSheet(wb, d, fileName, sheetName) {
    const aoa = [];
    aoa.push(["Số hoá đơn", d.so_hoa_don, "", "Ngày", d.ngay_hoa_don]);
    aoa.push(["Người bán", d.ten_nguoi_ban, "", "Khách hàng", d.ten_khach_hang]);
    aoa.push([]);
    aoa.push(["STT", "Mã hàng", "Tên hàng", "ĐVT", "SL", "Đơn giá", "Thành tiền"]);
    d.items.forEach(it => aoa.push([it.stt, it.ma_hang, it.ten_hang, it.dvt, it.so_luong, it.don_gia, it.thanh_tien]));
    aoa.push([]);
    aoa.push(["", "", "", "", "", "Cộng tiền hàng", d.cong_tien_hang]);
    aoa.push(["", "", "", "", "", "Nợ cũ", d.no_cu]);
    aoa.push(["", "", "", "", "", "Tổng thanh toán", d.tong_thanh_toan]);
    aoa.push(["Bằng chữ", d.tong_bang_chu]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 34 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[:\\/?*\[\]]/g, "").slice(0, 31));
}

$("#copyAllBtn").addEventListener("click", copyAll);
$("#exportAllBtn").addEventListener("click", exportAll);

/* ===================== utils ===================== */
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ===================== product catalog + fuzzy search ===================== */
/*
 * Kho san pham dung chung cho tab "Tim kiem san pham".
 * Luu tren backend dung chung qua /api/products (Vercel Serverless Function +
 * Upstash Redis) -- giong co che cua /api/invoices -- de moi nguoi truy cap
 * trang deu thay cung 1 danh muc, thay vi moi may luu rieng trong localStorage
 * nhu truoc.
 * Co the nap du lieu bang 2 cach:
 *   1) Nguoi dung bam "Nhap file Excel/CSV" trong giao dien (xem phan importFileInput ben duoi).
 *   2) Goi truc tiep tu console/tinh nang khac: ProductCatalog.addMany(list) hoac
 *      ProductCatalog.replaceAll(list) -- tab tim kiem se tu dong dung du lieu moi.
 * Moi san pham co dang: { id, ma_hang, ten_hang, dvt, gia_ban, gia_von }
 */
let productCatalog = [];
let productUidCounter = 0;
let productCatalogLoading = false;

async function fetchProductCatalog() {
    productCatalogLoading = true;
    try {
        const res = await fetch("/api/products");
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không tải được danh mục sản phẩm.");
        productCatalog = json.products || [];
    } catch (err) {
        showToast("Không tải được danh mục sản phẩm: " + (err.message || err));
        productCatalog = [];
    }
    productCatalogLoading = false;
    onCatalogChanged();
}

async function saveProductCatalog() {
    try {
        const res = await fetch("/api/products", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ products: productCatalog })
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Lưu danh mục thất bại.");
        return true;
    } catch (err) {
        showToast("Không lưu được danh mục sản phẩm: " + (err.message || err));
        return false;
    }
}

function nextProductId() { return "prod_" + Date.now() + "_" + (++productUidCounter); }
function normalizeProductInput(p) {
    return {
        id: nextProductId(),
        ma_hang: String(p.ma_hang ?? "").trim(),
        ten_hang: String(p.ten_hang ?? "").trim(),
        dvt: String(p.dvt ?? "").trim(),
        gia_ban: numOrZero(p.gia_ban),
        gia_von: numOrZero(p.gia_von)
    };
}

const ProductCatalog = {
    all() { return productCatalog.slice(); },
    async add(p) {
        productCatalog.push(normalizeProductInput(p));
        onCatalogChanged();
        await saveProductCatalog();
    },
    async addMany(list) {
        (list || []).forEach(p => productCatalog.push(normalizeProductInput(p)));
        onCatalogChanged();
        await saveProductCatalog();
    },
    async replaceAll(list) {
        productCatalog = (list || []).map(normalizeProductInput);
        onCatalogChanged();
        await saveProductCatalog();
    },
    async remove(id) {
        productCatalog = productCatalog.filter(p => p.id !== id);
        onCatalogChanged();
        await saveProductCatalog();
    },
    async clear() {
        productCatalog = [];
        onCatalogChanged();
        await saveProductCatalog();
    }
};
window.ProductCatalog = ProductCatalog; // co the goi tu ngoai de nap du lieu

function onCatalogChanged() {
    updateProductCount();
    renderCatalogTable();
    renderSearchResults();
}
function updateProductCount() {
    $("#productCount").textContent = productCatalog.length;
}

/* ---- Vietnamese-aware normalization + fuzzy scoring ---- */
function normalizeVN(str) {
    return String(str ?? "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function tokenizeVN(str) {
    const s = normalizeVN(str);
    return s ? s.split(" ") : [];
}
function levenshtein(a, b) {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    let prev = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
        const cur = [i];
        for (let j = 1; j <= bl; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[bl];
}
function tokenSimilarity(qt, pt) {
    if (!qt || !pt) return 0;
    if (qt === pt) return 1;
    if (pt.startsWith(qt) || qt.startsWith(pt)) return 0.9;
    if (pt.includes(qt) || qt.includes(pt)) return 0.8;
    const dist = levenshtein(qt, pt);
    const sim = 1 - dist / Math.max(qt.length, pt.length);
    return sim > 0.5 ? sim * 0.8 : 0;
}
// Tra ve diem khop 0..1 giua tu khoa tim kiem va mot san pham trong danh muc.
function scoreProduct(queryTokens, product) {
    if (!queryTokens.length) return 0;
    const prodTokens = tokenizeVN(`${product.ten_hang} ${product.ma_hang}`);
    if (!prodTokens.length) return 0;
    let sum = 0;
    queryTokens.forEach(qt => {
        let best = 0;
        prodTokens.forEach(pt => { const s = tokenSimilarity(qt, pt); if (s > best) best = s; });
        sum += best;
    });
    return sum / queryTokens.length;
}
function searchProducts(query) {
    const tokensAll = tokenizeVN(query);
    const tokens = tokensAll.filter(t => t.length >= 2);
    const useTokens = tokens.length ? tokens : tokensAll;
    if (!useTokens.length) return [];
    const scored = productCatalog.map(p => ({ product: p, score: scoreProduct(useTokens, p) }));
    return scored
        .filter(r => r.score >= 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
}

/* ---- rendering: search tab ---- */
const productSearchInput = $("#productSearchInput");
let searchDebounceTimer = null;
productSearchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(renderSearchResults, 150);
});
$("#clearSearchBtn").addEventListener("click", () => {
    productSearchInput.value = "";
    renderSearchResults();
    productSearchInput.focus();
});

function renderSearchResults() {
    const table = $("#searchResultsTable");
    const scrollWrap = $("#searchResultsScroll");
    const tbody = $("#searchResultsTbody");
    const empty = $("#searchEmpty");
    const query = productSearchInput.value.trim();
    tbody.innerHTML = "";

    if (!query) {
        table.style.display = "none";
        scrollWrap.style.display = "none";
        empty.style.display = "block";
        empty.innerHTML = `<p>Nhap tu khoa o tren de tim san pham gan dung trong danh muc.</p>`;
        return;
    }
    if (!productCatalog.length) {
        table.style.display = "none";
        scrollWrap.style.display = "none";
        empty.style.display = "block";
        empty.innerHTML = `<p>Danh muc san pham dang trong. Nhap file hoac them san pham o bang ben duoi truoc khi tim kiem.</p>`;
        return;
    }
    const results = searchProducts(query);
    if (!results.length) {
        table.style.display = "none";
        scrollWrap.style.display = "none";
        empty.style.display = "block";
        empty.innerHTML = `<p>Khong tim thay san pham nao gan giong "${escapeHtml(query)}".</p>`;
        return;
    }
    empty.style.display = "none";
    scrollWrap.style.display = "block";
    table.style.display = "table";
    results.forEach(({ product, score }) => {
        const pct = Math.round(score * 100);
        const cls = pct >= 70 ? "" : (pct >= 50 ? "mid" : "low");
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${escapeHtml(product.ma_hang || "—")}</td>
      <td>${escapeHtml(product.ten_hang || "—")}</td>
      <td>${escapeHtml(product.dvt || "—")}</td>
      <td class="num">${formatNumber(product.gia_ban)}</td>
      <td class="num">${formatNumber(product.gia_von)}</td>
      <td class="num"><span class="match-badge ${cls}">${pct}%</span></td>
      <td><button class="copy-row-btn" title="Sao chep ten hang">📋</button></td>`;
        tr.querySelector(".copy-row-btn").onclick = () => copyText(product.ten_hang || "");
        tbody.appendChild(tr);
    });
}

/* ---- rendering: catalog tab ---- */
const catalogFilterInput = $("#catalogFilterInput");
let catalogFilterDebounce = null;
catalogFilterInput.addEventListener("input", () => {
    clearTimeout(catalogFilterDebounce);
    catalogFilterDebounce = setTimeout(renderCatalogTable, 120);
});

function renderCatalogTable() {
    const tbody = $("#catalogTbody");
    const table = $("#catalogTable");
    const empty = $("#catalogEmpty");
    const hint = $("#catalogCountHint");
    tbody.innerHTML = "";

    const q = normalizeVN(catalogFilterInput.value.trim());
    const list = q
        ? productCatalog.filter(p => normalizeVN(`${p.ma_hang} ${p.ten_hang}`).includes(q))
        : productCatalog;

    if (!productCatalog.length) {
        empty.style.display = "block";
        empty.innerHTML = `<p>Chưa có sản phẩm nào trong danh mục. Nhập file Excel/CSV hoặc thêm thủ công ở trên.</p>`;
        table.closest(".table-scroll").style.display = "none";
        hint.textContent = "";
        return;
    }
    if (q && !list.length) {
        empty.style.display = "block";
        empty.innerHTML = `<p>Không có sản phẩm nào khớp bộ lọc "${escapeHtml(catalogFilterInput.value.trim())}".</p>`;
        table.closest(".table-scroll").style.display = "none";
        hint.textContent = `0 / ${productCatalog.length} sản phẩm`;
        return;
    }
    empty.style.display = "none";
    table.closest(".table-scroll").style.display = "block";
    hint.textContent = q ? `${list.length} / ${productCatalog.length} sản phẩm` : `${productCatalog.length} sản phẩm`;

    list.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${escapeHtml(p.ma_hang || "—")}</td>
      <td>${escapeHtml(p.ten_hang || "—")}</td>
      <td>${escapeHtml(p.dvt || "—")}</td>
      <td class="num">${formatNumber(p.gia_ban)}</td>
      <td class="num">${formatNumber(p.gia_von)}</td>
      <td><button class="saved-del" title="Xoa san pham">✕</button></td>`;
        tr.querySelector(".saved-del").onclick = () => ProductCatalog.remove(p.id);
        tbody.appendChild(tr);
    });
}

$("#addProductBtn").addEventListener("click", () => {
    const ten = $("#newProdTen").value.trim();
    if (!ten) { showToast("Vui long nhap ten hang."); $("#newProdTen").focus(); return; }
    ProductCatalog.add({
        ma_hang: $("#newProdMa").value,
        ten_hang: ten,
        dvt: $("#newProdDvt").value,
        gia_ban: $("#newProdGiaBan").value,
        gia_von: $("#newProdGiaVon").value
    });
    $("#newProdMa").value = "";
    $("#newProdTen").value = "";
    $("#newProdDvt").value = "";
    $("#newProdGiaBan").value = "";
    $("#newProdGiaVon").value = "";
    $("#newProdTen").focus();
    showToast("Da them san pham vao danh muc.");
});
["newProdMa", "newProdTen", "newProdDvt", "newProdGiaBan", "newProdGiaVon"].forEach(id => {
    $("#" + id).addEventListener("keydown", e => { if (e.key === "Enter") $("#addProductBtn").click(); });
});
$("#clearCatalogBtn").addEventListener("click", () => {
    if (!productCatalog.length) return;
    if (confirm("Xoa toan bo danh muc san pham? Hanh dong nay khong the hoan tac.")) {
        ProductCatalog.clear();
        catalogFilterInput.value = "";
        showToast("Da xoa toan bo danh muc.");
    }
});

/* ===================== import tu file Excel/CSV ===================== */
/*
 * Chi lay 5 cot: Ma hang, Ten hang, DVT, Gia ban, Gia von.
 * Doc file bang thu vien SheetJS (da nap san o index.html), tu do khop ten cot
 * (khong phan biet dau/hoa-thuong) de tuong thich voi nhieu mau file khac nhau
 * (vd file xuat tu POS365: "Ma hang hoa", "Ten hang hoa", "Gia ban", "Gia von", "DVT").
 */
const HEADER_CANDIDATES = {
    ma_hang: ["ma hang hoa", "ma hang", "ma san pham", "ma sp", "ma"],
    ten_hang: ["ten hang hoa", "ten hang", "ten san pham", "ten sp", "ten"],
    dvt: ["dvt", "don vi tinh", "don vi"],
    gia_ban: ["gia ban", "don gia ban", "gia ban le", "gia"],
    gia_von: ["gia von", "gia goc", "gia nhap", "gia von hang"]
};
// Nhung tu can loai neu header co chua, de tranh nham voi "Gia ban DVT Lon", "Ton kho"...
const HEADER_EXCLUDE_WORDS = ["lon", "quy doi", "ton kho", "nho nhat", "lon nhat"];

function matchHeaderColumns(headerRow) {
    const normalized = headerRow.map(h => normalizeVN(h));
    const colIndex = {};
    Object.keys(HEADER_CANDIDATES).forEach(field => {
        const candidates = HEADER_CANDIDATES[field];
        let found = -1;
        // 1) khop chinh xac theo thu tu uu tien
        for (const cand of candidates) {
            const idx = normalized.findIndex(h => h === cand);
            if (idx !== -1) { found = idx; break; }
        }
        // 2) fallback: header chua tat ca tu cua ung vien dau tien va khong dinh tu bi loai
        if (found === -1) {
            const words = candidates[0].split(" ");
            found = normalized.findIndex(h =>
                words.every(w => h.includes(w)) &&
                !HEADER_EXCLUDE_WORDS.some(ex => h.includes(ex))
            );
        }
        colIndex[field] = found;
    });
    return colIndex;
}

function parseWorkbookToProducts(workbook) {
    // lay sheet dau tien co du lieu
    let rows = [];
    for (const name of workbook.SheetNames) {
        const ws = workbook.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
        if (aoa.length > 1) { rows = aoa; break; }
        if (!rows.length) rows = aoa;
    }
    if (rows.length < 2) return { products: [], missing: Object.keys(HEADER_CANDIDATES) };

    const header = rows[0].map(h => String(h ?? ""));
    const colIndex = matchHeaderColumns(header);
    const missing = Object.keys(colIndex).filter(f => colIndex[f] === -1);
    // bat buoc phai co it nhat ten hang de import co y nghia
    if (colIndex.ten_hang === -1) return { products: [], missing };

    const products = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => c === "" || c == null)) continue;
        const get = (field) => (colIndex[field] !== -1 ? row[colIndex[field]] : "");
        const ten_hang = String(get("ten_hang") ?? "").trim();
        if (!ten_hang) continue;
        products.push({
            ma_hang: String(get("ma_hang") ?? "").trim(),
            ten_hang,
            dvt: String(get("dvt") ?? "").trim(),
            gia_ban: numOrZero(get("gia_ban")),
            gia_von: numOrZero(get("gia_von"))
        });
    }
    return { products, missing };
}

let pendingImportProducts = null;
let pendingImportFileName = "";

$("#importFileBtn").addEventListener("click", () => $("#importFileInput").click());
$("#importFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: "array" });
        const { products, missing } = parseWorkbookToProducts(workbook);
        if (!products.length) {
            showToast(missing.includes("ten_hang")
                ? "Không đọc được cột Tên hàng trong file — kiểm tra lại tiêu đề cột."
                : "Không tìm thấy dòng sản phẩm hợp lệ nào trong file.");
            return;
        }
        pendingImportProducts = products;
        pendingImportFileName = file.name;
        showImportSummary();
    } catch (err) {
        showToast("Không đọc được file: " + (err.message || err));
    }
});

function showImportSummary() {
    const panel = $("#importSummary");
    const text = $("#importSummaryText");
    const n = pendingImportProducts.length;
    text.innerHTML = `Đã đọc <b>${n}</b> sản phẩm từ file "${escapeHtml(pendingImportFileName)}". Chọn cách nạp vào danh mục:`;
    panel.style.display = "flex";
}
function hideImportSummary() {
    $("#importSummary").style.display = "none";
    pendingImportProducts = null;
    pendingImportFileName = "";
}
$("#importAppendBtn").addEventListener("click", () => {
    if (!pendingImportProducts) return;
    const n = pendingImportProducts.length;
    ProductCatalog.addMany(pendingImportProducts);
    hideImportSummary();
    showToast(`Đã thêm ${n} sản phẩm vào danh mục.`);
});
$("#importReplaceBtn").addEventListener("click", () => {
    if (!pendingImportProducts) return;
    const n = pendingImportProducts.length;
    if (!confirm(`Thay thế toàn bộ danh mục hiện tại (${productCatalog.length} sản phẩm) bằng ${n} sản phẩm từ file? Dữ liệu cũ sẽ mất.`)) return;
    ProductCatalog.replaceAll(pendingImportProducts);
    hideImportSummary();
    showToast(`Đã thay thế danh mục bằng ${n} sản phẩm.`);
});
$("#importCancelBtn").addEventListener("click", hideImportSummary);

fetchProductCatalog();

renderAll();