# BRT SOP Center

ระบบจัดทำ ตรวจทาน อนุมัติ และเผยแพร่คู่มือการปฏิบัติงาน (SOP / Work Instruction) ของ Blue Ribbon Trading
— Next.js (App Router) + Firebase Authentication + Cloud Firestore + Tiptap + draw.io · Deploy บน Firebase App Hosting
ทุกส่วนอยู่ใน Firebase project เดียว (`brt-sop-center`) — ไม่มีฐานข้อมูลหรือ Secret ภายนอก

## ฟังก์ชันที่มี

| หัวข้อ | รายละเอียด |
|---|---|
| Login | Firebase Authentication (Email/Password) · ตรวจ ID Token ที่เซิร์ฟเวอร์ทุก API · ผู้ดูแลคนแรกจาก `BOOTSTRAP_ADMIN_EMAIL` (ต้องยืนยันอีเมล) |
| แดชบอร์ด | จำนวน SOP ที่เข้าถึงได้ / เผยแพร่ / ร่าง / รอพิจารณา · เส้นทางเอกสาร · อัปเดตล่าสุด · งานที่รอคุณ |
| คลัง SOP | ค้นหารหัส ชื่อ และข้อความในเนื้อหา (ภาษาไทยแบบ substring) · กรองหมวดหมู่ · แสดงเฉพาะที่มีสิทธิ์อ่าน |
| Editor | Tiptap (หัวข้อ ตัวหนา/เอียง/ขีดเส้นใต้ รายการ กล่องหมายเหตุ ลิงก์ ตาราง) · Ctrl+S บันทึก · กันบันทึกทับกัน (row_version) |
| Flowchart | draw.io Embed (`embed.diagrams.net`) ผ่าน postMessage ตรวจ `origin` + `source` · เก็บ XML + ภาพ PNG ผูกกับเวอร์ชัน |
| วิดีโอ YouTube | ปุ่ม “แทรกวิดีโอ” → คลิป (ลิงก์ watch / youtu.be / shorts, ใส่เวลาเริ่ม `t=` ได้) · หัวข้อ · รายละเอียด (ยาวได้ 5,000 ตัวอักษร) · เล่นในหน้า SOP ผ่าน `youtube-nocookie.com` · ค้นหาเจอจากหัวข้อ/รายละเอียด · ตอนพิมพ์แสดงภาพตัวอย่าง + ลิงก์ |
| เวอร์ชัน | `revision_no` (r1, r2…) + `version_label` (1.0, 1.1, 2.0) · ฉบับเผยแพร่กับฉบับร่างอยู่คู่กันได้ · ฉบับเก่าเป็น `SUPERSEDED` และแก้ไขไม่ได้ |
| อนุมัติ | DRAFT → IN_REVIEW → IN_APPROVAL → PUBLISHED · Reject ต้องมีเหตุผลและกลับเป็นร่าง · เก็บ `attempt_no` ทุกครั้ง · Publish ใน Firestore transaction เดียว |
| สิทธิ์ | ADMIN / AUTHOR / REVIEWER / APPROVER / VIEWER ตรวจที่เซิร์ฟเวอร์ · ผู้ส่งตรวจทาน/อนุมัติงานตัวเองไม่ได้ · ผู้ตรวจกับผู้อนุมัติต้องเป็นคนละคน |
| แชร์ลิงก์ | เจ้าของ SOP / ผู้ดูแล สร้างลิงก์ให้คนนอกดู **ฉบับเผยแพร่ล่าสุด** ได้โดยไม่ต้องล็อกอิน · บังคับวันหมดอายุ (1 ชม. – 90 วัน) · ยกเลิกได้ทันที · นับจำนวนครั้งที่เปิด · เก็บเฉพาะ hash ของ token |
| PDF | หน้าพิมพ์ A4 พร้อมหัวกระดาษควบคุมเอกสาร (รหัส ชื่อ เวอร์ชัน วันที่มีผล) เลขหน้า ช่องลงนาม และลายน้ำ "ฉบับร่าง" → เลือก “บันทึกเป็น PDF” |
| Audit | บันทึกทุกการเปลี่ยนสถานะ แสดงในหน้า SOP สำหรับเจ้าของและผู้ดูแล |
| หมวดหมู่ / ผู้ใช้ | ผู้ดูแลเพิ่มหมวด · เชิญผู้ใช้ด้วยอีเมล (สร้างบัญชี Firebase + ส่งอีเมลตั้งรหัสผ่าน) · เปลี่ยนบทบาท / ระงับบัญชี |
| Responsive | เดสก์ท็อป (แถบเมนูซ้าย) · แท็บเล็ต (แถบไอคอน) · มือถือ (แถบล่าง + ปุ่มสร้าง) |

