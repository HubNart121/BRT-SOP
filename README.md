# BRT SOP Center

ระบบจัดทำ ตรวจทาน อนุมัติ และเผยแพร่คู่มือการปฏิบัติงาน (SOP / Work Instruction) ของ Blue Ribbon Trading
— Next.js (App Router) + Firebase Authentication + Cloud Firestore + Tiptap + draw.io · Deploy บน Firebase App Hosting
ทุกส่วนอยู่ใน Firebase project เดียว (`brt-sop-center`) — ไม่มีฐานข้อมูลหรือ Secret ภายนอก

## ฟังก์ชันที่มี

| หัวข้อ | รายละเอียด |
|---|---|
| Login | ปุ่ม “เข้าสู่ระบบด้วย Google” เท่านั้น (Firebase Authentication) · รับเฉพาะ **@gmail.com** ที่ผู้ดูแลเชิญไว้ · ไม่มีรหัสผ่าน · ตรวจ ID Token + ผู้ให้บริการ (Google) + โดเมนอีเมลที่เซิร์ฟเวอร์ทุก API · ผู้ดูแลคนแรกจาก `BOOTSTRAP_ADMIN_EMAIL` (อีเมลเดียวที่ไม่ต้องเป็น Gmail) |
| แดชบอร์ด | จำนวน SOP ที่เข้าถึงได้ / เผยแพร่ / ร่าง / รอพิจารณา · เส้นทางเอกสาร · อัปเดตล่าสุด · งานที่รอคุณ |
| คลัง SOP | ค้นหารหัส ชื่อ และข้อความในเนื้อหา (ภาษาไทยแบบ substring) · กรองหมวดหมู่ · แสดงเฉพาะที่มีสิทธิ์อ่าน |
| Editor | Tiptap (หัวข้อ ตัวหนา/เอียง/ขีดเส้นใต้ รายการ กล่องหมายเหตุ ลิงก์ ตาราง) · Ctrl+S บันทึก · กันบันทึกทับกัน (row_version) |
| Flowchart | draw.io Embed (`embed.diagrams.net`) ผ่าน postMessage ตรวจ `origin` + `source` · เก็บ XML + ภาพ PNG ผูกกับเวอร์ชัน |
| วิดีโอ YouTube | ปุ่ม “แทรกวิดีโอ” → คลิป (ลิงก์ watch / youtu.be / shorts, ใส่เวลาเริ่ม `t=` ได้) · หัวข้อ · รายละเอียด (ยาวได้ 5,000 ตัวอักษร) · เล่นในหน้า SOP ผ่าน `youtube-nocookie.com` · ค้นหาเจอจากหัวข้อ/รายละเอียด · ตอนพิมพ์แสดงภาพตัวอย่าง + ลิงก์ |
| รหัส SOP | ระบบออกให้อัตโนมัติตามหมวดที่เลือก: `SOP-<รหัสหมวด>-<ลำดับ>` เช่น `SOP-SALES-001` · ผู้ใช้กรอก/แก้ไม่ได้ · เลขเรียงต่อกันต่อหมวด ไม่ซ้ำและไม่นำกลับมาใช้ (สร้างพร้อมกันก็ไม่ชน) · ย้ายหมวดภายหลัง รหัสคงเดิม |
| เวอร์ชัน | `revision_no` (r1, r2…) + `version_label` (1.0, 1.1, 2.0) · ฉบับเผยแพร่กับฉบับร่างอยู่คู่กันได้ · ฉบับเก่าเป็น `SUPERSEDED` และแก้ไขไม่ได้ |
| อนุมัติ | DRAFT → IN_REVIEW → IN_APPROVAL → PUBLISHED · Reject ต้องมีเหตุผลและกลับเป็นร่าง · เก็บ `attempt_no` ทุกครั้ง · Publish ใน Firestore transaction เดียว |
| สิทธิ์ | ADMIN / AUTHOR / REVIEWER / APPROVER / VIEWER ตรวจที่เซิร์ฟเวอร์ · ผู้ส่งตรวจทาน/อนุมัติงานตัวเองไม่ได้ · ผู้ตรวจกับผู้อนุมัติต้องเป็นคนละคน |
| แชร์ลิงก์ | เจ้าของ SOP / ผู้ดูแล สร้างลิงก์ให้คนนอกดู **ฉบับเผยแพร่ล่าสุด** ได้โดยไม่ต้องล็อกอิน · บังคับวันหมดอายุ (1 ชม. – 90 วัน) · ยกเลิกได้ทันที · นับจำนวนครั้งที่เปิด · เก็บเฉพาะ hash ของ token |
| PDF | หน้าพิมพ์ A4 พร้อมหัวกระดาษควบคุมเอกสาร (รหัส ชื่อ เวอร์ชัน วันที่มีผล) เลขหน้า ช่องลงนาม และลายน้ำ "ฉบับร่าง" → เลือก “บันทึกเป็น PDF” |
| Audit | บันทึกทุกการเปลี่ยนสถานะ แสดงในหน้า SOP สำหรับเจ้าของและผู้ดูแล |
| หมวดหมู่ / ผู้ใช้ | ผู้ดูแลเพิ่ม / แก้ไข (ชื่อ รหัส หมวดหลัก) / ลบหมวด — ลบหมวดที่มี SOP ต้องเลือกหมวดที่จะย้าย SOP ไป (หรือ “ไม่มีหมวด”) ไม่กระทบเนื้อหาหรือเวอร์ชัน · หมวดที่มีหมวดย่อยต้องย้ายหมวดย่อยก่อน · เชิญผู้ใช้ด้วยอีเมล Gmail (ผูกบัญชีเมื่อผู้ใช้กดปุ่ม Google ครั้งแรก) · แก้ไขชื่อ / บทบาท / สถานะ (แก้อีเมลได้เฉพาะคำเชิญที่ยังไม่ถูกใช้) · ลบได้เฉพาะผู้ใช้ที่ยังไม่มีประวัติ (ไม่เป็นเจ้าของ SOP ผู้ตรวจ/ผู้อนุมัติ และไม่เคยทำรายการ) — มีประวัติให้ระงับแทน เพื่อเก็บหลักฐานการตรวจสอบ |
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

