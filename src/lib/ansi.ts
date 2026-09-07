/** 单行 ANSI 分段；无 className 时不包 span */
export interface AnsiSegment {
  text: string;
  className?: string;
}

interface SgrState {
  fg: string | null;
  bold: boolean;
  dim: boolean;
  underline: boolean;
}

function resetState(): SgrState {
  return { fg: null, bold: false, dim: false, underline: false };
}

function fgClass(code: number): string | null {
  if (code === 30 || code === 90) return "log-fg-dim";
  if (code === 31 || code === 91) return "log-fg-red";
  if (code === 32 || code === 92) return "log-fg-green";
  if (code === 33 || code === 93) return "log-fg-yellow";
  if (code === 34 || code === 94 || code === 35 || code === 95 || code === 36 || code === 96) {
    return "log-fg-text";
  }
  if (code === 37 || code === 97) return "log-fg-bright";
  if (code === 39) return null;
  return null;
}

function buildClassName(state: SgrState): string | undefined {
  const parts: string[] = [];
  if (state.fg) parts.push(state.fg);
  if (state.bold) parts.push("log-bold");
  if (state.dim) parts.push("log-dim");
  if (state.underline) parts.push("log-underline");
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function applySgr(state: SgrState, codes: number[]): void {
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    if (code === 0) {
      Object.assign(state, resetState());
    } else if (code === 1) {
      state.bold = true;
    } else if (code === 2) {
      state.dim = true;
    } else if (code === 4) {
      state.underline = true;
    } else if (code === 22) {
      state.bold = false;
    } else if (code === 24) {
      state.underline = false;
    } else if (code === 38 || code === 48) {
      if (codes[i + 1] === 5) i += 2;
      else if (codes[i + 1] === 2) i += 4;
    } else if (code >= 30 && code <= 37) {
      state.fg = fgClass(code);
    } else if (code >= 90 && code <= 97) {
      state.fg = fgClass(code);
    } else if (code === 39) {
      state.fg = null;
    }
  }
}

function parseParams(raw: string): number[] {
  if (raw === "") return [0];
  return raw.split(";").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
}

function parseLine(line: string, state: SgrState): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let textBuf = "";
  let i = 0;

  const flush = () => {
    if (textBuf.length === 0) return;
    const className = buildClassName(state);
    segments.push(className ? { text: textBuf, className } : { text: textBuf });
    textBuf = "";
  };

  while (i < line.length) {
    if (line[i] === "\x1b") {
      i += 1;
      if (i >= line.length) break;
      const next = line[i]!;
      if (next === "[") {
        i += 1;
        let params = "";
        while (i < line.length) {
          const c = line[i]!;
          if (c >= "@" && c <= "~") {
            if (c === "m") {
              flush();
              applySgr(state, parseParams(params));
            }
            i += 1;
            break;
          }
          params += c;
          i += 1;
        }
      } else if (next === "]") {
        i += 1;
        while (i < line.length) {
          if (line[i] === "\x07") {
            i += 1;
            break;
          }
          if (line[i] === "\x1b" && i + 1 < line.length && line[i + 1] === "\\") {
            i += 2;
            break;
          }
          i += 1;
        }
      } else {
        i += 1;
      }
    } else {
      textBuf += line[i];
      i += 1;
    }
  }

  flush();
  if (segments.length === 0) segments.push({ text: "" });
  return segments;
}

/** 将原始日志行解析为可着色的文本分段；按行顺序保留 SGR 状态 */
export function parseAnsiLines(lines: string[]): AnsiSegment[][] {
  const state = resetState();
  return lines.map((line) => parseLine(line, state));
}
