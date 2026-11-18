// Turning positioned pieces of text into rows and cells. Both the PDF text reader (pdf.ts) and OCR (ocr.ts)
// produce positioned text, so one set of rules decides what is a row and what is a cell.

/** Items whose baselines are within this share of the text height are on the same row. */
export const ROW_TOLERANCE = 0.5;
/** A horizontal gap wider than this share of the text height starts a new cell. */
export const CELL_GAP = 0.5;

/** One piece of text on a page, positioned by its left edge and baseline (PDF y points up). */
export interface PlacedText { text: string; x: number; y: number; width: number; height: number }

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/**
 * Turns one page's text into rows of cell text. Items are taken top to bottom: an item joins the current
 * row when its baseline is within ROW_TOLERANCE of the row's text height, otherwise it starts a new row.
 * Within a row, items are taken left to right: a gap wider than CELL_GAP of the text height starts a new
 * cell, and a smaller gap joins the item to the cell with a space (none when the items touch). A missing
 * cell can't be seen from the gaps, so that row simply has fewer cells and findTable flags it.
 */
export function groupTextItems(items: PlacedText[]): string[][] {
  const visible = items.filter((item) => item.text.trim() !== '');
  const typicalHeight = median(visible.map((item) => item.height).filter((h) => h > 0)) || 1;
  const sized = visible.map((item) => ({ ...item, height: item.height > 0 ? item.height : typicalHeight }));

  const rows: (typeof sized)[] = [];
  for (const item of [...sized].sort((a, b) => b.y - a.y)) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= row[0].height * ROW_TOLERANCE) row.push(item);
    else rows.push([item]);
  }

  return rows.map((row) => {
    const cells: string[] = [];
    let end = -Infinity;
    for (const item of [...row].sort((a, b) => a.x - b.x)) {
      const gap = item.x - end;
      if (cells.length === 0 || gap > item.height * CELL_GAP) cells.push(item.text.trim());
      else cells[cells.length - 1] += (gap > 0 ? ' ' : '') + item.text.trim();
      end = Math.max(end, item.x + item.width);
    }
    return cells;
  });
}
