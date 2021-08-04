type Lines = string[]
type RubyGemsName = string

function isGemfileLockDiffStart(line: string): boolean {
  return !!line.match(/^diff --git a\/.*Gemfile.lock$/)
}

function isDiffStart(line: string): boolean {
  return !!line.match(/^diff --git a\//)
}

function isDiff(line: string): boolean {
  return !!line.match(/^[-+][^-+]/)
}

function extractRubyGemsName(line: string): string | undefined {
  const match = line.match(/^[+] +([^ ]+) \(.*$/)
  return match ? match[1] : undefined
}

export function extractGemfileLockDiffLines(diff: string): Lines[] {
  const diffs: Lines[] = []
  let lines: Lines = []
  let inGemfileLock = false
  for (const line of diff.split('\n')) {
    if (inGemfileLock && isDiffStart(line)) {
      diffs.push(lines)
      inGemfileLock = isGemfileLockDiffStart(line)
      lines = []
    } else if (inGemfileLock && isDiff(line)) {
      lines.push(line)
    } else if (isGemfileLockDiffStart(line)) {
      inGemfileLock = true
    }
  }

  if (lines.length > 0) {
    diffs.push(lines)
  }
  return diffs
}

export function extractAddedRubyGemsNames(lines: Lines): RubyGemsName[] {
  return lines.map(extractRubyGemsName).filter(name => !!name) as RubyGemsName[]
}

export function parseDiff(diff: string): RubyGemsName[] {
  const names = new Set<RubyGemsName>()
  for (const lines of extractGemfileLockDiffLines(diff)) {
    for (const name of extractAddedRubyGemsNames(lines)) {
      names.add(name)
    }
  }
  return Array.from(names)
}
