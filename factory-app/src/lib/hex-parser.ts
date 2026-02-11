export interface MemoryBlock {
  address: number;
  data: Uint8Array;
}

export interface ParsedHexFile {
  blocks: MemoryBlock[];
  startAddress: number;
  totalBytes: number;
  minAddress: number;
  maxAddress: number;
}

interface HexRecord {
  byteCount: number;
  address: number;
  recordType: number;
  data: Uint8Array;
  checksum: number;
}

const RECORD_TYPE = {
  DATA: 0x00,
  EOF: 0x01,
  EXTENDED_SEGMENT_ADDRESS: 0x02,
  START_SEGMENT_ADDRESS: 0x03,
  EXTENDED_LINEAR_ADDRESS: 0x04,
  START_LINEAR_ADDRESS: 0x05,
};

function hexToByte(hex: string): number {
  return parseInt(hex, 16);
}

function parseHexRecord(line: string): HexRecord | null {
  line = line.trim();
  if (!line.startsWith(':')) return null;
  const hex = line.substring(1);
  if (hex.length < 10) return null;

  const byteCount = hexToByte(hex.substring(0, 2));
  const address = hexToByte(hex.substring(2, 6));
  const recordType = hexToByte(hex.substring(6, 8));

  const data = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    data[i] = hexToByte(hex.substring(8 + i * 2, 10 + i * 2));
  }

  const checksum = hexToByte(hex.substring(8 + byteCount * 2, 10 + byteCount * 2));

  let calculatedChecksum = byteCount + (address >> 8) + (address & 0xFF) + recordType;
  for (let i = 0; i < byteCount; i++) {
    calculatedChecksum += data[i];
  }
  calculatedChecksum = (~calculatedChecksum + 1) & 0xFF;

  if (calculatedChecksum !== checksum) {
    console.warn(`[HEX Parser] Checksum mismatch at line: ${line}`);
  }

  return { byteCount, address, recordType, data, checksum };
}

export function parseHexFile(hexContent: string): ParsedHexFile {
  const lines = hexContent.split(/\r?\n/);
  const memoryMap = new Map<number, number>();

  let extendedAddress = 0;
  let startAddress = 0x08000000;
  let minAddress = Infinity;
  let maxAddress = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const record = parseHexRecord(line);
    if (!record) continue;

    switch (record.recordType) {
      case RECORD_TYPE.DATA: {
        const fullAddress = extendedAddress + record.address;
        for (let i = 0; i < record.data.length; i++) {
          const addr = fullAddress + i;
          memoryMap.set(addr, record.data[i]);
          minAddress = Math.min(minAddress, addr);
          maxAddress = Math.max(maxAddress, addr);
        }
        break;
      }
      case RECORD_TYPE.EOF:
        break;
      case RECORD_TYPE.EXTENDED_SEGMENT_ADDRESS:
        extendedAddress = ((record.data[0] << 8) | record.data[1]) << 4;
        break;
      case RECORD_TYPE.START_SEGMENT_ADDRESS:
        break;
      case RECORD_TYPE.EXTENDED_LINEAR_ADDRESS:
        extendedAddress = ((record.data[0] << 8) | record.data[1]) << 16;
        break;
      case RECORD_TYPE.START_LINEAR_ADDRESS:
        startAddress = (record.data[0] << 24) | (record.data[1] << 16) |
                       (record.data[2] << 8) | record.data[3];
        break;
    }
  }

  if (minAddress === Infinity) {
    return { blocks: [], startAddress: 0x08000000, totalBytes: 0, minAddress: 0, maxAddress: 0 };
  }

  const blocks: MemoryBlock[] = [];
  const BLOCK_SIZE = 256;
  const alignedStart = Math.floor(minAddress / BLOCK_SIZE) * BLOCK_SIZE;
  const alignedEnd = Math.ceil((maxAddress + 1) / BLOCK_SIZE) * BLOCK_SIZE;

  for (let blockStart = alignedStart; blockStart < alignedEnd; blockStart += BLOCK_SIZE) {
    const blockData = new Uint8Array(BLOCK_SIZE);
    let hasData = false;
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const addr = blockStart + i;
      if (memoryMap.has(addr)) {
        blockData[i] = memoryMap.get(addr)!;
        hasData = true;
      } else {
        blockData[i] = 0xFF;
      }
    }
    if (hasData) {
      blocks.push({ address: blockStart, data: blockData });
    }
  }

  return {
    blocks,
    startAddress: startAddress || minAddress,
    totalBytes: memoryMap.size,
    minAddress,
    maxAddress,
  };
}

export function formatAddress(address: number): string {
  return '0x' + address.toString(16).toUpperCase().padStart(8, '0');
}
