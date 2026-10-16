import { exportCsv } from '../src/lib/exportCsv';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Alert: { alert: jest.fn() },
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///data/cache/',
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

describe('exportCsv.ts unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
  });

  it('rejects empty rows with an alert dialog', async () => {
    const result = await exportCsv({ filename: 'test', rows: [] });
    expect(result).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Empty Data', 'There are no records to export.');
  });

  it('generates properly formatted RFC 4180 CSV with UTF-8 BOM on mobile', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValueOnce(undefined);

    const rows = [
      ['Matric Number', 'Student Name', 'Attendance Status'],
      ['RUN/2021/001', 'Oluwaseun, "David"', 'present'],
      ['RUN/2021/002', 'Adekunle\nTaiwo', 'absent'],
    ];

    const result = await exportCsv({
      filename: 'CSC_401_Attendance.csv',
      rows,
      dialogTitle: 'Share Attendance File',
    });

    expect(result).toBe(true);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    const [fileUri, content] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];

    expect(fileUri).toContain('file:///data/cache/CSC_401_Attendance.csv');
    // Ensure UTF-8 BOM is present
    expect(content.startsWith('\uFEFF')).toBe(true);
    // Ensure escaping of quotes and commas
    expect(content).toContain('"Oluwaseun, ""David"""');
    expect(content).toContain('"Adekunle\nTaiwo"');

    expect(Sharing.shareAsync).toHaveBeenCalledWith(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Share Attendance File',
      UTI: 'public.comma-separated-values-text',
    });
  });

  it('appends .csv extension if missing from filename', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);

    await exportCsv({
      filename: 'Attendance_Report',
      rows: [['Header 1'], ['Value 1']],
    });

    const [fileUri] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(fileUri.endsWith('.csv')).toBe(true);
  });

  it('handles sharing unavailable gracefully', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);

    const result = await exportCsv({
      filename: 'test.csv',
      rows: [['Col1'], ['Val1']],
    });

    expect(result).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Sharing Unavailable', 'File sharing is not supported on this device.');
  });

  it('handles web platform file download via Blob and link click', async () => {
    (Platform as any).OS = 'web';

    const mockClick = jest.fn();
    const mockAppendChild = jest.fn();
    const mockRemoveChild = jest.fn();

    const mockAnchor = {
      href: '',
      setAttribute: jest.fn(),
      click: mockClick,
    };

    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: jest.fn().mockReturnValue(mockAnchor),
        body: {
          appendChild: mockAppendChild,
          removeChild: mockRemoveChild,
        },
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        URL: {
          createObjectURL: jest.fn().mockReturnValue('blob:mock-url'),
          revokeObjectURL: jest.fn(),
        },
      },
      writable: true,
      configurable: true,
    });

    const result = await exportCsv({
      filename: 'Web_Export',
      rows: [['A', 'B'], ['1', '2']],
    });

    expect(result).toBe(true);
    expect(mockAnchor.setAttribute).toHaveBeenCalledWith('download', 'Web_Export.csv');
    expect(mockClick).toHaveBeenCalled();
    expect(mockRemoveChild).toHaveBeenCalled();
  });
});
