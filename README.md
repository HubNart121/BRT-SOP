# BRT SOP Center

ระบบจัดทำ ตรวจทาน อนุมัติ และเผยแพร่คู่มือการปฏิบัติงาน (SOP / Work Instruction) ของ Blue Ribbon Trading
— Next.js (App Router) + Firebase Authentication + PostgreSQL + Tiptap + draw.io · Deploy บน Firebase App Hosting

## ฟังก์ชันที่มี

| หัวข้อ | รายละเอียด |
|---|---|
| Login | Firebase Authentication (Email/Password) · ตรวจ ID Token ที่เซิร์ฟเวอร์ทุก API · ผู้ดูแลคนแรกจาก `BOOTSTRAP_ADMIN_EMAIL` (ต้องยืนยันอีเมล) |
| แดชบอร์ด | จำนวน SOP ที่เข้าถึงได้ / เผยแพร่ / ร่าง / รอพิจารณา · เส้นทางเอกสาร · อัปเดตล่าสุด · งานที่รอคุณ |
| คลัง SOP | ค้นหารหัส ชื่อ และข้อความในเนื้อหา (ภาษาไทยแบบ substring — `ILIKE` + `pg_trgm`) · กรองหมวดหมู่ · แสดงเฉพาะที่มีสิทธิ์อ่าน |
| Editor | Tiptap (หัวข้อ ตัวหนา/เอียง/ขีดเส้นใต้ รายการ กล่องหมายเหตุ ลิงก์ ตาราง) · Ctrl+S บันทึก · กันบันทึกทับกัน (row_version) |
| Flowchart | draw.io Embed (`embed.diagrams.net`) ผ่าน postMessage ตรวจ `origin` + `source` · เก็บ XML + ภาพ PNG ผูกกับเวอร์ชัน |
| วิดีโอ YouTube | ปุ่ม “แทรกวิดีโอ” → คลิป (ลิงก์ watch / youtu.be / shorts, ใส่เวลาเริ่ม `t=` ได้) · หัวข้อ · รายละเอียด (ยาวได้ 5,000 ตัวอักษร) · เล่นในหน้า SOP ผ่าน `youtube-nocookie.com` · ค้นหาเจอจากหัวข้อ/รายละเอียด · ตอนพิมพ์แสดงภาพตัวอย่าง + ลิงก์ |
| เวอร์ชัน | `revision_no` (r1, r2…) + `version_label` (1.0, 1.1, 2.0) · ฉบับเผยแพร่กับฉบับร่างอยู่คู่กันได้ · ฉบับเก่าเป็น `SUPERSEDED` และแก้ไขไม่ได้ (บังคับด้วย trigger ในฐานข้อมูล) |
| อนุมัติ | DRAFT → IN_REVIEW → IN_APPROVAL → PUBLISHED · Reject ต้องมีเหตุผลและกลับเป็นร่าง · เก็บ `attempt_no` ทุกครั้ง · Publish ใน Transaction เดียว |
| สิทธิ์ | ADMIN / AUTHOR / REVIEWER / APPROVER / VIEWER ตรวจที่เซิร์ฟเวอร์ · ผู้ส่งตรวจทาน/อนุมัติงานตัวเองไม่ได้ · ผู้ตรวจกับผู้อนุมัติต้องเป็นคนละคน |
| แชร์ลิงก์ | เจ้าของ SOP / ผู้ดูแล สร้างลิงก์ให้คนนอกดู **ฉบับเผยแพร่ล่าสุด** ได้โดยไม่ต้องล็อกอิน · บังคับวันหมดอายุ (1 ชม. – 90 วัน) · ยกเลิกได้ทันที · นับจำนวนครั้งที่เปิด · เก็บเฉพาะ hash ของ token |
| PDF | หน้าพิมพ์ A4 พร้อมหัวกระดาษควบคุมเอกสาร (รหัส ชื่อ เวอร์ชัน วันที่มีผล) เลขหน้า ช่องลงนาม และลายน้ำ "ฉบับร่าง" → เลือก “บันทึกเป็น PDF” |
| Audit | `audit_events` บันทึกทุกการเปลี่ยนสถานะ (append-only) แสดงในหน้า SOP สำหรับเจ้าของและผู้ดูแล |
| หมวดหมู่ / ผู้ใช้ | ผู้ดูแลเพิ่มหมวด · เชิญผู้ใช้ด้วยอีเมล (สร้างบัญชี Firebase + ส่งอีเมลตั้งรหัสผ่าน) · เปลี่ยนบทบาท / ระงับบัญชี |
| Responsive | เดสก์ท็อป (แถบเมนูซ้าย) · แท็บเล็ต (แถบไอคอน) · มือถือ (แถบล่าง + ปุ่มสร้าง) |

