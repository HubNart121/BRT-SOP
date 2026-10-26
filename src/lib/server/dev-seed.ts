import 'server-only';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { doc, docToText, h2, ol, p, ul } from '@/lib/shared/content';
import type { Role, StepState, TiptapDoc, VersionState } from '@/lib/shared/types';
import { DEFAULT_CATEGORIES } from './auth';
import {
  C,
  bangkokDate,
  emailKey,
  newId,
  type CategoryDoc,
  type SopDoc,
  type StepDoc,
  type UserDoc,
  type VersionDoc,
} from './db';

const daysAgo = (d: number) => Timestamp.fromMillis(Date.now() - d * 86_400_000);

/**
 * Demo data for local development (Firestore emulator only — getDb() calls this only in demo mode).
 * Users log in through the dev login screen; there are no passwords.
 */
export async function seedDemoData(db: Firestore): Promise<void> {
  const batch = db.batch();
  const ids: Record<string, string> = {};
  const users: [string, string, Role][] = [
    ['admin@brt.local', 'ผู้ดูแลระบบ (ทดลอง)', 'ADMIN'],
    ['author@brt.local', 'ผู้เขียน (ทดลอง)', 'AUTHOR'],
    ['reviewer@brt.local', 'ผู้ตรวจทาน (ทดลอง)', 'REVIEWER'],
    ['approver@brt.local', 'ผู้อนุมัติ (ทดลอง)', 'APPROVER'],
    ['viewer@brt.local', 'พนักงานคลังสินค้า (ทดลอง)', 'VIEWER'],
  ];
  for (const [email, name, role] of users) {
    const id = newId();
    ids[role] = id;
    const u: UserDoc = {
      email,
      firebase_uid: null,
      full_name: name,
      role,
      is_active: true,
      created_at: daysAgo(90),
      updated_at: daysAgo(90),
      last_login_at: null,
    };
    batch.create(db.collection(C.users).doc(id), u);
    batch.create(db.collection(C.userEmails).doc(emailKey(email)), { user_id: id });
  }
  const cats: Record<string, string> = {};
  DEFAULT_CATEGORIES.forEach(([name, slug], i) => {
    const id = newId();
    cats[slug] = id;
    const c: CategoryDoc = { name, slug, parent_id: null, sort_order: (i + 1) * 10, created_at: daysAgo(90) };
    batch.create(db.collection(C.categories).doc(id), c);
    batch.create(db.collection(C.categorySlugs).doc(slug), { category_id: id });
  });

  const author = ids.AUTHOR;
  const reviewer = ids.REVIEWER;
  const approver = ids.APPROVER;

  interface V {
    rev: number;
    title: string;
    content: TiptapDoc;
    state: VersionState;
    label?: string;
    days: number;
    supersededDays?: number;
    note?: string;
    attempts?: number;
  }

  function auditEv(sopId: string, versionId: string | null, actor: string, type: string, days: number, meta = {}) {
    batch.create(db.collection(C.sops).doc(sopId).collection(C.audit).doc(), {
      actor_id: actor,
      version_id: versionId,
      event_type: type,
      metadata: meta,
      created_at: daysAgo(days),
    });
  }

  function step(sopId: string, vid: string, attempt: number, no: 1 | 2, state: StepState, days: number, comment = '') {
    const decided = state === 'APPROVED' || state === 'REJECTED';
    const assignee = no === 1 ? reviewer : approver;
    const s: StepDoc = {
      sop_id: sopId,
      version_id: vid,
      attempt_no: attempt,
      step_no: no,
      step_type: no === 1 ? 'REVIEW' : 'APPROVE',
      assignee_id: assignee,
      state,
      comment,
      decided_by: decided ? assignee : null,
      decided_at: decided ? daysAgo(days) : null,
      created_at: daysAgo(days + 1),
    };
    batch.create(db.collection(C.steps).doc(newId()), s);
  }

  function sop(code: string, title: string, cat: string, versions: V[]): { sopId: string; vids: string[] } {
    const sopId = newId();
    const vids = versions.map(() => newId());
    let published: SopDoc['published'] = null;
    let active: SopDoc['active'] = null;
    let publishedId: string | null = null;
    let activeId: string | null = null;
    let lastChange = 60;
    versions.forEach((v, i) => {
      const isPub = v.state === 'PUBLISHED' || v.state === 'SUPERSEDED';
      const vd: VersionDoc = {
        revision_no: v.rev,
        version_label: v.label ?? null,
        state: v.state,
        title: v.title,
        content_json: JSON.stringify(v.content),
        content_text: docToText(v.content),
        change_note: v.note ?? '',
        major_change: false,
        based_on_version_id: i > 0 ? vids[i - 1] : null,
        based_on_label: i > 0 ? (versions[i - 1].label ?? null) : null,
        row_version: 1,
        last_attempt_no: v.attempts ?? (isPub ? 1 : 0),
        created_by: author,
        updated_by: author,
        created_at: daysAgo(v.days + 3),
        updated_at: daysAgo(v.days),
        submitted_at: v.state === 'DRAFT' ? null : daysAgo(v.days + 2),
        published_at: isPub ? daysAgo(v.days) : null,
        published_by: isPub ? approver : null,
        effective_date: isPub ? bangkokDate(daysAgo(v.days).toDate()) : null,
        superseded_at: v.supersededDays !== undefined ? daysAgo(v.supersededDays) : null,
      };
      batch.create(db.collection(C.sops).doc(sopId).collection(C.versions).doc(vids[i]), vd);
      const summary = {
        id: vids[i],
        state: v.state,
        revision_no: v.rev,
        label: v.label ?? null,
        effective_date: vd.effective_date,
        updated_at: vd.updated_at,
      };
      if (v.state === 'PUBLISHED') {
        published = summary;
        publishedId = vids[i];
      } else if (v.state !== 'SUPERSEDED') {
        active = summary;
        activeId = vids[i];
      }
      lastChange = Math.min(lastChange, v.days);
      if (isPub) {
        step(sopId, vids[i], 1, 1, 'APPROVED', v.days + 1);
        step(sopId, vids[i], 1, 2, 'APPROVED', v.days);
        auditEv(sopId, vids[i], approver, 'PUBLISHED', v.days, { label: v.label, attempt_no: 1 });
      }
    });
    const s: SopDoc = {
      code,
      title: versions.find((v) => v.state === 'PUBLISHED')?.title ?? versions[versions.length - 1].title,
      owner_id: author,
      category_id: cats[cat],
      published_version_id: publishedId,
      active_version_id: activeId,
      published,
      active,
      last_revision_no: Math.max(...versions.map((v) => v.rev)),
      created_at: daysAgo(60),
      updated_at: daysAgo(lastChange),
    };
    batch.create(db.collection(C.sops).doc(sopId), s);
    batch.create(db.collection(C.sopCodes).doc(code), { sop_id: sopId });
    auditEv(sopId, vids[0], author, 'SOP_CREATED', 60, { code, title });
    return { sopId, vids };
  }

  const salTitle = 'รับคำขอใบเสนอราคา (RFQ) และออกใบเสนอราคา';
  sop('SOP-SALES-001', salTitle, 'sales', [
    { rev: 1, title: salTitle, content: salContent(false), state: 'SUPERSEDED', label: '1.0', days: 50, supersededDays: 12 },
    {
      rev: 2,
      title: salTitle,
      content: salContent(true),
      state: 'PUBLISHED',
      label: '1.1',
      days: 12,
      note: 'ลดระยะเวลาตอบกลับลูกค้าเหลือ 2 วันทำการ และเพิ่มตัวชี้วัด',
    },
  ]);
  const purTitle = 'สั่งซื้อสินค้าและติดตามซัพพลายเออร์';
  sop('SOP-PURCHASING-001', purTitle, 'purchasing', [
    { rev: 1, title: purTitle, content: purContent(), state: 'PUBLISHED', label: '1.0', days: 30 },
  ]);
  const wh1Title = 'รับเข้า ตรวจสอบ และจัดเก็บสินค้าในคลัง';
  sop('SOP-WAREHOUSE-001', wh1Title, 'warehouse', [
    { rev: 1, title: wh1Title, content: wh1Content(), state: 'PUBLISHED', label: '1.0', days: 21 },
  ]);
  const wh2Title = 'หยิบ แพ็ค และจัดส่งสินค้า';
  sop('SOP-WAREHOUSE-002', wh2Title, 'warehouse', [{ rev: 1, title: wh2Title, content: wh2Content(), state: 'DRAFT', days: 2 }]);

  // SOP-IMPORT-001: in review, 2nd attempt (1st rejected by the reviewer)
  const impTitle = 'เตรียมเอกสารนำเข้าสินค้าและตรวจสอบความถูกต้อง';
  const imp = sop('SOP-IMPORT-001', impTitle, 'import', [
    {
      rev: 1,
      title: impTitle,
      content: impContent(),
      state: 'IN_REVIEW',
      days: 1,
      attempts: 2,
      note: 'เพิ่มขั้นตอนตรวจร่างใบขนสินค้าตามที่ผู้ตรวจทานแนะนำ',
    },
  ]);
  const impV = imp.vids[0];
  step(imp.sopId, impV, 1, 1, 'REJECTED', 3, 'กรุณาเพิ่มขั้นตอนตรวจร่างใบขนสินค้าก่อนยื่น และระบุเอกสารแนบให้ครบ');
  step(imp.sopId, impV, 1, 2, 'CANCELLED', 3);
  step(imp.sopId, impV, 2, 1, 'PENDING', 0);
  step(imp.sopId, impV, 2, 2, 'WAITING', 0);
  auditEv(imp.sopId, impV, author, 'SUBMITTED', 4, { attempt_no: 1 });
  auditEv(imp.sopId, impV, reviewer, 'REVIEW_REJECTED', 3, { attempt_no: 1 });
  auditEv(imp.sopId, impV, author, 'SUBMITTED', 1, { attempt_no: 2 });

  await batch.commit();
}

