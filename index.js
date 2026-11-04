const express = require("express");
const admin = require("firebase-admin");

admin.initializeApp({
  databaseURL: "https://tuannghean-default-rtdb.firebaseio.com"
});

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  try {
    const { content } = req.body;
    console.log("Dữ liệu nhận từ SePAY:", content);
    if (!content) return res.status(200).send("No content");

    // Bắt mã phòng sau cụm BB36 (Ví dụ: SEVQR BB36 201)
    const match = content.toUpperCase().match(/BB36\s*([A-Z0-9]+)/);
    if (match && match[1]) {
      const roomId = match[1].toLowerCase();
      const db = admin.database();
      const snapshot = await db.ref("bbhouse_data").once("value");
      const appData = snapshot.val();

      if (appData && appData.rooms) {
        let updated = false;
        appData.rooms = appData.rooms.map(room => {
          if (room.id && room.id.toLowerCase() === roomId) {
            room.status = "paid";
            updated = true;
          }
          return room;
        });

        if (updated) {
          await db.ref("bbhouse_data/rooms").set(appData.rooms);
          const currentMonthKey = `${appData.billing_year || 2026}_${appData.billing_month || 9}`;
          if (appData.monthly_records && appData.monthly_records[currentMonthKey]) {
            await db.ref(`bbhouse_data/monthly_records/${currentMonthKey}`).set(appData.rooms);
          }
          console.log(`Đã gạch nợ thành công cho phòng: ${roomId}`);
          return res.json({ success: true, message: `Room ${roomId} marked as paid` });
        }
      }
    }
    return res.json({ success: false, message: "Room not found or ignored" });
  } catch (err) {
    console.error("Lỗi:", err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server chạy tại port ${PORT}`));