## รันในเครื่อง (ไม่ต้องมี Firebase / PostgreSQL)

```bash
npm install
npm run dev
```

เปิด http://localhost:3000 (ถ้าพอร์ต 3000 ใช้ไม่ได้: `npm run dev -- --port 4310`)

ไฟล์ `.env.local` ตั้ง `NEXT_PUBLIC_AUTH_MODE=dev` ไว้ → ระบบใช้ **ฐานข้อมูลในเครื่อง (PGlite)** ที่ `.data/pglite`
และหน้า Login จะให้เลือก **ผู้ใช้ทดลอง** ได้ทันที:

| อีเมล | บทบาท |
|---|---|
| admin@brt.local | ADMIN |
| author@brt.local | AUTHOR (เจ้าของ SOP ตัวอย่าง) |
| reviewer@brt.local | REVIEWER |
| approver@brt.local | APPROVER |
| viewer@brt.local | VIEWER |

ข้อมูลตัวอย่าง: SOP-SAL-001 (1.0 → 1.1), SOP-PUR-001, SOP-WH-001 (เผยแพร่), SOP-WH-002 (ร่าง), SOP-IMP-001 (รอตรวจ ครั้งที่ 2)

ล้างฐานข้อมูลทดลอง (หยุด `npm run dev` ก่อน): `npm run db:reset-dev`

> โหมดทดลองปิดตัวเองอัตโนมัติใน production build (`NODE_ENV=production`) — แม้ตั้ง `NEXT_PUBLIC_AUTH_MODE=dev` ไว้ก็ใช้ไม่ได้

คำสั่งตรวจสอบ: `npm run typecheck` · `npm run build`

### ทดสอบ Firebase Login จริงในเครื่อง (Auth Emulator)

ไม่ต้องมี Firebase project — ใช้โปรเจกต์จำลอง `demo-brt-sop`

```bash
npm install -g firebase-tools
npm run emulators
```

แล้วใส่ค่าในหัวข้อ “Auth Emulator” ของ `.env.example` ลงใน `.env.local` (แทน `NEXT_PUBLIC_AUTH_MODE=dev`) และรัน `npm run dev`
สร้างบัญชีผู้ดูแลด้วยอีเมลเดียวกับ `BOOTSTRAP_ADMIN_EMAIL` ผ่าน REST ของ emulator หรือหน้าจอ “ลืมรหัสผ่าน” —
อีเมลยืนยัน / ตั้งรหัสผ่านไม่ถูกส่งจริง ดูลิงก์ได้จาก `http://127.0.0.1:9099/emulator/v1/projects/demo-brt-sop/oobCodes`

## โครงสร้างโปรเจกต์

```text
apphosting.yaml            Firebase App Hosting (runConfig + Secrets)
db/schema.sql              PostgreSQL DDL + triggers + หมวดเริ่มต้น (รันครั้งเดียว)
scripts/db-apply.mjs       รัน SQL กับ DATABASE_URL (npm run db:schema)
src/app/(app)/             หน้าหลังล็อกอิน: แดชบอร์ด, sops, sops/new, sops/[id], approvals, categories, users
src/app/login/             หน้าเข้าสู่ระบบ
src/app/print/sops/[id]/   หน้าพิมพ์ / PDF
src/app/api/               Route Handlers (Node.js runtime)
src/components/            AppShell, AuthProvider, Dialogs, editor/ (Tiptap, draw.io)
src/lib/server/            db (pg / PGlite), auth (Firebase Admin), access (สิทธิ์), sops (workflow), admin
src/lib/shared/            types, labels, content (ตรวจ/แปลงเนื้อหา Tiptap)
```

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

## Deploy ขึ้น Firebase App Hosting

