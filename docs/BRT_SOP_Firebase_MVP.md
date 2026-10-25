# BRT SOP Center — MVP + Firebase App Hosting Deployment Guide

> **โครงการ:** SOP & Work Instruction Management System สำหรับ Blue Ribbon Trading (BRT)  
> **เอกสารเวอร์ชัน:** 1.0 · **วันที่:** 25 ตุลาคม 2026  
> **ภาษาใช้งาน:** ไทยเป็นหลัก  
> **สถานะ:** สเปกและโครงซอร์สโค้ดขั้นต้นมีอยู่ในชุด `BRT_SOP_Firebase_App/` แต่ **ยังไม่ได้ Deploy ไปยัง Firebase จริง** และยังไม่ควรถือว่าผ่านการทดสอบ Production

## 1. เป้าหมายของระบบ

สร้าง Web App สำหรับจัดทำ จัดเก็บ แก้ไข ตรวจสอบ อนุมัติ และเผยแพร่คู่มือการปฏิบัติงาน (SOP / Work Instruction) ของ BRT ให้พนักงานเข้าถึง **คู่มือฉบับที่อนุมัติแล้ว** ได้สะดวก โดยฝัง **draw.io (diagrams.net)** เพื่อวาด Flowchart ในตัวระบบ พร้อมประวัติเวอร์ชันและสิทธิ์การเข้าถึง

### ตัวอย่าง SOP ที่ควรใช้เริ่มต้น

- `SOP-SAL-001` — รับคำขอใบเสนอราคา (RFQ) และออกใบเสนอราคา
- `SOP-PUR-001` — สั่งซื้อสินค้าและติดตามซัพพลายเออร์
- `SOP-WH-001` — รับเข้า ตรวจสอบ และจัดเก็บสินค้าในคลัง
- `SOP-WH-002` — หยิบ แพ็ค และจัดส่งสินค้า
- `SOP-IMP-001` — เตรียมเอกสารนำเข้าสินค้าและตรวจสอบความถูกต้อง

## 2. เทคโนโลยี (Target Architecture)

| ชั้นระบบ | เทคโนโลยี | หน้าที่ |
|---|---|---|
| Web / Server | **Next.js App Router + TypeScript** | หน้าจอและ API Route Handlers |
| Hosting | **Firebase App Hosting** | Build, Deploy, Run Next.js จาก GitHub |
| Sign-in | **Firebase Authentication** | Login ด้วย Email/Password และ Firebase ID Token |
| Business DB | **PostgreSQL** (เช่น Neon) | SOP, revisions, approvers, audit logs |
| Text editor | **Tiptap** | Rich Text SOP และเก็บเอกสารแบบ JSON |
| Diagram | **draw.io Embed API** | แก้ไข Flowchart ผ่าน iframe / postMessage |
| File storage | **Cloud Storage for Firebase** (เฟสถัดไป) | รูปภาพ ไฟล์แนบ และ PDF ที่ต้องเก็บถาวร |
| PDF | Browser Print (โครงต้นแบบ) → Server-side PDF (งานที่ต้องเพิ่ม) | ส่งออกคู่มือที่คงรูปแบบและติดเลขเวอร์ชัน |
| Optional automation | n8n | แจ้งเตือนผู้อนุมัติหรือเชื่อมระบบ BRT ในอนาคต |

**ข้อควรทราบ:** Firebase App Hosting **ไม่ได้เป็น PostgreSQL managed database** ในตัว จำเป็นต้องใช้ PostgreSQL จากผู้ให้บริการแยกต่างหาก และสร้าง Secret ของ `DATABASE_URL` ใน Firebase/Google Cloud Secret Manager

```mermaid
flowchart TB
    Employee[พนักงานผ่านเว็บเบราว์เซอร์]
    Web[Next.js บน Firebase App Hosting]
    Auth[Firebase Authentication]
    DB[(PostgreSQL)]
    Storage[(Firebase Cloud Storage - planned)]
    Draw[draw.io Embedded Editor]
    Employee --> Web
    Web --> Auth
    Web --> DB
    Web -.-> Storage
    Employee <--> Draw
    Draw -- XML / preview --> Web
```

## 3. ขอบเขตฟังก์ชัน MVP

### 3.1 SOP Editor

