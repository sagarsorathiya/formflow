import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApprovalTrailEntry {
  stepKey: string;
  stepLabel: string;
  actorName: string;
  status: string;
  actedAt: Date | null;
  comment: string | null;
}

export interface PdfSubmissionData {
  serialNo: string | null;
  formTitle: string;
  submitterName: string;
  submitterDept: string | null;
  submitterDesignation: string | null;
  submittedAt: Date;
  completedAt: Date | null;
  fields: { label: string; value: string }[];
  trail: ApprovalTrailEntry[];
}

// ─── Page geometry ────────────────────────────────────────────────────────────

const PAGE_W = 595;  // A4 portrait
const PAGE_H = 842;
const ML = 48;       // left margin
const MR = 48;       // right margin
const CW = PAGE_W - ML - MR;  // content width = 499

// ─── Colour palette ───────────────────────────────────────────────────────────

const C_NAVY    = rgb(0.07, 0.10, 0.19);   // #12183 dark header bg
const C_ORANGE  = rgb(0.976, 0.451, 0.086);// #f97316 brand orange
const C_WHITE   = rgb(1, 1, 1);
const C_INK     = rgb(0.09, 0.10, 0.14);   // near-black body text
const C_LABEL   = rgb(0.40, 0.43, 0.50);   // muted label colour
const C_STRIPE  = rgb(0.955, 0.958, 0.968);// alternating row stripe
const C_LINE    = rgb(0.85, 0.86, 0.89);   // horizontal rule
const C_GREEN   = rgb(0.05, 0.50, 0.26);
const C_RED     = rgb(0.72, 0.10, 0.10);
const C_VIOLET  = rgb(0.42, 0.15, 0.72);
const C_SLATE   = rgb(0.34, 0.37, 0.44);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// WinAnsi-safe — Helvetica can't render ₹ € £ etc.
function enc(text: string): string {
  return text
    .replace(/₹/g, "Rs.")
    .replace(/€/g, "EUR")
    .replace(/£/g, "GBP")
    .replace(/¥/g, "JPY")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Tabs/newlines (pasted text, textareas) and other control chars are not in
    // WinAnsi — pdf-lib throws on them and the PDF job fails permanently.
    .replace(/[\t\r\n]+/g, " ")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .replace(/[^\x20-\xFF]/g, "?");
}

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  const s = enc(text);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const c = s.slice(0, mid) + "...";
    if (font.widthOfTextAtSize(c, size) <= maxW) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo) + "...";
}

function statusColor(status: string): ReturnType<typeof rgb> {
  switch (status) {
    case "APPROVED":  return C_GREEN;
    case "REJECTED":  return C_RED;
    case "RETURNED":  return C_VIOLET;
    case "SKIPPED":   return C_SLATE;
    default:          return C_ORANGE;
  }
}

// ─── Drawing context ──────────────────────────────────────────────────────────

interface Ctx {
  page: PDFPage;
  y: number;
  bold: PDFFont;
  reg: PDFFont;
  doc: PDFDocument;
}

function nextPage(ctx: Ctx): Ctx {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  return { ...ctx, page, y: PAGE_H - 56 };
}

function ensure(ctx: Ctx, needed: number): Ctx {
  return ctx.y - needed < 48 ? nextPage(ctx) : ctx;
}

interface TextOpts {
  size?: number;
  font?: PDFFont;
  color?: ReturnType<typeof rgb>;
  maxW?: number;
}

function draw(ctx: Ctx, str: string, x: number, opts: TextOpts = {}): void {
  const { size = 9.5, color = C_INK, font } = opts;
  const f = font ?? ctx.reg;
  const mw = opts.maxW ?? CW - (x - ML);
  ctx.page.drawText(fit(str, f, size, mw), { x, y: ctx.y, size, font: f, color });
}

function rule(ctx: Ctx, x1 = ML, x2 = ML + CW, thick = 0.4, color = C_LINE) {
  ctx.page.drawLine({ start: { x: x1, y: ctx.y }, end: { x: x2, y: ctx.y }, thickness: thick, color });
}

