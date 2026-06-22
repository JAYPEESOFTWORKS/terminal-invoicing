import { useState, useEffect, useCallback, useRef } from "react";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#0f1117", surface: "#161b22", surfaceHover: "#1c2333",
  border: "#21262d", accent: "#00b4d8", accentDim: "#023e8a",
  accentText: "#90e0ef", success: "#3fb950", warning: "#d29922",
  danger: "#f85149", muted: "#8b949e", text: "#e6edf3",
  textDim: "#b1bac4", amber: "#e3b341",
};

// ─── API client ──────────────────────────────────────────────────────────────────────────────
// When running via `node server.js` the UI is on the same origin so API_BASE="/api".
// During Vite dev on a different port set VITE_API_URL=http://localhost:4000/api
// Safe in both ESM (Vite) and non-module (artifact/CRA) environments
const API_BASE = "/api";

async function apiFetch(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
const apiGET    = p     => apiFetch("GET",    p);
const apiPOST   = (p,b) => apiFetch("POST",   p, b);
const apiPUT    = (p,b) => apiFetch("PUT",    p, b);
const apiDELETE = p     => apiFetch("DELETE", p);

// ─── Empty defaults (shown while loading) ──────────────────────────────────────────────────────────────
const defaultConfig = {
  company: { name: "", email: "", address: "", city_state_zip: "", phone: "", logo_path: "" },
  email: { provider: "mailgun", from: "", mailgun_domain: "", mailgun_api_key: "" },
  invoice_template: { subject: "", body: "" },
  state: { next_invoice_number: 1 },
};
// Layout/provider lists — server returns real values; these show while loading
const allLayouts = [
  { name: "default", description: "Clean, professional layout with logo support", author: "JAYPEESOFTWORKS", version: "1.0.0" },
  { name: "minimal", description: "Minimal one-page layout", author: "JAYPEESOFTWORKS", version: "1.0.0" },
  { name: "modern", description: "Modern color-accented layout", author: "Community", version: "0.9.0" },
];
const emailProviders = [
  { name: "mailgun", description: "Mailgun transactional email", status: "configured" },
  { name: "sendgrid", description: "SendGrid email delivery", status: "available" },
  { name: "smtp", description: "Generic SMTP provider", status: "available" },
];

// ─── Utilities ─────────────────────────────────────────────────────────────────
const fmt = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
const fmtDate = s => {
  if (!s) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const itemPrice = it => it ? (it.unit_price ?? it.rate ?? 0) : 0;
const itemName  = it => it ? (it.name || it.description || it.id || "") : "";
const calcTotal = (lineItems, catalog) => lineItems.reduce((s, li) => {
  const it = catalog.find(i => i.id === li.item_id);
  return s + itemPrice(it) * (li.qty ?? it?.quantity ?? 1);
}, 0);
const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Minimal YAML parser (subset: maps, lists, scalars, multiline |) ──────────
function parseYAML(text) {
  const lines = text.split("\n");
  function parseValue(val) {
    if (val === "true") return true;
    if (val === "false") return false;
    if (val === "null" || val === "~" || val === "") return null;
    if (!isNaN(val) && val.trim() !== "") return Number(val);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      return val.slice(1, -1);
    return val;
  }
  function getIndent(line) { return line.match(/^(\s*)/)[1].length; }

  function parseBlock(startLine, baseIndent) {
    let obj = null; let arr = null; let i = startLine;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue; }
      const indent = getIndent(line);
      if (indent < baseIndent) break;
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) {
        if (!arr) arr = [];
        const rest = trimmed.slice(2).trim();
        if (rest === "") {
          const [child, nextI] = parseBlock(i + 1, indent + 2);
          arr.push(child); i = nextI;
        } else {
          const colonIdx = rest.indexOf(":");
          if (colonIdx > 0) {
            const [child, nextI] = parseBlock(i, indent);
            // treat as object inside list
            if (!Array.isArray(child)) arr.push(child);
            i = nextI;
          } else { arr.push(parseValue(rest)); i++; }
        }
      } else if (trimmed.startsWith("-")) {
        if (!arr) arr = [];
        arr.push({}); i++;
      } else {
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx > 0) {
          if (!obj) obj = {};
          const key = trimmed.slice(0, colonIdx).trim();
          const rest = trimmed.slice(colonIdx + 1).trim();
          if (rest === "|" || rest === ">") {
            // multiline
            let mlLines = []; i++;
            while (i < lines.length) {
              const ml = lines[i];
              if (ml.trim() === "" || getIndent(ml) > indent) { mlLines.push(ml.trim()); i++; }
              else break;
            }
            obj[key] = mlLines.join("\n");
          } else if (rest === "" || rest === "{}" || rest === "[]") {
            const [child, nextI] = parseBlock(i + 1, indent + 2);
            obj[key] = child || (rest === "[]" ? [] : {}); i = nextI;
          } else { obj[key] = parseValue(rest); i++; }
        } else { i++; }
      }
    }
    return [arr || obj || {}, i];
  }
  try {
    const [result] = parseBlock(0, 0);
    return result;
  } catch (e) { return null; }
}

// ─── YAML serializer ───────────────────────────────────────────────────────────
function toYAML(obj, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]\n";
    return obj.map(item => {
      if (typeof item === "object" && item !== null) {
        const inner = toYAML(item, indent + 2);
        const firstLine = inner.split("\n")[0];
        return `${pad}- ${inner.slice(indent + 2).trimStart()}`;
      }
      return `${pad}- ${item}\n`;
    }).join("");
  }
  if (typeof obj === "object" && obj !== null) {
    return Object.entries(obj).map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return `${pad}${k}:\n${toYAML(v, indent + 2)}`;
      }
      if (typeof v === "string" && v.includes("\n")) {
        return `${pad}${k}: |\n${v.split("\n").map(l => `${pad}  ${l}`).join("\n")}\n`;
      }
      return `${pad}${k}: ${v === null ? "null" : v}\n`;
    }).join("");
  }
  return `${pad}${obj}\n`;
}

