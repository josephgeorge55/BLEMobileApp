import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export interface ChecklistResult {
  stepNumber: number;
  title: string;
  passed: boolean;
  overridden: boolean;
  completedAt: string | null;
}

export interface ReportData {
  operatorFirstName: string;
  operatorLastName: string;
  deviceName: string;
  oldSerialNumber: string;
  newSerialNumber: string;
  firmwareVersion: string;
  completionDateTime: string;
  completionLocation: string;
  checklist: ChecklistResult[];
}

function statusBadge(item: ChecklistResult): string {
  if (item.passed && item.overridden) {
    return '<span class="badge badge-override">OVERRIDE</span>';
  }
  if (item.passed) {
    return '<span class="badge badge-pass">PASS</span>';
  }
  return '<span class="badge badge-fail">FAIL</span>';
}

function triLabel(en: string, zh: string, vi: string): string {
  return `${en} <span class="sub-lang">${zh} / ${vi}</span>`;
}

export async function generateReport(data: ReportData): Promise<void> {
  const checklistRows = data.checklist
    .map(
      (item) => `
      <tr>
        <td class="cell cell-num">${item.stepNumber}</td>
        <td class="cell cell-test">${item.title}</td>
        <td class="cell cell-status">${statusBadge(item)}</td>
        <td class="cell cell-time">${item.completedAt || "\u2014"}</td>
      </tr>`
    )
    .join("");

  const allPassed = data.checklist.every((c) => c.passed);
  const hasOverrides = data.checklist.some((c) => c.overridden);
  const overriddenItems = data.checklist.filter((c) => c.overridden);

  let overallClass = "result-fail";
  let overallEn = "SOME TESTS FAILED";
  let overallZh = "\u90E8\u5206\u6D4B\u8BD5\u672A\u901A\u8FC7";
  let overallVi = "M\u1ED9t s\u1ED1 ki\u1EC3m tra kh\u00F4ng \u0111\u1EA1t";
  if (allPassed && !hasOverrides) {
    overallClass = "result-pass";
    overallEn = "ALL TESTS PASSED";
    overallZh = "\u6240\u6709\u6D4B\u8BD5\u901A\u8FC7";
    overallVi = "T\u1EA5t c\u1EA3 ki\u1EC3m tra \u0111\u1EA1t";
  } else if (allPassed && hasOverrides) {
    overallClass = "result-warn";
    overallEn = "PASSED WITH OVERRIDES";
    overallZh = "\u901A\u8FC7\uFF08\u542B\u8986\u76D6\uFF09";
    overallVi = "\u0110\u1EA1t v\u1EDBi ghi \u0111\u00E8";
  }

  const notesSection = overriddenItems.length > 0 ? `
      <div class="section">
        <div class="section-title">Notes <span class="sub-lang">\u5907\u6CE8 / Ghi ch\u00FA</span></div>
        <div class="notes-card">
          <div class="notes-header">Overridden Steps <span class="sub-lang">\u8986\u76D6\u7684\u6B65\u9AA4 / C\u00E1c b\u01B0\u1EDBc \u0111\u00E3 ghi \u0111\u00E8</span></div>
          <ul class="notes-list">
            ${overriddenItems.map((item) => `<li>Step ${item.stepNumber}: ${item.title}</li>`).join("")}
          </ul>
        </div>
      </div>
  ` : "";

  const deviceLabel = data.deviceName && data.deviceName !== "Unknown" ? data.deviceName : "\u2014";
  const qrData = encodeURIComponent(data.newSerialNumber || "N/A");
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${qrData}&format=svg`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 30px; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
          color: #1a1a1a;
          line-height: 1.5;
          padding: 0;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 16px;
          border-bottom: 3px solid #1a1a1a;
          margin-bottom: 4px;
        }
        .header-left { flex: 1; }
        .brand {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 6px;
        }
        .report-title {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
          letter-spacing: -0.3px;
        }
        .report-title-sub {
          font-size: 11px;
          color: #888;
          margin-top: 2px;
        }
        .header-right {
          text-align: right;
          font-size: 10px;
          color: #888;
          padding-top: 4px;
        }
        .doc-id {
          font-size: 13px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 2px;
        }
        .header-accent {
          height: 2px;
          background: linear-gradient(90deg, #34C759, #007AFF);
          margin-bottom: 20px;
        }

        .sub-lang {
          font-size: 9px;
          color: #999;
          font-weight: 400;
        }

        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 0;
          margin-bottom: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          overflow: hidden;
        }
        .info-cell {
          padding: 10px 12px;
          border-bottom: 1px solid #eee;
          border-right: 1px solid #eee;
        }
        .info-cell:nth-child(3n) { border-right: none; }
        .info-cell.span-2 { grid-column: span 2; }
        .info-label {
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #888;
          margin-bottom: 3px;
        }
        .info-value {
          font-size: 13px;
          font-weight: 500;
          color: #1a1a1a;
        }
        .info-value.mono {
          font-family: 'Courier New', monospace;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .info-value.device-type {
          font-size: 15px;
          font-weight: 700;
          color: #007AFF;
        }

        .section { margin-bottom: 18px; }
        .section-title {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #1a1a1a;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e0e0e0;
        }

        table { width: 100%; border-collapse: collapse; }
        th {
          background: #1a1a1a;
          color: #fff;
          padding: 8px 10px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: left;
        }
        th:first-child { border-radius: 4px 0 0 0; }
        th:last-child { border-radius: 0 4px 0 0; }
        .cell {
          padding: 8px 10px;
          border-bottom: 1px solid #eee;
          font-size: 12px;
        }
        .cell-num {
          width: 36px;
          text-align: center;
          font-weight: 700;
          color: #666;
        }
        .cell-test { font-weight: 500; }
        .cell-status { width: 90px; text-align: center; }
        .cell-time { width: 150px; font-size: 10px; color: #666; }
        tr:nth-child(even) .cell { background: #fafafa; }
        tr:last-child .cell { border-bottom: none; }

        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 10px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .badge-pass { background: #d4edda; color: #155724; }
        .badge-fail { background: #f8d7da; color: #721c24; }
        .badge-override { background: #fff3cd; color: #856404; }

        .result-banner {
          padding: 14px;
          border-radius: 6px;
          text-align: center;
          margin-bottom: 18px;
        }
        .result-pass { background: #d4edda; border: 1px solid #b7dfb9; }
        .result-fail { background: #f8d7da; border: 1px solid #f0b4b8; }
        .result-warn { background: #fff3cd; border: 1px solid #ffd866; }
        .result-text-en {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 1px;
        }
        .result-text-sub {
          font-size: 10px;
          color: #666;
          margin-top: 2px;
        }
        .result-pass .result-text-en { color: #155724; }
        .result-fail .result-text-en { color: #721c24; }
        .result-warn .result-text-en { color: #856404; }

        .notes-card {
          background: #fffde7;
          border: 1px solid #ffe082;
          border-radius: 6px;
          padding: 12px 14px;
        }
        .notes-header {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .notes-list {
          margin: 0;
          padding-left: 18px;
          font-size: 11px;
          color: #555;
        }
        .notes-list li { margin-bottom: 2px; }

        .qr-section {
          text-align: center;
          margin: 20px 0 14px;
          padding: 16px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          background: #fafafa;
        }
        .qr-section img {
          width: 140px;
          height: 140px;
        }
        .qr-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #888;
          margin-bottom: 8px;
        }
        .qr-sn {
          font-family: 'Courier New', monospace;
          font-size: 14px;
          font-weight: 700;
          color: #1a1a1a;
          letter-spacing: 1.5px;
          margin-top: 8px;
        }

        .footer {
          margin-top: 24px;
          padding-top: 14px;
          border-top: 2px solid #1a1a1a;
          text-align: center;
        }
        .footer-company {
          font-size: 11px;
          font-weight: 700;
          color: #1a1a1a;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }
        .footer-rev {
          font-size: 9px;
          color: #888;
          margin-bottom: 8px;
        }
        .footer-manual {
          font-size: 9px;
          color: #c77800;
          line-height: 1.6;
          margin-bottom: 10px;
        }
        .compliance-marks {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .compliance-mark {
          border: 1.5px solid #aaa;
          border-radius: 3px;
          padding: 2px 8px;
          font-size: 8px;
          font-weight: 800;
          color: #555;
          letter-spacing: 0.5px;
        }
        .footer-gen {
          font-size: 8px;
          color: #bbb;
        }
        .confidential {
          font-size: 8px;
          font-weight: 700;
          color: #cc0000;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-top: 6px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <div class="brand">Blade Marine Technologies</div>
          <div class="report-title">Factory Commissioning Report</div>
          <div class="report-title-sub">\u5DE5\u5382\u8C03\u8BD5\u62A5\u544A / B\u00E1o c\u00E1o v\u1EADn h\u00E0nh nh\u00E0 m\u00E1y</div>
        </div>
        <div class="header-right">
          <div class="doc-id">${deviceLabel}</div>
          <div>${data.completionDateTime}</div>
          <div>Rev 1.1.0</div>
        </div>
      </div>
      <div class="header-accent"></div>

      <div class="info-grid">
        <div class="info-cell">
          <div class="info-label">${triLabel("Operator", "\u64CD\u4F5C\u5458", "Ng\u01B0\u1EDDi v\u1EADn h\u00E0nh")}</div>
          <div class="info-value">${data.operatorFirstName} ${data.operatorLastName}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">${triLabel("Device Type", "\u8BBE\u5907\u7C7B\u578B", "Lo\u1EA1i thi\u1EBFt b\u1ECB")}</div>
          <div class="info-value device-type">${deviceLabel}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">${triLabel("Firmware", "\u56FA\u4EF6\u7248\u672C", "Firmware")}</div>
          <div class="info-value mono">${data.firmwareVersion}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">${triLabel("Serial Number", "\u5E8F\u5217\u53F7", "S\u1ED1 serial")}</div>
          <div class="info-value mono">${data.newSerialNumber || "\u2014"}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">${triLabel("Previous S/N", "\u65E7\u5E8F\u5217\u53F7", "S/N c\u0169")}</div>
          <div class="info-value mono">${data.oldSerialNumber || "\u2014"}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">${triLabel("Location", "\u4F4D\u7F6E", "V\u1ECB tr\u00ED")}</div>
          <div class="info-value">${data.completionLocation}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">${triLabel("Test Results", "\u6D4B\u8BD5\u7ED3\u679C", "K\u1EBFt qu\u1EA3 ki\u1EC3m tra")}</div>
        <table>
          <thead>
            <tr>
              <th style="width:36px;text-align:center;">#</th>
              <th>Test</th>
              <th style="width:90px;text-align:center;">Status</th>
              <th style="width:150px;">Completed</th>
            </tr>
          </thead>
          <tbody>
            ${checklistRows}
          </tbody>
        </table>
      </div>

      <div class="result-banner ${overallClass}">
        <div class="result-text-en">${overallEn}</div>
        <div class="result-text-sub">${overallZh} / ${overallVi}</div>
      </div>

      ${notesSection}

      <div class="qr-section">
        <div class="qr-label">${triLabel("Device Serial Number", "\u8BBE\u5907\u5E8F\u5217\u53F7", "S\u1ED1 serial thi\u1EBFt b\u1ECB")}</div>
        <img src="${qrUrl}" alt="QR Code" />
        <div class="qr-sn">${data.newSerialNumber || "N/A"}</div>
      </div>

      <div class="footer">
        <div class="footer-company">Blade Marine Technologies Limited (HK)</div>
        <div class="footer-rev">Revision 1.1.0</div>
        <div class="footer-manual">
          Please read the training manual before starting commissioning.<br/>
          \u8BF7\u5728\u5F00\u59CB\u8C03\u8BD5\u524D\u9605\u8BFB\u57F9\u8BAD\u624B\u518C\u3002<br/>
          Vui l\u00F2ng \u0111\u1ECDc s\u00E1ch h\u01B0\u1EDBng d\u1EABn \u0111\u00E0o t\u1EA1o tr\u01B0\u1EDBc khi b\u1EAFt \u0111\u1EA7u v\u1EADn h\u00E0nh.
        </div>
        <div class="compliance-marks">
          <span class="compliance-mark">CE</span>
          <span class="compliance-mark">UKCA</span>
          <span class="compliance-mark">RoHS</span>
          <span class="compliance-mark">ISO 9001</span>
        </div>
        <div class="footer-gen">Generated by Blade Factory App | ${new Date().toISOString()}</div>
        <div class="confidential">Confidential \u2014 Internal Use Only</div>
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Share Factory Commissioning Report",
      UTI: "com.adobe.pdf",
    });
  }
}