ข้อมูลตัวอย่าง: SOP-SALES-001 (1.0 → 1.1), SOP-PURCHASING-001, SOP-WAREHOUSE-001 (เผยแพร่), SOP-WAREHOUSE-002 (ร่าง), SOP-IMPORT-001 (รอตรวจ ครั้งที่ 2)
ข้อมูลใน emulator เก็บไว้ที่ `.data/emulators` เมื่อปิด emulator · ล้างข้อมูล (ปิด emulator ก่อน): `npm run emulators:reset`

> โหมดทดลองปิดตัวเองอัตโนมัติใน production build (`NODE_ENV=production`) — แม้ตั้ง `NEXT_PUBLIC_AUTH_MODE=dev` ไว้ก็ใช้ไม่ได้

คำสั่งตรวจสอบ: `npm run typecheck` · `npm run build`

### ทดสอบ Firebase Login จริงในเครื่อง

ใช้ค่าในหัวข้อ “Auth Emulator” ของ `.env.example` ใน `.env.local` แล้ว `npm run dev` (emulator ต้องรันอยู่)
กด “เข้าสู่ระบบด้วย Google” → หน้าต่างของ emulator ให้ **Add new account** แล้วกรอกอีเมลทดสอบเองได้ (ไม่ใช่บัญชี Google จริง):
`boss@brt.test` = ผู้ดูแลคนแรก (ตาม `BOOTSTRAP_ADMIN_EMAIL`) · ผู้ใช้อื่นต้องเป็น `…@gmail.com` ที่เชิญไว้แล้ว

## โครงสร้างโปรเจกต์

