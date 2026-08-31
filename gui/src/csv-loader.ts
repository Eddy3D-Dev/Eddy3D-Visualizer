// CSV Loader module - handles CSV parsing and dataset management

export interface SensorDataPoint {
  x: number;
  y: number;
  z: number;
  val: number;
  h: number;
  /** In-plane velocity components (m/s) from the optional U_x/U_y/U_z columns —
   *  what the particle-flow overlay advects along. Absent in older exports. */
  u?: number;
  v?: number;
  w?: number;
  /** True when u/v were APPROXIMATED as mag_U times the case's global inflow direction
   *  (ML datasets carry dir_sin/dir_cos but no local vectors) — the overlay then shows
   *  the inflow everywhere rather than the deflected local flow, and says so. */
  approxDir?: boolean;
}

export class CSVLoader {
  private loadedDatasets = new Map<string, SensorDataPoint[]>();
  private onUpdateUI: () => void;
  private onError?: (msg: string) => void;

  constructor(
    onUpdateUI: () => void,
    onError?: (msg: string) => void
  ) {
    this.onUpdateUI = onUpdateUI;
    this.onError = onError;
  }

  processCSVData(text: string, name: string) {
    try {
      // ⚡ Bolt Optimization: Iterate over string using indexOf instead of split('\n')
      // This avoids creating a massive array of strings for large files, significantly reducing memory usage and GC pressure.

      let lineStart = 0;
      let lineEnd = text.indexOf('\n', lineStart);
      if (lineEnd === -1) lineEnd = text.length;

      // Extract first line (header) and handle potential empty leading lines
      let headerLine = text.substring(lineStart, lineEnd).trim();

      while (headerLine.length === 0 && lineStart < text.length) {
          lineStart = lineEnd + 1;
          lineEnd = text.indexOf('\n', lineStart);
          if (lineEnd === -1) lineEnd = text.length;
          headerLine = text.substring(lineStart, lineEnd).trim();
      }

      if (headerLine.length === 0) {
        console.error('CSV is empty');
        this.onError?.(`Error: The file "${name}" is empty or invalid.`);
        return;
      }

      const header = headerLine.split(',').map(h => h.trim());
      const xIdx = header.findIndex(h => h.toLowerCase() === 'x');
      const yIdx = header.findIndex(h => h.toLowerCase() === 'y');
      const zIdx = header.findIndex(h => h.toLowerCase() === 'z_relative' || h.toLowerCase() === 'z');
      const valIdx = header.findIndex(h => h.toLowerCase() === 'mag_u' || h.toLowerCase() === 'u' || h.toLowerCase().includes('mag_u'));
      const hIdx = header.findIndex(h => h.toLowerCase() === 'bldg_height' || h.toLowerCase().includes('height'));
      // Optional velocity components (the Export to Visualizer component writes U_x/U_y/U_z);
      // they feed the particle-flow overlay and are simply absent in older exports.
      const uIdx = header.findIndex(h => h.toLowerCase() === 'u_x');
      const vIdx = header.findIndex(h => h.toLowerCase() === 'u_y');
      const wIdx = header.findIndex(h => h.toLowerCase() === 'u_z');
      // ML datasets (the bundled default included) carry no local vectors, but they do
      // carry the case's inflow direction as dir_sin/dir_cos — and DESPITE the names,
      // Eddy3D's Dataset Curator documents dir_sin as the flow X component and dir_cos
      // as the flow Y component. When no real U_x/U_y exists, u = mag * dir_sin and
      // v = mag * dir_cos give an APPROXIMATE field (the inflow direction everywhere,
      // scaled by the local speed) so the particle overlay still works on these files.
      const dirSinIdx = header.findIndex(h => h.toLowerCase() === 'dir_sin');
      const dirCosIdx = header.findIndex(h => h.toLowerCase() === 'dir_cos');

      if (xIdx === -1 || yIdx === -1 || zIdx === -1) {
        console.error('Missing columns in CSV:', { xIdx, yIdx, zIdx });
        this.onError?.(`Error: The file "${name}" is missing required columns (x, y, z).`);
        return;
      }

      const newData: SensorDataPoint[] = [];
      // ⚡ Bolt Optimization: include hIdx in maxIdx to ensure we parse height if present
      const maxIdx = Math.max(xIdx, yIdx, zIdx, valIdx, hIdx, uIdx, vIdx, wIdx, dirSinIdx, dirCosIdx);
      const hasVectors = uIdx !== -1 && vIdx !== -1;
      // Real components always win; the inflow approximation only fills their absence.
      const deriveVectors = !hasVectors && dirSinIdx !== -1 && dirCosIdx !== -1 && valIdx !== -1;

      // Advance past the header
      lineStart = lineEnd + 1;

      while (lineStart < text.length) {
        lineEnd = text.indexOf('\n', lineStart);
        if (lineEnd === -1) lineEnd = text.length;

        // Determine content end (exclude \r if present)
        let contentEnd = lineEnd;
        if (contentEnd > lineStart && text[contentEnd - 1] === '\r') {
            contentEnd--;
        }

        // Only process if there is content
        if (contentEnd > lineStart) {
            // ⚡ Bolt Optimization: Manual column parsing
            // Avoids line.split(',') which creates arrays and strings for every line.
            // Instead, we scan for commas and extract only needed columns.

            let currentPos = lineStart;
            let colIdx = 0;
            let x = NaN, y = NaN, z = NaN;
            // Default val/h to 0 if column not in header, else NaN (expecting value)
            let val = valIdx !== -1 ? NaN : 0;
            let h = hIdx !== -1 ? NaN : 0;
            let u = 0, v = 0, w = 0;
            let dirSin = NaN, dirCos = NaN;

            while (currentPos <= contentEnd) {
                let nextComma = text.indexOf(',', currentPos);
                if (nextComma === -1 || nextComma > contentEnd) nextComma = contentEnd;

                // Parse only relevant columns
                if (colIdx === xIdx) {
                    x = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === yIdx) {
                    y = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === zIdx) {
                    z = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === valIdx) {
                    val = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === hIdx) {
                    h = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === uIdx) {
                    u = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === vIdx) {
                    v = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === wIdx) {
                    w = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === dirSinIdx) {
                    dirSin = parseFloat(text.substring(currentPos, nextComma));
                } else if (colIdx === dirCosIdx) {
                    dirCos = parseFloat(text.substring(currentPos, nextComma));
                }

                // Stop if we passed the last column we need
                if (colIdx >= maxIdx) break;

                if (nextComma >= contentEnd) break;
                currentPos = nextComma + 1;
                colIdx++;
            }

            if (!isNaN(x) && !isNaN(y) && !isNaN(z) && !isNaN(val)) {
                if (hasVectors) {
                    // A malformed cell parses NaN — treat as still air, matching the loader's
                    // tolerance for the scalar columns.
                    newData.push({
                        x, y, z, val, h,
                        u: isNaN(u) ? 0 : u,
                        v: isNaN(v) ? 0 : v,
                        w: isNaN(w) ? 0 : w,
                    });
                } else if (deriveVectors && !isNaN(dirSin) && !isNaN(dirCos)) {
                    // dir_sin is the flow X component, dir_cos the Y — the Curator's own
                    // documented (mis)naming.
                    newData.push({
                        x, y, z, val, h,
                        u: val * dirSin,
                        v: val * dirCos,
                        w: 0,
                        approxDir: true,
                    });
                } else {
                    newData.push({ x, y, z, val, h });
                }
            }
        }

        lineStart = lineEnd + 1;
      }

      if (newData.length > 0) {
        this.loadedDatasets.set(name, newData);
        this.onUpdateUI();
      }
    } catch (err) {
      console.error('Error processing CSV:', err);
    }
  }

