import { parseHexFile, formatAddress } from './hex-parser';

const ACK = 0x79;
const NACK = 0x1F;

const CMD = {
  HELLO: 0x79,
  FW_INFO: 0x10,
  ERASE: 0x43,
  WRITE: 0x31,
  GOTOAPP: 0x21,
};

const FIRMWARE_START_ADDRESS = 0x08004000;
const BLOCK_SIZE = 256;
const TIMEOUT_MS = 5000;
const ERASE_TIMEOUT_MS = 15000;
const WRITE_BLOCK_TIMEOUT_MS = 5000;
const BOOTLOADER_ENTRY_DELAY_MS = 1500;
const MAX_RETRIES = 3;

export type OTAState =
  | 'idle'
  | 'connecting'
  | 'initializing'
  | 'erasing'
  | 'programming'
  | 'verifying'
  | 'starting'
  | 'complete'
  | 'error';

export interface OTAProgress {
  state: OTAState;
  progress: number;
  currentBlock: number;
  totalBlocks: number;
  bytesWritten: number;
  totalBytes: number;
  message: string;
}

export interface OTALogEntry {
  timestamp: Date;
  level: 'info' | 'success' | 'warning' | 'error' | 'debug';
  message: string;
}

type SendDataFn = (data: Uint8Array) => Promise<void>;
type ReceiveDataFn = (timeout: number) => Promise<Uint8Array | null>;
type LogFn = (level: OTALogEntry['level'], message: string) => void;
type ProgressFn = (progress: OTAProgress) => void;