- สร้างเอกสารใหม่ด้วย **รหัส SOP ไม่ซ้ำ**, ชื่อเรื่อง, หมวดหมู่ และเจ้าของ
- แก้ไขเนื้อหาด้วย Tiptap (หัวข้อ ย่อหน้า รายการ และ Rich Text พื้นฐาน)
- บันทึกเนื้อหาเป็น `content_json` และข้อความที่ค้นหาได้เป็น `content_text`
- แก้ไขได้เฉพาะเวอร์ชันสถานะ `DRAFT` ที่ผู้ใช้ได้รับสิทธิ์

### 3.2 draw.io Integration

- เปิด editor ใน Modal ผ่าน `https://embed.diagrams.net/`
- ใช้ `postMessage` โหลดและรับไฟล์แผนภาพ XML
- จัดเก็บ `xml_source` **ผูกกับ `sop_version`** เพื่อไม่ให้ผังงานฉบับเก่าถูกเขียนทับ
- แสดงภาพ PNG preview ในคู่มือและ PDF เมื่อสร้าง preview สำเร็จ
- ตรวจสอบ `event.origin` และ `event.source` ให้ตรงกับ iframe ที่เชื่อถือได้

**Data-handling:** การฝัง draw.io จากโดเมนสาธารณะเป็นการใช้งาน editor จากบุคคลภายนอกผ่านเบราว์เซอร์ ควรทบทวนข้อกำหนดด้านข้อมูลบริษัทก่อนใช้กับเอกสารอ่อนไหว

### 3.3 Version Control

- ใช้ `revision_no` เป็นเลขภายในที่เพิ่มขึ้นตามการแก้ไข
- ใช้ `version_label` เช่น `1.0`, `1.1` สำหรับฉบับเผยแพร่
- SOP หนึ่งเรื่องมีได้ทั้งฉบับเผยแพร่ปัจจุบันและ Draft ฉบับแก้ไขใหม่
- เมื่ออนุมัติ Draft ใหม่: เวอร์ชันเก่าเปลี่ยนเป็น `SUPERSEDED` และเวอร์ชันใหม่เป็น `PUBLISHED`
- ไม่แก้ไขข้อมูลของเวอร์ชัน `PUBLISHED`/`SUPERSEDED` ย้อนหลัง
- มีหน้ารายการประวัติเวอร์ชัน; **การ Diff แบบเทียบสองเวอร์ชันโดยละเอียด** เป็นฟังก์ชันเสริมหลัง MVP

### 3.4 Approval Workflow

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> IN_REVIEW: Submit
    IN_REVIEW --> DRAFT: Reviewer rejects
    IN_REVIEW --> IN_APPROVAL: Reviewer approves
    IN_APPROVAL --> DRAFT: Approver rejects
    IN_APPROVAL --> PUBLISHED: Approver approves
    PUBLISHED --> SUPERSEDED: New version published
