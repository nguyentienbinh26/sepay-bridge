const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const FIREBASE_URL = "https://tuannghean-default-rtdb.firebaseio.com/bbhouse_data.json";

// Endpoint kiểm tra
app.get("/webhook", (req, res) => {
  res.status(200).send("Sepay Bridge Server is RUNNING OK!");
});

app.post("/webhook", (req, res) => {
  // 1. Phản hồi SePAY ngay lập tức
  res.status(200).json({ success: true, message: "Received by bridge" });

  // 2. Chạy ngầm gạch nợ qua REST API
  (async () => {
    try {
      console.log("==> PAYLOAD SEPAY:", JSON.stringify(req.body));
      const content = (req.body.content || req.body.description || req.body.code || "").toString().trim();
      console.log("==> NỘI DUNG CK:", content);

      if (!content) return;

      // Lấy dữ liệu từ Firebase
      const response = await axios.get(FIREBASE_URL);
      const appData = response.data;

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
        await axios.put("https://tuannghean-default-rtdb.firebaseio.com/bbhouse_data/rooms.json", appData.rooms);

        // Cập nhật bản ghi lịch sử tháng
        const m = appData.billing_month || 9;
        const y = appData.billing_year || 2026;
        const curKey = `${y}_${m}`;
        if (appData.monthly_records && appData.monthly_records[curKey]) {
          await axios.put(`https://tuannghean-default-rtdb.firebaseio.com/bbhouse_data/monthly_records/${curKey}.json`, appData.rooms);
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
