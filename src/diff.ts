type Lines = string[]
type RubyGemsDiff = {
  name: string
  added: boolean
  version: string
}
type RubyGemsChange = {
  add?: RubyGemsDiff
  remove?: RubyGemsDiff
}
export type AddedRubyGems = {
  name: string
  oldVersion?: string
  newVersion: string
}

function isGemfileLockDiffStart(line: string): boolean {
  return !!line.match(/^diff --git a\/.*Gemfile.lock$/)
}

function isDiffStart(line: string): boolean {
  return !!line.match(/^diff --git a\//)
}

function isDiff(line: string): boolean {
  return !!line.match(/^[-+][^-+]/)
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

export function extractChangedRubyGemsNames(lines: Lines): RubyGemsDiff[] {
  const regexp = new RegExp(`^[-+] {4}([^ ]+) \\((.+)\\).*$`)
  const diffs = lines.map(line => {
    const match = line.match(regexp)
    if (!match) {
      return null
    }

    const [, name, version] = match
    const added = line[0] === '+'
    return {name, added, version}
  })

  return diffs.filter(diff => !!diff) as RubyGemsDiff[]
}

export function parseDiff(diff: string): AddedRubyGems[] {
  const diffs: RubyGemsDiff[] = []
  for (const lines of extractGemfileLockDiffLines(diff)) {
    for (const gem of extractChangedRubyGemsNames(lines)) {
      diffs.push(gem)
    }
  }

  const changes = new Map<string, RubyGemsChange>()
  for (const gem of diffs) {
    let change = changes.get(gem.name) || {}
    if (gem.added) {
      change.add = gem
    } else {
      change.remove = gem
    }
    changes.set(gem.name, change)
  }

  const gems: AddedRubyGems[] = []
  for (const [name, change] of changes.entries()) {
    if (!change.add) continue

    gems.push({
      name: name,
      oldVersion: change.remove?.version,
      newVersion: change.add.version
    })
  }
  return gems
}
