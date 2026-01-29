/**
 * Firmware OTA Service
 * Implements STM32 bootloader protocol for Tiller Board firmware updates
 * 
 * Protocol: UART over Bluetooth SPP
 * Settings: 115200 baud, 8 data bits, Even parity, 1 stop bit
 * 
 * Based on Tiller Board FOTA Technical Specification v1.3
 */

import { parseHexFile, ParsedHexFile, formatAddress, calculateChecksum } from './hex-parser';

const ACK = 0x79;
const NACK = 0x1F;
const INIT_BYTE = 0x7F;

const CMD = {
  GET: [0x00, 0xFF],
  GET_ID: [0x02, 0xFD],
  ERASE: [0x43, 0xBC],
  ERASE_SEQUENCE: [0xFF, 0x00],
  WRITE: [0x31, 0xCE],
  GO: [0x21, 0xDE],
  ENTER_BOOTLOADER: [0x01, 0xFE],
};

const DEFAULT_START_ADDRESS = 0x08000000;
const ERASE_DELAY_MS = 2000;
const BLOCK_DELAY_MS = 10;
const TIMEOUT_SHORT = 3000;
const TIMEOUT_LONG = 10000;

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

export interface ChipInfo {
  protocolVersion: string;
  chipId: string;
  bootloaderVersion: string;
  supportedCommands: number[];
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
  
  private async waitForResponse(timeout: number = TIMEOUT_SHORT): Promise<Uint8Array | null> {
    const response = await this.receiveData(timeout);
    if (response) {
      this.log('debug', `RX: ${this.formatBytes(response)}`);
    } else {
      this.log('debug', 'RX: timeout (no response)');
    }
    return response;
  }
  
  private async waitForAck(timeout: number = TIMEOUT_SHORT): Promise<boolean> {
    const response = await this.waitForResponse(timeout);
    if (!response || response.length === 0) {
      return false;
    }
    
    if (response[0] === ACK) {
      return true;
    } else if (response[0] === NACK) {
      this.log('error', 'NACK (0x1F) received from bootloader');
      return false;
    }
    
    this.log('warning', `Unexpected response byte: 0x${response[0].toString(16).toUpperCase()}`);
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
  
  async enterBootloaderMode(): Promise<boolean> {
    this.log('info', 'Sending command to enter bootloader mode...');
    this.updateProgress('connecting', 0, 'Entering bootloader mode...');
    
    try {
      await this.send(CMD.ENTER_BOOTLOADER);
      await this.delay(500);
      this.log('success', 'Bootloader mode command sent');
      return true;
    } catch (error) {
      this.log('warning', 'Could not send bootloader command. Ensure board is in bootloader mode via hardware switch.');
      return false;
    }
  }
  
  async initialize(): Promise<ChipInfo | null> {
    this.aborted = false;
    this.log('info', 'Initializing bootloader connection...');
    this.updateProgress('initializing', 0, 'Sending init byte (0x7F)...');
    
    await this.send([INIT_BYTE]);
    
    if (!await this.waitForAck(TIMEOUT_SHORT)) {
      this.log('error', 'No ACK received for init byte (0x7F). Is the board in bootloader mode?');
      this.log('info', 'Tip: Use hardware switch or send software command to enter bootloader mode');
      this.updateProgress('error', 0, 'Initialization failed - check bootloader mode');
      return null;
    }
    
    this.log('success', 'Bootloader ACK received (0x79)');
    this.updateProgress('initializing', 2, 'Sending GET command...');
    
    this.log('info', 'Sending GET command (0x00 0xFF)...');
    await this.send(CMD.GET);
    
    const getResponse = await this.waitForResponse(TIMEOUT_SHORT);
    if (!getResponse || getResponse.length < 13) {
      this.log('error', `Invalid GET response: expected 13 bytes, got ${getResponse?.length || 0}`);
      this.updateProgress('error', 0, 'GET command failed');
      return null;
    }
    
    if (getResponse[0] !== ACK) {
      this.log('error', `GET command not acknowledged: 0x${getResponse[0].toString(16)}`);
      this.updateProgress('error', 0, 'GET command not ACK');
      return null;
    }
    
    const numBytes = getResponse[1];
    const protocolByte = getResponse[2];
    const protocolVersion = `${(protocolByte >> 4) & 0x0F}.${protocolByte & 0x0F}`;
    
    const supportedCommands: number[] = [];
    for (let i = 3; i < 3 + numBytes; i++) {
      if (i < getResponse.length) {
        supportedCommands.push(getResponse[i]);
      }
    }
    
    this.log('success', `Protocol version: ${protocolVersion}`);
    this.log('info', `Supported commands: ${supportedCommands.map(c => '0x' + c.toString(16).toUpperCase()).join(', ')}`);
    
    this.updateProgress('initializing', 4, 'Sending GET ID command...');
    
    this.log('info', 'Sending GET ID command (0x02 0xFD)...');
    await this.send(CMD.GET_ID);
    
    const idResponse = await this.waitForResponse(TIMEOUT_SHORT);
    if (!idResponse || idResponse.length < 5) {
      this.log('error', `Invalid GET ID response: expected 5 bytes, got ${idResponse?.length || 0}`);
      this.updateProgress('error', 0, 'GET ID command failed');
      return null;
    }
    
    if (idResponse[0] !== ACK) {
      this.log('error', `GET ID not acknowledged: 0x${idResponse[0].toString(16)}`);
      this.updateProgress('error', 0, 'GET ID not ACK');
      return null;
    }
    
    const chipId = ((idResponse[2] << 8) | idResponse[3]).toString(16).toUpperCase().padStart(4, '0');
    this.log('success', `Chip ID: 0x${chipId}`);
    
    this.updateProgress('idle', 5, 'Bootloader ready');
    
    return {
      protocolVersion,
      chipId: `0x${chipId}`,
      bootloaderVersion: protocolVersion,
      supportedCommands,
    };
  }
  
  async eraseChip(): Promise<boolean> {
    this.checkAbort();
    this.log('info', 'Erasing chip memory...');
    this.updateProgress('erasing', 10, 'Sending erase command (0x43 0xBC)...');
    
    await this.send(CMD.ERASE);
    
    if (!await this.waitForAck(TIMEOUT_SHORT)) {
      this.log('error', 'Erase command not acknowledged');
      this.updateProgress('error', 10, 'Erase command failed');
      return false;
    }
    
    this.log('info', 'Erase command ACK. Sending mass erase sequence (0xFF 0x00)...');
    this.updateProgress('erasing', 12, 'Mass erasing...');
    
    await this.send(CMD.ERASE_SEQUENCE);
    
    if (!await this.waitForAck(TIMEOUT_LONG)) {
      this.log('error', 'Mass erase failed - no ACK received');
      this.updateProgress('error', 15, 'Mass erase failed');
      return false;
    }
    
    this.log('info', `Waiting ${ERASE_DELAY_MS}ms for erase operation to complete...`);
    await this.delay(ERASE_DELAY_MS);
    
    this.log('success', 'Chip erased successfully');
    this.updateProgress('erasing', 20, 'Erase complete');
    
    return true;
  }
  
  async programFirmware(hexContent: string): Promise<boolean> {
    this.checkAbort();
    
    this.log('info', 'Parsing Intel HEX file...');
    const parsed = parseHexFile(hexContent);
    
    if (parsed.blocks.length === 0) {
      this.log('error', 'No valid data found in HEX file');
      this.updateProgress('error', 20, 'Invalid HEX file');
      return false;
    }
    
    this.log('success', `Parsed ${parsed.blocks.length} blocks (${parsed.totalBytes} bytes)`);
    this.log('info', `Address range: ${formatAddress(parsed.minAddress)} - ${formatAddress(parsed.maxAddress)}`);
    this.log('info', `Start address: ${formatAddress(parsed.startAddress)}`);
    
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
      const progress = 25 + ((i / totalBlocks) * 65);
      
      this.updateProgress(
        'programming',
        progress,
        `Writing block ${i + 1}/${totalBlocks} at ${formatAddress(block.address)}`,
        i + 1,
        totalBlocks,
        bytesWritten,
        parsed.totalBytes
      );
      
      if (!await this.writeBlock(block.address, block.data)) {
        this.log('error', `Failed to write block ${i + 1} at ${formatAddress(block.address)}`);
        this.updateProgress('error', progress, 'Write failed');
        return false;
      }
      
      bytesWritten += block.data.length;
      
      await this.delay(BLOCK_DELAY_MS);
    }
    
    this.log('success', `Firmware written: ${bytesWritten} bytes in ${totalBlocks} blocks`);
    this.updateProgress('programming', 90, 'Firmware written');
    
    return true;
  }
  
