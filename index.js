const express = require("express");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: "https://tuannghean-default-rtdb.firebaseio.com"
  });
}

const app = express();
app.use(express.json());

// Endpoint kiểm tra nhanh
app.get("/webhook", (req, res) => {
  res.status(200).send("Sepay Bridge Server is RUNNING OK!");
});

app.post("/webhook", (req, res) => {
  // 1. TRẢ LỜI SEPAY NGAY LẬP TỨC ĐỂ KHÔNG BỊ TIMEOUT 15 GIÂY
  res.status(200).json({ success: true, message: "Received by bridge" });

  // 2. XỬ LÝ GẠCH NỢ CHẠY NGẦM PHÍA SAU
  (async () => {
    try {
      console.log("==> PAYLOAD SEPAY:", JSON.stringify(req.body));
      const content = (req.body.content || req.body.description || req.body.code || "").toString().trim();
      console.log("==> NỘI DUNG CK:", content);

      if (!content) return;

      const db = admin.database();
      const snapshot = await db.ref("bbhouse_data").once("value");
      const appData = snapshot.val();

      if (!appData || !Array.isArray(appData.rooms)) return;

      const cleanContent = content.toUpperCase().replace(/[\s\-_]/g, "");
      let matchedRoom = null;

      for (const r of appData.rooms) {
        const rId = (r.id || "").toString().toUpperCase().replace(/[\s\-_]/g, "");
        const rName = (r.name || "").toString().toUpperCase().replace(/[\s\-_]/g, "");

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
        matchedRoom.status = "paid";
        await db.ref("bbhouse_data/rooms").set(appData.rooms);

        const m = appData.billing_month || 9;
        const y = appData.billing_year || 2026;
        const curKey = `${y}_${m}`;
        if (appData.monthly_records && appData.monthly_records[curKey]) {
          await db.ref(`bbhouse_data/monthly_records/${curKey}`).set(appData.rooms);
        }
        console.log(`==> ✓ ĐÃ GẠCH NỢ THÀNH CÔNG CHO: ${matchedRoom.name}`);
      }
    } catch (err) {
      console.error("==> Lỗi chạy ngầm:", err.message);
    }
  })();
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server chạy tại port ${PORT}`);
});