// ── Demo content ──────────────────────────────────────────────────────

function salContent(v11: boolean): TiptapDoc {
  return doc(
    h2('1. วัตถุประสงค์'),
    p('เพื่อให้การรับคำขอใบเสนอราคาจากลูกค้าและการออกใบเสนอราคาเป็นมาตรฐานเดียวกัน ตอบกลับลูกค้าได้รวดเร็ว และตรวจสอบย้อนหลังได้'),
    h2('2. ขอบเขต'),
    p('ใช้กับคำขอราคาสินค้าทุกประเภทที่ฝ่ายขายได้รับทางอีเมล โทรศัพท์ LINE หรือหน้าร้าน'),
    h2('3. ผู้รับผิดชอบ'),
    ul([
      'เจ้าหน้าที่ขาย — รับคำขอ บันทึก RFQ และจัดทำใบเสนอราคา',
      'ผู้จัดการฝ่ายขาย — อนุมัติราคาที่ต่ำกว่าราคามาตรฐาน',
      'ฝ่ายจัดซื้อ — ขอราคาจากซัพพลายเออร์เมื่อไม่มีสินค้าในสต็อก',
    ]),
    h2('4. ขั้นตอนการปฏิบัติงาน'),
    ol([
      'รับคำขอจากลูกค้าและบันทึกเป็นใบขอราคา (RFQ) ภายในวันทำการเดียวกัน',
      'ตรวจสอบรายละเอียดสินค้า สเปก จำนวน และกำหนดส่งที่ลูกค้าต้องการ',
      'ตรวจสอบสต็อกคงเหลือในระบบ หากไม่มีสินค้าในสต็อก ส่งคำขอให้ฝ่ายจัดซื้อขอราคาจากซัพพลายเออร์',
      'คำนวณราคาขายตามโครงสร้างราคาและส่วนลดที่ได้รับอนุมัติ',
      v11 ? 'ออกใบเสนอราคาและส่งให้ลูกค้าภายใน 2 วันทำการ' : 'ออกใบเสนอราคาและส่งให้ลูกค้าภายใน 3 วันทำการ',
      'ติดตามผลกับลูกค้าภายใน 7 วันหลังส่งใบเสนอราคา',
    ]),
    ...(v11 ? [h2('5. ตัวชี้วัด'), p('ตอบกลับลูกค้าภายใน 2 วันทำการ ไม่น้อยกว่า 95% ของคำขอทั้งหมดในแต่ละเดือน')] : []),
    h2(v11 ? '6. เอกสารที่เกี่ยวข้อง' : '5. เอกสารที่เกี่ยวข้อง'),
    ul(['แบบฟอร์มใบขอราคา (RFQ)', 'ใบเสนอราคา (Quotation)', 'ตารางโครงสร้างราคาขาย']),
  );
}