// ─── PDF Preview Canvas Renderer ───────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
function InvoicePDFPreview_UNUSED({ invoice, customer, lineItems, catalog, config, layout }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const mm = W / 210; // scale: 1mm in px (A4 = 210mm wide)
    const margin = 20 * mm;
    const contentW = W - margin * 2;

    // ── Layout: default ────────────────────────────────────────────
    if (layout === "default" || layout === "minimal") {
      // Header bar
      ctx.fillStyle = layout === "default" ? "#0f1117" : "#1a1a2e";
      ctx.fillRect(0, 0, W, 14 * mm);

      // Company name in header
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${4.5 * mm}px 'Inter', sans-serif`;
      ctx.fillText(config.company.name || "Your Company", margin, 9 * mm);

      // INVOICE label
      ctx.font = `bold ${4 * mm}px monospace`;
      ctx.fillStyle = "#90e0ef";
      const invLabel = "INVOICE";
      const lw = ctx.measureText(invLabel).width;
      ctx.fillText(invLabel, W - margin - lw, 9 * mm);

      let y = 22 * mm;

      // Invoice meta block
      const invNum = invoice?.id || "INV-###";
      const today = new Date().toISOString().split("T")[0];
      const dueDate = (() => {
        const d = new Date(); d.setDate(d.getDate() + (invoice?.due_days || 30));
        return d.toISOString().split("T")[0];
      })();

      ctx.fillStyle = "#374151";
      ctx.font = `${3 * mm}px monospace`;
      ctx.fillText(`Invoice #: ${invNum}`, W - margin - 55 * mm, y);
      ctx.fillText(`Date: ${fmtDate(today)}`, W - margin - 55 * mm, y + 5 * mm);
      ctx.fillText(`Due: ${fmtDate(dueDate)}`, W - margin - 55 * mm, y + 10 * mm);

      // Bill From
      ctx.fillStyle = "#6b7280";
      ctx.font = `bold ${2.5 * mm}px sans-serif`;
      ctx.fillText("BILL FROM", margin, y);
      y += 4 * mm;
      ctx.fillStyle = "#111827";
      ctx.font = `bold ${3.5 * mm}px sans-serif`;
      ctx.fillText(config.company.name || "Your Company", margin, y);
      y += 4.5 * mm;
      ctx.fillStyle = "#374151";
      ctx.font = `${3 * mm}px sans-serif`;
      ctx.fillText(config.company.address || "", margin, y);
      y += 4 * mm;
      ctx.fillText(config.company.city_state_zip || "", margin, y);
      y += 4 * mm;
      ctx.fillText(config.company.email || "", margin, y);

      y += 12 * mm;

      // Bill To
      ctx.fillStyle = "#6b7280";
      ctx.font = `bold ${2.5 * mm}px sans-serif`;
      ctx.fillText("BILL TO", margin, y);
      y += 4 * mm;
      ctx.fillStyle = "#111827";
      ctx.font = `bold ${3.5 * mm}px sans-serif`;
      ctx.fillText(customer?.name || "Customer Name", margin, y);
      y += 4.5 * mm;
      ctx.fillStyle = "#374151";
      ctx.font = `${3 * mm}px sans-serif`;
      ctx.fillText(customer?.address || "", margin, y);
      y += 4 * mm;
      ctx.fillText(customer?.city_state_zip || "", margin, y);
      y += 4 * mm;
      ctx.fillText(customer?.email || "", margin, y);

      y += 10 * mm;

      // Table header
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(margin, y, contentW, 8 * mm);
      ctx.fillStyle = "#374151";
      ctx.font = `bold ${2.8 * mm}px sans-serif`;
      ctx.fillText("DESCRIPTION", margin + 3 * mm, y + 5.5 * mm);
      ctx.fillText("QTY", W - margin - 42 * mm, y + 5.5 * mm);
      ctx.fillText("UNIT PRICE", W - margin - 30 * mm, y + 5.5 * mm);
      ctx.fillText("AMOUNT", W - margin - 12 * mm, y + 5.5 * mm);

      y += 8 * mm;

      // Line items
      let subtotal = 0;
      lineItems.forEach((li, idx) => {
        const item = catalog.find(i => i.id === li.item_id);
        if (!item) return;
        const amount = item.unit_price * li.qty;
        subtotal += amount;

        if (idx % 2 === 1) {
          ctx.fillStyle = "#f9fafb";
          ctx.fillRect(margin, y, contentW, 10 * mm);
        }

        ctx.fillStyle = "#111827";
        ctx.font = `${3 * mm}px sans-serif`;
        ctx.fillText(item.name, margin + 3 * mm, y + 4 * mm);

        if (item.detail) {
          ctx.fillStyle = "#6b7280";
          ctx.font = `${2.5 * mm}px sans-serif`;
          ctx.fillText(item.detail, margin + 3 * mm, y + 7.5 * mm);
        }

        ctx.fillStyle = "#374151";
        ctx.font = `${3 * mm}px monospace`;
        ctx.fillText(String(li.qty), W - margin - 42 * mm, y + 5.5 * mm);
        ctx.fillText(fmt(item.unit_price), W - margin - 30 * mm, y + 5.5 * mm);
        ctx.fillText(fmt(amount), W - margin - 12 * mm, y + 5.5 * mm);

        y += 10 * mm;
      });

      // Divider
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(margin, y + 2 * mm);
      ctx.lineTo(W - margin, y + 2 * mm);
      ctx.stroke();
      y += 6 * mm;

      // Totals
      const tax = 0;
      const total = subtotal + tax;
      const totalsX = W - margin - 65 * mm;

      [[`Subtotal`, fmt(subtotal)], [`Tax (0%)`, fmt(tax)], [`TOTAL DUE`, fmt(total)]].forEach(([label, val], i) => {
        const isTotal = label === "TOTAL DUE";
        if (isTotal) {
          ctx.fillStyle = "#0f1117";
          ctx.fillRect(totalsX - 3 * mm, y - 2 * mm, 65 * mm + 3 * mm, 9 * mm);
        }
        ctx.fillStyle = isTotal ? "#ffffff" : "#374151";
        ctx.font = isTotal ? `bold ${3.5 * mm}px sans-serif` : `${3 * mm}px sans-serif`;
        ctx.fillText(label, totalsX, y + 4 * mm);
        ctx.fillText(val, W - margin - 2 * mm - ctx.measureText(val).width, y + 4 * mm);
        y += isTotal ? 10 * mm : 6 * mm;
      });

      y += 8 * mm;

      // Notes
      if (invoice?.notes) {
        ctx.fillStyle = "#6b7280";
        ctx.font = `bold ${2.5 * mm}px sans-serif`;
        ctx.fillText("NOTES", margin, y);
        y += 4 * mm;
        ctx.fillStyle = "#374151";
        ctx.font = `${3 * mm}px sans-serif`;
        ctx.fillText(invoice.notes, margin, y);
        y += 6 * mm;
      }

      // Footer
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, H - 14 * mm, W, 14 * mm);
      ctx.fillStyle = "#9ca3af";
      ctx.font = `${2.5 * mm}px sans-serif`;
      const footer = `${config.company.name} · ${config.company.phone} · ${config.company.email}`;
      ctx.fillText(footer, margin, H - 7 * mm);
    }

    // ── Layout: modern ─────────────────────────────────────────────
    if (layout === "modern") {
      ctx.fillStyle = "#00b4d8";
      ctx.fillRect(0, 0, 8 * mm, H);
      ctx.fillStyle = "#0f1117";
      ctx.fillRect(0, 0, W, 20 * mm);

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${6 * mm}px monospace`;
      ctx.fillText("INVOICE", margin + 10 * mm, 13 * mm);

      ctx.fillStyle = "#00b4d8";
      ctx.font = `bold ${3.5 * mm}px sans-serif`;
      ctx.fillText(config.company.name || "Your Company", W - margin - 60 * mm, 10 * mm);

      let y = 30 * mm;
      ctx.fillStyle = "#111827";
      ctx.font = `bold ${4 * mm}px sans-serif`;
      ctx.fillText(customer?.name || "Customer", margin + 10 * mm, y);
      y += 5 * mm;
      ctx.fillStyle = "#374151";
      ctx.font = `${3 * mm}px sans-serif`;
      ctx.fillText(customer?.email || "", margin + 10 * mm, y);

      y += 12 * mm;
      let subtotal = 0;
      lineItems.forEach((li) => {
        const item = catalog.find(i => i.id === li.item_id);
        if (!item) return;
        const amount = item.unit_price * li.qty;
        subtotal += amount;
        ctx.fillStyle = "#111827";
        ctx.font = `${3.2 * mm}px sans-serif`;
        ctx.fillText(item.name, margin + 10 * mm, y);
        ctx.font = `${3.2 * mm}px monospace`;
        ctx.fillStyle = "#00b4d8";
        ctx.fillText(fmt(amount), W - margin - 20 * mm, y);
        y += 7 * mm;
      });

      ctx.strokeStyle = "#00b4d8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin + 10 * mm, y);
      ctx.lineTo(W - margin, y);
      ctx.stroke();
      y += 6 * mm;

      ctx.fillStyle = "#0f1117";
      ctx.font = `bold ${4.5 * mm}px monospace`;
      ctx.fillText(`TOTAL: ${fmt(subtotal)}`, margin + 10 * mm, y);
    }

  }, [invoice, customer, lineItems, catalog, config, layout]);

  return (
    <canvas
      ref={canvasRef}
      width={794}
      height={1123}
      style={{ width: "100%", height: "auto", border: `1px solid ${C.border}`, borderRadius: 4, display: "block", background: "#fff" }}
    />
  );
}

// ─── PDF Preview Panel ─────────────────────────────────────────────────────────
function PDFPreview({ invoice, customers, items: catalog, config, onClose }) {
  const customer = customers.find(c => c.id === invoice?.customer_id);
  const previewUrl = invoice?.id
    ? (invoice._isHistory
        ? `/api/history/${invoice.id}/pdf-preview`
        : `/api/invoices/${invoice.id}/pdf-preview`)
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 1000, display: "flex" }} onClick={onClose}>
      <div style={{ marginLeft: "auto", width: "min(860px, 95vw)", height: "100%", background: C.surface, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>PDF Preview</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "monospace" }}>{invoice?.id || "new invoice"} · {customer?.name}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {previewUrl && (
              <a href={previewUrl} download={`${invoice.id}.pdf`} style={{ background: C.accent, color: "#000", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>
                ↓ Download PDF
              </a>
            )}
            <button onClick={onClose} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "6px 10px", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>
        {/* Real PDF in iframe */}
        <div style={{ flex: 1, overflow: "hidden", background: "#555" }}>
          {previewUrl
            ? <iframe src={previewUrl} style={{ width: "100%", height: "100%", border: "none" }} title="Invoice PDF Preview" />
            : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontSize: 14 }}>No invoice selected</div>
          }
        </div>
        {/* Footer meta */}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 20, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            <span style={{ color: C.textDim }}>Amount: </span>
            <span style={{ fontFamily: "monospace", color: C.accentText }}>{fmt(calcTotal(invoice?.items || [], catalog))}</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            <span style={{ color: C.textDim }}>Due in: </span>
            <span style={{ fontFamily: "monospace" }}>{invoice?.due_days || 30} days</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            <span style={{ color: C.textDim }}>Layout: </span>
            <span style={{ fontFamily: "monospace" }}>{invoice?.layout || "default"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── YAML Import Panel ─────────────────────────────────────────────────────────
function YAMLImport({ onImport, onClose }) {
  const [tab, setTab] = useState("paste");
  const [text, setText] = useState("");
  const [fileType, setFileType] = useState("customer");
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef(null);

  const EXAMPLE_YAML = {
    customer: `id: my-client\nname: "My Client Inc."\nemail: billing@myclient.com\ncontact: "Alice Johnson"\naddress: "789 Client Road"\ncity_state_zip: "Denver, CO 80202"\nnotes: "Net 15 terms"`,
    item: `id: web-dev\nname: "Web Development"\ntype: service\nunit_price: 1500\ndescription: "Custom web development"\ndetail: "Per project"`,
    invoice: `id: inv-client-monthly\ncustomer_id: my-client\nlayout: default\ndue_days: 30\nnotes: "Thank you!"\nschedule:\n  day_of_month: 1\n  enabled: true\nitems:\n  - item_id: web-dev\n    qty: 1`,
    config: `name: "ACME Dev Shop"\nemail: billing@acmedev.com\naddress: "100 Dev Street"\ncity_state_zip: "San Francisco, CA 94105"\nphone: "415-555-0100"`,
    bulk: `customers:\n  - id: client-a\n    name: "Client A"\n    email: a@client.com\n    contact: "Bob"\n    address: "1 Main St"\n    city_state_zip: "Boston, MA 02101"\n    notes: ""\nitems:\n  - id: design\n    name: "Design Services"\n    type: service\n    unit_price: 2000\n    description: "UI/UX design"\n    detail: ""`,
  };

  const detect = (yaml, name) => {
    if (yaml.customers || yaml.items || yaml.invoices) return "bulk";
    if (name && name.includes("customer")) return "customer";
    if (name && name.includes("item")) return "item";
    if (name && name.includes("invoice")) return "invoice";
    if (name && name.includes("company")) return "config";
    if (yaml.id && yaml.email && yaml.address) return "customer";
    if (yaml.id && yaml.unit_price !== undefined) return "item";
    if (yaml.id && yaml.customer_id) return "invoice";
    if (yaml.name && yaml.phone) return "config";
    return fileType;
  };

  const parse = (rawText, name = "") => {
    setError(null); setParsed(null);
    if (!rawText.trim()) return;
    const result = parseYAML(rawText);
    if (!result) { setError("Could not parse YAML — check the syntax and try again."); return; }
    const detected = detect(result, name);
    setFileType(detected);
    setParsed({ data: result, type: detected });
  };

  const handleText = t => { setText(t); if (t.trim()) parse(t); else { setParsed(null); setError(null); } };

  const handleFile = file => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => { const t = e.target.result; setText(t); parse(t, file.name); };
    reader.readAsText(file);
  };

  const handleDrop = e => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const apply = () => {
    if (!parsed) return;
    onImport(parsed);
  };

  const countRecords = () => {
    if (!parsed) return null;
    const { data, type } = parsed;
    if (type === "bulk") {
      const parts = [];
      if (data.customers) parts.push(`${data.customers.length} customer(s)`);
      if (data.items) parts.push(`${data.items.length} item(s)`);
      if (data.invoices) parts.push(`${data.invoices.length} invoice(s)`);
      return parts.join(", ");
    }
    return `1 ${type}`;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: "min(780px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Import from YAML</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Import customers, items, invoices, or company config from CLI YAML files</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left: input */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, overflow: "hidden" }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, padding: "12px 16px 0", borderBottom: `1px solid ${C.border}` }}>
              {[["paste", "Paste YAML"], ["file", "Upload File"]].map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} style={{ padding: "6px 16px", border: "none", borderBottom: tab === id ? `2px solid ${C.accent}` : "2px solid transparent", background: "none", color: tab === id ? C.accentText : C.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
              {tab === "paste" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={fileType} onChange={e => setFileType(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "5px 10px", fontSize: 12 }}>
                      {[["customer","Customer"],["item","Item"],["invoice","Invoice"],["config","Company Config"],["bulk","Bulk (multiple)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button onClick={() => handleText(EXAMPLE_YAML[fileType] || "")} style={{ background: C.accentDim, color: C.accentText, border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                      Load Example
                    </button>
                  </div>
                  <textarea
                    value={text}
                    onChange={e => handleText(e.target.value)}
                    placeholder={`Paste your ${fileType}.yaml content here…\n\nExample:\n${EXAMPLE_YAML[fileType] || ""}`}
                    style={{ flex: 1, minHeight: 280, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: 14, fontSize: 12, fontFamily: "monospace", lineHeight: 1.7, resize: "none", outline: "none" }}
                  />
                </div>
              )}

              {tab === "file" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    style={{ border: `2px dashed ${dragging ? C.accent : C.border}`, borderRadius: 10, padding: "40px 20px", textAlign: "center", cursor: "pointer", background: dragging ? `${C.accent}11` : "transparent", transition: "all 0.15s" }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                    <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>Drop a .yaml or .yml file here</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>or click to browse</div>
                    {fileName && <div style={{ marginTop: 10, color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>✓ {fileName}</div>}
                    <input ref={fileRef} type="file" accept=".yaml,.yml,.txt" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
                  </div>

                  {text && (
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>File contents</div>
                      <pre style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 11, color: C.textDim, fontFamily: "monospace", maxHeight: 180, overflowY: "auto", margin: 0, whiteSpace: "pre-wrap" }}>
                        {text.slice(0, 800)}{text.length > 800 ? "\n…" : ""}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: preview / result */}
          <div style={{ width: 280, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Parse Result</div>

            {error && (
              <div style={{ background: "#2a1010", border: `1px solid ${C.danger}44`, borderRadius: 8, padding: 12, color: C.danger, fontSize: 12 }}>
                ✗ {error}
              </div>
            )}

            {parsed && !error && (
              <div style={{ background: "#1a3a1a", border: `1px solid ${C.success}44`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.success, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>✓ Valid YAML</div>
                <div style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>
                  Detected type: <span style={{ fontFamily: "monospace", color: C.accentText }}>{parsed.type}</span>
                </div>
                <div style={{ color: C.textDim, fontSize: 12 }}>
                  Will import: <span style={{ color: C.text }}>{countRecords()}</span>
                </div>
              </div>
            )}

            {parsed && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Parsed Structure</div>
                <pre style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, fontSize: 10, color: C.textDim, fontFamily: "monospace", maxHeight: 240, overflowY: "auto", margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(parsed.data, null, 2).slice(0, 600)}
                </pre>
              </div>
            )}

            {!parsed && !error && (
              <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>
                Paste or upload YAML to see a parsed preview here.
                <div style={{ marginTop: 10, fontSize: 11 }}>
                  Supported files:
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    <li>customers/*.yaml</li>
                    <li>items/*.yaml</li>
                    <li>invoices/*.yaml</li>
                    <li>config/company.yaml</li>
                    <li>Bulk file with multiple types</li>
                  </ul>
                </div>
              </div>
            )}

            <div style={{ marginTop: "auto" }}>
              <button
                onClick={apply}
                disabled={!parsed || !!error}
                style={{ width: "100%", background: parsed && !error ? C.accent : C.border, color: parsed && !error ? "#000" : C.muted, border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: parsed && !error ? "pointer" : "not-allowed" }}
              >
                Import {parsed ? countRecords() : ""}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UI Primitives ─────────────────────────────────────────────────────────────
function Badge({ color = "muted", children }) {
  const map = { muted: [C.border, C.muted], success: ["#1a3a1a", C.success], warning: ["#2d2000", C.warning], danger: ["#2a1010", C.danger], accent: [C.accentDim, C.accentText] };
  const [bg, fg] = map[color] || map.muted;
  return <span style={{ background: bg, color: fg, border: `1px solid ${fg}33`, borderRadius: 4, padding: "1px 8px", fontSize: 11, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{children}</span>;
}

function Btn({ onClick, variant = "ghost", disabled, children, small }) {
  const base = { border: "none", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.15s", opacity: disabled ? 0.4 : 1, padding: small ? "4px 10px" : "7px 14px", fontSize: small ? 12 : 13 };
  const variants = { primary: { background: C.accent, color: "#000" }, danger: { background: C.danger, color: "#fff" }, ghost: { background: "transparent", color: C.textDim, border: `1px solid ${C.border}` }, success: { background: C.success, color: "#000" }, warning: { background: C.warning, color: "#000" } };
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Input({ label, value, onChange, type = "text", placeholder, mono, rows }) {
  const style = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "8px 12px", fontSize: 13, fontFamily: mono ? "monospace" : "inherit", outline: "none", boxSizing: "border-box", resize: rows ? "vertical" : undefined };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
      {rows ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={style} />
             : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }}>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: "100%", maxWidth: wide ? 720 : 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: C.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const bg = { success: C.success, error: C.danger, info: C.accent }[type] || C.muted;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, background: bg, color: "#000", padding: "10px 18px", borderRadius: 8, fontWeight: 600, fontSize: 13, zIndex: 9999, boxShadow: "0 4px 20px #0008", display: "flex", alignItems: "center", gap: 8 }}>
      {type === "success" ? "✓" : type === "error" ? "✗" : "ℹ"} {msg}
    </div>
  );
}

function Table({ cols, rows, onRow }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>{cols.map(c => <th key={c.key + c.label} style={{ textAlign: c.right ? "right" : "left", padding: "8px 12px", color: C.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={cols.length} style={{ textAlign: "center", color: C.muted, padding: 32, fontStyle: "italic" }}>No records found</td></tr>
            : rows.map((row, i) => (
              <tr key={i} onClick={() => onRow && onRow(row)} style={{ borderBottom: `1px solid ${C.border}`, cursor: onRow ? "pointer" : "default", transition: "background 0.1s" }}
                onMouseEnter={e => onRow && (e.currentTarget.style.background = C.surfaceHover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                {cols.map(c => <td key={c.key + c.label} style={{ padding: "10px 12px", color: c.dim ? C.muted : C.text, textAlign: c.right ? "right" : "left", fontFamily: c.mono ? "monospace" : "inherit", whiteSpace: c.nowrap ? "nowrap" : undefined }}>
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>)}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>{title}</h2>
        {subtitle && <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 13 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, ...style }}>{children}</div>;
}

function StatCard({ label, value, sub, color }) {
  return (
    <Card>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 28, fontWeight: 800, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

// ─── Pages ─────────────────────────────────────────────────────────────────────

function Dashboard({ customers, items, invoices, history, config, onNav, onPreview, onImport }) {
  const totalBilled = history.reduce((s, h) => s + h.total, 0);
  const activeInvoices = invoices.filter(i => i.schedule.enabled).length;
  const recentHistory = [...history].reverse().slice(0, 5);
  return (
    <div>
      <SectionHeader title="Dashboard" subtitle="Terminal Invoicing · Professional CLI billing system"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={onImport}>↑ Import YAML</Btn>
            <Btn variant="primary" onClick={() => onPreview(invoices[0])}>⬡ Preview PDF</Btn>
          </div>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="Customers" value={customers.length} sub="active clients" color={C.accentText} />
        <StatCard label="Catalog Items" value={items.length} sub="services & products" color={C.accentText} />
        <StatCard label="Recurring Invoices" value={activeInvoices} sub={`${invoices.length} total defined`} color={C.success} />
        <StatCard label="Total Billed" value={fmt(totalBilled)} sub={`${history.length} invoices sent`} color={C.amber} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Recent Invoices</div>
          {recentHistory.map(h => (
            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <span style={{ fontFamily: "monospace", color: C.accentText, fontSize: 13 }}>{h.id}</span>
                <span style={{ color: C.muted, fontSize: 12, marginLeft: 10 }}>{h.customer}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{fmt(h.total)}</span>
                <Badge color={h.status === "sent" ? "success" : "warning"}>{h.status}</Badge>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 14 }}><Btn small onClick={() => onNav("history")}>View full history →</Btn></div>
        </Card>
        <Card>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Active Schedules</div>
          {invoices.filter(i => i.schedule.enabled).map(inv => {
            const cust = customers.find(c => c.id === inv.customer_id);
            return (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text }}>{cust?.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>day {inv.schedule.day_of_month} of each month</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge color="success">active</Badge>
                  <Btn small onClick={() => onPreview(inv)}>Preview</Btn>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 14 }}><Btn small onClick={() => onNav("schedule")}>Manage schedules →</Btn></div>
        </Card>
      </div>
    </div>
  );
}

function Customers({ customers, saveCustomer, deleteCustomer, toast, onImport }) {
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm({ id: "", name: "", email: "", contact: "", address: "", city_state_zip: "", notes: "" }); setModal("add"); };
  const openEdit = c => { setForm({ ...c }); setSelected(c); setModal("edit"); };
  const openShow = c => { setSelected(c); setModal("show"); };
  const save = async () => {
    if (!form.name || !form.email) return toast("Name and email required", "error");
    const id = form.id || form.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    setSaving(true);
    try {
      await saveCustomer({ ...form, id }, modal === "add");
      setModal(null); toast(modal === "add" ? "Customer saved to disk" : "Customer updated on disk", "success");
    } catch(e) { toast(e.message, "error"); } finally { setSaving(false); }
  };
  const remove = async c => {
    try { await deleteCustomer(c.id); setModal(null); toast("Customer removed from disk", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const exportYAML = c => {
    const yaml = toYAML(c);
    navigator.clipboard.writeText(yaml).then(() => toast("YAML copied to clipboard", "success"));
  };
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <SectionHeader title="Customers" subtitle="Manage client contact information"
        action={<div style={{ display: "flex", gap: 8 }}><Btn onClick={onImport}>↑ Import YAML</Btn><Btn variant="primary" onClick={openAdd}>+ Add Customer</Btn></div>} />
      <Card>
        <Table
          cols={[
            { key: "id", label: "ID", mono: true, dim: true, nowrap: true },
            { key: "name", label: "Name" },
            { key: "email", label: "Email", mono: true },
            { key: "contact", label: "Contact", dim: true },
            { key: "actions", label: "", render: (_, row) => (
              <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                <Btn small onClick={() => exportYAML(row)}>↓ YAML</Btn>
                <Btn small onClick={() => openEdit(row)}>Edit</Btn>
                <Btn small variant="danger" onClick={() => remove(row)}>Remove</Btn>
              </div>
            )}
          ]}
          rows={customers} onRow={openShow}
        />
      </Card>
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Add Customer" : "Edit Customer"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gap: 14 }}>
            <Input label="Name" value={form.name} onChange={v => f("name", v)} placeholder="Acme Corporation" />
            <Input label="Email" value={form.email} onChange={v => f("email", v)} placeholder="billing@acme.com" type="email" />
            <Input label="Contact Person" value={form.contact} onChange={v => f("contact", v)} placeholder="Jane Smith" />
            <Input label="Street Address" value={form.address} onChange={v => f("address", v)} placeholder="123 Business Ave" />
            <Input label="City, State ZIP" value={form.city_state_zip} onChange={v => f("city_state_zip", v)} placeholder="New York, NY 10001" />
            <Input label="Notes" value={form.notes} onChange={v => f("notes", v)} rows={2} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => setModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={save}>{modal === "add" ? "Add Customer" : "Save"}</Btn>
            </div>
          </div>
        </Modal>
      )}
      {modal === "show" && selected && (
        <Modal title={selected.name} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gap: 10 }}>
            {[["ID", selected.id, true], ["Email", selected.email, true], ["Contact", selected.contact], ["Address", selected.address], ["City/ZIP", selected.city_state_zip], ["Notes", selected.notes]].filter(([,v]) => v).map(([k, v, mono]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                <span style={{ color: C.muted, fontSize: 12 }}>{k}</span>
                <span style={{ fontFamily: mono ? "monospace" : "inherit", fontSize: 13 }}>{v}</span>
              </div>
            ))}
            <div style={{ background: C.bg, borderRadius: 6, padding: 10, fontFamily: "monospace", fontSize: 11, color: C.textDim, marginTop: 4 }}>
              <div style={{ color: C.muted, marginBottom: 4 }}># {selected.id}.yaml</div>
              {toYAML(selected)}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => exportYAML(selected)}>↓ Copy YAML</Btn>
              <Btn onClick={() => openEdit(selected)}>Edit</Btn>
              <Btn variant="danger" onClick={() => remove(selected)}>Remove</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Items({ items, saveItem, deleteItem, toast, onImport }) {
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm({ id: "", name: "", type: "service", unit_price: "", description: "", detail: "" }); setModal("add"); };
  const openEdit = item => { setForm({ ...item, unit_price: String(item.unit_price) }); setSelected(item); setModal("edit"); };
  const save = async () => {
    if (!form.name || !form.unit_price) return toast("Name and price required", "error");
    const id = form.id || form.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const payload = { ...form, id, unit_price: parseFloat(form.unit_price) || 0 };
    setSaving(true);
    try {
      await saveItem(payload, modal === "add");
      setModal(null); toast(modal === "add" ? "Item saved to disk" : "Item updated on disk", "success");
    } catch(e) { toast(e.message, "error"); } finally { setSaving(false); }
  };
  const remove = async item => {
    try { await deleteItem(item.id); toast("Item removed from disk", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const exportYAML = item => { navigator.clipboard.writeText(toYAML(item)).then(() => toast("YAML copied", "success")); };
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <SectionHeader title="Items & Services" subtitle="Manage your catalog of billable services and products"
        action={<div style={{ display: "flex", gap: 8 }}><Btn onClick={onImport}>↑ Import YAML</Btn><Btn variant="primary" onClick={openAdd}>+ Add Item</Btn></div>} />
      <Card>
        <Table
          cols={[
            { key: "id", label: "ID", mono: true, dim: true },
            { key: "name", label: "Name", render: (v, row) => itemName(row) },
            { key: "type", label: "Type", render: v => <Badge color={v === "service" ? "accent" : "muted"}>{v}</Badge> },
            { key: "unit_price", label: "Unit Price", right: true, mono: true, render: (v, row) => fmt(itemPrice(row)) },
            { key: "description", label: "Description", dim: true, render: (v, row) => row.detail || v },
            { key: "actions", label: "", render: (_, row) => (
              <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                <Btn small onClick={() => exportYAML(row)}>↓ YAML</Btn>
                <Btn small onClick={() => openEdit(row)}>Edit</Btn>
                <Btn small variant="danger" onClick={() => remove(row)}>Remove</Btn>
              </div>
            )}
          ]}
          rows={items}
        />
      </Card>
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Add Item" : "Edit Item"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gap: 14 }}>
            <Input label="Name" value={form.name} onChange={v => f("name", v)} placeholder="Monthly Development Retainer" />
            <Select label="Type" value={form.type} onChange={v => f("type", v)} options={[{ value: "service", label: "Service" }, { value: "product", label: "Product" }, { value: "comment", label: "Comment / Note" }]} />
            <Input label="Unit Price ($)" value={form.unit_price} onChange={v => f("unit_price", v)} type="number" />
            <Input label="Description" value={form.description} onChange={v => f("description", v)} />
            <Input label="Detail Line" value={form.detail} onChange={v => f("detail", v)} placeholder="e.g. 160 hrs @ $53.13/hr" />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => setModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={save}>{modal === "add" ? "Add Item" : "Save"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Invoices({ invoices, saveInvoice, deleteInvoice, generateInvoice, customers, items, history, config, toast, onPreview, onImport }) {
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [lineItems, setLineItems] = useState([]);
  const [generateOpts, setGenerateOpts] = useState({ dryRun: false, noSend: false, preview: false });

  const openAdd = () => {
    setForm({ id: "", customer_id: customers[0]?.id || "", schedule_day: "1", enabled: true, layout: "default", due_days: "30", notes: "" });
    setLineItems([{ item_id: items[0]?.id || "", qty: 1 }]);
    setModal("add");
  };
  const openEdit = inv => {
    setForm({ ...inv, schedule_day: String(inv.schedule.day_of_month), enabled: inv.schedule.enabled, due_days: String(inv.due_days) });
    setLineItems(inv.items.map(li => ({ ...li }))); setSelected(inv); setModal("edit");
  };
  const openGenerate = inv => { setSelected(inv); setGenerateOpts({ dryRun: false, noSend: false, preview: false }); setModal("generate"); };
  const save = async () => {
    if (!form.customer_id) return toast("Customer required", "error");
    const id = form.id || `inv-${form.customer_id}-${uid()}`;
    const payload = { id, customer_id: form.customer_id, items: lineItems, schedule: { day_of_month: parseInt(form.schedule_day) || 1, enabled: form.enabled }, layout: form.layout, due_days: parseInt(form.due_days) || 30, notes: form.notes };
    try {
      await saveInvoice(payload, modal === "add");
      setModal(null); toast(modal === "add" ? "Invoice saved to disk" : "Invoice updated on disk", "success");
    } catch(e) { toast(e.message, "error"); }
  };
  const remove = async inv => {
    try { await deleteInvoice(inv.id); toast("Invoice removed from disk", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const generate = async () => {
    try {
      const result = await generateInvoice(selected.id, generateOpts);
      setModal(null);
      const label = generateOpts.dryRun ? "[dry-run] " : "";
      toast(`${label}${result.invoice_number || selected.id} generated${generateOpts.noSend ? " (not sent)" : generateOpts.dryRun ? "" : " & sent"}`, "success");
    } catch(e) { toast(e.message, "error"); }
  };
  const exportYAML = inv => { navigator.clipboard.writeText(toYAML(inv)).then(() => toast("YAML copied", "success")); };
  const addLine = () => setLineItems(p => [...p, { item_id: items[0]?.id || "", qty: 1 }]);
  const updateLine = (i, k, v) => setLineItems(p => p.map((l, j) => j === i ? { ...l, [k]: k === "qty" ? parseInt(v) || 1 : v } : l));
  const removeLine = i => setLineItems(p => p.filter((_, j) => j !== i));
  const getTotal = inv => calcTotal(inv.items, items);

  return (
    <div>
      <SectionHeader title="Invoice Definitions" subtitle="Manage recurring invoice configurations"
        action={<div style={{ display: "flex", gap: 8 }}><Btn onClick={onImport}>↑ Import YAML</Btn><Btn variant="primary" onClick={openAdd}>+ Create Invoice</Btn></div>} />
      <Card>
        <Table
          cols={[
            { key: "id", label: "ID", mono: true, dim: true },
            { key: "customer_id", label: "Customer", render: v => customers.find(c => c.id === v)?.name || v },
            { key: "schedule", label: "Schedule", render: v => `Day ${v.day_of_month}` },
            { key: "schedule", label: "Status", render: v => <Badge color={v.enabled ? "success" : "muted"}>{v.enabled ? "enabled" : "disabled"}</Badge> },
            { key: "total", label: "Est. Amount", right: true, mono: true, render: (_, row) => fmt(getTotal(row)) },
            { key: "actions", label: "", render: (_, row) => (
              <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                <Btn small onClick={() => onPreview(row)}>⬡ Preview</Btn>
                <Btn small variant="success" onClick={() => openGenerate(row)}>▶ Generate</Btn>
                <Btn small onClick={() => exportYAML(row)}>↓ YAML</Btn>
                <Btn small onClick={() => openEdit(row)}>Edit</Btn>
                <Btn small variant="danger" onClick={() => remove(row)}>✕</Btn>
              </div>
            )}
          ]}
          rows={invoices}
        />
      </Card>

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Create Invoice" : "Edit Invoice"} onClose={() => setModal(null)} wide>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Select label="Customer" value={form.customer_id} onChange={v => setForm(p => ({ ...p, customer_id: v }))} options={customers.map(c => ({ value: c.id, label: c.name }))} />
              <Select label="Layout" value={form.layout} onChange={v => setForm(p => ({ ...p, layout: v }))} options={allLayouts.map(l => ({ value: l.name, label: l.name }))} />
              <Input label="Send Day of Month" value={form.schedule_day} onChange={v => setForm(p => ({ ...p, schedule_day: v }))} type="number" />
              <Input label="Payment Due (days)" value={form.due_days} onChange={v => setForm(p => ({ ...p, due_days: v }))} type="number" />
            </div>
            <label style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={form.enabled} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} />
              Automation enabled (cron will run this invoice)
            </label>
            <div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Line Items</div>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px auto", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                  <Select value={li.item_id} onChange={v => updateLine(i, "item_id", v)} options={items.map(it => ({ value: it.id, label: `${itemName(it)} — ${fmt(itemPrice(it))}` }))} />
                  <Input value={String(li.qty)} onChange={v => updateLine(i, "qty", v)} type="number" />
                  <Btn small variant="danger" onClick={() => removeLine(i)}>✕</Btn>
                </div>
              ))}
              <Btn small onClick={addLine}>+ Add Line</Btn>
              <div style={{ marginTop: 10, textAlign: "right", fontFamily: "monospace", color: C.accentText, fontSize: 15 }}>
                Total: {fmt(lineItems.reduce((s, li) => { const it = items.find(x => x.id === li.item_id); return s + itemPrice(it) * (li.qty || 1); }, 0))}
              </div>
            </div>
            <Input label="Invoice Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} rows={2} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => setModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={save}>{modal === "add" ? "Create" : "Save"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal === "generate" && selected && (
        <Modal title={`Generate ${selected.id}`} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ background: C.bg, borderRadius: 8, padding: 14, fontFamily: "monospace", fontSize: 13 }}>
              <div style={{ color: C.muted, marginBottom: 6 }}>Preview</div>
              <div>Customer: <span style={{ color: C.text }}>{customers.find(c => c.id === selected.customer_id)?.name}</span></div>
              <div>Amount: <span style={{ color: C.accentText }}>{fmt(calcTotal(selected.items, items))}</span></div>
              <div>Layout: <span style={{ color: C.text }}>{selected.layout}</span></div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {[["dryRun", "--dry-run", "Generate PDF but don't send or archive"], ["noSend", "--no-send", "Archive but don't email"], ["preview", "--preview", "Open PDF after generating"]].map(([key, flag, desc]) => (
                <label key={key} style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={generateOpts[key]} onChange={e => setGenerateOpts(p => ({ ...p, [key]: e.target.checked }))} />
                  <span><strong>{flag}</strong> <span style={{ color: C.muted }}>{desc}</span></span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => onPreview(selected)}>⬡ Preview PDF</Btn>
              <Btn onClick={() => setModal(null)}>Cancel</Btn>
              <Btn variant={generateOpts.dryRun ? "warning" : "success"} onClick={generate}>
                {generateOpts.dryRun ? "▶ Dry Run" : "▶ Generate & Send"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Schedule({ invoices, saveInvoice, scheduleSetup, scheduleRemove, customers, toast }) {
  const [cronSetup, setCronSetup] = useState(false);
  const toggle = async inv => {
    const updated = { ...inv, schedule: { ...inv.schedule, enabled: !inv.schedule.enabled } };
    try { await saveInvoice(updated, false); toast(`Schedule ${inv.schedule.enabled ? "disabled" : "enabled"} on disk`, "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const handleSetup = async () => {
    try { await scheduleSetup(); setCronSetup(true); toast("Cron jobs configured", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const handleRemove = async () => {
    try { await scheduleRemove(); setCronSetup(false); toast("Cron jobs removed", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const cronStr = day => `0 9 ${day} * * # Terminal Invoicing`;
  return (
    <div>
      <SectionHeader title="Schedule Management" subtitle="Cron-based automation for recurring invoices"
        action={<div style={{ display: "flex", gap: 8 }}><Btn variant="danger" onClick={handleRemove}>✕ Remove Cron Jobs</Btn><Btn variant="success" onClick={handleSetup}>⚙ Setup Cron Jobs</Btn></div>} />
      {cronSetup && (
        <Card style={{ marginBottom: 16, borderColor: C.success + "44" }}>
          <div style={{ fontSize: 12, color: C.success, fontWeight: 700, marginBottom: 8 }}>✓ Cron jobs active</div>
          <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: C.muted, background: C.bg, padding: 12, borderRadius: 6 }}>
            {invoices.filter(i => i.schedule.enabled).map(inv => cronStr(inv.schedule.day_of_month)).join("\n") || "# No enabled invoices"}
          </pre>
        </Card>
      )}
      <Card>
        <Table
          cols={[
            { key: "id", label: "Invoice ID", mono: true },
            { key: "customer_id", label: "Customer", render: v => customers.find(c => c.id === v)?.name || v },
            { key: "schedule", label: "Cron", mono: true, render: v => cronStr(v.day_of_month) },
            { key: "schedule", label: "Status", render: v => <Badge color={v.enabled ? "success" : "muted"}>{v.enabled ? "enabled" : "disabled"}</Badge> },
            { key: "actions", label: "", render: (_, row) => <Btn small variant={row.schedule.enabled ? "danger" : "success"} onClick={() => toggle(row)}>{row.schedule.enabled ? "Disable" : "Enable"}</Btn> }
          ]}
          rows={invoices}
        />
      </Card>
    </div>
  );
}

