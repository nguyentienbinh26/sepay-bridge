const express = require("express");

const app = express();
app.use(express.json());

const FIREBASE_BASE = "https://tuannghean-default-rtdb.firebaseio.com/bbhouse_data";

// Endpoint kiểm tra máy chủ hoạt động
app.get("/webhook", (req, res) => {
  res.status(200).send("Sepay Bridge Server is RUNNING OK!");
});

app.post("/webhook", (req, res) => {
  // 1. Phản hồi SePAY ngay lập tức để không bị timeout 15 giây
  res.status(200).json({ success: true, message: "Received by bridge" });

  // 2. Chạy ngầm xử lý đối soát và gạch nợ
  (async () => {
    try {
      console.log("==> PAYLOAD SEPAY:", JSON.stringify(req.body));
      const content = (req.body.content || req.body.description || req.body.code || "").toString().trim();
      const transferAmount = Number(req.body.transferAmount || req.body.amount || 0);

      console.log(`==> NỘI DUNG CK: "${content}" | SỐ TIỀN: ${transferAmount} đ`);

      if (!content) return;

      // Đọc toàn bộ dữ liệu hiện tại từ Firebase
      const resData = await fetch(`${FIREBASE_BASE}.json`);
      const appData = await resData.json();

      if (!appData || !Array.isArray(appData.rooms)) {
        console.log("==> ❌ Không tìm thấy danh sách phòng trong Firebase");
        return;
      }

      const cleanContent = content.toUpperCase().replace(/[\s\-_]/g, "");
      let matchedRoom = null;

      // Tìm phòng khớp mã hoặc tên trong nội dung CK
      for (const r of appData.rooms) {
        const rId = (r.id || "").toString().toUpperCase().replace(/[\s\-_]/g, "");
        const rName = (r.name || "").toString().toUpperCase().replace(/[\s\-_]/g, "");

        if (
          (rId && cleanContent.includes(rId)) ||
          (rName && cleanContent.includes(rName))
        ) {
          matchedRoom = r;
          break;
        }
      }

      if (!matchedRoom) {
        console.log("==> ⚠️ Không tìm thấy phòng khớp với nội dung CK");
        return;
      }

      // Lấy số tiền phòng cần thanh toán (hỗ trợ các trường: total, total_bill, price)
      const expectedAmount = Number(matchedRoom.total || matchedRoom.total_bill || matchedRoom.price || 0);
      console.log(`==> Phòng: ${matchedRoom.name} | Cần thu: ${expectedAmount} đ | Đã chuyển: ${transferAmount} đ`);

      // Kiểm tra điều kiện số tiền: nếu phòng có số tiền cần thu mà khách chuyển thiếu thì không gạch nợ
      if (expectedAmount > 0 && transferAmount < expectedAmount) {
        console.log(`==> ⚠️ Khách chuyển thiếu ${expectedAmount - transferAmount} đ. KHÔNG gạch nợ.`);
        return;
      }

      // Đủ tiền -> Chuyển trạng thái sang "paid"
      matchedRoom.status = "paid";

      // Cập nhật lại danh sách phòng chính
      await fetch(`${FIREBASE_BASE}/rooms.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appData.rooms)
      });

      // Cập nhật lịch sử tháng hiện tại
      const m = appData.billing_month || 9;
      const y = appData.billing_year || 2026;
      const curKey = `${y}_${m}`;
      if (appData.monthly_records && appData.monthly_records[curKey]) {
        await fetch(`${FIREBASE_BASE}/monthly_records/${curKey}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appData.rooms)
        });
      }

      console.log(`==> ✓ ĐÃ GẠCH NỢ THÀNH CÔNG CHO: ${matchedRoom.name}`);
    } catch (err) {
      console.error("==> ❌ Lỗi xử lý gạch nợ:", err.message);
    }
  })();
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server chạy tại port ${PORT}`);
});