  getSortedDatasetNames(): string[] {
    const keys = Array.from(this.loadedDatasets.keys());
    
    keys.sort((a, b) => {
      const numA = a.match(/\d+/);
      const numB = b.match(/\d+/);

      if (numA && numB) {
        const valA = parseInt(numA[0]);
        const valB = parseInt(numB[0]);
        return valA - valB;
      } else if (numA) {
        return -1;
      } else if (numB) {
        return 1;
      } else {
        return a.localeCompare(b);
      }
    });

    return keys;
  }

  getDataset(name: string): SensorDataPoint[] | undefined {
    return this.loadedDatasets.get(name);
  }

  hasDataset(name: string): boolean {
    return this.loadedDatasets.has(name);
  }

  deleteDataset(name: string): boolean {
    return this.loadedDatasets.delete(name);
  }

  getDatasetCount(): number {
    return this.loadedDatasets.size;
  }

  getAllDatasets(): Map<string, SensorDataPoint[]> {
    return this.loadedDatasets;
  }
}

export function updateResultsDropdown(
  select: HTMLSelectElement,
  datasetNames: string[],
  firstOption?: HTMLOptionElement
) {
  if (firstOption) {
    select.innerHTML = '';
    select.appendChild(firstOption);
  } else {
    select.innerHTML = '';
  }

  for (let i = 0; i < datasetNames.length; i++) {
    const key = datasetNames[i];
    const option = document.createElement('option');
    option.value = key;
    option.text = key;
    select.appendChild(option);
  }

  const isDisabled = datasetNames.length === 0;
  select.disabled = isDisabled;
  if (isDisabled) {
    select.title = 'Upload a dataset to select results';
  } else {
    select.removeAttribute('title');
  }
}

export function handleFileUpload(
  files: FileList | null,
  processCSV: (text: string, name: string) => void,
  onError?: (msg: string) => void
) {
  if (!files) return;

  const invalidFiles: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name.toLowerCase().endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        processCSV(text, file.name);
      };
      reader.readAsText(file);
    } else {
      invalidFiles.push(file.name);
    }
  }

  if (invalidFiles.length > 0 && onError) {
    if (invalidFiles.length === 1) {
      onError(`Unsupported file type: "${invalidFiles[0]}". Please upload .csv files.`);
    } else {
      onError(`Unsupported file types: ${invalidFiles.length} files ignored. Please upload .csv files.`);
    }
  }
}
