export interface ParsedQuery {
  raw: string;
  text: string;
  typeFilter?: string; // class, file, symbol, text
  kindFilter?: string; // method, function, class, etc.
  pathFilter?: string;
  extFilter?: string;
  langFilter?: string;
  isExact?: boolean;
  warnings?: string[];
}

export class QueryParser {
  private static readonly FILTER_REGEX = /(?:type|kind|path|ext|lang):[^\s]+/gi;
  public static readonly VALID_TYPES = new Set(['all', 'class', 'file', 'symbol', 'text']);

  public static parse(query: string): ParsedQuery {
    const raw = query.trim();
    if (!raw) {
      return { raw: '', text: '' };
    }

    let text = raw;
    let typeFilter: string | undefined;
    let kindFilter: string | undefined;
    let pathFilter: string | undefined;
    let extFilter: string | undefined;
    let langFilter: string | undefined;
    const warnings: string[] = [];

    const matches = raw.match(QueryParser.FILTER_REGEX);
    if (matches) {
      for (const m of matches) {
        text = text.replace(m, '').trim();
        const colonIndex = m.indexOf(':');
        const key = m.slice(0, colonIndex).toLowerCase();
        const val = m.slice(colonIndex + 1).trim();

        if (key === 'type') {
          const lowerVal = val.toLowerCase();
          if (QueryParser.VALID_TYPES.has(lowerVal)) {
            typeFilter = lowerVal;
          } else {
            warnings.push(
              `Invalid search type "${val}". Allowed: ${Array.from(QueryParser.VALID_TYPES).join(', ')}`
            );
          }
        } else if (key === 'kind') {
          kindFilter = val.toLowerCase();
        } else if (key === 'path') {
          pathFilter = val;
        } else if (key === 'ext') {
          extFilter = val.startsWith('.') ? val.slice(1).toLowerCase() : val.toLowerCase();
        } else if (key === 'lang') {
          langFilter = val.toLowerCase();
        }
      }
    }

    // Collapse multiple spaces
    text = text.replace(/\s+/g, ' ').trim();

    return {
      raw,
      text,
      typeFilter,
      kindFilter,
      pathFilter,
      extFilter,
      langFilter,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}
