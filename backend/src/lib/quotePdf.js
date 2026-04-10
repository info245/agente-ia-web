import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

function money(value, currency = "EUR") {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount);
}

function safe(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getBillingLabel(content = {}) {
  const explicit = String(content.billing_label || "").trim();
  if (explicit) return explicit;

  const type = String(content.billing_type || "monthly").trim();
  if (type === "monthly") return "Mensual";
  if (type === "one_time") return "Pago unico";
  if (type === "custom") return "Personalizado";
  return "Mensual";
}

function drawWrappedLabelValue(doc, { x, y, width, label, value, fill = "#ffffff22", border = "#ffffff33" }) {
  doc
    .roundedRect(x, y, width, 58, 14)
    .fillAndStroke(fill, border);

  doc
    .fillColor("#FCEEFF")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(label, x + 12, y + 10, { width: width - 24 });

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(value, x + 12, y + 28, {
      width: width - 24,
      height: 22,
      ellipsis: true,
    });
}

function writeSectionTitle(doc, text, y) {
  doc
    .fillColor("#201A14")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(text, 54, y);
}

function drawTableHeader(doc, startX, y, widths) {
  const titles = ["Concepto", "Cantidad", "Precio unitario", "Importe"];
  let currentX = startX;

  titles.forEach((title, index) => {
    doc
      .fillColor("#EFE1FF")
      .rect(currentX, y, widths[index], 28)
      .fill("#EFE1FF");

    doc
      .fillColor("#241B14")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(title, currentX + 10, y + 9, {
        width: widths[index] - 20,
        align: index === 0 ? "left" : "right",
      });

    currentX += widths[index];
  });
}

function drawTableRow(doc, startX, y, widths, row, currency) {
  const qty = Number.isFinite(Number(row?.quantity)) ? Number(row.quantity) : 0;
  const unitPrice = Number.isFinite(Number(row?.unit_price)) ? Number(row.unit_price) : 0;
  const lineTotal = qty * unitPrice;
  const values = [
    safe(row?.concept),
    String(qty),
    money(unitPrice, currency),
    money(lineTotal, currency),
  ];

  let currentX = startX;
  values.forEach((value, index) => {
    doc
      .lineWidth(0.5)
      .strokeColor("#D9CFBF")
      .rect(currentX, y, widths[index], 34)
      .stroke();

    doc
      .fillColor("#2A231D")
      .font(index === 0 ? "Helvetica" : "Helvetica-Bold")
      .fontSize(10)
      .text(value, currentX + 10, y + 10, {
        width: widths[index] - 20,
        align: index === 0 ? "left" : "right",
        ellipsis: true,
      });

    currentX += widths[index];
  });
}

export async function renderQuotePdfBuffer({
  lead = {},
  quote = {},
  logoPath = "",
} = {}) {
  const content = quote?.content_json || {};
  const items = Array.isArray(content.items) ? content.items : [];
  const billingLabel = getBillingLabel(content);
  const currency = quote?.currency || "EUR";
  const subtotal = Number.isFinite(Number(quote?.subtotal)) ? Number(quote.subtotal) : 0;
  const tax = Number.isFinite(Number(quote?.tax)) ? Number(quote.tax) : 0;
  const total = Number.isFinite(Number(quote?.total)) ? Number(quote.total) : 0;
  const taxRate = Number.isFinite(Number(content.tax_rate)) ? Number(content.tax_rate) : 0;
  const assumptions = String(content.assumptions || "").trim();
  const leadName = safe(lead?.name || lead?.phone || lead?.email || "Cliente");

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: {
      Title: safe(quote?.title, "Propuesta comercial"),
      Author: "TMedia Global",
    },
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFF9F1");

  const heroHeight = 224;
  doc
    .save()
    .rect(0, 0, doc.page.width, heroHeight)
    .fill("#E95877")
    .restore();
  doc
    .save()
    .polygon(
      [doc.page.width * 0.55, 0],
      [doc.page.width, 0],
      [doc.page.width, heroHeight],
      [doc.page.width * 0.72, heroHeight]
    )
    .fill("#7F54FF")
    .restore();

  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, 54, 34, { fit: [102, 102] });
  }

  doc
    .fillColor("#FFEAF4")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("TMEDIA GLOBAL", 54, 124);

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(safe(quote?.title, "Propuesta comercial"), 54, 146, {
      width: 380,
      height: 66,
      ellipsis: true,
    });

  doc
    .fillColor("#FFF5FB")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(
      safe(content.summary, "Propuesta personalizada preparada a partir de la informacion recogida en el CRM."),
      54,
      190,
      { width: 460, height: 40, ellipsis: true }
    );

  doc
    .roundedRect(doc.page.width - 118, 34, 72, 26, 999)
    .fillAndStroke("#FFFFFF22", "#FFFFFF33");
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(safe(quote?.status, "draft"), doc.page.width - 100, 42, {
      width: 36,
      align: "center",
    });

  drawWrappedLabelValue(doc, {
    x: 54,
    y: 246,
    width: 150,
    label: "Cliente",
    value: leadName,
  });
  drawWrappedLabelValue(doc, {
    x: 220,
    y: 246,
    width: 170,
    label: "Servicio",
    value: safe(lead?.interest_service),
  });
  drawWrappedLabelValue(doc, {
    x: 406,
    y: 246,
    width: 136,
    label: "Contacto",
    value: safe(lead?.email || lead?.phone),
  });

  let y = 332;
  writeSectionTitle(doc, "Alcance", y);
  y += 30;
  doc
    .fillColor("#2A231D")
    .font("Helvetica")
    .fontSize(11)
    .text(safe(content.scope, quote?.title || ""), 54, y, {
      width: doc.page.width - 108,
      lineGap: 4,
    });

  y = Math.max(y + doc.heightOfString(safe(content.scope, quote?.title || ""), {
    width: doc.page.width - 108,
    lineGap: 4,
  }) + 26, 430);

  doc.moveTo(54, y - 8).lineTo(doc.page.width - 54, y - 8).strokeColor("#D9CFBF").stroke();
  writeSectionTitle(doc, "Partidas", y + 16);
  y += 52;

  const widths = [250, 80, 110, 110];
  drawTableHeader(doc, 54, y, widths);
  y += 28;

  if (items.length) {
    items.forEach((item) => {
      if (y > 690) {
        doc.addPage({ margin: 0 });
        doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFF9F1");
        y = 54;
        drawTableHeader(doc, 54, y, widths);
        y += 28;
      }
      drawTableRow(doc, 54, y, widths, item, currency);
      y += 34;
    });
  } else {
    doc
      .lineWidth(0.5)
      .strokeColor("#D9CFBF")
      .rect(54, y, widths.reduce((a, b) => a + b, 0), 40)
      .stroke();
    doc
      .fillColor("#756B61")
      .font("Helvetica")
      .fontSize(10)
      .text("Todavia no hay partidas en este presupuesto.", 54, y + 13, {
        width: widths.reduce((a, b) => a + b, 0),
        align: "center",
      });
    y += 40;
  }

  const totalsBoxWidth = 240;
  const totalsX = doc.page.width - 54 - totalsBoxWidth;
  const rowWidth = totalsBoxWidth;
  const rowHeight = 32;
  const rows = [
    ["Subtotal", money(subtotal, currency), "#FFFFFF", "#D9CFBF", "#241B14"],
    [`IVA (${taxRate}%)`, money(tax, currency), "#FFFFFF", "#D9CFBF", "#241B14"],
    ["Total", money(total, currency), "#EFE1FF", "#D1B7FF", "#241B14"],
  ];

  y += 18;
  rows.forEach(([label, value, fill, stroke, textColor]) => {
    doc.roundedRect(totalsX, y, rowWidth, rowHeight, 12).fillAndStroke(fill, stroke);
    doc
      .fillColor(textColor)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(label, totalsX + 12, y + 10, { width: 100 });
    doc
      .fillColor(textColor)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(value, totalsX + 112, y + 10, { width: 116, align: "right" });
    y += rowHeight + 10;
  });

  doc
    .roundedRect(totalsX + 92, y, 148, 26, 999)
    .fillAndStroke("#EFE1FF", "#D1B7FF");
  doc
    .fillColor("#5A2AA8")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(`Precio ${billingLabel.toLowerCase()}`, totalsX + 92, y + 8, {
      width: 148,
      align: "center",
    });

  y += 48;
  if (y > 720) {
    doc.addPage({ margin: 0 });
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFF9F1");
    y = 54;
  }

  writeSectionTitle(doc, "Mensaje de la propuesta", y);
  y += 30;
  doc
    .fillColor("#2A231D")
    .font("Helvetica")
    .fontSize(11)
    .text(safe(content.body, ""), 54, y, {
      width: doc.page.width - 108,
      lineGap: 4,
    });

  y += doc.heightOfString(safe(content.body, ""), {
    width: doc.page.width - 108,
    lineGap: 4,
  }) + 28;

  if (assumptions) {
    if (y > 700) {
      doc.addPage({ margin: 0 });
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFF9F1");
      y = 54;
    }
    writeSectionTitle(doc, "Supuestos y notas", y);
    y += 30;
    doc
      .fillColor("#2A231D")
      .font("Helvetica")
      .fontSize(11)
      .text(assumptions, 54, y, {
        width: doc.page.width - 108,
        lineGap: 4,
      });
    y += doc.heightOfString(assumptions, {
      width: doc.page.width - 108,
      lineGap: 4,
    }) + 28;
  }

  if (y > 740) {
    doc.addPage({ margin: 0 });
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFF9F1");
    y = 54;
  }

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#756B61")
    .text(
      "Esta propuesta ha sido generada desde el CRM interno de TMedia Global y puede editarse antes de su envio definitivo por email o WhatsApp.",
      54,
      Math.max(y, 760),
      {
        width: doc.page.width - 108,
        lineGap: 3,
      }
    );

  doc.end();
  return done;
}