```text
apphosting.yaml            Firebase App Hosting (runConfig + env)
firebase.json              Firestore rules/indexes, emulator ports
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
| `sops`, `sopCodes`, `sopCodeCounters` | ตัว SOP (สรุปฉบับเผยแพร่/ฉบับร่าง) + ดัชนีกันรหัส SOP ซ้ำ + เลขล่าสุดที่ออกไปของแต่ละ `SOP-<รหัสหมวด>` |
| `sops/{id}/versions`, `…/diagrams`, `sops/{id}/audit` | เนื้อหาแต่ละเวอร์ชัน · Flowchart · ประวัติกิจกรรม |
| `approvalSteps`, `shareLinks`, `auditEvents` | ขั้นตรวจ/อนุมัติ · ลิงก์แชร์ · กิจกรรมด้านผู้ใช้/หมวด |

ขนาดสูงสุด (Firestore จำกัด 1 MiB ต่อเอกสาร): เนื้อหา SOP 600 KB · Flowchart XML 300 KB + ภาพตัวอย่าง 650 KB

## API

| Method | Route | งาน |
|---|---|---|
| GET | `/api/me` | ผู้ใช้ปัจจุบัน + จำนวนงานรอพิจารณา |
| GET | `/api/dashboard` | สรุปแดชบอร์ด |
| GET, POST | `/api/users` · PATCH, DELETE `/api/users/:id` | รายชื่อ / เชิญ / แก้ไข / ลบ (ผู้ใช้ที่ไม่มีประวัติ) (ADMIN) |
| GET, POST | `/api/categories` | อ่าน / เพิ่มหมวด (ADMIN) |
| PATCH, DELETE | `/api/categories/:id` | แก้ไขหมวด · ลบหมวด (`{ move_to }` = หมวดที่จะย้าย SOP ไป หรือ `null`) (ADMIN) |
| GET, POST | `/api/sops?q=&category=` | ค้นหา / สร้าง SOP (`{ title, categoryId }` — รหัสออกโดยระบบ) |
| GET | `/api/sops/next-code?category=` | ดูรหัสที่ SOP ถัดไปในหมวดนี้จะได้ (ยังไม่จองเลข) |
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

เว็บ: **https://brt-sop--brt-sop-center.asia-southeast1.hosted.app** (App Hosting backend `brt-sop`, asia-southeast1)

ค่าที่ตั้งไว้แล้วในโค้ด: Web SDK config + `BOOTSTRAP_ADMIN_EMAIL` (`apphosting.yaml`) · Google sign-in + backend + รายการไฟล์ที่ไม่อัปโหลด (`firebase.json`)

```bash
# Deploy ทุกอย่างจากเครื่อง: Firestore rules/indexes · เปิด Google sign-in · build + rollout แอป
firebase deploy --only firestore,auth,apphosting --project brt-sop-center
```

`apphosting` อัปโหลดซอร์สจากเครื่อง (ข้ามไฟล์ใน `.gitignore` และ `ignore` ของ `firebase.json` เช่น `.env.local`) แล้ว build บน Cloud Build ·
ถ้าต้องการให้ push ขึ้น `main` แล้ว deploy อัตโนมัติ ให้เชื่อม GitHub repo ที่ Firebase Console → App Hosting → `brt-sop` → Settings

<details><summary>ตั้งค่าครั้งแรก (ทำไปแล้วสำหรับ <code>brt-sop-center</code>)</summary>

```bash
firebase firestore:databases:create "(default)" --location asia-southeast1 --project brt-sop-center
firebase apphosting:backends:create --project brt-sop-center --backend brt-sop \
  --primary-region asia-southeast1 --app 1:959139949716:web:f8363219ebbf0b47329881 --root-dir / --non-interactive