  private async writeBlock(address: number, data: Uint8Array): Promise<boolean> {
    this.log('debug', `Writing ${data.length} bytes to ${formatAddress(address)}`);
    
    await this.send(CMD.WRITE);
    
    if (!await this.waitForAck(TIMEOUT_SHORT)) {
      this.log('error', 'Write command (0x31 0xCE) not acknowledged');
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
    
    if (!await this.waitForAck(TIMEOUT_SHORT)) {
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
    payload[payload.length - 1] = dataChecksum & 0xFF;
    
    await this.sendBytes(payload);
    
    if (!await this.waitForAck(TIMEOUT_SHORT)) {
      this.log('error', `Data block at ${formatAddress(address)} not acknowledged`);
      return false;
    }
    
    return true;
  }
  
  async startFirmware(startAddress: number = DEFAULT_START_ADDRESS): Promise<boolean> {
    this.checkAbort();
    
    this.log('info', `Starting firmware (GO command) at ${formatAddress(startAddress)}...`);
    this.updateProgress('starting', 95, 'Sending GO command...');
    
    await this.send(CMD.GO);
    
    if (!await this.waitForAck(TIMEOUT_SHORT)) {
      this.log('error', 'GO command (0x21 0xDE) not acknowledged');
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
    
    if (!await this.waitForAck(TIMEOUT_SHORT)) {
      this.log('error', 'Start address not acknowledged');
      this.updateProgress('error', 95, 'Start failed');
      return false;
    }
    
    this.log('success', 'Firmware started successfully!');
    this.updateProgress('complete', 100, 'Firmware update complete!');
    
    return true;
  }
  
  async performFullUpdate(hexContent: string): Promise<boolean> {
    try {
      this.log('info', '=== STARTING FIRMWARE UPDATE ===');
      
      const chipInfo = await this.initialize();
      if (!chipInfo) {
        this.log('error', 'Bootloader initialization failed');
        return false;
      }
      
      this.log('info', `Connected to STM32 bootloader (Chip: ${chipInfo.chipId})`);
      
      if (!await this.programFirmware(hexContent)) {
        this.log('error', 'Firmware programming failed');
        return false;
      }
      
      const parsed = parseHexFile(hexContent);
      if (!await this.startFirmware(parsed.startAddress || DEFAULT_START_ADDRESS)) {
        this.log('error', 'Failed to start firmware');
        return false;
      }
      
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
