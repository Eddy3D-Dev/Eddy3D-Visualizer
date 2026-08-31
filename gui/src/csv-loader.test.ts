import { describe, it, expect, vi } from 'vitest';
import { CSVLoader, updateResultsDropdown, handleFileUpload } from './csv-loader';

// ── CSVLoader ────────────────────────────────────────────────────────────────

function makeLoader() {
  const onUpdate = vi.fn();
  const onError = vi.fn();
  return { loader: new CSVLoader(onUpdate, onError), onUpdate, onError };
}

const SIMPLE_CSV = `x,y,z,mag_u,bldg_height
0,0,0,1.5,10
1,1,1,2.5,0
2,2,2,3.5,5`;

const CSV_Z_RELATIVE = `x,y,z_relative,u
10,20,30,0.5
11,21,31,0.6`;

describe('CSVLoader', () => {
  describe('processCSVData', () => {
    it('parses a well-formed CSV', () => {
      const { loader, onUpdate } = makeLoader();
      loader.processCSVData(SIMPLE_CSV, 'test.csv');

      expect(loader.hasDataset('test.csv')).toBe(true);
      expect(loader.getDatasetCount()).toBe(1);
      expect(onUpdate).toHaveBeenCalledOnce();

      const data = loader.getDataset('test.csv')!;
      expect(data).toHaveLength(3);
      expect(data[0]).toEqual({ x: 0, y: 0, z: 0, val: 1.5, h: 10 });
      expect(data[1]).toEqual({ x: 1, y: 1, z: 1, val: 2.5, h: 0 });
      expect(data[2]).toEqual({ x: 2, y: 2, z: 2, val: 3.5, h: 5 });
    });

    it('recognises z_relative and u column names', () => {
      const { loader } = makeLoader();
      loader.processCSVData(CSV_Z_RELATIVE, 'alt.csv');

      const data = loader.getDataset('alt.csv')!;
      expect(data).toHaveLength(2);
      expect(data[0].z).toBe(30);
      expect(data[0].val).toBe(0.5);
    });

    it('handles Windows-style \\r\\n line endings', () => {
      const csv = 'x,y,z,mag_u\r\n1,2,3,4\r\n5,6,7,8\r\n';
      const { loader } = makeLoader();
      loader.processCSVData(csv, 'win.csv');
      expect(loader.getDataset('win.csv')).toHaveLength(2);
    });

    it('skips leading blank lines', () => {
      const csv = '\n\n\nx,y,z,mag_u\n1,2,3,4';
      const { loader } = makeLoader();
      loader.processCSVData(csv, 'blanks.csv');
      expect(loader.getDataset('blanks.csv')).toHaveLength(1);
    });

    it('skips rows with NaN values in required columns', () => {
      const csv = 'x,y,z,mag_u\n1,2,3,4\nabc,2,3,4\n5,6,7,8';
      const { loader } = makeLoader();
      loader.processCSVData(csv, 'partial.csv');
      expect(loader.getDataset('partial.csv')).toHaveLength(2);
    });

    it('rejects CSV missing required x/y/z columns', () => {
      const csv = 'a,b,c\n1,2,3';
      const { loader, onUpdate, onError } = makeLoader();
      loader.processCSVData(csv, 'bad.csv');
      expect(loader.hasDataset('bad.csv')).toBe(false);
      expect(onUpdate).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith('Error: The file "bad.csv" is missing required columns (x, y, z).');
    });

    it('handles empty CSV gracefully', () => {
      const { loader, onUpdate, onError } = makeLoader();
      loader.processCSVData('', 'empty.csv');
      expect(loader.hasDataset('empty.csv')).toBe(false);
      expect(onUpdate).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith('Error: The file "empty.csv" is empty or invalid.');
    });

    it('defaults val to 0 when mag_u column is absent', () => {
      const csv = 'x,y,z\n1,2,3\n4,5,6';
      const { loader } = makeLoader();
      loader.processCSVData(csv, 'noval.csv');
      const data = loader.getDataset('noval.csv')!;
      expect(data).toHaveLength(2);
      expect(data[0].val).toBe(0);
    });

    it('defaults h to 0 when height column is absent', () => {
      const csv = 'x,y,z,mag_u\n1,2,3,4';
      const { loader } = makeLoader();
      loader.processCSVData(csv, 'noh.csv');
      expect(loader.getDataset('noh.csv')![0].h).toBe(0);
    });

    it('overwrites dataset with same name', () => {
      const { loader } = makeLoader();
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'dup.csv');
      loader.processCSVData('x,y,z,mag_u\n5,6,7,8\n9,10,11,12', 'dup.csv');
      expect(loader.getDataset('dup.csv')).toHaveLength(2);
    });

    it('parses U_x/U_y/U_z velocity components (the Export to Visualizer header)', () => {
      const csv = 'X,Y,Z_relative,U_at_z,mag_U,U_x,U_y,U_z\n1,2,3,5,5,3,-4,0.5\n4,5,6,0,0,0,0,0';
      const { loader } = makeLoader();
      loader.processCSVData(csv, 'vec.csv');
      const data = loader.getDataset('vec.csv')!;
      expect(data).toHaveLength(2);
      expect(data[0].u).toBe(3);
      expect(data[0].v).toBe(-4);
      expect(data[0].w).toBe(0.5);
      expect(data[1].u).toBe(0);
    });

    it('leaves velocity fields undefined for legacy CSVs without U_x/U_y', () => {
      const { loader } = makeLoader();
      loader.processCSVData(SIMPLE_CSV, 'legacy.csv');
      const data = loader.getDataset('legacy.csv')!;
      expect(data[0].u).toBeUndefined();
      expect(data[0].v).toBeUndefined();
    });

    it('treats malformed vector cells as still air, keeping the row', () => {
      const csv = 'x,y,z,mag_u,u_x,u_y,u_z\n1,2,3,4,abc,2,0';
      const { loader } = makeLoader();
      loader.processCSVData(csv, 'nanvec.csv');
      const data = loader.getDataset('nanvec.csv')!;
      expect(data).toHaveLength(1);
      expect(data[0].u).toBe(0);
      expect(data[0].v).toBe(2);
    });
  });

  describe('dataset management', () => {
    it('getSortedDatasetNames sorts numerically', () => {
      const { loader } = makeLoader();
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'file_10.csv');
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'file_2.csv');
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'file_1.csv');

      expect(loader.getSortedDatasetNames()).toEqual([
        'file_1.csv',
        'file_2.csv',
        'file_10.csv',
      ]);
    });

    it('getSortedDatasetNames sorts alphabetically when no numbers', () => {
      const { loader } = makeLoader();
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'bravo.csv');
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'alpha.csv');

      expect(loader.getSortedDatasetNames()).toEqual([
        'alpha.csv',
        'bravo.csv',
      ]);
    });

    it('deleteDataset removes a dataset', () => {
      const { loader } = makeLoader();
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'del.csv');
      expect(loader.deleteDataset('del.csv')).toBe(true);
      expect(loader.hasDataset('del.csv')).toBe(false);
      expect(loader.getDatasetCount()).toBe(0);
    });

    it('deleteDataset returns false for missing dataset', () => {
      const { loader } = makeLoader();
      expect(loader.deleteDataset('nope')).toBe(false);
    });

    it('getDataset returns undefined for missing name', () => {
      const { loader } = makeLoader();
      expect(loader.getDataset('nope')).toBeUndefined();
    });

    it('getAllDatasets returns the internal map', () => {
      const { loader } = makeLoader();
      loader.processCSVData('x,y,z,mag_u\n1,2,3,4', 'a.csv');
      const all = loader.getAllDatasets();
      expect(all).toBeInstanceOf(Map);
      expect(all.size).toBe(1);
    });
  });
});