function History({ history, customers, items: catalog, config, toast, onPreview }) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const filtered = history.filter(h => (h.id || "").toLowerCase().includes(filter.toLowerCase()) || (h.customer || h.customer_name || "").toLowerCase().includes(filter.toLowerCase()));

  // Build a synthetic invoice from a history entry for preview
  const buildPreviewInv = h => {
    return { id: h.id, _isHistory: true, customer_id: customers.find(c => c.name === h.customer)?.id || "", items: [], due_days: 30, notes: "", layout: "default", date: h.date, total: h.total };
  };

  return (
    <div>
      <SectionHeader title="History & Archives" subtitle="Complete audit trail of all generated invoices" />
      <div style={{ marginBottom: 16 }}><Input placeholder="Filter by invoice # or customer…" value={filter} onChange={setFilter} /></div>
      <Card>
        <Table
          cols={[
            { key: "id", label: "Invoice #", mono: true, render: v => <span style={{ color: C.accentText }}>{v}</span> },
            { key: "customer", label: "Customer" },
            { key: "date", label: "Date", render: v => fmtDate(v), nowrap: true },
            { key: "due", label: "Due", render: v => fmtDate(v), nowrap: true },
            { key: "total", label: "Amount", right: true, mono: true, render: v => fmt(v) },
            { key: "status", label: "Status", render: v => <Badge color={v === "sent" ? "success" : "warning"}>{v}</Badge> },
            { key: "pdf", label: "PDF", render: v => v ? <Badge color="accent">✓</Badge> : <span style={{ color: C.muted, fontSize: 12 }}>—</span> },
            { key: "actions", label: "", render: (_, row) => (
              <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                <Btn small onClick={() => onPreview(buildPreviewInv(row))}>⬡ Preview</Btn>
                <Btn small onClick={() => setSelected(row)}>Show</Btn>
                <Btn small onClick={() => toast(`Exporting ${row.id}.zip…`, "info")}>Export</Btn>
              </div>
            )}
          ]}
          rows={[...filtered].reverse()} onRow={setSelected}
        />
      </Card>
      {selected && (
        <Modal title={`Archive: ${selected.id}`} onClose={() => setSelected(null)}>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {[["Invoice #", selected.id], ["Customer", selected.customer], ["Date", fmtDate(selected.date)], ["Due", fmtDate(selected.due)], ["Amount", fmt(selected.total)], ["Status", selected.status]].map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                <span style={{ color: C.muted, fontSize: 12 }}>{k}</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ background: C.bg, borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 12, color: C.muted, marginBottom: 14 }}>
            <div style={{ color: C.accentText, marginBottom: 4 }}>{selected.id}.zip</div>
            <div>├── invoice.pdf {selected.pdf ? "✓" : "(dry-run)"}</div>
            <div>├── invoice-params.yaml</div>
            <div>└── delivery.yaml</div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => { onPreview(buildPreviewInv(selected)); setSelected(null); }}>⬡ Preview PDF</Btn>
            <Btn variant="primary" onClick={() => toast(`Exporting ${selected.id}.zip…`, "info")}>Export Archive</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Email({ config, saveConfig, sendTestEmail, providers, toast }) {
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [form, setForm] = useState(config.email);
  const [tplForm, setTplForm] = useState(config.invoice_template);
  useEffect(() => { setForm(config.email); }, [config.email]);
  useEffect(() => { setTplForm(config.invoice_template); }, [config.invoice_template]);
  const saveEmail = async () => {
    try { await saveConfig("email", form); toast("Email config saved to disk", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const saveTpl = async () => {
    try { await saveConfig("template", tplForm); toast("Template saved to disk", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const sendTest = async () => {
    if (!testEmail) return toast("Enter a recipient", "error");
    try { await sendTestEmail(testEmail); toast(`Test sent to ${testEmail}`, "success"); setTesting(false); setTestEmail(""); }
    catch(e) { toast(e.message, "error"); }
  };
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const ft = (k, v) => setTplForm(p => ({ ...p, [k]: v }));
  return (
    <div>
      <SectionHeader title="Email Management" subtitle="Configure providers, templates, and test delivery" action={<Btn variant="primary" onClick={() => setTesting(true)}>✉ Send Test Email</Btn>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Provider Config</div>
          <div style={{ display: "grid", gap: 12 }}>
            <Select label="Provider" value={form.provider} onChange={v => f("provider", v)} options={emailProviders.map(p => ({ value: p.name, label: p.name }))} />
            <Input label="From Address" value={form.from} onChange={v => f("from", v)} type="email" />
            {form.provider === "mailgun" && <>
              <Input label="Mailgun Domain" value={form.mailgun_domain} onChange={v => f("mailgun_domain", v)} placeholder="mg.yourcompany.com" />
              <Input label="Mailgun API Key" value={form.mailgun_api_key} onChange={v => f("mailgun_api_key", v)} type="password" placeholder="key-xxxxxx" />
            </>}
            <Btn variant="primary" onClick={saveEmail}>Save Config</Btn>
          </div>
        </Card>
        <Card>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Available Providers</div>
          <Table cols={[{ key: "name", label: "Name", mono: true }, { key: "description", label: "Description", dim: true }, { key: "status", label: "", render: v => <Badge color={v === "configured" ? "success" : "muted"}>{v}</Badge> }]} rows={providers || emailProviders} />
        </Card>
      </div>
      <Card>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Email Template</div>
        <div style={{ display: "grid", gap: 12 }}>
          <Input label="Subject" value={tplForm.subject} onChange={v => ft("subject", v)} />
          <Input label="Body" value={tplForm.body} onChange={v => ft("body", v)} rows={7} mono />
          <div style={{ padding: 10, background: C.bg, borderRadius: 6, fontSize: 11, color: C.muted }}>
            Variables: <span style={{ fontFamily: "monospace", color: C.accentText }}>{"{{invoice_number}} {{company_name}} {{customer_name}} {{total_amount}} {{due_date}}"}</span>
          </div>
          <Btn variant="primary" onClick={saveTpl}>Save Template</Btn>
        </div>
      </Card>
      {testing && (
        <Modal title="Send Test Email" onClose={() => setTesting(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <Input label="Recipient" value={testEmail} onChange={setTestEmail} placeholder="recipient@example.com" type="email" />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => setTesting(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={sendTest}>Send Test</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Layouts({ toast }) {
  const [selected, setSelected] = useState(null);
  return (
    <div>
      <SectionHeader title="Layout Management" subtitle="PDF invoice layout plugins" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {allLayouts.map(l => (
          <Card key={l.name} style={{ cursor: "pointer", borderColor: selected?.name === l.name ? C.accent : C.border }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: C.text }}>{l.name}</div>
              {l.name === "default" && <Badge color="success">built-in</Badge>}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>{l.description}</div>
            <div style={{ fontSize: 11, color: C.muted }}>by {l.author} · v{l.version}</div>
            <div style={{ marginTop: 12 }}><Btn small onClick={() => setSelected(l)}>Details</Btn></div>
          </Card>
        ))}
        <Card style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 140, opacity: 0.5 }}>
          <div style={{ fontSize: 24, color: C.muted }}>+</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Add custom layout</div>
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 4 }}>Drop a .js plugin in layouts/</div>
        </Card>
      </div>
      {selected && (
        <Modal title={`Layout: ${selected.name}`} onClose={() => setSelected(null)}>
          <div style={{ display: "grid", gap: 10 }}>
            {[["Name", selected.name], ["Description", selected.description], ["Author", selected.author], ["Version", selected.version]].map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                <span style={{ color: C.muted, fontSize: 12 }}>{k}</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{v}</span>
              </div>
            ))}
            <pre style={{ background: C.bg, borderRadius: 6, padding: 12, fontFamily: "monospace", fontSize: 11, color: C.muted, margin: 0 }}>
              {`// layouts/${selected.name}.js\nconst layout = {\n  name: '${selected.name}',\n  render(doc, data, config) {\n    // PDFKit rendering…\n  }\n};\nmodule.exports = layout;`}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Config({ config, saveConfig, toast, onImport }) {
  const [form, setForm] = useState(config.company);
  const [tab, setTab] = useState("company");
  useEffect(() => { setForm(config.company); }, [config.company]);
  const save = async () => {
    try { await saveConfig("company", form); toast("Config saved to disk", "success"); }
    catch(e) { toast(e.message, "error"); }
  };
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const exportAll = () => {
    const yaml = `# config/company.yaml\n${toYAML(config.company)}\n# config/email.yaml\n${toYAML(config.email)}\n# config/state.yaml\n${toYAML(config.state)}`;
    navigator.clipboard.writeText(yaml).then(() => toast("Full config YAML copied", "success"));
  };
  return (
    <div>
      <SectionHeader title="Configuration" subtitle="Company info and system settings"
        action={<div style={{ display: "flex", gap: 8 }}><Btn onClick={onImport}>↑ Import YAML</Btn><Btn onClick={exportAll}>↓ Export All YAML</Btn></div>} />
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: C.bg, borderRadius: 8, padding: 4, width: "fit-content" }}>
        {[["company", "company"], ["show", "config show"], ["state", "state"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: tab === id ? C.surface : "transparent", color: tab === id ? C.text : C.muted }}>
            {label}
          </button>
        ))}
      </div>
      {tab === "company" && (
        <Card>
          <div style={{ display: "grid", gap: 14 }}>
            <Input label="Company Name" value={form.name} onChange={v => f("name", v)} />
            <Input label="Billing Email" value={form.email} onChange={v => f("email", v)} type="email" />
            <Input label="Street Address" value={form.address} onChange={v => f("address", v)} />
            <Input label="City, State ZIP" value={form.city_state_zip} onChange={v => f("city_state_zip", v)} />
            <Input label="Phone" value={form.phone} onChange={v => f("phone", v)} />
            <Input label="Logo Path" value={form.logo_path} onChange={v => f("logo_path", v)} placeholder="assets/logo.png" />
            <Btn variant="primary" onClick={save}>Save Company Config</Btn>
          </div>
        </Card>
      )}
      {tab === "show" && (
        <Card>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Terminal Invoicing config show</div>
          <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: C.textDim, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {`# config/company.yaml\n${toYAML(config.company)}\n# config/email.yaml\n${toYAML(config.email)}\n# config/state.yaml\n${toYAML(config.state)}`}
          </pre>
        </Card>
      )}
      {tab === "state" && (
        <Card>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ color: C.muted, fontSize: 12 }}>The state file tracks the next invoice number atomically.</div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase" }}>Next Invoice #</label>
              <Input value={String(config.state.next_invoice_number)} onChange={v => { const n = parseInt(v); if (n) saveConfig("state", { ...config.state, next_invoice_number: n }); }} type="number" />
            </div>
            <Btn variant="warning" onClick={async () => { try { await saveConfig("state", config.state); toast("State saved to disk", "success"); } catch(e) { toast(e.message, "error"); } }}>Save State</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Login Screen ──────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const submit = async (e) => {
    e && e.preventDefault && e.preventDefault();
    if (!username || !password) return setError("Enter your username and password.");
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",                         // send/receive httpOnly cookie
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed."); return; }
      onLogin(data.user, data.token);
    } catch (e) {
      setError("Cannot reach server. Is it running?");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, padding: "11px 14px", fontSize: 14, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      <style>{`* { box-sizing: border-box; }`}</style>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>

        {/* Logo / wordmark */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: C.muted, letterSpacing: "0.14em", marginBottom: 6 }}>$ terminal-invoicing</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: C.text }}>Terminal</span>
            <span style={{ color: C.accent }}> Invoicing</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Sign in to continue</div>
        </div>

        {/* Card */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28 }}>
          {error && (
            <div style={{ background: "#2a1010", border: `1px solid ${C.danger}55`, borderRadius: 8, padding: "10px 14px", color: C.danger, fontSize: 13, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>✗</span> {error}
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Username</label>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="admin" autoComplete="username" autoFocus
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="••••••••" autoComplete="current-password"
                style={inputStyle}
              />
            </div>
            <button
              onClick={submit} disabled={loading}
              style={{ width: "100%", background: loading ? C.accentDim : C.accent, color: "#000", border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", marginTop: 4, transition: "background 0.15s" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.border }}>
          JAYPEESOFTWORKS · Terminal Invoicing
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", icon: "⊞", label: "Dashboard" },
  { id: "customers", icon: "◎", label: "Customers" },
  { id: "items", icon: "▤", label: "Items" },
  { id: "invoices", icon: "◈", label: "Invoices" },
  { id: "schedule", icon: "⏱", label: "Schedule" },
  { id: "history", icon: "◷", label: "History" },
  { id: "email", icon: "✉", label: "Email" },
  { id: "layouts", icon: "⬡", label: "Layouts" },
  { id: "config", icon: "⚙", label: "Config" },
];

function Sidebar({ active, onNav, invoices, currentUser, onLogout }) {
  const enabled = invoices.filter(i => i.schedule.enabled).length;
  return (
    <div style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: C.muted, letterSpacing: "0.12em", marginBottom: 2 }}>$ terminal-invoicing</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Terminal</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.accent }}>Invoicing</div>
      </div>
      <nav style={{ flex: 1, padding: "8px 0" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => onNav(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 18px", border: "none", background: active === n.id ? `${C.accent}18` : "transparent", borderLeft: active === n.id ? `3px solid ${C.accent}` : "3px solid transparent", color: active === n.id ? C.accentText : C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: active === n.id ? 700 : 400, textAlign: "left", transition: "all 0.1s" }}>
            <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>
            {n.label}
            {n.id === "schedule" && enabled > 0 && <span style={{ marginLeft: "auto", background: C.success, color: "#000", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{enabled}</span>}
          </button>
        ))}
      </nav>
      {/* User / logout footer */}
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textDim, fontFamily: "monospace" }}>{currentUser?.username}</div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{currentUser?.role}</div>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: "pointer", padding: "4px 8px", lineHeight: 1, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.color = C.danger; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
          >
            ⏻ out
          </button>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: C.border }}>v1.0.0 · JAYPEESOFTWORKS</div>
      </div>
    </div>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState("dashboard");
  const [authed, setAuthed]     = useState(false);   // true once login confirmed
  const [authChecked, setAuthChecked] = useState(false); // true once /me check done
  const [currentUser, setCurrentUser] = useState(null);
  const [authToken, setAuthToken]     = useState(null);

  const [customers, setCustomers] = useState([]);
  const [items, setItems]         = useState([]);
  const [invoices, setInvoices]   = useState([]);
  const [history, setHistory]     = useState([]);
  const [config, setConfig]       = useState(defaultConfig);
  const [layouts, setLayouts]     = useState(allLayouts);
  const [providers, setProviders] = useState(emailProviders);
  const [loading, setLoading]     = useState(false);
  const [serverError, setServerError] = useState(null);
  const [toastState, setToastState]   = useState({ msg: null, type: "success" });
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [showImport, setShowImport]   = useState(false);

  const toast = useCallback((msg, type = "success") => {
    setToastState({ msg, type });
    setTimeout(() => setToastState({ msg: null }), 3200);
  }, []);

  // ─ Auth helpers ─────────────────────────────────────────────────────────────────────────
  // On mount: ping /api/auth/me to restore an existing httpOnly cookie session
  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => { setCurrentUser(user); setAuthed(true); })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogin = useCallback((user, token) => {
    setCurrentUser(user);
    setAuthToken(token);
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setAuthed(false);
    setCurrentUser(null);
    setAuthToken(null);
    setCustomers([]); setItems([]); setInvoices([]); setHistory([]);
    setConfig(defaultConfig);
    setPage("dashboard");
  }, []);

  // ─ Authenticated API fetch ──────────────────────────────────────────────────────────────
  // Overrides the module-level apiFetch to always include credentials + token
  const authFetch = useCallback(async (method, path, body) => {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method, headers, credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { handleLogout(); throw new Error("Session expired — please log in again"); }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }, [authToken, handleLogout]);

  // ─ Load all data ─────────────────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [c, it, inv, h, cfg, lay, prov] = await Promise.all([
        authFetch("GET", "/customers"),
        authFetch("GET", "/items"),
        authFetch("GET", "/invoices"),
        authFetch("GET", "/history"),
        authFetch("GET", "/config"),
        authFetch("GET", "/layouts").catch(() => allLayouts),
        authFetch("GET", "/email/providers").catch(() => emailProviders),
      ]);
      setCustomers(c); setItems(it); setInvoices(inv); setHistory(h);
      setConfig(cfg); setLayouts(lay); setProviders(prov);
      setServerError(null);
    } catch (e) {
      if (e.message !== "Session expired — please log in again") setServerError(e.message);
    } finally { setLoading(false); }
  }, [authFetch]);

  // Load data whenever we become authenticated
  useEffect(() => { if (authed) reload(); }, [authed, reload]);

  // ─ API-backed mutations ─────────────────────────────────────────────────────────────────────
  const apiSaveCustomer   = useCallback(async (d, isNew) => { isNew ? await authFetch("POST", "/customers", d) : await authFetch("PUT", `/customers/${d.id}`, d); setCustomers(await authFetch("GET", "/customers")); }, [authFetch]);
  const apiDeleteCustomer = useCallback(async id => { await authFetch("DELETE", `/customers/${id}`); setCustomers(p => p.filter(c => c.id !== id)); }, [authFetch]);
  const apiSaveItem       = useCallback(async (d, isNew) => { isNew ? await authFetch("POST", "/items", d) : await authFetch("PUT", `/items/${d.id}`, d); setItems(await authFetch("GET", "/items")); }, [authFetch]);
  const apiDeleteItem     = useCallback(async id => { await authFetch("DELETE", `/items/${id}`); setItems(p => p.filter(i => i.id !== id)); }, [authFetch]);
  const apiSaveInvoice    = useCallback(async (d, isNew) => { isNew ? await authFetch("POST", "/invoices", d) : await authFetch("PUT", `/invoices/${d.id}`, d); setInvoices(await authFetch("GET", "/invoices")); }, [authFetch]);
  const apiDeleteInvoice  = useCallback(async id => { await authFetch("DELETE", `/invoices/${id}`); setInvoices(p => p.filter(i => i.id !== id)); }, [authFetch]);
  const apiGenerateInvoice = useCallback(async (invId, opts) => { const r = await authFetch("POST", `/invoices/${invId}/generate`, opts); setHistory(await authFetch("GET", "/history")); return r; }, [authFetch]);
  const apiSaveConfig     = useCallback(async (section, data) => { await authFetch("PUT", `/config/${section}`, data); setConfig(await authFetch("GET", "/config")); }, [authFetch]);
  const apiScheduleSetup  = useCallback(() => authFetch("POST",   "/schedule/setup", {}), [authFetch]);
  const apiScheduleRemove = useCallback(() => authFetch("DELETE", "/schedule"),            [authFetch]);
  const apiSendTestEmail  = useCallback(to => authFetch("POST", "/email/test", { to }),    [authFetch]);

  const handleImport = useCallback(async ({ data, type }) => {
    setShowImport(false);
    try {
      if (type === "bulk") {
        const saves = [
          ...(data.customers || []).map(c => authFetch("POST", "/customers", c)),
          ...(data.items     || []).map(i => authFetch("POST", "/items",     i)),
          ...(data.invoices  || []).map(i => authFetch("POST", "/invoices",  i)),
        ];
        await Promise.all(saves); await reload(); toast("Bulk YAML imported to disk", "success"); return;
      }
      if (type === "customer") { await authFetch("POST", "/customers", data); setCustomers(await authFetch("GET", "/customers")); toast(`Customer "${data.name}" saved`, "success"); }
      if (type === "item")     { await authFetch("POST", "/items",     data); setItems    (await authFetch("GET", "/items"));     toast(`Item "${data.name}" saved`,     "success"); }
      if (type === "invoice")  { await authFetch("POST", "/invoices",  data); setInvoices (await authFetch("GET", "/invoices"));  toast(`Invoice "${data.id}" saved`,    "success"); }
      if (type === "config")   { await authFetch("PUT",  "/config/company", data); setConfig(await authFetch("GET", "/config")); toast("Config saved", "success"); }
    } catch (e) { toast(`Import failed: ${e.message}`, "error"); }
  }, [authFetch, reload, toast]);

  // ─ Loading / error / auth gates ─────────────────────────────────────────────────────────
  // Blank while checking cookie (avoids flash of login screen)
  if (!authChecked) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }} />
  );

  if (!authed) return <LoginScreen onLogin={handleLogin} />;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.muted, fontFamily: "monospace", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 20, color: C.accentText }}>terminal-invoicing</div>
      <div style={{ fontSize: 13 }}>loading data…</div>
    </div>
  );

  if (serverError) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.text, fontFamily: "monospace", flexDirection: "column", gap: 16, padding: 32 }}>
      <div style={{ fontSize: 20, color: C.danger }}>Server error</div>
      <div style={{ fontSize: 12, color: C.danger, background: "#2a1010", padding: "10px 16px", borderRadius: 6, maxWidth: 500 }}>{serverError}</div>
      <button onClick={reload} style={{ background: C.accent, color: "#000", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Retry</button>
    </div>
  );

  const props = {
    customers, items, invoices, history, config, layouts, providers,
    saveCustomer: apiSaveCustomer, deleteCustomer: apiDeleteCustomer,
    saveItem: apiSaveItem, deleteItem: apiDeleteItem,
    saveInvoice: apiSaveInvoice, deleteInvoice: apiDeleteInvoice,
    generateInvoice: apiGenerateInvoice,
    saveConfig: apiSaveConfig,
    scheduleSetup: apiScheduleSetup, scheduleRemove: apiScheduleRemove,
    sendTestEmail: apiSendTestEmail,
    reload, toast,
  };

  const onPreview = inv => setPreviewInvoice(inv);
  const onImport  = () => setShowImport(true);

  const pages = {
    dashboard: <Dashboard {...props} onNav={setPage} onPreview={onPreview} onImport={onImport} />,
    customers: <Customers {...props} onImport={onImport} />,
    items:     <Items     {...props} onImport={onImport} />,
    invoices:  <Invoices  {...props} onPreview={onPreview} onImport={onImport} />,
    schedule:  <Schedule  {...props} />,
    history:   <History   {...props} onPreview={onPreview} />,
    email:     <Email     {...props} />,
    layouts:   <Layouts   {...props} />,
    config:    <Config    {...props} onImport={onImport} />,
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", overflow: "hidden" }}>
      <style>{`* { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; } select option { background: #161b22; } input[type=number]::-webkit-inner-spin-button { opacity: 0.5; }`}</style>
      <Sidebar active={page} onNav={setPage} invoices={invoices} currentUser={currentUser} onLogout={handleLogout} />
      <main style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {pages[page] || pages.dashboard}
      </main>
      <Toast msg={toastState.msg} type={toastState.type} />
      {previewInvoice && <PDFPreview invoice={previewInvoice} customers={customers} items={items} config={config} onClose={() => setPreviewInvoice(null)} />}
      {showImport && <YAMLImport onImport={handleImport} onClose={() => setShowImport(false)} />}
    </div>
  );
}
