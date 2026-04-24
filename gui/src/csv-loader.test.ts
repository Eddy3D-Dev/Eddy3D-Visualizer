import { describe, it, expect, vi } from 'vitest';
import { CSVLoader, updateResultsDropdown, handleFileUpload } from './csv-loader';

// ── CSVLoader ────────────────────────────────────────────────────────────────

function makeLoader() {
  const onUpdate = vi.fn();
  return { loader: new CSVLoader(onUpdate), onUpdate };
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
      const { loader, onUpdate } = makeLoader();
      loader.processCSVData(csv, 'bad.csv');
      expect(loader.hasDataset('bad.csv')).toBe(false);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('handles empty CSV gracefully', () => {
      const { loader, onUpdate } = makeLoader();
      loader.processCSVData('', 'empty.csv');
      expect(loader.hasDataset('empty.csv')).toBe(false);
      expect(onUpdate).not.toHaveBeenCalled();
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

    it('detects k column and creates a separate dataset', () => {
      const { loader } = makeLoader();
      const csv = 'x,y,z,u,k\n1,2,3,4,0.5';
      loader.processCSVData(csv, 'k_test.csv');

      expect(loader.hasDataset('k_test.csv')).toBe(true);
      expect(loader.hasDataset('k_test.csv (k)')).toBe(true);
      expect(loader.getDatasetCount()).toBe(2);

      const uData = loader.getDataset('k_test.csv')!;
      expect(uData[0].val).toBe(4);

      const kData = loader.getDataset('k_test.csv (k)')!;
      expect(kData[0].val).toBe(0.5);
    });

    it('detects mag_U_roof column and creates a separate roof dataset', () => {
      const { loader } = makeLoader();
      const csv = 'x,y,z,mag_U,mag_U_roof,Bldg_height\n1,2,3,4.0,1.18,14.5\n5,6,7,0.0,0.0,0.0';
      loader.processCSVData(csv, 'roof_test.csv');

      expect(loader.hasDataset('roof_test.csv')).toBe(true);
      expect(loader.hasDataset('roof_test.csv (roof)')).toBe(true);

      const uData = loader.getDataset('roof_test.csv')!;
      expect(uData[0].val).toBe(4.0);
      expect(uData[0].z).toBe(3); // pedestrian-level z stays unchanged

      const roofData = loader.getDataset('roof_test.csv (roof)')!;
      expect(roofData).toHaveLength(2);
      expect(roofData[0].val).toBe(1.18);
      expect(roofData[0].z).toBe(14.5 + 3); // z = Bldg_height + Z_relative for buildings
      expect(roofData[1].val).toBe(0.0);
      expect(roofData[1].z).toBe(7); // z stays at Z_relative when Bldg_height is 0
    });

    it('detects k_roof column and creates a separate k_roof dataset at roof height', () => {
      const { loader } = makeLoader();
      const csv = 'x,y,z,mag_U,k,k_roof,Bldg_height\n1,2,3,4.0,0.5,0.3,10.0';
      loader.processCSVData(csv, 'k_roof_test.csv');

      expect(loader.hasDataset('k_roof_test.csv')).toBe(true);
      expect(loader.hasDataset('k_roof_test.csv (k)')).toBe(true);
      expect(loader.hasDataset('k_roof_test.csv (k_roof)')).toBe(true);
      expect(loader.getDatasetCount()).toBe(3);

      const kRoofData = loader.getDataset('k_roof_test.csv (k_roof)')!;
      expect(kRoofData[0].val).toBe(0.3);
      expect(kRoofData[0].z).toBe(10.0 + 3); // z = Bldg_height + Z_relative
    });

    it('handles full ML pipeline CSV with all columns and correct roof z', () => {
      const { loader } = makeLoader();
      const csv = 'X,Y,Z_relative,SDF,Bldg_height,U_over_Uref,dir_sin,dir_cos,mag_U,k,mag_U_roof\n' +
        '-485.0,-54.5,1.8,-291.22,0.0,0.26,0.0,-1.0,0.0,0.0,0.0\n' +
        '-195.0,-14.5,1.8,-1.3,14.57,0.26,0.0,-1.0,0.0,0.0,1.18';
      loader.processCSVData(csv, 'full_pipeline.csv');

      expect(loader.hasDataset('full_pipeline.csv')).toBe(true);
      expect(loader.hasDataset('full_pipeline.csv (k)')).toBe(true);
      expect(loader.hasDataset('full_pipeline.csv (roof)')).toBe(true);
      expect(loader.getDatasetCount()).toBe(3);

      const uData = loader.getDataset('full_pipeline.csv')!;
      expect(uData).toHaveLength(2);
      expect(uData[0].z).toBe(1.8);   // pedestrian z unchanged
      expect(uData[0].h).toBe(0.0);
      expect(uData[1].z).toBe(1.8);   // pedestrian z unchanged even with building
      expect(uData[1].h).toBe(14.57);

      const roofData = loader.getDataset('full_pipeline.csv (roof)')!;
      expect(roofData[0].z).toBe(1.8);           // no building → stays at Z_relative
      expect(roofData[1].z).toBeCloseTo(14.57 + 1.8); // building → Bldg_height + Z_relative
      expect(roofData[1].val).toBe(1.18);
    });

    it('does not match mag_u_roof as the velocity column', () => {
      const { loader } = makeLoader();
      // CSV with only mag_U_roof, no mag_U — val should default to 0
      const csv = 'x,y,z,mag_U_roof\n1,2,3,5.5';
      loader.processCSVData(csv, 'only_roof.csv');

      const uData = loader.getDataset('only_roof.csv')!;
      expect(uData[0].val).toBe(0); // val should be 0 since there is no mag_u column

      const roofData = loader.getDataset('only_roof.csv (roof)')!;
      expect(roofData[0].val).toBe(5.5);
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

  it('ignores non-csv files', async () => {
    const file = new File(['hello'], 'readme.txt', { type: 'text/plain' });
    const fileList = {
      length: 1,
      item: () => file,
      [Symbol.iterator]: function* () { yield file; },
      0: file,
    } as unknown as FileList;

    const cb = vi.fn();
    handleFileUpload(fileList, cb);
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).not.toHaveBeenCalled();
  });
});