```

</details>

**Firebase Authentication (ตั้งแล้ว — ตรวจได้ที่ Console → Authentication):**
- **Sign-in method:** Google เปิด (จาก `firebase deploy --only auth`) · Email/Password **ปิด** — `firebase deploy` ปิด provider ให้ไม่ได้ ต้องปิดใน Console
  (ถึงเปิดไว้ เซิร์ฟเวอร์ก็ปฏิเสธ token ที่ไม่ได้มาจาก Google อยู่แล้ว)
- **Settings → Authorized domains:** มี `brt-sop--brt-sop-center.asia-southeast1.hosted.app` แล้ว — ถ้าผูกโดเมนจริงเพิ่ม ต้องเพิ่มโดเมนนั้นด้วย
  ไม่งั้นปุ่ม Google จะขึ้น “โดเมนนี้ยังไม่ได้รับอนุญาต”
- **Settings → User actions:** ต้อง **เปิด “Enable create (sign-up)” ไว้** (ค่าเริ่มต้น) — ผู้ถูกเชิญได้บัญชี Firebase ตอนกดปุ่ม Google ครั้งแรก ·
  คนที่ไม่ได้รับเชิญอาจมีบัญชีใน Firebase ได้ แต่เข้าระบบไม่ได้ (API ตอบ 403)
- **ผู้ดูแลคนแรก:** เปิดเว็บ → “เข้าสู่ระบบด้วย Google” ด้วย `sl@brt.co.th` → ได้สิทธิ์ ADMIN พร้อมหมวดหมู่เริ่มต้น 4 หมวด ·
  อีเมลนี้ต้องเป็นบัญชี Google (Google Workspace ของบริษัท หรือบัญชี Google ที่สร้างด้วยอีเมลนี้) — เป็นอีเมลเดียวที่ไม่ใช่ Gmail ที่เข้าระบบได้

**สิทธิ์ของ backend:** ถ้า log ขึ้น `PERMISSION_DENIED` ตอนอ่าน Firestore ให้เพิ่ม role **Cloud Datastore User**
ให้ service account ของ backend (`firebase-app-hosting-compute@brt-sop-center.iam.gserviceaccount.com`) ใน IAM

**สำรองข้อมูล:** เปิด Point-in-time recovery / scheduled backups ของ Firestore ได้ที่ Firebase Console → Firestore → Disaster recovery

### ทดสอบก่อนเปิดใช้

ล็อกอิน Admin → เชิญผู้ใช้แต่ละบทบาท → Author สร้าง SOP + Flowchart → ส่งตรวจ → Reviewer ผ่าน → Approver อนุมัติ →
Viewer เห็นเฉพาะฉบับเผยแพร่และพิมพ์ PDF ได้ (ดู Test Plan ใน [`docs/BRT_SOP_Firebase_MVP.md`](docs/BRT_SOP_Firebase_MVP.md) หัวข้อ 9)

---

## หมายเหตุด้านความปลอดภัย

- เบราว์เซอร์อ่าน/เขียน Firestore โดยตรงไม่ได้ (`firestore.rules` ปิดทั้งหมด) — ทุกอย่างผ่าน API ที่ตรวจ Firebase ID Token + Role + Ownership + Assignee ที่เซิร์ฟเวอร์
- ทุกการเปลี่ยนสถานะ (ส่งตรวจ / อนุมัติ / เผยแพร่ / สร้างฉบับแก้ไข) ทำใน Firestore transaction — คำขอพร้อมกันจะมีผลได้รายการเดียว
- ทุกคำขอต้องมาจาก Google sign-in (`sign_in_provider = google.com`) และเป็นอีเมล `@gmail.com` (ยกเว้น `BOOTSTRAP_ADMIN_EMAIL`) — token จากรหัสผ่านหรือ provider อื่นได้ 403
- ผู้ใช้ผูกกับบัญชี Firebase ด้วย uid · การผูกครั้งแรก (ตอนกดปุ่ม Google หลังได้รับเชิญ) ใช้อีเมลที่ Google ยืนยันแล้วเท่านั้น (กันการสวมรอย)
- ผู้ไม่มีสิทธิ์อ่าน Draft จะได้ 404 (ไม่รู้ว่ามีเอกสารอยู่) และค้นหาข้อความในร่างไม่เจอ
- เนื้อหา Tiptap ถูกตรวจชนิด node/mark ที่เซิร์ฟเวอร์ · ลิงก์อนุญาตเฉพาะ `http(s)` / `mailto` · ภาพ Flowchart รับเฉพาะ PNG
- **ลิงก์แชร์:** token สุ่ม 256 บิต เก็บเฉพาะ SHA-256 (แสดงลิงก์ได้ครั้งเดียวตอนสร้าง) · เห็นเฉพาะฉบับเผยแพร่ ไม่เห็นร่าง/อีเมล/ไฟล์ draw.io ·
  ลิงก์หมดอายุ ถูกยกเลิก หรือผู้สร้างถูกระงับบัญชี → ใช้ไม่ได้ทันที (ตอบ 404 เหมือนกันทุกกรณี) · หน้าแชร์ส่ง `Referrer-Policy: no-referrer` + `noindex` ·
  ถ้ามีฉบับใหม่ได้รับอนุมัติ ลิงก์เดิมจะแสดงฉบับใหม่ทันที
- Content-Security-Policy จำกัด iframe ไว้ที่ `embed.diagrams.net`, `www.youtube-nocookie.com` และ auth domain ของ Firebase · สคริปต์ภายนอกมีแค่ `apis.google.com` (ตัวโหลดของ Google sign-in) — ถ้าเปิดใช้ reCAPTCHA / App Check ต้องเพิ่มโดเมนใน `next.config.ts`
- วิดีโอเก็บเฉพาะรหัสคลิป YouTube (ตรวจรูปแบบที่เซิร์ฟเวอร์) ไม่เก็บ URL หรือ HTML ที่ผู้ใช้วางมาโดยตรง — คลิปที่ตั้งเป็น Private บน YouTube จะเล่นไม่ได้ ควรใช้ Public หรือ Unlisted
- **draw.io:** editor โหลดจากโดเมนสาธารณะของ diagrams.net (ประมวลผลในเบราว์เซอร์) — ทบทวนนโยบายข้อมูลบริษัทก่อนใช้กับเอกสารอ่อนไหว หรือ self-host draw.io แล้วแก้ `DRAWIO_ORIGIN`

## งานถัดไป (Phase C)

- เก็บไฟล์แนบ / รูปภาพใน Cloud Storage for Firebase
- สร้าง PDF ฝั่งเซิร์ฟเวอร์และเก็บสำเนาถาวร (ปัจจุบันใช้ Browser Print)
- เปรียบเทียบความต่างระหว่างเวอร์ชัน (Diff) · แจ้งเตือนผู้ตรวจ/ผู้อนุมัติทางอีเมลหรือ n8n
- Pagination / ระบบค้นหาเต็มรูปแบบเมื่อมี SOP หลายพันฉบับ / ทดสอบ E2E อัตโนมัติ
