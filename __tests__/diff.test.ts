import { extractGemfileLockDiffLines, extractAddedRubyGemsNames, parseDiff } from '../src/diff'
import { expect, test } from '@jest/globals'

const diff = `
diff --git a/.github/fixtures/Gemfile.lock b/.github/fixtures/Gemfile.lock
index 144048b..656b118 100644
--- a/.github/fixtures/Gemfile.lock
+++ b/.github/fixtures/Gemfile.lock
@@ -1,7 +1,7 @@
 PATH
   remote: .
   specs:
-    aspnet_password_hasher (0.1.0)
+    aspnet_password_hasher (1.0.0)
 
 GEM
   remote: https://rubygems.org/
@@ -11,13 +11,13 @@ GEM
     coderay (1.1.3)
     diff-lcs (1.4.4)
     docile (1.4.0)
-    parser (3.0.1.1)
+    parser (3.0.2.0)
       ast (~> 2.4.1)
     proc_to_ast (0.1.0)
       coderay
       parser
       unparser
-    rake (13.0.3)
+    rake (13.0.6)
     rspec (3.10.0)
       rspec-core (~> 3.10.0)
       rspec-expectations (~> 3.10.0)
diff --git a/dist/index.js b/dist/index.js
index 5b7555e..297291e 100644
--- a/dist/index.js
+++ b/dist/index.js
@@ -68,16 +68,20 @@ function fetchRubyGemsDescription(gemname) {
             port: 443,
             path: /gems/rails,
             method: 'GET',
-            heders: {
+            headers: {
                 'Authorization': token,
                 'Content-Type': 'application/json',
             }
         };
`

test('extractGemfileLockDiffLines', () => {
  const diffLines = extractGemfileLockDiffLines(diff)
  expect(diffLines.length).toBe(1)
  expect(diffLines[0].length).toBe(6)
})

test('extractAddedRubyGemsNames', () => {
  const lines = [
    '-    aspnet_password_hasher (0.1.0)',
    '+    aspnet_password_hasher (1.0.0)',
    '-    parser (3.0.1.1)',
    '+    parser (3.0.2.0)',
    '-    rake (13.0.3)',
    '+    rake (13.0.6)'
  ]

  const gemnames = extractAddedRubyGemsNames(lines)
  expect(gemnames).toStrictEqual(['aspnet_password_hasher', 'parser', 'rake'])
})

test('parseDiff', () => {
  const gemnames = parseDiff(diff)
  expect(gemnames).toStrictEqual(['aspnet_password_hasher', 'parser', 'rake'])
})