### 1. Firebase Project + Authentication

1. https://console.firebase.google.com → สร้าง Project (เช่น `brt-sop-center`) → อัปเกรดเป็นแพ็กเกจ **Blaze**
2. **Project settings → Your apps → Web app** → ลงทะเบียน Web App (ค่า config จะถูกส่งให้แอปอัตโนมัติผ่าน App Hosting)
3. **Authentication → Sign-in method** → เปิด **Email/Password**
4. **Authentication → Settings → User actions** → แนะนำให้ **ปิด “Enable create (sign-up)”** เพื่อให้มีแต่ผู้ที่ผู้ดูแลเชิญเท่านั้นที่มีบัญชี
5. **Authentication → Templates** → ตั้งภาษา/ชื่อผู้ส่งของอีเมล “ยืนยันอีเมล” และ “รีเซ็ตรหัสผ่าน” (ใช้ตอนเชิญผู้ใช้)
6. **Authentication → Users → Add user** → สร้างบัญชีผู้ดูแลคนแรก (อีเมลเดียวกับ `BOOTSTRAP_ADMIN_EMAIL`)
   ครั้งแรกที่ล็อกอิน ระบบจะขอให้กด “ส่งอีเมลยืนยันตัวตน” → เปิดลิงก์ในอีเมล → กด “ตรวจสอบอีกครั้ง” แล้วจะได้สิทธิ์ ADMIN

### 2. PostgreSQL (เช่น Neon)

1. สร้างฐานข้อมูล → คัดลอก Connection string (แนะนำแบบ **pooled** และมี `sslmode=require`)
2. รัน schema **ครั้งเดียว** กับฐานข้อมูลว่าง:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require" npm run db:schema
   ```

   (หรือวาง `db/schema.sql` ใน Neon SQL Editor) — หลังเปิดใช้งานจริงให้ใช้ migration และ backup ก่อนแก้โครงสร้าง

   ฐานข้อมูลที่สร้างจาก schema รุ่นก่อน: รันไฟล์ใน `db/migrations/` ตามลำดับ (รันซ้ำได้ ไม่เสียหาย) เช่น
   `node scripts/db-apply.mjs db/migrations/001_share_links.sql` — ฐานข้อมูลทดลองในเครื่อง (PGlite) รันให้อัตโนมัติ

### 3. GitHub

สร้าง Repository (แนะนำ Private) แล้ว push โค้ดนี้ขึ้น branch `main` — `.gitignore` กันไฟล์ `.env.local`, `.data/` ไว้แล้ว

### 4. App Hosting backend + Secrets

```bash
npm install -g firebase-tools
firebase login
firebase apphosting:backends:create --project <PROJECT_ID>
#   เลือก region, เชื่อม GitHub repo, branch main, root directory "/"

