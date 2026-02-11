import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

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
  stepDetails?: Record<string, any>;
  connectedDeviceName?: string;
}

function generateReportId(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900 + 100);
  return `BF-${y}${m}${d}-${h}${min}-${rand}`;
}

function badge(item: ChecklistResult): string {
  if (item.passed && item.overridden) return '<span class="b b-w">OVERRIDE</span>';
  if (item.passed) return '<span class="b b-p">PASS</span>';
  return '<span class="b b-f">FAIL</span>';
}

function stepDetailRow(label: string, value: string | undefined | null): string {
  if (!value) return "";
  return `<div class="detail-row"><span class="detail-label">${label}:</span> <span class="detail-value">${value}</span></div>`;
}

export async function generateReport(data: ReportData): Promise<void> {
  const reportId = generateReportId();
  const sd = data.stepDetails || {};
  const allPassed = data.checklist.every((c) => c.passed);
  const hasOverrides = data.checklist.some((c) => c.overridden);

  let overallClass = "r-fail";
  let overallText = "SOME TESTS FAILED";
  if (allPassed && !hasOverrides) { overallClass = "r-pass"; overallText = "ALL TESTS PASSED \u2014 \u6240\u6709\u6D4B\u8BD5\u901A\u8FC7 \u2014 T\u1EA5t c\u1EA3 \u0111\u1EA1t"; }
  else if (allPassed && hasOverrides) { overallClass = "r-warn"; overallText = "PASSED WITH OVERRIDES \u2014 \u901A\u8FC7\uFF08\u542B\u8986\u76D6\uFF09 \u2014 \u0110\u1EA1t v\u1EDBi ghi \u0111\u00E8"; }

  const osName = Platform.OS === "ios" ? "iOS" : "Android";
  const osVersion = Platform.Version?.toString() || "Unknown";
  const deviceLabel = data.deviceName && data.deviceName !== "Unknown" ? data.deviceName : "\u2014";

  const qrData = encodeURIComponent(data.newSerialNumber || "N/A");
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=4&data=${qrData}&format=svg`;

  function buildStepDetails(step: number): string {
    const details: string[] = [];
    switch (step) {
      case 1:
        if (sd.step1) {
          details.push(stepDetailRow("Previous S/N", sd.step1.oldSerial || "None"));
          details.push(stepDetailRow("New S/N", sd.step1.newSerial));
          details.push(stepDetailRow("Command", `<code>${sd.step1.command}</code>`));
        }
        break;
      case 2:
        if (sd.step2) {
          details.push(stepDetailRow("Device Name Set", sd.step2.deviceName));
          details.push(stepDetailRow("Command", `<code>${sd.step2.command}</code>`));
        }
        break;
      case 3:
        if (sd.step3?.bleDataSample) {
          const sample = sd.step3.bleDataSample;
          const entries = Object.entries(sample).slice(0, 8);
          const vals = entries.map(([k, v]) => `${k}: ${v ?? "\u2014"}`).join(" | ");
          details.push(stepDetailRow("BLE Sample", vals));
        }
        break;
      case 4:
        if (sd.step4) {
          details.push(stepDetailRow("Phone GPS", `${sd.step4.phoneGPS.lat.toFixed(6)}, ${sd.step4.phoneGPS.lng.toFixed(6)}`));
          details.push(stepDetailRow("Outboard GPS", `${sd.step4.outboardGPS.lat.toFixed(6)}, ${sd.step4.outboardGPS.lng.toFixed(6)}`));
          details.push(stepDetailRow("Distance", `${sd.step4.distanceMeters}m`));
        }
        break;
      case 5:
        if (sd.step5) {
          details.push(stepDetailRow("Dethrottle Set To", `${sd.step5.dethrottleValue}%`));
          details.push(stepDetailRow("Command", `<code>${sd.step5.command}</code>`));
        }
        break;
      case 6:
        if (sd.step6) {
          details.push(stepDetailRow("Firmware Version", sd.step6.firmwareVersion));
          details.push(stepDetailRow("Confirmed", sd.step6.confirmed ? "Yes (double confirmed)" : "No"));
        }
        break;
      case 7:
        if (sd.step7) {
          details.push(stepDetailRow("Previous Odometer", sd.step7.previousOdometer));
          details.push(stepDetailRow("Reset To", sd.step7.newOdometer));
          details.push(stepDetailRow("Command", `<code>${sd.step7.command}</code>`));
        }
        break;
      case 8:
        if (sd.step8) {
          details.push(stepDetailRow("MQTT/4G Result", sd.step8.mqttResult ? "Data Found" : "No Data"));
          if (sd.step8.firestoreCoords) {
            details.push(stepDetailRow("Firestore GPS", `${sd.step8.firestoreCoords.lat.toFixed(6)}, ${sd.step8.firestoreCoords.lng.toFixed(6)}`));
          }
        }
        break;
    }
    const filtered = details.filter(Boolean);
    if (filtered.length === 0) return "";
    return `<div class="step-details">${filtered.join("")}</div>`;
  }

  const checklistRows = data.checklist.map((item) => `
    <tr>
      <td class="c c-n">${item.stepNumber}</td>
      <td class="c c-t">${item.title}</td>
      <td class="c c-s">${badge(item)}</td>
      <td class="c c-d">${item.completedAt || "\u2014"}</td>
    </tr>
    ${buildStepDetails(item.stepNumber) ? `<tr><td></td><td colspan="3" class="c c-det">${buildStepDetails(item.stepNumber)}</td></tr>` : ""}
  `).join("");

  const overriddenItems = data.checklist.filter((c) => c.overridden);
  const notesHtml = overriddenItems.length > 0 ? `
    <div class="notes">
      <strong>Overridden Steps:</strong> ${overriddenItems.map((i) => `Step ${i.stepNumber} (${i.title})`).join(", ")}
    </div>
  ` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { margin: 20px 24px; size: A4; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 10px; line-height: 1.4; }
.hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 2.5px solid #1a1a1a; margin-bottom: 2px; }
.hdr-l { flex: 1; }
.brand { font-size: 9px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: #666; margin-bottom: 3px; }
.title { font-size: 18px; font-weight: 700; color: #1a1a1a; }
.title-sub { font-size: 9px; color: #999; margin-top: 1px; }
.hdr-r { text-align: right; font-size: 9px; color: #888; }
.doc-id { font-size: 11px; font-weight: 700; color: #1a1a1a; margin-bottom: 1px; }
.accent { height: 2px; background: linear-gradient(90deg, #34C759, #007AFF); margin-bottom: 10px; }
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
.gc { padding: 6px 8px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; }
.gc:nth-child(4n) { border-right: none; }
.gc.span2 { grid-column: span 2; }
.gl { font-size: 7.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 1px; }
.gv { font-size: 10px; font-weight: 500; color: #1a1a1a; }
.gv.mono { font-family: 'Courier New', monospace; font-weight: 600; letter-spacing: 0.3px; }
.gv.blue { font-size: 12px; font-weight: 700; color: #007AFF; }
.sec { margin-bottom: 8px; }
.sec-t { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a1a1a; margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid #e0e0e0; }
table { width: 100%; border-collapse: collapse; }
th { background: #1a1a1a; color: #fff; padding: 4px 6px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; text-align: left; }
th:first-child { border-radius: 3px 0 0 0; }
th:last-child { border-radius: 0 3px 0 0; }
.c { padding: 4px 6px; border-bottom: 1px solid #eee; font-size: 9px; }
.c-n { width: 24px; text-align: center; font-weight: 700; color: #666; }
.c-t { font-weight: 500; }
.c-s { width: 70px; text-align: center; }
.c-d { width: 120px; font-size: 8px; color: #666; }
.c-det { padding: 2px 6px 6px; background: #f8f9fa; }
tr:nth-child(even) .c:not(.c-det) { background: #fafafa; }
.b { display: inline-block; padding: 1px 8px; border-radius: 8px; font-size: 7px; font-weight: 700; letter-spacing: 0.3px; }
.b-p { background: #d4edda; color: #155724; }
.b-f { background: #f8d7da; color: #721c24; }
.b-w { background: #fff3cd; color: #856404; }
.step-details { font-size: 8px; color: #555; line-height: 1.5; }
.detail-row { margin-bottom: 1px; }
.detail-label { font-weight: 600; color: #444; }
.detail-value { color: #333; }
code { font-family: 'Courier New', monospace; font-size: 7.5px; background: #e9ecef; padding: 0 3px; border-radius: 2px; }
.result { padding: 8px; border-radius: 4px; text-align: center; margin-bottom: 8px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; }
.r-pass { background: #d4edda; border: 1px solid #b7dfb9; color: #155724; }
.r-fail { background: #f8d7da; border: 1px solid #f0b4b8; color: #721c24; }
.r-warn { background: #fff3cd; border: 1px solid #ffd866; color: #856404; }
.notes { background: #fffde7; border: 1px solid #ffe082; border-radius: 4px; padding: 6px 8px; font-size: 8px; margin-bottom: 8px; }
.bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 6px; }
.qr-box { text-align: center; border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; background: #fafafa; flex-shrink: 0; }
.qr-box img { width: 90px; height: 90px; }
.qr-lbl { font-size: 7px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
.qr-sn { font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-top: 4px; }
.ftr { flex: 1; font-size: 7.5px; color: #888; }
.ftr-company { font-size: 9px; font-weight: 700; color: #1a1a1a; letter-spacing: 0.5px; margin-bottom: 2px; }
.ftr-marks { display: flex; gap: 6px; margin: 4px 0; }
.ftr-mark { border: 1px solid #bbb; border-radius: 2px; padding: 1px 5px; font-size: 7px; font-weight: 800; color: #666; }
.ftr-manual { font-size: 7px; color: #c77800; line-height: 1.4; margin-top: 3px; }
.ftr-conf { font-size: 7px; font-weight: 700; color: #cc0000; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }
.ftr-gen { font-size: 6.5px; color: #bbb; margin-top: 2px; }
</style></head><body>

<div class="hdr">
  <div class="hdr-l">
    <div class="brand">Blade Marine Technologies</div>
    <div class="title">Factory Commissioning Report</div>
    <div class="title-sub">\u5DE5\u5382\u8C03\u8BD5\u62A5\u544A / B\u00E1o c\u00E1o v\u1EADn h\u00E0nh nh\u00E0 m\u00E1y</div>
  </div>
  <div class="hdr-r">
    <div class="doc-id">${reportId}</div>
    <div>${deviceLabel}</div>
    <div>${data.completionDateTime}</div>
  </div>
</div>
<div class="accent"></div>

<div class="grid">
  <div class="gc">
    <div class="gl">Report ID</div>
    <div class="gv mono">${reportId}</div>
  </div>
  <div class="gc">
    <div class="gl">Device Type</div>
    <div class="gv blue">${deviceLabel}</div>
  </div>
  <div class="gc">
    <div class="gl">Serial Number</div>
    <div class="gv mono">${data.newSerialNumber || "\u2014"}</div>
  </div>
  <div class="gc">
    <div class="gl">Previous S/N</div>
    <div class="gv mono">${data.oldSerialNumber || "\u2014"}</div>
  </div>
  <div class="gc">
    <div class="gl">Operator</div>
    <div class="gv">${data.operatorFirstName} ${data.operatorLastName}</div>
  </div>
  <div class="gc">
    <div class="gl">Firmware</div>
    <div class="gv mono">${data.firmwareVersion}</div>
  </div>
  <div class="gc">
    <div class="gl">Location</div>
    <div class="gv">${data.completionLocation}</div>
  </div>
  <div class="gc">
    <div class="gl">Date/Time</div>
    <div class="gv">${data.completionDateTime}</div>
  </div>
  <div class="gc">
    <div class="gl">Platform</div>
    <div class="gv">${Platform.OS === "ios" ? "iPhone/iPad" : "Android"}</div>
  </div>
  <div class="gc">
    <div class="gl">Operating System</div>
    <div class="gv">${osName} ${osVersion}</div>
  </div>
  <div class="gc">
    <div class="gl">BLE Device Name</div>
    <div class="gv">${data.connectedDeviceName || "\u2014"}</div>
  </div>
  <div class="gc">
    <div class="gl">App Version</div>
    <div class="gv">1.1.0</div>
  </div>
</div>

<div class="sec">
  <div class="sec-t">Test Results &amp; Details \u2014 \u6D4B\u8BD5\u7ED3\u679C \u2014 K\u1EBFt qu\u1EA3</div>
  <table>
    <thead><tr>
      <th style="width:24px;text-align:center;">#</th>
      <th>Test</th>
      <th style="width:70px;text-align:center;">Result</th>
      <th style="width:120px;">Completed</th>
    </tr></thead>
    <tbody>${checklistRows}</tbody>
  </table>
</div>

<div class="result ${overallClass}">${overallText}</div>

${notesHtml}

<div class="bottom">
  <div class="qr-box">
    <div class="qr-lbl">Serial Number QR</div>
    <img src="${qrUrl}" alt="QR" />
    <div class="qr-sn">${data.newSerialNumber || "N/A"}</div>
  </div>
  <div class="ftr">
    <div class="ftr-company">Blade Marine Technologies Limited (HK)</div>
    <div class="ftr-marks">
      <span class="ftr-mark">CE</span>
      <span class="ftr-mark">UKCA</span>
      <span class="ftr-mark">RoHS</span>
      <span class="ftr-mark">ISO 9001</span>
    </div>
    <div class="ftr-manual">
      Please read the training manual before starting commissioning.<br/>
      \u8BF7\u5728\u5F00\u59CB\u8C03\u8BD5\u524D\u9605\u8BFB\u57F9\u8BAD\u624B\u518C\u3002<br/>
      Vui l\u00F2ng \u0111\u1ECDc s\u00E1ch h\u01B0\u1EDBng d\u1EABn \u0111\u00E0o t\u1EA1o tr\u01B0\u1EDBc khi b\u1EAFt \u0111\u1EA7u.
    </div>
    <div class="ftr-conf">Confidential \u2014 Internal Use Only</div>
    <div class="ftr-gen">Generated by Blade Factory App v1.1.0 | ${new Date().toISOString()}</div>
  </div>
</div>

</body></html>`;

  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Share Factory Commissioning Report",
      UTI: "com.adobe.pdf",
    });
  }
}
