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

function statusIcon(item: ChecklistResult): string {
  if (item.passed && item.overridden) {
    return '<span style="color:#FFCC00;font-weight:bold;">OVERRIDE</span>';
  }
  if (item.passed) {
    return '<span style="color:#34C759;font-weight:bold;">PASS</span>';
  }
  return '<span style="color:#FF3B30;font-weight:bold;">FAIL</span>';
}

export async function generateReport(data: ReportData): Promise<void> {
  const checklistRows = data.checklist
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${item.stepNumber}</td>
        <td style="padding:8px;border:1px solid #ddd;">${item.title}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${statusIcon(item)}</td>
        <td style="padding:8px;border:1px solid #ddd;">${item.completedAt || "N/A"}</td>
      </tr>`
    )
    .join("");

  const allPassed = data.checklist.every((c) => c.passed);
  const hasOverrides = data.checklist.some((c) => c.overridden);
  const overriddenItems = data.checklist.filter((c) => c.overridden);

  let overallClass = "fail";
  let overallText = "SOME TESTS FAILED";
  if (allPassed && !hasOverrides) {
    overallClass = "pass";
    overallText = "ALL TESTS PASSED";
  } else if (allPassed && hasOverrides) {
    overallClass = "warn";
    overallText = "PASSED WITH OVERRIDES";
  }

  const notesSection = overriddenItems.length > 0 ? `
      <h2>Notes / \u5907\u6CE8 / Ghi ch\u00FA</h2>
      <div style="padding:12px;background:#fffde7;border-radius:6px;border:1px solid #FFCC00;">
        <p style="font-weight:bold;margin:0 0 8px 0;">Overridden Steps / \u8986\u76D6\u7684\u6B65\u9AA4 / C\u00E1c b\u01B0\u1EDBc \u0111\u00E3 ghi \u0111\u00E8:</p>
        <ul style="margin:0;padding-left:20px;">
          ${overriddenItems.map((item) => `<li>Step ${item.stepNumber}: ${item.title}</li>`).join("")}
        </ul>
      </div>
  ` : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
        h1 { color: #1a1a1a; border-bottom: 2px solid #34C759; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f5f5f5; padding: 10px; border: 1px solid #ddd; text-align: left; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
        .info-item { padding: 8px; background: #f9f9f9; border-radius: 4px; }
        .info-label { font-weight: bold; color: #666; font-size: 12px; }
        .info-value { font-size: 14px; margin-top: 4px; }
        .overall { padding: 15px; margin-top: 20px; border-radius: 8px; text-align: center; font-size: 18px; font-weight: bold; }
        .pass { background: #d4edda; color: #155724; }
        .fail { background: #f8d7da; color: #721c24; }
        .warn { background: #fff3cd; color: #856404; }
        .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; }
      </style>
    </head>
    <body>
      <h1>Blade Factory Test Report / Blade\u5DE5\u5382\u6D4B\u8BD5\u62A5\u544A / B\u00E1o c\u00E1o ki\u1EC3m tra nh\u00E0 m\u00E1y Blade</h1>

      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Operator / \u64CD\u4F5C\u5458 / Ng\u01B0\u1EDDi v\u1EADn h\u00E0nh</div>
          <div class="info-value">${data.operatorFirstName} ${data.operatorLastName}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Device / \u8BBE\u5907 / Thi\u1EBFt b\u1ECB</div>
          <div class="info-value">${data.deviceName}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Old Serial Number / \u65E7\u5E8F\u5217\u53F7 / S\u1ED1 serial c\u0169</div>
          <div class="info-value">${data.oldSerialNumber || "N/A"}</div>
        </div>
        <div class="info-item">
          <div class="info-label">New Serial Number / \u65B0\u5E8F\u5217\u53F7 / S\u1ED1 serial m\u1EDBi</div>
          <div class="info-value">${data.newSerialNumber}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Firmware Version / \u56FA\u4EF6\u7248\u672C / Phi\u00EAn b\u1EA3n firmware</div>
          <div class="info-value">${data.firmwareVersion}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Completion Date/Time / \u5B8C\u6210\u65E5\u671F\u65F6\u95F4 / Ng\u00E0y gi\u1EDD ho\u00E0n th\u00E0nh</div>
          <div class="info-value">${data.completionDateTime}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Location / \u4F4D\u7F6E / V\u1ECB tr\u00ED</div>
          <div class="info-value">${data.completionLocation}</div>
        </div>
      </div>

      <h2>Test Checklist / \u6D4B\u8BD5\u6E05\u5355 / Danh s\u00E1ch ki\u1EC3m tra</h2>
      <table>
        <thead>
          <tr>
            <th style="width:40px;">#</th>
            <th>Test / \u6D4B\u8BD5 / Ki\u1EC3m tra</th>
            <th style="width:100px;text-align:center;">Status / \u72B6\u6001 / Tr\u1EA1ng th\u00E1i</th>
            <th style="width:180px;">Time / \u65F6\u95F4 / Th\u1EDDi gian</th>
          </tr>
        </thead>
        <tbody>
          ${checklistRows}
        </tbody>
      </table>

      <div class="overall ${overallClass}">
        Overall Result: ${overallText}
      </div>

      ${notesSection}

      <div class="footer">
        <div style="margin-bottom:8px;">
          <strong>Blade Marine Technologies Limited (HK)</strong>
        </div>
        <div style="margin-bottom:6px;">Revision 1.1.0</div>
        <div style="margin-bottom:10px;color:#FF9500;font-weight:500;">
          Please read the training manual before starting commissioning.<br/>
          \u8BF7\u5728\u5F00\u59CB\u8C03\u8BD5\u524D\u9605\u8BFB\u57F9\u8BAD\u624B\u518C\u3002<br/>
          Vui l\u00F2ng \u0111\u1ECDc s\u00E1ch h\u01B0\u1EDBng d\u1EABn \u0111\u00E0o t\u1EA1o tr\u01B0\u1EDBc khi b\u1EAFt \u0111\u1EA7u v\u1EADn h\u00E0nh.
        </div>
        <div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="border:1px solid #999;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:bold;">CE</span>
          <span style="border:1px solid #999;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:bold;">UKCA</span>
          <span style="border:1px solid #999;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:bold;">RoHS</span>
          <span style="border:1px solid #999;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:bold;">ISO 9001</span>
        </div>
        <div style="margin-top:6px;">Generated by Blade Factory App | ${new Date().toISOString()}</div>
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Share Factory Test Report",
      UTI: "com.adobe.pdf",
    });
  }
}