function purContent(): TiptapDoc {
  return doc(
    h2('1. วัตถุประสงค์'),
    p('เพื่อให้การสั่งซื้อสินค้าเป็นไปตามงบประมาณ ได้สินค้าตรงสเปกและตรงเวลา และติดตามซัพพลายเออร์ได้อย่างเป็นระบบ'),
    h2('2. ขั้นตอนการปฏิบัติงาน'),
    ol([
      'รับใบขอซื้อ (PR) ที่ได้รับอนุมัติจากหัวหน้าหน่วยงาน',
      'ขอใบเสนอราคาจากซัพพลายเออร์อย่างน้อย 2 ราย สำหรับยอดสั่งซื้อเกิน 50,000 บาท',
      'เปรียบเทียบราคา เงื่อนไขการชำระเงิน และระยะเวลาส่งมอบ',
      'ออกใบสั่งซื้อ (PO) และขออนุมัติตามวงเงินที่กำหนด',
      'ส่ง PO ให้ซัพพลายเออร์และขอยืนยันกำหนดส่งเป็นลายลักษณ์อักษร',
      'ติดตามสถานะการผลิตและการจัดส่งทุกสัปดาห์ และแจ้งคลังสินค้าล่วงหน้าก่อนสินค้าเข้า',
    ]),
    h2('3. เอกสารที่เกี่ยวข้อง'),
    ul(['ใบขอซื้อ (PR)', 'ใบสั่งซื้อ (PO)', 'ตารางเปรียบเทียบราคา']),
  );
}