// ── updateResultsDropdown ────────────────────────────────────────────────────
describe('updateResultsDropdown', () => {
  it('populates options from dataset names', () => {
    const select = document.createElement('select');
    updateResultsDropdown(select, ['a', 'b', 'c']);

    expect(select.options.length).toBe(3);
    expect(select.options[0].value).toBe('a');
    expect(select.disabled).toBe(false);
  });

  it('disables select when list is empty', () => {
    const select = document.createElement('select');
    updateResultsDropdown(select, []);

    expect(select.disabled).toBe(true);
    expect(select.title).toBe('Upload a dataset to select results');
  });

  it('preserves firstOption when provided', () => {
    const select = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.text = 'Pick...';
    updateResultsDropdown(select, ['x'], placeholder);

    expect(select.options.length).toBe(2);
    expect(select.options[0].text).toBe('Pick...');
  });
});

// ── handleFileUpload ─────────────────────────────────────────────────────────
describe('handleFileUpload', () => {
  it('does nothing when files is null', () => {
    const cb = vi.fn();
    handleFileUpload(null, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('reads .csv files and calls processCSV', async () => {
    const csvContent = 'x,y,z\n1,2,3';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const fileList = {
      length: 1,
      item: (i: number) => (i === 0 ? file : null),
      [Symbol.iterator]: function* () { yield file; },
      0: file,
    } as unknown as FileList;

    const cb = vi.fn();
    handleFileUpload(fileList, cb);

    // wait for FileReader async
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).toHaveBeenCalledWith(csvContent, 'test.csv');
  });

  it('ignores non-csv files and calls onError if provided', async () => {
    const file = new File(['hello'], 'readme.txt', { type: 'text/plain' });
    const fileList = {
      length: 1,
      item: () => file,
      [Symbol.iterator]: function* () { yield file; },
      0: file,
    } as unknown as FileList;

    const cb = vi.fn();
    const errCb = vi.fn();
    handleFileUpload(fileList, cb, errCb);
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).not.toHaveBeenCalled();
    expect(errCb).toHaveBeenCalledWith('Unsupported file type: "readme.txt". Please upload .csv files.');
  });

  it('calls onError with multiple files message when multiple invalid files are uploaded', async () => {
    const file1 = new File(['hello'], 'readme.txt', { type: 'text/plain' });
    const file2 = new File(['world'], 'data.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileList = {
      length: 2,
      item: (i: number) => (i === 0 ? file1 : i === 1 ? file2 : null),
      0: file1,
      1: file2
    } as unknown as FileList;

    const cb = vi.fn();
    const errCb = vi.fn();
    handleFileUpload(fileList, cb, errCb);
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).not.toHaveBeenCalled();
    expect(errCb).toHaveBeenCalledWith('Unsupported file types: 2 files ignored. Please upload .csv files.');
  });
});