firebase apphosting:secrets:set BRT_SOP_DATABASE_URL --project <PROJECT_ID>
firebase apphosting:secrets:set BRT_SOP_ADMIN_EMAIL --project <PROJECT_ID>
#   ตอบ Yes เมื่อถามให้ grant access ให้ backend
#   (ถ้าข้ามไป: firebase apphosting:secrets:grantaccess <SECRET> --backend <BACKEND_ID>)
```

จากนั้น push ขึ้น `main` อีกครั้ง (หรือกด Rollout ใน Console) → ตรวจ Build/Runtime logs → เปิด URL `*.hosted.app`

**สิทธิ์เชิญผู้ใช้:** การเชิญผู้ใช้สร้างบัญชีใน Firebase Auth ผ่าน Admin SDK — ถ้าขึ้นข้อความว่าสร้างบัญชีไม่สำเร็จ ให้เพิ่ม role
**Firebase Authentication Admin** ให้ service account ของ backend (`firebase-app-hosting-compute@<PROJECT_ID>.iam.gserviceaccount.com`) ใน IAM

**Connection pool:** `maxInstances (3) × DB_POOL_MAX (5)` = สูงสุด 15 connections — ปรับใน `apphosting.yaml` ให้เหมาะกับแพ็กเกจฐานข้อมูล

### 5. ทดสอบก่อนเปิดใช้

ล็อกอิน Admin → เชิญผู้ใช้แต่ละบทบาท → Author สร้าง SOP + Flowchart → ส่งตรวจ → Reviewer ผ่าน → Approver อนุมัติ →
Viewer เห็นเฉพาะฉบับเผยแพร่และพิมพ์ PDF ได้ (ดู Test Plan ใน [`docs/BRT_SOP_Firebase_MVP.md`](docs/BRT_SOP_Firebase_MVP.md) หัวข้อ 9)

---

## หมายเหตุด้านความปลอดภัย

- ทุก API ตรวจ Firebase ID Token + Role + Ownership + Assignee ที่เซิร์ฟเวอร์ — การซ่อนปุ่มฝั่งหน้าเว็บเป็นเพียง UX
- ผู้ใช้ผูกกับบัญชี Firebase ด้วย uid · ถ้าผูกด้วยอีเมลต้องยืนยันอีเมลแล้วเท่านั้น — บัญชีที่มีคนสมัครด้วยอีเมลพนักงานไว้ก่อนแต่ยังไม่ยืนยัน จะไม่ถูกผูกตอนเชิญ (กันการสวมรอย)
- ผู้ไม่มีสิทธิ์อ่าน Draft จะได้ 404 (ไม่รู้ว่ามีเอกสารอยู่) และค้นหาข้อความในร่างไม่เจอ
- เนื้อหา Tiptap ถูกตรวจชนิด node/mark ที่เซิร์ฟเวอร์ · ลิงก์อนุญาตเฉพาะ `http(s)` / `mailto` · ภาพ Flowchart รับเฉพาะ PNG
- **ลิงก์แชร์:** token สุ่ม 256 บิต เก็บเฉพาะ SHA-256 (แสดงลิงก์ได้ครั้งเดียวตอนสร้าง) · เห็นเฉพาะฉบับเผยแพร่ ไม่เห็นร่าง/อีเมล/ไฟล์ draw.io ·
  ลิงก์หมดอายุ ถูกยกเลิก หรือผู้สร้างถูกระงับบัญชี → ใช้ไม่ได้ทันที (ตอบ 404 เหมือนกันทุกกรณี) · หน้าแชร์ส่ง `Referrer-Policy: no-referrer` + `noindex` ·
  ถ้ามีฉบับใหม่ได้รับอนุมัติ ลิงก์เดิมจะแสดงฉบับใหม่ทันที
- ฐานข้อมูลบังคับ: ฉบับเผยแพร่แก้ไขไม่ได้, หนึ่ง SOP มีร่างที่ทำงานอยู่ได้ฉบับเดียว, pointer ฉบับเผยแพร่ต้องเป็นของ SOP เดียวกัน, audit log แก้/ลบไม่ได้
- Content-Security-Policy จำกัด iframe ไว้ที่ `embed.diagrams.net` และ `www.youtube-nocookie.com` — ถ้าเปิดใช้ reCAPTCHA / App Check ต้องเพิ่มโดเมนใน `next.config.ts`
- วิดีโอเก็บเฉพาะรหัสคลิป YouTube (ตรวจรูปแบบที่เซิร์ฟเวอร์) ไม่เก็บ URL หรือ HTML ที่ผู้ใช้วางมาโดยตรง — คลิปที่ตั้งเป็น Private บน YouTube จะเล่นไม่ได้ ควรใช้ Public หรือ Unlisted
- **draw.io:** editor โหลดจากโดเมนสาธารณะของ diagrams.net (ประมวลผลในเบราว์เซอร์) — ทบทวนนโยบายข้อมูลบริษัทก่อนใช้กับเอกสารอ่อนไหว หรือ self-host draw.io แล้วแก้ `DRAWIO_ORIGIN`

## งานถัดไป (Phase C)

- เก็บไฟล์แนบ / รูปภาพใน Cloud Storage for Firebase (มีตาราง `sop_attachments` รองรับแล้ว)
- สร้าง PDF ฝั่งเซิร์ฟเวอร์และเก็บสำเนาถาวร (ปัจจุบันใช้ Browser Print)
- เปรียบเทียบความต่างระหว่างเวอร์ชัน (Diff) · แจ้งเตือนผู้ตรวจ/ผู้อนุมัติทางอีเมลหรือ n8n
- Pagination / ทดสอบ E2E อัตโนมัติ / Backup & Restore drill