function wh1Content(): TiptapDoc {
  const cell = (s: string, header = false) => ({
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [p(s)],
  });
  const row = (cells: string[], header = false) => ({ type: 'tableRow', content: cells.map((c) => cell(c, header)) });
  return doc(
    h2('1. วัตถุประสงค์'),
    p('เพื่อให้สินค้าที่รับเข้าคลังถูกต้องทั้งจำนวนและคุณภาพ บันทึกในระบบครบถ้วน และจัดเก็บตามหลัก FIFO'),
    h2('2. ขั้นตอนการปฏิบัติงาน'),
    ol([
      'ตรวจสอบเอกสารส่งของ (Invoice / Delivery Note) เทียบกับใบสั่งซื้อ (PO)',
      'ตรวจนับจำนวนและสภาพหีบห่อต่อหน้าผู้ส่งของ',
      'สุ่มตรวจคุณภาพตามเกณฑ์การตรวจรับ',
      'บันทึกรับสินค้าเข้าระบบภายในวันเดียวกัน',
      'ติดป้ายสินค้าและจัดเก็บตามตำแหน่ง (Location) โดยใช้หลัก FIFO',
    ]),
    h2('3. เกณฑ์การตรวจรับ'),
    {
      type: 'table',
      content: [
        row(['รายการตรวจ', 'เกณฑ์', 'เมื่อไม่ผ่าน'], true),
        row(['จำนวน', 'ตรงกับ PO 100%', 'บันทึกส่วนต่างและแจ้งจัดซื้อ']),
        row(['สภาพหีบห่อ', 'ไม่ฉีกขาด ไม่เปียกชื้น', 'ถ่ายรูปและให้ผู้ส่งลงนามรับทราบ']),
        row(['คุณภาพสินค้า', 'สุ่มตรวจ 5% ต่อล็อต', 'กักสินค้าไว้พื้นที่รอตรวจ']),
      ],
    },
    h2('4. เอกสารที่เกี่ยวข้อง'),
    ul(['ใบรับสินค้า (GR)', 'แบบฟอร์มรายงานสินค้าผิดปกติ']),
  );
}

function wh2Content(): TiptapDoc {
  return doc(
    h2('1. วัตถุประสงค์'),
    p('เพื่อให้การหยิบ แพ็ค และจัดส่งสินค้าถูกต้อง ครบถ้วน และส่งถึงลูกค้าตามกำหนด'),
    h2('2. ขั้นตอนการปฏิบัติงาน'),
    ol([
      'รับใบหยิบสินค้า (Picking List) จากระบบ',
      'หยิบสินค้าตามตำแหน่งจัดเก็บโดยใช้หลัก FIFO',
      'ตรวจสอบรหัสสินค้าและจำนวนก่อนแพ็ค',
      'แพ็คสินค้าตามมาตรฐานบรรจุภัณฑ์และติดฉลากจัดส่ง',
      '[ระบุขั้นตอนส่งมอบให้บริษัทขนส่ง]',
    ]),
    h2('3. เอกสารที่เกี่ยวข้อง'),
    p('[ระบุแบบฟอร์มหรือเอกสารอ้างอิง]'),
  );
}

function impContent(): TiptapDoc {
  return doc(
    h2('1. วัตถุประสงค์'),
    p('เพื่อให้เอกสารนำเข้าสินค้าถูกต้องครบถ้วน ลดความเสี่ยงค่าปรับและความล่าช้าในการตรวจปล่อยสินค้า'),
    h2('2. ขั้นตอนการปฏิบัติงาน'),
    ol([
      'ตรวจสอบ Commercial Invoice, Packing List และ Bill of Lading ให้ตรงกัน',
      'ตรวจสอบพิกัดศุลกากร (HS Code) อัตราอากร และสิทธิประโยชน์ทางภาษี',
      'ส่งเอกสารให้ตัวแทนออกของ (Shipping) พร้อมใบอนุญาตที่เกี่ยวข้อง',
      'ตรวจร่างใบขนสินค้าขาเข้าก่อนยื่น ให้ตรงกับ Invoice ทั้งราคาและจำนวน',
      'ชำระอากรและติดตามการตรวจปล่อยสินค้า แจ้งคลังสินค้าเมื่อได้กำหนดรับ',
    ]),
    h2('3. เอกสารแนบ'),
    ul(['Commercial Invoice', 'Packing List', 'Bill of Lading / Air Waybill', 'ใบอนุญาตนำเข้า (ถ้ามี)']),
  );
}

