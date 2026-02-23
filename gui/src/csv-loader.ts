// CSV Loader module - handles CSV parsing and dataset management

export interface SensorDataPoint {
  x: number;
  y: number;
  z: number;
  val: number;
  h: number;
}

export class CSVLoader {
  private loadedDatasets = new Map<string, SensorDataPoint[]>();
  private onUpdateUI: () => void;

  constructor(
    onUpdateUI: () => void
  ) {
    this.onUpdateUI = onUpdateUI;
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
        return;
      }

      const header = headerLine.split(',').map(h => h.trim());
      const xIdx = header.findIndex(h => h.toLowerCase() === 'x');
      const yIdx = header.findIndex(h => h.toLowerCase() === 'y');
      const zIdx = header.findIndex(h => h.toLowerCase() === 'z_relative' || h.toLowerCase() === 'z');
      const valIdx = header.findIndex(h => h.toLowerCase() === 'mag_u' || h.toLowerCase() === 'u' || h.toLowerCase().includes('mag_u'));
      const hIdx = header.findIndex(h => h.toLowerCase() === 'bldg_height' || h.toLowerCase().includes('height'));

      if (xIdx === -1 || yIdx === -1 || zIdx === -1) {
        console.error('Missing columns in CSV:', { xIdx, yIdx, zIdx });
        return;
      }

      const newData: SensorDataPoint[] = [];
      const maxIdx = Math.max(xIdx, yIdx, zIdx, valIdx);

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
            const line = text.substring(lineStart, contentEnd);
            // Skip whitespace-only lines
            if (line.trim().length > 0) {
                const parts = line.split(',');
                if (parts.length > maxIdx) {
                    const x = parseFloat(parts[xIdx]);
                    const y = parseFloat(parts[yIdx]);
                    const z = parseFloat(parts[zIdx]);
                    const val = valIdx !== -1 ? parseFloat(parts[valIdx]) : 0;
                    const h = hIdx !== -1 ? parseFloat(parts[hIdx]) : 0;

                    if (!isNaN(x) && !isNaN(y) && !isNaN(z) && !isNaN(val)) {
                      newData.push({ x, y, z, val, h });
                    }
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

  datasetNames.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.text = key;
    select.appendChild(option);
  });
}

export function handleFileUpload(
  files: FileList | null,
  processCSV: (text: string, name: string) => void
) {
  if (!files) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name.toLowerCase().endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        processCSV(text, file.name);
      };
      reader.readAsText(file);
    }
  }
}
