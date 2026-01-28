/**
 * Firmware OTA Service
 * Implements STM32 bootloader protocol for Tiller Board firmware updates
 * 
 * Protocol: UART over Bluetooth SPP
 * Settings: 115200 baud, 8 data bits, Even parity, 1 stop bit
 */

import { parseHexFile, ParsedHexFile, formatAddress, calculateChecksum } from './hex-parser';

const ACK = 0x79;
const NACK = 0x1F;
const INIT_BYTE = 0x7F;

const CMD = {
  GET: [0x00, 0xFF],
  GET_ID: [0x02, 0xFD],
  ERASE: [0x43, 0xBC],
  WRITE: [0x31, 0xCE],
  GO: [0x21, 0xDE],
};

const DEFAULT_START_ADDRESS = 0x08000000;

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
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ChipInfo {
  protocolVersion: string;
  chipId: string;
  bootloaderVersion: string;
}

type SendDataFn = (data: Uint8Array) => Promise<void>;
type ReceiveDataFn = (timeout: number) => Promise<Uint8Array | null>;
type LogFn = (level: OTALogEntry['level'], message: string) => void;
type ProgressFn = (progress: OTAProgress) => void;

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
    await this.sendData(new Uint8Array(data));
  }
  
  private async waitForAck(timeout: number = 5000): Promise<boolean> {
    const response = await this.receiveData(timeout);
    if (!response || response.length === 0) {
      return false;
    }
    
    if (response[0] === ACK) {
      return true;
    } else if (response[0] === NACK) {
      this.log('error', 'Received NACK from bootloader');
      return false;
    }
    
    return false;
  }
  
  private updateProgress(
    state: OTAState,
    progress: number,
    message: string,
    currentBlock: number = 0,
    totalBlocks: number = 0,
    bytesWritten: number = 0,
    totalBytes: number = 0
  ) {
    this.onProgress({
      state,
      progress,
      currentBlock,
      totalBlocks,
      bytesWritten,
      totalBytes,
      message,
    });
  }
  
  async initialize(): Promise<ChipInfo | null> {
    this.aborted = false;
    this.log('info', 'Initializing bootloader connection...');
    this.updateProgress('initializing', 0, 'Sending init byte...');
    
    await this.send([INIT_BYTE]);
    
    if (!await this.waitForAck(3000)) {
      this.log('error', 'No ACK received for init byte. Is the board in bootloader mode?');
      this.updateProgress('error', 0, 'Initialization failed');
      return null;
    }
    
    this.log('success', 'Bootloader responded with ACK');
    
    this.log('info', 'Sending GET command...');
    await this.send(CMD.GET);
    
    const getResponse = await this.receiveData(3000);
    if (!getResponse || getResponse.length < 13) {
      this.log('error', 'Invalid response to GET command');
      this.updateProgress('error', 0, 'GET command failed');
      return null;
    }
    
    const protocolVersion = `${(getResponse[2] >> 4) & 0x0F}.${getResponse[2] & 0x0F}`;
    this.log('success', `Protocol version: ${protocolVersion}`);
    
    this.log('info', 'Sending GET ID command...');
    await this.send(CMD.GET_ID);
    
    const idResponse = await this.receiveData(3000);
    if (!idResponse || idResponse.length < 5) {
      this.log('error', 'Invalid response to GET ID command');
      this.updateProgress('error', 0, 'GET ID command failed');
      return null;
    }
    
    const chipId = ((idResponse[2] << 8) | idResponse[3]).toString(16).toUpperCase();
    this.log('success', `Chip ID: 0x${chipId}`);
    
    this.updateProgress('idle', 5, 'Bootloader ready');
    
    return {
      protocolVersion,
      chipId: `0x${chipId}`,
      bootloaderVersion: protocolVersion,
    };
  }
  
  async eraseChip(): Promise<boolean> {
    this.checkAbort();
    this.log('info', 'Erasing chip memory...');
    this.updateProgress('erasing', 10, 'Sending erase command...');
    
    await this.send(CMD.ERASE);
    
    if (!await this.waitForAck(3000)) {
      this.log('error', 'Erase command not acknowledged');
      this.updateProgress('error', 10, 'Erase command failed');
      return false;
    }
    
    this.log('info', 'Erase command ACK received, erasing all memory...');
    await this.send([0xFF, 0x00]);
    
    if (!await this.waitForAck(10000)) {
      this.log('error', 'Mass erase failed');
      this.updateProgress('error', 15, 'Mass erase failed');
      return false;
    }
    
    this.log('success', 'Chip erased successfully');
    this.updateProgress('erasing', 20, 'Erase complete');
    
    await this.delay(2000);
    
    return true;
  }
  
  async programFirmware(hexContent: string): Promise<boolean> {
    this.checkAbort();
    
    this.log('info', 'Parsing HEX file...');
    const parsed = parseHexFile(hexContent);
    
    if (parsed.blocks.length === 0) {
      this.log('error', 'No valid data found in HEX file');
      this.updateProgress('error', 20, 'Invalid HEX file');
      return false;
    }
    
    this.log('success', `Parsed ${parsed.blocks.length} blocks (${parsed.totalBytes} bytes)`);
    this.log('info', `Address range: ${formatAddress(parsed.minAddress)} - ${formatAddress(parsed.maxAddress)}`);
    
    if (!await this.eraseChip()) {
      return false;
    }
    
    this.checkAbort();
    
    this.log('info', 'Beginning firmware write...');
    this.updateProgress('programming', 25, 'Writing firmware...');
    
    const totalBlocks = parsed.blocks.length;
    let bytesWritten = 0;
    
    for (let i = 0; i < totalBlocks; i++) {
      this.checkAbort();
      
      const block = parsed.blocks[i];
      const progress = 25 + (i / totalBlocks) * 65;
      
      this.updateProgress(
        'programming',
        progress,
        `Writing block ${i + 1}/${totalBlocks}...`,
        i + 1,
        totalBlocks,
        bytesWritten,
        parsed.totalBytes
      );
      
      if (!await this.writeBlock(block.address, block.data)) {
        this.log('error', `Failed to write block at ${formatAddress(block.address)}`);
        this.updateProgress('error', progress, 'Write failed');
        return false;
      }
      
      bytesWritten += block.data.length;
      
      await this.delay(10);
    }
    
    this.log('success', `Firmware written successfully (${bytesWritten} bytes)`);
    this.updateProgress('programming', 90, 'Firmware written');
    
    return true;
  }
  
  private async writeBlock(address: number, data: Uint8Array): Promise<boolean> {
    await this.send(CMD.WRITE);
    
    if (!await this.waitForAck(3000)) {
      this.log('error', 'Write command not acknowledged');
      return false;
    }
    
    const addressBytes = [
      (address >> 24) & 0xFF,
      (address >> 16) & 0xFF,
      (address >> 8) & 0xFF,
      address & 0xFF,
    ];
    const addressChecksum = addressBytes[0] ^ addressBytes[1] ^ addressBytes[2] ^ addressBytes[3];
    
    await this.send([...addressBytes, addressChecksum]);
    
    if (!await this.waitForAck(3000)) {
      this.log('error', `Address ${formatAddress(address)} not acknowledged`);
      return false;
    }
    
    const length = data.length - 1;
    let dataChecksum = length;
    for (let i = 0; i < data.length; i++) {
      dataChecksum ^= data[i];
    }
    
    const payload = new Uint8Array(data.length + 2);
    payload[0] = length;
    payload.set(data, 1);
    payload[payload.length - 1] = dataChecksum;
    
    await this.sendData(payload);
    
    if (!await this.waitForAck(3000)) {
      this.log('error', `Data block at ${formatAddress(address)} not acknowledged`);
      return false;
    }
    
    return true;
  }
  
  async startFirmware(startAddress: number = DEFAULT_START_ADDRESS): Promise<boolean> {
    this.checkAbort();
    
    this.log('info', `Starting firmware at ${formatAddress(startAddress)}...`);
    this.updateProgress('starting', 95, 'Starting firmware...');
    
    await this.send(CMD.GO);
    
    if (!await this.waitForAck(3000)) {
      this.log('error', 'GO command not acknowledged');
      this.updateProgress('error', 95, 'GO command failed');
      return false;
    }
    
    const addressBytes = [
      (startAddress >> 24) & 0xFF,
      (startAddress >> 16) & 0xFF,
      (startAddress >> 8) & 0xFF,
      startAddress & 0xFF,
    ];
    const addressChecksum = addressBytes[0] ^ addressBytes[1] ^ addressBytes[2] ^ addressBytes[3];
    
    await this.send([...addressBytes, addressChecksum]);
    
    if (!await this.waitForAck(3000)) {
      this.log('error', 'Start address not acknowledged');
      this.updateProgress('error', 95, 'Start failed');
      return false;
    }
    
    this.log('success', 'Firmware started successfully!');
    this.updateProgress('complete', 100, 'Update complete!');
    
    return true;
  }
  
  async performFullUpdate(hexContent: string): Promise<boolean> {
    try {
      const chipInfo = await this.initialize();
      if (!chipInfo) {
        return false;
      }
      
      if (!await this.programFirmware(hexContent)) {
        return false;
      }
      
      const parsed = parseHexFile(hexContent);
      if (!await this.startFirmware(parsed.startAddress)) {
        return false;
      }
      
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'OTA update aborted') {
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
