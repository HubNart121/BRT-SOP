import 'server-only';
import { doc, docToText, h2, ol, p, ul } from '@/lib/shared/content';
import type { Database } from './db';
import type { TiptapDoc } from '@/lib/shared/types';

/**
 * Demo data for local development (PGlite only — never runs against DATABASE_URL).
 * Users log in through the dev login screen; there are no passwords.
 */
export async function seedDemoData(db: Database): Promise<void> {
  await db.tx(async (q) => {
    const users = [
      ['admin@brt.local', 'ผู้ดูแลระบบ (ทดลอง)', 'ADMIN'],
      ['author@brt.local', 'ผู้เขียน (ทดลอง)', 'AUTHOR'],
      ['reviewer@brt.local', 'ผู้ตรวจทาน (ทดลอง)', 'REVIEWER'],
      ['approver@brt.local', 'ผู้อนุมัติ (ทดลอง)', 'APPROVER'],
      ['viewer@brt.local', 'พนักงานคลังสินค้า (ทดลอง)', 'VIEWER'],
    ];
    const ids: Record<string, string> = {};
    for (const [email, name, role] of users) {
      const { rows } = await q.query(
        `insert into app_users (email, full_name, role) values ($1, $2, $3) returning id`,
        [email, name, role],
      );
      ids[role] = rows[0].id;
    }
    const cats: Record<string, string> = {};
    for (const r of (await q.query(`select id, slug from sop_categories`)).rows) cats[r.slug] = r.id;

    const author = ids.AUTHOR;
    const reviewer = ids.REVIEWER;
    const approver = ids.APPROVER;

    async function sop(code: string, title: string, cat: string): Promise<string> {
      const { rows } = await q.query(
        `insert into sops (code, title, owner_id, created_at, updated_at)
         values ($1, $2, $3, now() - interval '60 days', now() - interval '60 days') returning id`,
        [code, title, author],
      );
      await q.query(`insert into sop_category_links (sop_id, category_id) values ($1, $2)`, [rows[0].id, cats[cat]]);
      await q.query(`insert into audit_events (actor_id, sop_id, event_type, metadata, created_at)
                     values ($1, $2, 'SOP_CREATED', $3, now() - interval '60 days')`, [
        author,
        rows[0].id,
        JSON.stringify({ code, title }),
      ]);
      return rows[0].id;
    }

    async function version(
      sopId: string,
      rev: number,
      title: string,
      content: TiptapDoc,
      opts: { state: string; label?: string; daysAgo: number; supersededDaysAgo?: number; note?: string },
    ): Promise<string> {
      const published = opts.state === 'PUBLISHED' || opts.state === 'SUPERSEDED';
      const { rows } = await q.query(
        `insert into sop_versions (sop_id, revision_no, state, version_label, title, content_json, content_text,
                                   change_note, created_by, updated_by, created_at, updated_at, submitted_at,
                                   published_at, published_by, effective_date, superseded_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9,
                 now() - make_interval(days => $10 + 3), now() - make_interval(days => $10),
                 case when $3 <> 'DRAFT' then now() - make_interval(days => $10 + 2) end,
                 case when $11 then now() - make_interval(days => $10) end,
                 case when $11 then $12::uuid end,
                 case when $11 then ((now() - make_interval(days => $10)) at time zone 'Asia/Bangkok')::date end,
                 case when $13::int is not null then now() - make_interval(days => $13::int) end)
         returning id`,
        [
          sopId,
          rev,
          opts.state,
          opts.label ?? null,
          title,
          JSON.stringify(content),
          docToText(content),
          opts.note ?? '',
          author,
          opts.daysAgo,
          published,
          approver,
          opts.supersededDaysAgo ?? null,
        ],
      );
      const vid: string = rows[0].id;
      if (published) {
        await q.query(
          `insert into approval_steps (version_id, attempt_no, step_no, step_type, assignee_id, state, comment,
                                       decided_by, decided_at, created_at)
           values ($1, 1, 1, 'REVIEW', $2, 'APPROVED', '', $2, now() - make_interval(days => $4 + 1), now() - make_interval(days => $4 + 2)),
                  ($1, 1, 2, 'APPROVE', $3, 'APPROVED', '', $3, now() - make_interval(days => $4), now() - make_interval(days => $4 + 2))`,
          [vid, reviewer, approver, opts.daysAgo],
        );
        await q.query(
          `insert into audit_events (actor_id, sop_id, version_id, event_type, metadata, created_at)
           values ($1, $2, $3, 'PUBLISHED', $4, now() - make_interval(days => $5))`,
          [approver, sopId, vid, JSON.stringify({ label: opts.label, attempt_no: 1 }), opts.daysAgo],
        );
      }
      if (opts.state === 'PUBLISHED') {
        await q.query(`update sops set published_version_id = $2, title = $3, updated_at = now() - make_interval(days => $4)
                        where id = $1`, [sopId, vid, title, opts.daysAgo]);
      }
      return vid;
    }

    // ── SOP-SAL-001: 1.0 superseded by 1.1 ──
    const sal = await sop('SOP-SAL-001', 'รับคำขอใบเสนอราคา (RFQ) และออกใบเสนอราคา', 'sales');
    await version(sal, 1, 'รับคำขอใบเสนอราคา (RFQ) และออกใบเสนอราคา', salContent(false), {
      state: 'SUPERSEDED',
      label: '1.0',
      daysAgo: 50,
      supersededDaysAgo: 12,
    });
    await version(sal, 2, 'รับคำขอใบเสนอราคา (RFQ) และออกใบเสนอราคา', salContent(true), {
      state: 'PUBLISHED',
      label: '1.1',
      daysAgo: 12,
      note: 'ลดระยะเวลาตอบกลับลูกค้าเหลือ 2 วันทำการ และเพิ่มตัวชี้วัด',
    });

    // ── SOP-PUR-001 / SOP-WH-001: published 1.0 ──
    const pur = await sop('SOP-PUR-001', 'สั่งซื้อสินค้าและติดตามซัพพลายเออร์', 'purchasing');
    await version(pur, 1, 'สั่งซื้อสินค้าและติดตามซัพพลายเออร์', purContent(), { state: 'PUBLISHED', label: '1.0', daysAgo: 30 });
    const wh1 = await sop('SOP-WH-001', 'รับเข้า ตรวจสอบ และจัดเก็บสินค้าในคลัง', 'warehouse');
    await version(wh1, 1, 'รับเข้า ตรวจสอบ และจัดเก็บสินค้าในคลัง', wh1Content(), { state: 'PUBLISHED', label: '1.0', daysAgo: 21 });

    // ── SOP-WH-002: draft ──
    const wh2 = await sop('SOP-WH-002', 'หยิบ แพ็ค และจัดส่งสินค้า', 'warehouse');
    await version(wh2, 1, 'หยิบ แพ็ค และจัดส่งสินค้า', wh2Content(), { state: 'DRAFT', daysAgo: 2 });

    // ── SOP-IMP-001: in review, 2nd attempt (1st rejected by the reviewer) ──
    const imp = await sop('SOP-IMP-001', 'เตรียมเอกสารนำเข้าสินค้าและตรวจสอบความถูกต้อง', 'import');
    const impV = await version(imp, 1, 'เตรียมเอกสารนำเข้าสินค้าและตรวจสอบความถูกต้อง', impContent(), {
      state: 'IN_REVIEW',
      daysAgo: 1,
      note: 'เพิ่มขั้นตอนตรวจร่างใบขนสินค้าตามที่ผู้ตรวจทานแนะนำ',
    });
    await q.query(
      `insert into approval_steps (version_id, attempt_no, step_no, step_type, assignee_id, state, comment, decided_by, decided_at, created_at)
       values ($1, 1, 1, 'REVIEW', $2, 'REJECTED', 'กรุณาเพิ่มขั้นตอนตรวจร่างใบขนสินค้าก่อนยื่น และระบุเอกสารแนบให้ครบ', $2, now() - interval '3 days', now() - interval '4 days'),
              ($1, 1, 2, 'APPROVE', $3, 'CANCELLED', '', null, null, now() - interval '4 days'),
              ($1, 2, 1, 'REVIEW', $2, 'PENDING', '', null, null, now() - interval '1 day'),
              ($1, 2, 2, 'APPROVE', $3, 'WAITING', '', null, null, now() - interval '1 day')`,
      [impV, reviewer, approver],
    );
    await q.query(
      `insert into audit_events (actor_id, sop_id, version_id, event_type, metadata, created_at) values
         ($1, $3, $4, 'SUBMITTED', '{"attempt_no":1}', now() - interval '4 days'),
         ($2, $3, $4, 'REVIEW_REJECTED', '{"attempt_no":1}', now() - interval '3 days'),
         ($1, $3, $4, 'SUBMITTED', '{"attempt_no":2}', now() - interval '1 day')`,
      [author, reviewer, imp, impV],
    );
  });
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