function fill(ctx: Ctx, x: number, yOff: number, w: number, h: number, color: ReturnType<typeof rgb>) {
  ctx.page.drawRectangle({ x, y: ctx.y + yOff, width: w, height: h, color });
}

// ─── Section heading ──────────────────────────────────────────────────────────

function section(ctx: Ctx, title: string): Ctx {
  ctx = ensure(ctx, 32);
  ctx.y -= 6;
  // Orange pill label
  const tw = ctx.bold.widthOfTextAtSize(title, 7.5);
  ctx.page.drawRectangle({ x: ML, y: ctx.y - 3, width: tw + 16, height: 16, color: C_ORANGE });
  ctx.page.drawText(title, { x: ML + 8, y: ctx.y + 1, size: 7.5, font: ctx.bold, color: C_WHITE });
  ctx.y -= 6;
  rule(ctx, ML, ML + CW, 0.6, C_LINE);
  ctx.y -= 16;
  return ctx;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateApprovedPdf(data: PdfSubmissionData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  const first = doc.addPage([PAGE_W, PAGE_H]);
  let ctx: Ctx = { page: first, y: PAGE_H, bold, reg, doc };

  // ── HEADER BAR ─────────────────────────────────────────────────────────────
  first.drawRectangle({ x: 0, y: PAGE_H - 68, width: PAGE_W, height: 68, color: C_NAVY });
  // Orange left stripe
  first.drawRectangle({ x: 0, y: PAGE_H - 68, width: 5, height: 68, color: C_ORANGE });

  // "FormFlow" wordmark
  first.drawText("FormFlow", { x: ML + 4, y: PAGE_H - 28, size: 24, font: bold, color: C_WHITE });

  // Form title beneath
  first.drawText(fit(data.formTitle, reg, 9, CW - 160), {
    x: ML + 4, y: PAGE_H - 52, size: 9, font: reg,
    color: rgb(0.68, 0.72, 0.84),
  });

  // "APPROVED – OFFICIAL COPY" badge on right
  const bText = "APPROVED - OFFICIAL COPY";
  const bW = bold.widthOfTextAtSize(bText, 7.5) + 20;
  const bX = PAGE_W - MR - bW;
  first.drawRectangle({ x: bX, y: PAGE_H - 46, width: bW, height: 18, color: C_ORANGE });
  first.drawText(bText, { x: bX + 10, y: PAGE_H - 38, size: 7.5, font: bold, color: C_WHITE });

  ctx.y = PAGE_H - 82;

  // ── SUBMISSION INFO CARD ───────────────────────────────────────────────────
  const INFO_H = 82;
  first.drawRectangle({ x: ML - 10, y: ctx.y - INFO_H + 12, width: CW + 20, height: INFO_H, color: C_STRIPE });
  first.drawRectangle({ x: ML - 10, y: ctx.y - INFO_H + 12, width: 4,       height: INFO_H, color: C_ORANGE });

  // Serial number
  const serial = data.serialNo ? `#${data.serialNo}` : "No Serial";
  first.drawText(enc(serial), { x: ML + 4, y: ctx.y, size: 20, font: bold, color: C_INK });
  ctx.y -= 26;

  const col2 = ML + CW / 2 + 8;

  // Row 1 labels
  draw(ctx, "SUBMITTED BY", ML + 4, { size: 7, font: bold, color: C_LABEL });
  draw(ctx, "DEPARTMENT",   col2,   { size: 7, font: bold, color: C_LABEL });
  ctx.y -= 12;
  draw(ctx, enc(data.submitterName), ML + 4, { size: 10, font: bold, color: C_INK, maxW: CW / 2 - 8 });
  draw(ctx, enc(data.submitterDept ?? "-"), col2, { size: 10, font: bold, color: C_INK, maxW: CW / 2 - 8 });
  ctx.y -= 18;

  // Row 2 labels
  draw(ctx, "DESIGNATION", ML + 4, { size: 7, font: bold, color: C_LABEL });
  draw(ctx, "DATE",         col2,  { size: 7, font: bold, color: C_LABEL });
  ctx.y -= 12;
  draw(ctx, enc(data.submitterDesignation ?? "-"), ML + 4, { size: 10, color: C_INK, maxW: CW / 2 - 8 });
  const subDate  = data.submittedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const appDate  = data.completedAt
    ? "   Approved: " + data.completedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  draw(ctx, subDate + appDate, col2, { size: 10, color: C_INK, maxW: CW / 2 - 8 });

  ctx.y -= 20;

  // ── FORM DATA ──────────────────────────────────────────────────────────────
  ctx = section(ctx, "FORM DATA");

  const LCOL = 160;          // label column width
  const VCOL_X = ML + LCOL + 12;
  const VCOL_W = CW - LCOL - 12;
  const ROW_H = 24;

  for (let i = 0; i < data.fields.length; i++) {
    const field = data.fields[i];
    ctx = ensure(ctx, ROW_H + 4);

    // Alternating row background
    if (i % 2 === 0) {
      fill(ctx, ML - 6, -(ROW_H - 8), CW + 12, ROW_H, C_STRIPE);
    }

    draw(ctx, enc(field.label), ML, { size: 8.5, font: bold, color: C_LABEL, maxW: LCOL });
    draw(ctx, enc(field.value || "-"), VCOL_X, { size: 9.5, color: C_INK, maxW: VCOL_W });
    ctx.y -= 4;
    rule(ctx, ML - 6, ML + CW + 6, 0.3);
    ctx.y -= ROW_H;
  }

  ctx.y -= 12;

  // ── APPROVAL TRAIL ─────────────────────────────────────────────────────────
  ctx = section(ctx, "APPROVAL TRAIL");

  for (const entry of data.trail) {
    const hasComment = !!entry.comment;
    const CARD_H = hasComment ? 70 : 54;
    ctx = ensure(ctx, CARD_H + 10);

    const sc = statusColor(entry.status);

    // Card background
    fill(ctx, ML - 8, -(CARD_H - 12), CW + 16, CARD_H, C_STRIPE);
    // Status-coloured left stripe
    fill(ctx, ML - 8, -(CARD_H - 12), 4, CARD_H, sc);

    // Step name
    draw(ctx, enc(entry.stepLabel), ML + 6, { size: 11, font: bold, color: C_INK });

    // Status badge (right-aligned)
    const sText = entry.status;
    const sW = bold.widthOfTextAtSize(sText, 8) + 16;
    const sX = ML + CW - sW;
    ctx.page.drawRectangle({ x: sX, y: ctx.y - 11, width: sW, height: 17, color: sc });
    ctx.page.drawText(sText, { x: sX + 8, y: ctx.y - 7, size: 8, font: bold, color: C_WHITE });

    ctx.y -= 17;

    // Actor + timestamp
    const ts = entry.actedAt
      ? entry.actedAt.toLocaleString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
        })
      : "Pending";
    draw(ctx, enc(entry.actorName) + "     ·     " + ts, ML + 6, { size: 8.5, color: C_LABEL });
    ctx.y -= 14;

    if (hasComment) {
      draw(ctx, "Comment:  " + enc(entry.comment!), ML + 6, { size: 8.5, color: C_INK, maxW: CW - 14 });
      ctx.y -= 14;
    }

    ctx.y -= 14;
    rule(ctx, ML - 8, ML + CW + 8, 0.3);
    ctx.y -= 8;
  }

  // ── FOOTER ON EVERY PAGE ───────────────────────────────────────────────────
  const pages = doc.getPages();
  const genAt = enc(
    new Date().toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    })
  );
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawLine({ start: { x: ML, y: 32 }, end: { x: PAGE_W - MR, y: 32 }, thickness: 0.4, color: C_LINE });
    p.drawText(`FormFlow  ·  ${genAt}  ·  System-generated official document`, {
      x: ML, y: 18, size: 7.5, font: reg, color: C_LABEL,
    });
    const pgText = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pgText, {
      x: PAGE_W - MR - bold.widthOfTextAtSize(pgText, 7.5),
      y: 18, size: 7.5, font: bold, color: C_LABEL,
    });
  }

  return doc.save();
}