## รันในเครื่อง (Firebase Emulator — ไม่แตะข้อมูลจริง)

ต้องมี **Node.js 20+** และ **Java 21+** (สำหรับ Firestore Emulator — ดาวน์โหลด Temurin ได้ที่ https://adoptium.net)

```bash
npm install
npm run emulators        # เทอร์มินัลที่ 1: Firestore + Auth Emulator (ค้างไว้)
npm run dev              # เทอร์มินัลที่ 2
```

> Windows PowerShell ที่ปิดการรันสคริปต์: ใช้ `npm.cmd run emulators` / `npm.cmd run dev`

เปิด http://localhost:3000 (ถ้าพอร์ต 3000 ใช้ไม่ได้: `npm run dev -- --port 4310`)

`.env.local` ตั้ง `NEXT_PUBLIC_AUTH_MODE=dev` + `FIRESTORE_EMULATOR_HOST` ไว้ → ครั้งแรกระบบใส่ **ข้อมูลตัวอย่าง** ให้ และหน้า Login จะให้เลือก **ผู้ใช้ทดลอง**:

| อีเมล | บทบาท |
|---|---|
| admin@brt.local | ADMIN |
| author@brt.local | AUTHOR (เจ้าของ SOP ตัวอย่าง) |
| reviewer@brt.local | REVIEWER |
| approver@brt.local | APPROVER |
| viewer@brt.local | VIEWER |

ข้อมูลตัวอย่าง: SOP-SAL-001 (1.0 → 1.1), SOP-PUR-001, SOP-WH-001 (เผยแพร่), SOP-WH-002 (ร่าง), SOP-IMP-001 (รอตรวจ ครั้งที่ 2)
ข้อมูลใน emulator เก็บไว้ที่ `.data/emulators` เมื่อปิด emulator · ล้างข้อมูล (ปิด emulator ก่อน): `npm run emulators:reset`

> โหมดทดลองปิดตัวเองอัตโนมัติใน production build (`NODE_ENV=production`) — แม้ตั้ง `NEXT_PUBLIC_AUTH_MODE=dev` ไว้ก็ใช้ไม่ได้

คำสั่งตรวจสอบ: `npm run typecheck` · `npm run build`

### ทดสอบ Firebase Login จริงในเครื่อง

ใช้ค่าในหัวข้อ “Auth Emulator” ของ `.env.example` ใน `.env.local` แล้ว `npm run dev` (emulator ต้องรันอยู่)
อีเมลยืนยัน / ตั้งรหัสผ่านไม่ถูกส่งจริง — ดูลิงก์ได้จาก `http://127.0.0.1:9099/emulator/v1/projects/demo-brt-sop/oobCodes`

## โครงสร้างโปรเจกต์

```text
apphosting.yaml            Firebase App Hosting (runConfig + env)
firebase.json              Firestore rules/indexes, Auth provider, emulator ports
firestore.rules            ปิดการเข้าถึงจากเบราว์เซอร์ทั้งหมด (ใช้ผ่าน API เท่านั้น)
scripts/emulators.mjs      npm run emulators
src/app/(app)/             หน้าหลังล็อกอิน: แดชบอร์ด, sops, sops/new, sops/[id], approvals, categories, users
src/app/login/             หน้าเข้าสู่ระบบ
src/app/print/sops/[id]/   หน้าพิมพ์ / PDF
src/app/share/[token]/     หน้าแชร์สาธารณะ
src/app/api/               Route Handlers (Node.js runtime)
src/components/            AppShell, AuthProvider, Dialogs, ShareDialog, editor/ (Tiptap, draw.io, YouTube)
src/lib/server/            db (Firestore), auth (Firebase Admin), access (สิทธิ์), sops (workflow), admin, shares
src/lib/shared/            types, labels, content (ตรวจ/แปลงเนื้อหา Tiptap)
```

### ข้อมูลใน Firestore

| Collection | เก็บอะไร |
|---|---|
| `users`, `userEmails` | ผู้ใช้ + ดัชนีกันอีเมลซ้ำ |
| `categories`, `categorySlugs` | หมวดหมู่ + ดัชนีกันรหัสซ้ำ |
| `sops`, `sopCodes` | ตัว SOP (สรุปฉบับเผยแพร่/ฉบับร่าง) + ดัชนีกันรหัส SOP ซ้ำ |
| `sops/{id}/versions`, `…/diagrams`, `sops/{id}/audit` | เนื้อหาแต่ละเวอร์ชัน · Flowchart · ประวัติกิจกรรม |
| `approvalSteps`, `shareLinks`, `auditEvents` | ขั้นตรวจ/อนุมัติ · ลิงก์แชร์ · กิจกรรมด้านผู้ใช้/หมวด |

ขนาดสูงสุด (Firestore จำกัด 1 MiB ต่อเอกสาร): เนื้อหา SOP 600 KB · Flowchart XML 300 KB + ภาพตัวอย่าง 650 KB

## API

| Method | Route | งาน |
|---|---|---|
| GET | `/api/me` | ผู้ใช้ปัจจุบัน + จำนวนงานรอพิจารณา |
| GET | `/api/dashboard` | สรุปแดชบอร์ด |
| GET, POST | `/api/users` · PATCH `/api/users/:id` | รายชื่อ / เชิญ / แก้บทบาท-สถานะ (ADMIN) |
| GET, POST | `/api/categories` | อ่าน / เพิ่มหมวด (ADMIN) |
| GET, POST | `/api/sops?q=&category=` | ค้นหา / สร้าง SOP |
| GET | `/api/sops/:id?version=` | SOP + เวอร์ชันที่มีสิทธิ์เห็น |
| POST | `/api/sops/:id/revisions` | สร้างฉบับร่างจากฉบับเผยแพร่ |
| PATCH | `/api/sops/:id/versions/:versionId` | บันทึกร่าง |
| PUT | `/api/sops/:id/versions/:versionId/diagrams/:blockId` | บันทึก draw.io XML + PNG |
| POST | `/api/sops/:id/submit` | ส่งตรวจ (เลือก Reviewer + Approver) |
| GET, POST | `/api/sops/:id/shares` · DELETE `/api/sops/:id/shares/:shareId` | รายการ / สร้าง / ยกเลิกลิงก์แชร์ (เจ้าของ, ADMIN) |
| GET | `/api/share/:token` | **สาธารณะ** — ฉบับเผยแพร่ของลิงก์ที่ยังไม่หมดอายุ (หน้าเว็บ `/share/:token`) |
| GET | `/api/approvals` | งานรอพิจารณา |
| POST | `/api/approvals/:stepId/decision` | `APPROVE` / `REJECT` (+ เหตุผล) |

---

## Deploy ขึ้น Firebase (project `brt-sop-center`)

ค่าที่ตั้งไว้แล้วในโค้ด: Web SDK config + `BOOTSTRAP_ADMIN_EMAIL` (`apphosting.yaml`), Email/Password (`firebase.json`)

```bash
# 1) สร้าง Firestore (ครั้งเดียว) และ deploy rules + Auth provider
firebase firestore:databases:create "(default)" --location asia-southeast1 --project brt-sop-center
firebase deploy --only firestore,auth --project brt-sop-center

# 2) สร้าง App Hosting backend (เชื่อม GitHub repo, branch main, root "/")
firebase apphosting:backends:create --project brt-sop-center --backend brt-sop \
  --primary-region asia-southeast1 --app 1:959139949716:web:f8363219ebbf0b47329881 --root-dir /
```

หลังจากนั้นทุกครั้งที่ push ขึ้น `main` จะ Deploy อัตโนมัติ · ดูสถานะ/URL `*.hosted.app` ที่ Firebase Console → App Hosting

**ใน Firebase Console:**
- **Authentication → Settings → User actions** → แนะนำให้ **ปิด “Enable create (sign-up)”** — มีแต่ผู้ที่ผู้ดูแลเชิญเท่านั้นที่มีบัญชี
- **Authentication → Templates** → ตั้งภาษา/ชื่อผู้ส่งของอีเมล “ยืนยันอีเมล” และ “รีเซ็ตรหัสผ่าน”
- **Authentication → Users → Add user** → สร้างบัญชีผู้ดูแลคนแรก (`sl@brt.co.th`) · ครั้งแรกที่ล็อกอิน กด “ส่งอีเมลยืนยันตัวตน” →
  เปิดลิงก์ในอีเมล → กด “ตรวจสอบอีกครั้ง” แล้วจะได้สิทธิ์ ADMIN พร้อมหมวดหมู่เริ่มต้น 4 หมวด

**สิทธิ์ของ backend:** ถ้า log ขึ้น `PERMISSION_DENIED` ตอนอ่าน Firestore หรือเชิญผู้ใช้ไม่ได้ ให้เพิ่ม role **Cloud Datastore User**
และ **Firebase Authentication Admin** ให้ service account ของ backend (`firebase-app-hosting-compute@brt-sop-center.iam.gserviceaccount.com`) ใน IAM

**สำรองข้อมูล:** เปิด Point-in-time recovery / scheduled backups ของ Firestore ได้ที่ Firebase Console → Firestore → Disaster recovery

### ทดสอบก่อนเปิดใช้

ล็อกอิน Admin → เชิญผู้ใช้แต่ละบทบาท → Author สร้าง SOP + Flowchart → ส่งตรวจ → Reviewer ผ่าน → Approver อนุมัติ →
Viewer เห็นเฉพาะฉบับเผยแพร่และพิมพ์ PDF ได้ (ดู Test Plan ใน [`docs/BRT_SOP_Firebase_MVP.md`](docs/BRT_SOP_Firebase_MVP.md) หัวข้อ 9)

---

## หมายเหตุด้านความปลอดภัย

- เบราว์เซอร์อ่าน/เขียน Firestore โดยตรงไม่ได้ (`firestore.rules` ปิดทั้งหมด) — ทุกอย่างผ่าน API ที่ตรวจ Firebase ID Token + Role + Ownership + Assignee ที่เซิร์ฟเวอร์
- ทุกการเปลี่ยนสถานะ (ส่งตรวจ / อนุมัติ / เผยแพร่ / สร้างฉบับแก้ไข) ทำใน Firestore transaction — คำขอพร้อมกันจะมีผลได้รายการเดียว
- ผู้ใช้ผูกกับบัญชี Firebase ด้วย uid · ถ้าผูกด้วยอีเมลต้องยืนยันอีเมลแล้วเท่านั้น — บัญชีที่มีคนสมัครด้วยอีเมลพนักงานไว้ก่อนแต่ยังไม่ยืนยัน จะไม่ถูกผูกตอนเชิญ (กันการสวมรอย)
- ผู้ไม่มีสิทธิ์อ่าน Draft จะได้ 404 (ไม่รู้ว่ามีเอกสารอยู่) และค้นหาข้อความในร่างไม่เจอ
- เนื้อหา Tiptap ถูกตรวจชนิด node/mark ที่เซิร์ฟเวอร์ · ลิงก์อนุญาตเฉพาะ `http(s)` / `mailto` · ภาพ Flowchart รับเฉพาะ PNG
- **ลิงก์แชร์:** token สุ่ม 256 บิต เก็บเฉพาะ SHA-256 (แสดงลิงก์ได้ครั้งเดียวตอนสร้าง) · เห็นเฉพาะฉบับเผยแพร่ ไม่เห็นร่าง/อีเมล/ไฟล์ draw.io ·
  ลิงก์หมดอายุ ถูกยกเลิก หรือผู้สร้างถูกระงับบัญชี → ใช้ไม่ได้ทันที (ตอบ 404 เหมือนกันทุกกรณี) · หน้าแชร์ส่ง `Referrer-Policy: no-referrer` + `noindex` ·
  ถ้ามีฉบับใหม่ได้รับอนุมัติ ลิงก์เดิมจะแสดงฉบับใหม่ทันที
- Content-Security-Policy จำกัด iframe ไว้ที่ `embed.diagrams.net` และ `www.youtube-nocookie.com` — ถ้าเปิดใช้ reCAPTCHA / App Check ต้องเพิ่มโดเมนใน `next.config.ts`
- วิดีโอเก็บเฉพาะรหัสคลิป YouTube (ตรวจรูปแบบที่เซิร์ฟเวอร์) ไม่เก็บ URL หรือ HTML ที่ผู้ใช้วางมาโดยตรง — คลิปที่ตั้งเป็น Private บน YouTube จะเล่นไม่ได้ ควรใช้ Public หรือ Unlisted
- **draw.io:** editor โหลดจากโดเมนสาธารณะของ diagrams.net (ประมวลผลในเบราว์เซอร์) — ทบทวนนโยบายข้อมูลบริษัทก่อนใช้กับเอกสารอ่อนไหว หรือ self-host draw.io แล้วแก้ `DRAWIO_ORIGIN`

## งานถัดไป (Phase C)

- เก็บไฟล์แนบ / รูปภาพใน Cloud Storage for Firebase
- สร้าง PDF ฝั่งเซิร์ฟเวอร์และเก็บสำเนาถาวร (ปัจจุบันใช้ Browser Print)
- เปรียบเทียบความต่างระหว่างเวอร์ชัน (Diff) · แจ้งเตือนผู้ตรวจ/ผู้อนุมัติทางอีเมลหรือ n8n
- Pagination / ระบบค้นหาเต็มรูปแบบเมื่อมี SOP หลายพันฉบับ / ทดสอบ E2E อัตโนมัติ
