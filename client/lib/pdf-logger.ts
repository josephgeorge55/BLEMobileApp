type LogLevel = "INFO" | "DATA" | "ERROR" | "WARN" | "SUCCESS";
type LogCallback = (level: LogLevel, message: string) => void;

let logCallback: LogCallback | null = null;
const pendingLogs: { level: LogLevel; message: string; timestamp: string }[] = [];

export function setPdfLogCallback(callback: LogCallback | null) {
  logCallback = callback;
  if (callback && pendingLogs.length > 0) {
    pendingLogs.forEach(log => callback(log.level, `[${log.timestamp}] ${log.message}`));
    pendingLogs.length = 0;
  }
}

export function logPdf(level: LogLevel, message: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[PDF ${level}] ${message}`);
  
  if (logCallback) {
    logCallback(level, message);
  } else {
    pendingLogs.push({ level, message, timestamp });
    if (pendingLogs.length > 50) {
      pendingLogs.shift();
    }
  }
}

export function getPendingLogs() {
  return [...pendingLogs];
}

export function clearPendingLogs() {
  pendingLogs.length = 0;
}