export function prepareFirmwareData(content: string, isBinary: boolean): Uint8Array {
  if (isBinary) {
    const binaryStr = atob(content);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  const parsed = parseHexFile(content);
  if (parsed.blocks.length === 0) {
    throw new Error('No valid data found in HEX file');
  }

  const totalSize = parsed.blocks.reduce((sum, b) => sum + b.data.length, 0);
  const firmwareData = new Uint8Array(totalSize);
  let offset = 0;
  for (const block of parsed.blocks) {
    firmwareData.set(block.data, offset);
    offset += block.data.length;
  }
  return firmwareData;
}

export class FirmwareOTAService {
  private sendData: SendDataFn;
  private receiveData: ReceiveDataFn;
  private log: LogFn;
  private onProgress: ProgressFn;
  private aborted: boolean = false;

  constructor(
    sendData: SendDataFn,
    receiveData: ReceiveDataFn,
    log: LogFn,
    onProgress: ProgressFn
  ) {
    this.sendData = sendData;
    this.receiveData = receiveData;
    this.log = log;
    this.onProgress = onProgress;
  }

  abort() {
    this.aborted = true;
    this.log('warning', 'OTA update aborted by user');
  }

  private checkAbort() {
    if (this.aborted) {
      throw new Error('OTA update aborted');
    }
  }

  private async send(data: number[]): Promise<void> {
    this.log('debug', `TX: [${data.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`);
    await this.sendData(new Uint8Array(data));
  }

  private async sendBytes(data: Uint8Array): Promise<void> {
    const preview = Array.from(data.slice(0, 8)).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    this.log('debug', `TX: [${preview}${data.length > 8 ? '...' : ''}] (${data.length} bytes)`);
    await this.sendData(data);
  }

  private formatBytes(data: Uint8Array | null): string {
    if (!data) return 'null';
    const bytes = Array.from(data.slice(0, 16)).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    return `[${bytes}${data.length > 16 ? '...' : ''}] (${data.length} bytes)`;
  }

  private async waitForResponse(timeout: number = TIMEOUT_MS): Promise<Uint8Array | null> {
    const response = await this.receiveData(timeout);
    if (response) {
      this.log('debug', `RX: ${this.formatBytes(response)}`);
    } else {
      this.log('debug', 'RX: timeout (no response)');
    }
    return response;
  }

  private async waitForAck(timeout: number = TIMEOUT_MS): Promise<boolean> {
    const response = await this.waitForResponse(timeout);
    if (!response || response.length === 0) return false;

    for (let i = 0; i < response.length; i++) {
      if (response[i] === ACK) return true;
      else if (response[i] === NACK) {
        this.log('error', 'NACK (0x1F) received from bootloader');
        return false;
      }
    }

    this.log('warning', `Unexpected response: ${this.formatBytes(response)}`);
    return false;
  }

  private updateProgress(
    state: OTAState, progress: number, message: string,
    currentBlock: number = 0, totalBlocks: number = 0,
    bytesWritten: number = 0, totalBytes: number = 0
  ) {
    this.onProgress({ state, progress, currentBlock, totalBlocks, bytesWritten, totalBytes, message });
  }

  async enterBootloaderMode(): Promise<boolean> {
    this.log('info', 'Sending $APP_CONFIG,UPDATE_FW to enter bootloader mode...');
    this.updateProgress('connecting', 0, 'Entering bootloader mode...');

    try {
      const cmd = '$APP_CONFIG,UPDATE_FW\n';
      const encoder = new TextEncoder();
      await this.sendData(encoder.encode(cmd));
      this.log('info', `Waiting ${BOOTLOADER_ENTRY_DELAY_MS}ms for bootloader to initialize...`);
      await this.delay(BOOTLOADER_ENTRY_DELAY_MS);
      this.log('success', 'Bootloader entry command sent');
      return true;
    } catch (error) {
      this.log('error', `Failed to send bootloader entry command: ${error}`);
      return false;
    }
  }

  async hello(): Promise<boolean> {
    this.aborted = false;
    this.log('info', 'Sending HELLO command (0x79) to check bootloader connection...');
    this.updateProgress('initializing', 5, 'Checking bootloader connection...');

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      this.log('info', `HELLO attempt ${attempt}/${MAX_RETRIES}...`);
      await this.send([CMD.HELLO]);

      if (await this.waitForAck(TIMEOUT_MS)) {
        this.log('success', 'Bootloader responded with ACK - connection established');
        this.updateProgress('idle', 10, 'Bootloader ready');
        return true;
      }

      if (attempt < MAX_RETRIES) {
        this.log('warning', `No ACK for HELLO, retrying in 500ms...`);
        await this.delay(500);
      }
    }

    this.log('error', 'HELLO command failed after all retries.');
    this.updateProgress('error', 0, 'Bootloader connection failed');
    return false;
  }

  async fwInfo(firmwareSize: number): Promise<boolean> {
    this.checkAbort();
    this.log('info', `Sending FW_INFO: start=${formatAddress(FIRMWARE_START_ADDRESS)}, size=${firmwareSize} bytes`);
    this.updateProgress('initializing', 12, 'Sending firmware info...');

    const frame = new Uint8Array(9);
    frame[0] = CMD.FW_INFO;
    frame[1] = (FIRMWARE_START_ADDRESS >> 24) & 0xFF;
    frame[2] = (FIRMWARE_START_ADDRESS >> 16) & 0xFF;
    frame[3] = (FIRMWARE_START_ADDRESS >> 8) & 0xFF;
    frame[4] = FIRMWARE_START_ADDRESS & 0xFF;
    frame[5] = (firmwareSize >> 24) & 0xFF;
    frame[6] = (firmwareSize >> 16) & 0xFF;
    frame[7] = (firmwareSize >> 8) & 0xFF;
    frame[8] = firmwareSize & 0xFF;

    await this.sendBytes(frame);

    if (!await this.waitForAck(TIMEOUT_MS)) {
      this.log('error', 'FW_INFO command not acknowledged');
      this.updateProgress('error', 12, 'FW_INFO failed');
      return false;
    }

    this.log('success', 'FW_INFO acknowledged by bootloader');
    return true;
  }

  async eraseChip(): Promise<boolean> {
    this.checkAbort();
    this.log('info', 'Sending ERASE command (0x43) to erase application flash...');
    this.updateProgress('erasing', 15, 'Erasing flash memory...');

    await this.send([CMD.ERASE]);

    this.log('info', 'Waiting for erase operation to complete...');

    if (!await this.waitForAck(ERASE_TIMEOUT_MS)) {
      this.log('error', 'Erase command failed - NACK or timeout');
      this.updateProgress('error', 15, 'Erase failed');
      return false;
    }

    this.log('success', 'Flash memory erased successfully');
    this.updateProgress('erasing', 20, 'Erase complete');
    return true;
  }

  async writeFirmware(firmwareData: Uint8Array): Promise<boolean> {
    this.checkAbort();

    const totalBlocks = Math.ceil(firmwareData.length / BLOCK_SIZE);
    this.log('info', `Starting WRITE: ${firmwareData.length} bytes in ${totalBlocks} blocks of ${BLOCK_SIZE} bytes`);
    this.updateProgress('programming', 25, 'Sending WRITE command...');

    await this.send([CMD.WRITE]);

    if (!await this.waitForAck(TIMEOUT_MS)) {
      this.log('error', 'WRITE command (0x31) not acknowledged');
      this.updateProgress('error', 25, 'WRITE command failed');
      return false;
    }

    this.log('success', 'WRITE command acknowledged - beginning data transfer');

    let bytesWritten = 0;

    for (let i = 0; i < totalBlocks; i++) {
      this.checkAbort();

      const offset = i * BLOCK_SIZE;
      const remaining = firmwareData.length - offset;
      const blockLength = Math.min(BLOCK_SIZE, remaining);

      const block = new Uint8Array(BLOCK_SIZE);
      block.fill(0xFF);
      block.set(firmwareData.slice(offset, offset + blockLength));

      const progress = 25 + ((i / totalBlocks) * 65);
      this.updateProgress('programming', progress, `Writing block ${i + 1}/${totalBlocks}`, i + 1, totalBlocks, bytesWritten, firmwareData.length);

      await this.sendBytes(block);

      if (!await this.waitForAck(WRITE_BLOCK_TIMEOUT_MS)) {
        this.log('error', `Block ${i + 1}/${totalBlocks} not acknowledged`);
        this.updateProgress('error', progress, `Write failed at block ${i + 1}`);
        return false;
      }

      bytesWritten += blockLength;

      if ((i + 1) % 50 === 0 || i === totalBlocks - 1) {
        this.log('info', `Written ${i + 1}/${totalBlocks} blocks (${bytesWritten} bytes)`);
      }
    }

    this.log('success', `Firmware written: ${bytesWritten} bytes in ${totalBlocks} blocks`);
    this.updateProgress('programming', 90, 'Firmware write complete');
    return true;
  }

  async gotoApp(): Promise<boolean> {
    this.checkAbort();

    this.log('info', 'Sending GOTOAPP command (0x21) to start new firmware...');
    this.updateProgress('starting', 95, 'Starting firmware...');

    await this.send([CMD.GOTOAPP]);

    if (!await this.waitForAck(TIMEOUT_MS)) {
      this.log('error', 'GOTOAPP command not acknowledged');
      this.updateProgress('error', 95, 'GOTOAPP failed');
      return false;
    }

    this.log('success', 'New firmware started successfully!');
    this.updateProgress('complete', 100, 'Firmware update complete!');
    return true;
  }

  async performFullUpdate(firmwareData: Uint8Array): Promise<boolean> {
    try {
      this.log('info', '=== STARTING FIRMWARE UPDATE (FOTA v2.0) ===');
      this.log('info', `Firmware size: ${firmwareData.length} bytes`);
      this.log('info', `Target address: ${formatAddress(FIRMWARE_START_ADDRESS)}`);

      this.log('info', '--- Step 1/5: HELLO ---');
      if (!await this.hello()) return false;

      this.log('info', '--- Step 2/5: FW_INFO ---');
      if (!await this.fwInfo(firmwareData.length)) return false;

      this.log('info', '--- Step 3/5: ERASE ---');
      if (!await this.eraseChip()) return false;

      this.log('info', '--- Step 4/5: WRITE ---');
      if (!await this.writeFirmware(firmwareData)) return false;

      this.log('info', '--- Step 5/5: GOTOAPP ---');
      if (!await this.gotoApp()) return false;

      this.log('success', '=== FIRMWARE UPDATE COMPLETE ===');
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'OTA update aborted') {
        this.log('warning', 'Update cancelled by user');
        this.updateProgress('idle', 0, 'Update cancelled');
        return false;
      }
      this.log('error', `OTA update failed: ${error}`);
      this.updateProgress('error', 0, 'Update failed');
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
