# Ward Notes (เวอร์ชัน PWA ติดตั้งเป็นแอปได้)

หน้าเว็บสถิตที่คุยกับ **Google Sheets โดยตรง** ด้วยการลงชื่อเข้าใช้ Google ของคุณเอง ไม่มี Apps Script คั่นกลาง
จึงติดตั้งเป็นแอปเต็มจอได้ และไม่มีแถบเตือนของ Apps Script

- โฮสต์เก็บแค่โค้ด **ไม่มีข้อมูลคนไข้** ข้อมูลไปจาก Google ถึงมือถือโดยตรง
- รายการ rotation เก็บใน `localStorage` ของเครื่อง (ไม่ใช่ใน ScriptProperties) เครื่องใหม่ต้องกด "ผูก sheet ที่มีอยู่" วางลิงก์อีกครั้ง
- โครง sheet เหมือนเดิม: แท็บ `Main`, `Staffs`, `Wards`
- เวอร์ชัน Apps Script (โฟลเดอร์ราก) ยังอยู่ ใช้เป็นตัวสำรองได้

## ติดตั้งครั้งแรก

### 1. สร้าง OAuth Client ID (Google Cloud Console)

1. เปิด https://console.cloud.google.com → สร้างโปรเจกต์ใหม่ เช่น "Ward Notes"
2. **APIs & Services → Library** → ค้นหา **Google Sheets API** → Enable
3. **OAuth consent screen** (หรือ Google Auth Platform) → User type **External** → ใส่ชื่อแอปและอีเมล
   - **Scopes:** เพิ่ม `https://www.googleapis.com/auth/spreadsheets`
   - **Test users:** เพิ่มอีเมลของคุณ (สถานะแอปคงเป็น **Testing** ไม่ต้องส่งตรวจสอบ)
4. **Credentials → Create credentials → OAuth client ID** → Application type **Web application**
   - **Authorized JavaScript origins:** `https://<ชื่อผู้ใช้ GitHub>.github.io` (ไม่ต้องมี path ท้าย)
5. คัดลอก **Client ID** ไปใส่ใน [`config.js`](config.js) ตรง `clientId` (Client ID ไม่ใช่ความลับ)

ตอนลงชื่อเข้าใช้ครั้งแรก Google จะขึ้นว่า "แอปนี้ยังไม่ได้รับการยืนยัน" ซึ่งปกติสำหรับแอปส่วนตัวที่เป็นโหมด Testing เลือก **ขั้นสูง → ไปที่ … (ไม่ปลอดภัย)** ได้ถ้าเป็นบัญชีที่คุณเพิ่มเป็น Test user เอง

### 2. เผยแพร่ด้วย GitHub Pages

1. push repo ขึ้น GitHub (ฟรีต้องเป็น public: ในโฟลเดอร์ `docs/` ไม่มีข้อมูลคนไข้ แต่ `Code.gs` ที่ราก repo มี ID ของ sheet ถ้าไม่อยากเปิดเผย ให้ลบออกจาก repo ที่ push หรือแยก repo)
2. GitHub → Settings → **Pages** → Source: **Deploy from a branch** → Branch `main` / โฟลเดอร์ **`/docs`**
3. รอสักครู่ แล้วเปิด `https://<ชื่อผู้ใช้>.github.io/<ชื่อ repo>/` บนมือถือ

### 3. ใช้งาน

1. กด **ลงชื่อเข้าใช้ Google** (จะถามเมื่อเริ่มใช้และเมื่อ token หมดอายุราว 1 ชม. แตะปุ่มรีเฟรชเพื่อต่อใหม่)
2. หน้าแรกจะพาไปหน้า rotation ให้ **ผูก sheet ที่มีอยู่** (วางลิงก์) หรือ **เริ่ม rotation ใหม่**
3. Chrome → เมนู ⋮ → **ติดตั้งแอป** (ถ้ามีเมนูนี้) หรือ **เพิ่มลงในหน้าจอหลัก**

## ทดลองโดยไม่ล็อกอิน (ข้อมูลสมมติ)

เปิด `index.html?mock=1` ผ่านเว็บเซิร์ฟเวอร์ในเครื่อง เช่น

```bash
python -m http.server 8765 --directory docs
```

แล้วเปิด http://localhost:8765/index.html?mock=1 ใช้ Google Sheets จำลองในหน่วยความจำ ไม่แตะข้อมูลจริง

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าจอทั้งหมด (สร้างจาก `index.html` ของเวอร์ชัน Apps Script แล้วเปลี่ยนส่วนเรียกเซิร์ฟเวอร์) |
| `api.js` | ฟังก์ชัน "เซิร์ฟเวอร์" ที่เรียก Sheets API (ชื่อ/ผลลัพธ์เหมือน `Code.gs`, `rotations.gs`, `wards.gs`) |
| `auth.js` | ลงชื่อเข้าใช้ Google (Identity Services) ขอสิทธิ์ `spreadsheets` อย่างเดียว |
| `core.js` | ฟังก์ชันล้วนๆ (วันที่/POD, หัวคอลัมน์, ward, rotation) มีเทสต์ |
| `mock.js` | Sheets จำลองสำหรับเทสต์และโหมด `?mock=1` |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | ติดตั้งเป็นแอป + เก็บตัวหน้าจอไว้ใช้ตอนออฟไลน์ |
| `config.js` | Client ID |

## ข้อจำกัดที่รู้

- ไม่มีตัวล็อกกันเขียนชนกัน (Apps Script มี `LockService`) ยังมีการเช็ก HN + ชื่อของแถวก่อนเขียน แต่ถ้าสองเครื่องแก้คนไข้คนเดียวกันพร้อมกันพอดี อาจเขียนทับกันได้
- โหมด Testing ของ Google อาจให้ยินยอมสิทธิ์ใหม่เป็นระยะ
- การต่อ token อัตโนมัติอาจเด้งหน้าต่างขึ้นมาบนมือถือบางรุ่น ถ้าเป็นแบบนั้นแตะปุ่มรีเฟรช
- เทสต์ทั้งหมดใช้ Sheets จำลอง ยังไม่เคยรันกับ Google จริง
