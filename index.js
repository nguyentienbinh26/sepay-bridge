const express = require("express");

const app = express();
app.use(express.json());

const FIREBASE_BASE = "https://tuannghean-default-rtdb.firebaseio.com/bbhouse_data";

// Endpoint kiểm tra hoạt động
app.get("/webhook", (req, res) => {
  res.status(200).send("Sepay Bridge Server is RUNNING OK!");
});

app.post("/webhook", (req, res) => {
  // 1. Phản hồi SePAY ngay lập tức để tránh timeout 15 giây
  res.status(200).json({ success: true, message: "Received by bridge" });

  // 2. Chạy ngầm cập nhật Firebase qua Fetch API tích hợp
  (async () => {
    try {
      console.log("==> PAYLOAD SEPAY:", JSON.stringify(req.body));
      const content = (req.body.content || req.body.description || req.body.code || "").toString().trim();
      console.log("==> NỘI DUNG CK:", content);

      if (!content) return;

      // Đọc dữ liệu từ Firebase
      const resData = await fetch(`${FIREBASE_BASE}.json`);
      const appData = await resData.json();

      if (!appData || !Array.isArray(appData.rooms)) {
        console.log("==> Không tìm thấy danh sách phòng trong Firebase");
        return;
      }

      const cleanContent = content.toUpperCase().replace(/[\s\-_]/g, "");
      let matchedRoom = null;

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

      if (matchedRoom) {
        matchedRoom.status = "paid";

        // Cập nhật lại danh sách phòng
        await fetch(`${FIREBASE_BASE}/rooms.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appData.rooms)
        });

        // Cập nhật bản ghi lịch sử tháng
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
      } else {
        console.log("==> Không tìm thấy phòng khớp với nội dung CK");
      }
    } catch (err) {
      console.error("==> Lỗi cập nhật Firebase:", err.message);
    }
  })();
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server chạy tại port ${PORT}`);
});
