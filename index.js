const express = require("express");
const admin = require("firebase-admin");

// Khởi tạo kết nối Firebase Database
if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: "https://tuannghean-default-rtdb.firebaseio.com"
  });
}

const app = express();
app.use(express.json());

// Endpoint GET kiểm tra server hoạt động và chống ngủ đông
app.get("/webhook", (req, res) => {
  res.status(200).send("Sepay Bridge Server is RUNNING OK!");
});

app.post("/webhook", async (req, res) => {
  try {
    console.log("==> PAYLOAD NHẬN TỪ SEPAY:", JSON.stringify(req.body));
    
    // Lấy nội dung chuyển khoản từ SePAY
    const content = (req.body.content || req.body.description || req.body.code || "").toString().trim();
    console.log("==> NỘI DUNG CHUYỂN KHOẢN:", content);

    if (!content) {
      return res.status(200).json({ success: false, message: "Không tìm thấy nội dung CK" });
    }

    const db = admin.database();
    const snapshot = await db.ref("bbhouse_data").once("value");
    const appData = snapshot.val();

    if (!appData || !Array.isArray(appData.rooms)) {
      console.log("==> Không tìm thấy danh sách phòng trong Firebase bbhouse_data");
      return res.status(200).json({ success: false, message: "Dữ liệu phòng trống" });
    }

    // Chuẩn hóa chuỗi tìm kiếm (xóa dấu cách, dấu gạch, viết hoa toàn bộ)
    const cleanContent = content.toUpperCase().replace(/[\s\-_]/g, "");

    let matchedRoom = null;

    // Quét đối chiếu với từng phòng trong cơ sở dữ liệu
    for (const r of appData.rooms) {
      const rId = (r.id || "").toString().toUpperCase().replace(/[\s\-_]/g, "");
      const rName = (r.name || "").toString().toUpperCase().replace(/[\s\-_]/g, "");

      // Khớp nếu nội dung chứa BB36 + ID, BB36 + Tên phòng, hoặc trực tiếp ID
      if (
        (rId && cleanContent.includes("BB36" + rId)) ||
        (rName && cleanContent.includes("BB36" + rName)) ||
        (rId && cleanContent.includes(rId))
      ) {
        matchedRoom = r;
        break;
      }
    }

    if (matchedRoom) {
      console.log(`==> TÌM THẤY PHÒNG KHỚP: ${matchedRoom.name} (ID: ${matchedRoom.id})`);
      
      // Đổi trạng thái sang đã thanh toán
      matchedRoom.status = "paid";

      // Cập nhật lại vào Firebase
      await db.ref("bbhouse_data/rooms").set(appData.rooms);

      // Đồng bộ vào bản ghi lịch sử tháng hiện tại
      const m = appData.billing_month || 9;
      const y = appData.billing_year || 2026;
      const curKey = `${y}_${m}`;
      if (appData.monthly_records && appData.monthly_records[curKey]) {
        await db.ref(`bbhouse_data/monthly_records/${curKey}`).set(appData.rooms);
      }

      console.log(`==> ✓ ĐÃ GẠCH NỢ THÀNH CÔNG CHO: ${matchedRoom.name}`);
      return res.status(200).json({ success: true, message: `Đã gạch nợ ${matchedRoom.name}` });
    } else {
      console.log("==> Không khớp với bất kỳ phòng nào trong danh sách.");
      return res.status(200).json({ success: false, message: "Không khớp phòng nào" });
    }
  } catch (error) {
    console.error("==> LỖI XỬ LÝ:", error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server chạy tại port ${PORT}`);
});