```

**กติกา:**

1. ผู้เขียนสร้างและบันทึก Draft
2. ผู้เขียนเลือก Reviewer และ Approver แล้วส่งตรวจ
3. Reviewer สามารถ **Approve** หรือ **Reject พร้อมเหตุผล**
4. หาก Reviewer ผ่าน เอกสารจะเข้าสู่คิว Approver
5. Approver ผ่านแล้ว ระบบ Publish โดยปรับสถานะ/เลขเวอร์ชัน/Pointer ใน **Transaction เดียว**
6. หากถูก Reject ให้กลับไป `DRAFT` โดยเก็บประวัติการตัดสินใจและ `attempt_no` ทุกครั้ง

### 3.5 Role & Permission

| บทบาท | สร้าง/แก้ไข Draft | ตรวจ/อนุมัติ | อ่าน/พิมพ์ฉบับเผยแพร่ | จัดการผู้ใช้/หมวด |
|---|---|---|---|---|
| `ADMIN` | ได้ทุก SOP | จัดการได้ (ต้อง Audit) | ได้ | ได้ |
| `AUTHOR` | SOP ที่เป็นเจ้าของ | ส่งตรวจได้ | ได้ | ไม่ได้ |
| `REVIEWER` | ไม่แก้เนื้อหา | ตรวจงานที่ได้รับมอบหมาย | ได้ | ไม่ได้ |
| `APPROVER` | ไม่แก้เนื้อหา | อนุมัติงานที่ได้รับมอบหมาย | ได้ | ไม่ได้ |
| `VIEWER` | ไม่ได้ | ไม่ได้ | ได้ | ไม่ได้ |

**ข้อบังคับด้านความปลอดภัย:** ยืนยันสิทธิ์บน Server ทุก API ห้ามใช้แค่ซ่อนปุ่มใน Frontend; ผู้ใช้ทั่วไปห้ามเข้าถึง Draft/Version ที่ไม่ได้รับมอบหมาย

### 3.6 Search & Categories

- ค้นหาด้วยรหัสเอกสาร ชื่อเอกสาร และ `content_text`
- กรองตามหมวดหมู่ เช่น ฝ่ายขาย จัดซื้อ คลังสินค้า นำเข้า
- PostgreSQL `ILIKE` + `pg_trgm` สำหรับ substring search ภาษาไทยระดับ MVP
- ผลการค้นหาต้องแสดงเฉพาะเอกสารที่ผู้ใช้มีสิทธิ์อ่าน

### 3.7 Export PDF

**เป้าหมาย Production:** ดาวน์โหลด PDF A4 ที่มีรหัส SOP ชื่อเรื่อง เลขเวอร์ชัน วันที่มีผล และเลขหน้า พร้อมรองรับฟอนต์ไทยและภาพ Flowchart

**สถานะโค้ดที่มีอยู่:** ปุ่ม `ส่งออก PDF` ใน UI **เรียก `window.print()`** ให้ผู้ใช้เลือก Save as PDF ด้วย Browser; ยังไม่มี API สร้าง PDF ฝั่ง Server และยังไม่มีการเก็บ PDF ลง Cloud Storage จึงต้องเพิ่มก่อนถือว่าฟีเจอร์ PDF สมบูรณ์

## 4. หน้าจอหลัก (Screen Specification)

| หน้าจอ | เป้าหมาย | ฟังก์ชันสำคัญ |
|---|---|---|
| Login | ยืนยันตัวตน | Email/Password, สถานะบัญชี |
| Dashboard | สรุปสถานะ SOP | จำนวน SOP ที่เข้าถึงได้, Published, Draft, รออนุมัติ |
| SOP Library | ค้นหาเอกสาร | Search, Category Filter, รายการเอกสาร |
| Create SOP | สร้างคู่มือ | รหัส, ชื่อ, หมวดหมู่ |
| SOP Detail / Editor | อ่าน/แก้ไข | Tiptap, Flowchart, Save Draft, Submit Review |
| Approval Queue | พิจารณาเอกสาร | ดูเอกสารที่รับมอบหมาย, Approve/Reject |
| Version History | ตรวจสอบย้อนหลัง | เวอร์ชัน สถานะ วันที่อนุมัติ เปิดฉบับเก่า |
| Categories | จัดระเบียบ | แสดงหมวดและเพิ่มหมวด (Admin) |
| Users | บริหารสิทธิ์ | เชิญผู้ใช้ด้วย Email และกำหนด Role (Admin) |

**หมายเหตุการพัฒนา:** โค้ดต้นแบบใน `src/components/SopCenter.tsx` ใช้การนำทางภายใน Client Component เป็นหลัก ไม่ใช่มี Next.js page route แยกครบทุกหน้าตามตารางนี้

## 5. ออกแบบฐานข้อมูล PostgreSQL

ไฟล์ DDL ที่จัดเตรียมไว้: `BRT_SOP_Firebase_App/db/schema.sql`

| Table | บทบาท | ฟิลด์หลัก |
|---|---|---|
| `app_users` | ข้อมูลผู้ใช้ | `id`, `email`, `firebase_uid`, `full_name`, `role`, `is_active` |
| `sops` | ตัวตน SOP ถาวร | `id`, `code`, `title`, `owner_id`, `published_version_id` |
| `sop_versions` | เนื้อหาแต่ละฉบับ | `id`, `sop_id`, `revision_no`, `version_label`, `state`, `content_json`, `content_text` |
| `sop_categories` | หมวดหมู่ | `id`, `name`, `slug`, `parent_id` |
| `sop_category_links` | เชื่อม SOP กับหมวด | `sop_id`, `category_id` |
| `sop_diagrams` | Flowchart รายเวอร์ชัน | `version_id`, `block_id`, `xml_source`, `preview_png_data` |
| `sop_attachments` | เมทาดาทาไฟล์แนบ | `version_id`, `filename`, `storage_key` |
| `approval_steps` | งานตรวจ/อนุมัติ | `version_id`, `attempt_no`, `step_no`, `assignee_id`, `state` |
| `audit_events` | เก็บการกระทำ | `actor_id`, `sop_id`, `version_id`, `event_type`, `metadata` |

```mermaid
erDiagram
    APP_USERS ||--o{ SOPS : owns
    SOPS ||--o{ SOP_VERSIONS : contains
    SOPS ||--o{ SOP_CATEGORY_LINKS : classified
    SOP_CATEGORIES ||--o{ SOP_CATEGORY_LINKS : groups
    SOP_VERSIONS ||--o{ SOP_DIAGRAMS : includes
    SOP_VERSIONS ||--o{ SOP_ATTACHMENTS : includes
    SOP_VERSIONS ||--o{ APPROVAL_STEPS : requires
    APP_USERS ||--o{ APPROVAL_STEPS : assigned
    SOPS ||--o{ AUDIT_EVENTS : tracks
```

**Integrity Rules:**

- หนึ่ง SOP มี Draft / In Review / In Approval ที่ยัง active ได้ไม่เกินหนึ่งเวอร์ชัน
- `sops.published_version_id` ต้องชี้ไปที่ revision ของ SOP เดียวกัน
- การ Publish ต้อง Lock แถวที่เกี่ยวข้องและทำใน Database Transaction
- ทุกการเปลี่ยนสถานะต้องบันทึก `audit_events`
- ข้อมูลเวอร์ชันที่เผยแพร่แล้วห้ามแก้ไขโดยไม่มีการสร้าง Draft ใหม่

## 6. API Surface (Target & Existing Core)

API โครงต้นแบบ: `src/app/api/[...path]/route.ts` (Node.js runtime)

| Method | Route | งาน |
|---|---|---|
| `GET` | `/api/me` | ตรวจสอบผู้ใช้และสิทธิ์ |
| `GET`, `POST` | `/api/users` | อ่านรายชื่อ/เพิ่มผู้ใช้ (ตาม Role) |
| `GET`, `POST` | `/api/categories` | อ่าน/เพิ่มหมวด |
| `GET`, `POST` | `/api/sops` | ค้นหา/สร้าง SOP |
| `GET` | `/api/sops/:id` | อ่าน SOP และเวอร์ชันที่มีสิทธิ์ |
| `POST` | `/api/sops/:id/revisions` | สร้าง Draft จากฉบับเผยแพร่ |
| `PATCH` | `/api/sops/:id/versions/:versionId` | บันทึก Draft |
| `PUT` | `/api/sops/:id/versions/:versionId/diagrams/:blockId` | เก็บ draw.io XML / Preview |
| `POST` | `/api/sops/:id/submit` | ส่งเข้า Approval Workflow |
| `GET` | `/api/approvals` | รายการงานอนุมัติ |
| `POST` | `/api/approvals/:stepId/decision` | Approve / Reject |

> รายการข้างต้นอ้างอิงไฟล์ซอร์สต้นแบบที่มีอยู่ การใช้งานจริงต้องตรวจสอบ API, ตรวจสอบสิทธิ์และทดสอบ End-to-End เพิ่มเติมก่อนเปิดระบบ

## 7. โครงสร้างซอร์สโค้ดที่เตรียมไว้

```text
BRT_SOP_Firebase_App/
├── apphosting.yaml                  # Firebase App Hosting settings + Secret references
├── .env.example                     # ตัวอย่างตัวแปรสภาพแวดล้อม (ไม่มีรหัสผ่านจริง)
├── package.json
├── tsconfig.json
├── db/
│   └── schema.sql                   # PostgreSQL DDL
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── styles.css
│   │   └── api/[...path]/route.ts
│   ├── components/
│   │   ├── SopCenter.tsx             # UI รวมของระบบ
│   │   ├── RichEditor.tsx            # Tiptap
│   │   └── DrawioEmbed.tsx           # draw.io iframe/postMessage
│   └── lib/
│       ├── firebase-client.ts       # Firebase Web SDK
│       └── server.ts                # PostgreSQL, Firebase Admin, RBAC helpers
└── docs/
    └── legacy-prototype.html        # UI รุ่นเริ่มต้น
```

## 8. ขั้นตอนการ Deploy บน Firebase

### 8.1 สิ่งที่ต้องเตรียม

- บัญชี Google ที่มีสิทธิ์สร้าง/จัดการ Firebase Project และ Billing
- **Firebase Project** ที่เปิดแพ็กเกจ **Blaze** สำหรับ App Hosting
- GitHub Repository สำหรับเก็บซอร์สโค้ดของระบบ
- PostgreSQL Database ภายนอก (ตัวอย่าง Neon) ที่อนุญาต TLS Connection
- Node.js และ npm สำหรับทดสอบ Build ในเครื่อง (แนะนำตามเวอร์ชันที่ Next.js/Firebase รองรับ)

### 8.2 สร้าง Firebase Project + Authentication

1. เปิด https://console.firebase.google.com/
2. สร้าง Project เช่น **BRT-SOP-Center** (ชื่อโปรเจกต์เป็นเพียงตัวอย่าง)
3. ลงทะเบียน Web App และคัดลอก Firebase Web Configuration
4. ไปที่ **Authentication → Sign-in method** แล้วเปิด **Email/Password**
5. สร้างบัญชี Admin ที่ยืนยัน Email แล้ว (ระบุ Email เดียวกันใน `BOOTSTRAP_ADMIN_EMAIL`)
6. เข้า **App Hosting → Get started / Create backend** เมื่อโค้ดอยู่ใน GitHub

> **สำคัญ:** อย่าใช้ Email ทั่วไปเป็น Admin โดยไม่ยืนยันตัวตน ตรวจสอบว่า `BOOTSTRAP_ADMIN_EMAIL` ตรงกับบัญชีที่เจ้าของระบบควบคุมจริง

### 8.3 สร้าง PostgreSQL และรัน Schema

1. สร้าง PostgreSQL Database บนบริการที่เลือก
2. คัดลอก **Connection String** ซึ่งควรมี TLS เช่น `sslmode=require`
3. เก็บข้อมูลเชื่อมต่อไว้ใน **Secret Manager** เท่านั้น
4. รัน `db/schema.sql` ผ่าน Neon SQL Editor หรือ `psql` ที่ได้รับอนุญาต

```bash
# ตัวอย่างสำหรับเครื่องที่มี psql และ DATABASE_URL ตั้งไว้แล้ว
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
```

**คำเตือน:** ไฟล์ `schema.sql` เป็น initial schema ไม่ใช่ migration ที่ควรรันซ้ำทุก Deploy; หลังเปิดใช้งานให้ใช้ migration versioning และ backup ก่อนปรับโครงสร้าง DB

### 8.4 ตั้งค่า Environment Variables

ค่าที่ต้องมี **ใน build และ runtime ตามหน้าที่**:

```dotenv
# Private secrets - ต้องเก็บใน Secret Manager เท่านั้น
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
BOOTSTRAP_ADMIN_EMAIL=admin@your-company.example

# Firebase Web SDK config - เป็น Public Config แต่ต้องกำหนดให้ถูกต้องใน build
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

- `DATABASE_URL` และ `BOOTSTRAP_ADMIN_EMAIL`: ใช้ Firebase **App Hosting Secret**; โครงต้นแบบ `apphosting.yaml` อ้างถึง `BRT_SOP_DATABASE_URL` และ `BRT_SOP_ADMIN_EMAIL`
- `NEXT_PUBLIC_FIREBASE_*`: กำหนดเป็น **Environment Variables ที่ใช้ใน BUILD** (และ RUNTIME ได้) ผ่าน Firebase Console หรือ `apphosting.yaml`; ค่าเหล่านี้จะถูกฝังใน JavaScript ฝั่ง Browser
- ไม่ใส่ Password, Secret หรือ Firebase service-account private key ลงใน GitHub
- โค้ดบน App Hosting ใช้ Firebase Admin SDK กับ Application Default Credentials ตามตัวอย่างใน `src/lib/server.ts`

`apphosting.yaml` ในซอร์สที่มีอยู่:

```yaml
runConfig:
  minInstances: 0
  maxInstances: 3
  concurrency: 40
  memoryMiB: 1024
  cpu: 1
env:
  - variable: DATABASE_URL
    secret: BRT_SOP_DATABASE_URL
    availability:
      - RUNTIME
  - variable: BOOTSTRAP_ADMIN_EMAIL
    secret: BRT_SOP_ADMIN_EMAIL
    availability:
      - RUNTIME
```

**หมายเหตุ:** การระบุชื่อ Secret ใน YAML อย่างเดียว **ไม่ได้สร้างค่า Secret หรือมอบสิทธิ์เข้าถึง** ให้เอง ต้องสร้าง Secret และ Grant Access ให้ App Hosting Backend ก่อน Deploy

### 8.5 ทดสอบในเครื่องก่อน Push

```bash
cd BRT_SOP_Firebase_App
npm install
npm run typecheck
npm run build
npm run dev
```

สำหรับการรัน Local ให้คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกค่าจริงในเครื่อง **โดยไม่ Commit `.env.local`**; ฝั่ง Firebase Admin SDK อาจต้องตั้งค่า local application credentials ตามเอกสารทางการเพิ่มเติม

### 8.6 นำซอร์สขึ้น GitHub

หากยังไม่มี repository:

```bash
git init
git add .
git commit -m "Initial BRT SOP Center MVP"
git branch -M main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

แทน `OWNER/REPOSITORY` ด้วย GitHub Repository ของจริง; ต้องสร้าง Repository ที่ GitHub ก่อนรัน `git push` หากไม่มี repo เดิม

### 8.7 เชื่อม App Hosting และ Deploy

1. Firebase Console → **App Hosting** → **Create backend**
2. เลือก Region ใกล้ผู้ใช้และที่รองรับบริการ (ตรวจสอบ Region ที่ใช้ได้ใน Console)
3. เชื่อม GitHub และเลือก Repository/Branch (`main`)
4. ตั้ง **Root directory** ให้ตรงที่มี `package.json` และ `apphosting.yaml` (หากวางโปรเจกต์ไว้ที่ root ให้เลือก `/`)
5. ใส่ Environment Variables และ Secrets ให้ครบ
6. Grant Access ให้ backend service account อ่าน Secrets ที่จำเป็น
7. กด Deploy แล้วตรวจ Build Logs / Runtime Logs
8. เข้า URL `hosted.app` ที่ Firebase แสดงผล แล้วลอง Login, สร้าง SOP, บันทึก Draft และตรวจ Workflow

**โปรดทราบ:** การ Push GitHub ทำให้เกิด Automatic Rollout เมื่อเปิดการเชื่อมต่อไว้ แต่ **ยังไม่เกิด Deploy ใด ๆ ในงานนี้** เพราะยังไม่ได้ตั้งค่า Firebase Project, Backend, Secrets และ GitHub Integration แทนเจ้าของบัญชี

## 9. Test Plan ก่อนใช้งานจริง

### Functional Acceptance Tests

- [ ] ผู้ใช้ที่ไม่ Login เข้า `/api/*` ไม่ได้
- [ ] Admin ที่ยืนยัน Email แล้ว Login ได้
- [ ] Admin เชิญ User และกำหนด Role ได้
- [ ] Author สร้าง SOP รหัสไม่ซ้ำ และบันทึก Draft ได้
- [ ] Author สร้าง Flowchart และบันทึก XML ได้
- [ ] เปิด Flowchart แก้ไขใหม่แล้วเห็นข้อมูลเดิม
- [ ] Viewer ไม่เห็น Draft ที่ยังไม่ Publish
- [ ] Reviewer เห็นเฉพาะงานที่ได้รับมอบหมาย
- [ ] Reject ต้องมีเหตุผลและทำให้กลับไปเป็น Draft
- [ ] Approver อนุมัติแล้ว SOP เปลี่ยนเป็น Published อย่างครบถ้วนใน Transaction เดียว
- [ ] เวอร์ชันเก่าคงเดิมหลังเผยแพร่ฉบับใหม่
- [ ] ค้นหา SOP ภาษาไทยและกรองหมวดหมู่ได้
- [ ] พิมพ์ / Save as PDF ได้พร้อมรหัสและเวอร์ชันที่ถูกต้อง
- [ ] ภาพแผนงานแสดงใน PDF
- [ ] ไม่มี URL/API ที่ให้ผู้ใช้ทั่วไปอ่าน XML/เนื้อหาลับของ Draft

### Security & Reliability Checks

- [ ] Database Secret ไม่ปรากฏใน Client bundle / Git history / Build Logs
- [ ] Firebase Auth Token ถูกตรวจสอบบน Server ทุกคำขอ
- [ ] Server ตรวจ Role, Ownership และ Assignee ทุกการเรียก API
- [ ] `postMessage` ของ draw.io ตรวจ Origin และ Source
- [ ] ตรวจขนาด/ชนิดเนื้อหา XML และไฟล์ Upload ก่อนรับเข้า DB/Storage
- [ ] ตรวจ Content Security Policy และแนวทาง sanitize preview ก่อนแสดงผล
- [ ] มี Backup PostgreSQL และทดสอบ Restore
- [ ] จำกัด DB Connections ตามขนาด Instance และ Pooler ของผู้ให้บริการ DB
- [ ] ทดสอบภาษาไทย/มือถือ/การพิมพ์ PDF

## 10. สิ่งที่มีแล้ว vs. ยังต้องพัฒนา

| หัวข้อ | สถานะตามไฟล์ซอร์สที่ตรวจพบ | หมายเหตุ |
|---|---|---|
| Next.js + TypeScript scaffold | **มีโครงโค้ด** | ยังไม่ยืนยันว่ารัน `npm run build` ผ่าน |
| Login Firebase Auth | **มีโค้ดเชื่อม** | ต้องกำหนด Firebase Project และทดสอบกับผู้ใช้จริง |
| PostgreSQL Schema | **มี DDL** | ต้องสร้าง DB และรัน schema จริง |
| SOP List / Editor | **มีโค้ด UI + API** | ต้องทดสอบแก้ไขและสิทธิ์ |
| draw.io Embed | **มี React component** | ต้องทดสอบ Save/Preview และกรณี Network Error |
| Version Control / Approval | **มีโค้ด API ส่วนหลัก** | ต้องทดสอบ Transaction/Race Condition/Authorization |
| Categories / Search | **มีโค้ดพื้นฐาน** | Pagination และ Performance Tune เพิ่มได้ |
| Export PDF | **บางส่วน** | ปัจจุบันใช้ Browser Print; ยังไม่ใช่ Server-side PDF |
| Firebase Cloud Storage | **ยังไม่เชื่อมจริง** | ตารางเก็บ Metadata รองรับแนวทางต่อยอด |
| Deployment to Firebase | **ยังไม่ดำเนินการ** | ต้องมีการเชื่อมบัญชี Firebase + GitHub/CLI และ Secrets |
| CI / E2E / Production Hardening | **ยังต้องทำ** | จำเป็นก่อนเปิดให้พนักงานใช้จริง |

## 11. ลำดับงานที่แนะนำ

**Phase A — Foundation:** เตรียม Firebase Project, GitHub, PostgreSQL, Secrets และทำให้ App Build/Deploy ได้

**Phase B — Core Workflow:** ทดสอบ Login, CRUD, draw.io, Version Control, Reviewer/Approver, Audit Events ด้วยข้อมูลตัวอย่างจริง

**Phase C — Production Readiness:** เพิ่ม File Storage, Server-side PDF, สิทธิ์แบบละเอียด, Logging, Backup, E2E Test และแผน Rollback

**เกณฑ์รับ MVP:** พนักงานที่มีสิทธิ์สามารถ Login → Author สร้าง SOP + Flowchart → Reviewer ตรวจ → Approver อนุมัติ → Viewer อ่านฉบับเผยแพร่และบันทึก PDF ได้ โดย Draft และเวอร์ชันเก่าคงได้รับการปกป้องและตรวจสอบย้อนกลับได้

## 12. เอกสารอ้างอิงทางการ

- Firebase App Hosting — Get Started: https://firebase.google.com/docs/app-hosting/get-started
- Firebase App Hosting — Configure, Env & Secrets: https://firebase.google.com/docs/app-hosting/configure
- Firebase Authentication: https://firebase.google.com/docs/auth/web/password-auth
- draw.io Embed Mode: https://www.drawio.com/doc/faq/embed-mode
- Next.js App Router: https://nextjs.org/docs/app
- PostgreSQL pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html

---

**สรุป:** เอกสารฉบับนี้เป็นทั้ง Blueprint ของ BRT SOP Center และคู่มือเตรียมนำขึ้น Firebase App Hosting โดยยึดโครงซอร์สที่มีอยู่จริง ไม่ใช่หลักฐานว่าระบบออนไลน์หรือพร้อม Production แล้ว
