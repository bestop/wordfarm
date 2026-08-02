$ErrorActionPreference = 'Stop'

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Join-Path $scriptPath '..'
$dataFile = Join-Path $root 'src\game\data.ts'
$dictFile = Join-Path $scriptPath 'phonetics.json'

# 1. Run the phonetic generator to produce phonetics.json (skip if node fails)
try {
    Push-Location $root
    & node (Join-Path $scriptPath 'gen_phonetics.js') 2>&1 | Out-Null
    Pop-Location
} catch {
    Write-Warning "gen_phonetics.js failed: $($_.Exception.Message)"
    Pop-Location
}

# 2. Load phonetics dict if present, otherwise fall back to inline small dict
$phonetics = $null
if (Test-Path $dictFile) {
    Add-Type -AssemblyName System.Web.Extensions
    $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $serializer.MaxJsonLength = 10000000
    $phonetics = $serializer.DeserializeObject([IO.File]::ReadAllText($dictFile))
    Write-Host "Loaded phonetics dict: $($phonetics.Count) entries"
} else {
    Write-Warning "phonetics.json not found. Falling back to rule-based phonetics."
    $phonetics = @{}
}

function Get-Phonetic {
    param([string]$w)
    $w = $w.ToLower()
    if ($phonetics -and $phonetics.ContainsKey($w)) { return $phonetics[$w] }

    # Suffix map (suffix -> IPA ending)
    $suffixes = @(
        @('tion', 'ʃən'), @('sion', 'ʒən'), @('ssion', 'ʃən'),
        @('cial', 'ʃəl'), @('tial', 'ʃəl'),
        @('gious', 'dʒəs'), @('cious', 'ʃəs'), @('tious', 'ʃəs'), @('eous', 'iəs'),
        @('ence', 'əns'), @('ance', 'əns'), @('ment', 'mənt'), @('ness', 'nəs'),
        @('able', 'əbəl'), @('ible', 'əbəl'),
        @('ful', 'fəl'), @('less', 'ləs'), @('hood', 'hʊd'), @('ward', 'wɚd'),
        @('ship', 'ʃɪp'), @('dom', 'dəm'), @('ism', 'ɪzəm'), @('ist', 'ɪst'),
        @('ity', 'əti'), @('ly', 'li'),
        @('er', 'ɚ'), @('or', 'ɚ'), @('our', 'ʊr'), @('ous', 'əs'), @('ive', 'ɪv'),
        @('ize', 'aɪz'), @('ise', 'aɪz'), @('ate', 'eɪt'), @('en', 'ən'),
        @('ure', 'jʊr'), @('age', 'ɪdʒ'),
        @('al', 'əl'), @('ant', 'ənt'), @('ent', 'ənt'),
        @('ary', 'eri'), @('ory', 'ɔri'), @('ery', 'əri'),
        @('ing', 'ɪŋ'), @('ed', 'd'), @('es', 'z'), @('s', 'z')
    )
    foreach ($sfx in $suffixes) {
        if ($w.EndsWith($sfx[0])) { $root = $w.Substring(0, $w.Length - $sfx[0].Length); return (Get-RootPhonetic $root) + $sfx[1] }
    }
    return Get-RootPhonetic $w
}

function Get-RootPhonetic {
    param([string]$r)
    if ([string]::IsNullOrEmpty($r)) { return '' }
    $vowels = @('a','e','i','o','u')
    $out = ''
    for ($i = 0; $i -lt $r.Length; $i++) {
        $c = $r[$i]
        if ($vowels -contains $c) {
            # vowel cluster
            $cluster = [string]$c
            $j = $i + 1
            while ($j -lt $r.Length -and $vowels -contains $r[$j] -and $j -lt $i + 3) { $cluster += $r[$j]; $j++ }
            $nextCons = if ($j -lt $r.Length) { [string]$r[$j] } else { $null }
            $afterNext = if ($j + 1 -lt $r.Length) { [string]$r[$j + 1] } else { $null }
            $isLong = (($nextCons -ne $null) -and ($afterNext -eq 'e') -and ($j -eq $r.Length - 2)) -or
                      (($nextCons -ne $null) -and ($afterNext -ne $null) -and -not ($vowels -contains $nextCons) -and ($vowels -contains $afterNext))
            switch -Exact ($cluster) {
                'ai' { $out += 'eɪ' }
                'ay' { $out += 'eɪ' }
                'au' { $out += 'ɔː' }
                'aw' { $out += 'ɔː' }
                'ea' { $out += if ($nextCons -eq 'd' -or $nextCons -eq $null) { 'iː' } else { 'ɛ' } }
                'ee' { $out += 'iː' }
                'ei' { $out += 'eɪ' }
                'ey' { $out += 'eɪ' }
                'ie' { $out += 'aɪ' }
                'oa' { $out += 'oʊ' }
                'oo' { $out += 'uː' }
                'ou' { $out += 'aʊ' }
                'ow' { $out += 'aʊ' }
                'oi' { $out += 'ɔɪ' }
                'oy' { $out += 'ɔɪ' }
                'ue' { $out += 'uː' }
                'ui' { $out += 'uː' }
                'a' { $out += if ($isLong) { 'eɪ' } else { 'æ' } }
                'e' { $out += if ($isLong) { 'iː' } else { 'ɛ' } }
                'i' { $out += if ($isLong) { 'aɪ' } else { 'ɪ' } }
                'o' { $out += if ($isLong) { 'oʊ' } else { 'ɒ' } }
                'u' { $out += if ($isLong) { 'juː' } else { 'ʌ' } }
                default { $out += $cluster }
            }
            $i = $j - 1
        } else {
            switch -Exact ([string]$c) {
                'c' { $nxt = if ($i + 1 -lt $r.Length) { [string]$r[$i + 1] } else { '' }; $out += if ('eiy'.Contains($nxt)) { 's' } else { 'k' } }
                'g' { $nxt = if ($i + 1 -lt $r.Length) { [string]$r[$i + 1] } else { '' }; $out += if ('eiy'.Contains($nxt)) { 'dʒ' } else { 'ɡ' } }
                'q' { $out += 'kw' }
                'x' { $out += 'ks' }
                'y' { $prv = if ($i -gt 0) { [string]$r[$i - 1] } else { '' }; if ($i -eq 0) { $out += 'j' } elseif ($vowels -contains $prv) { } else { $out += 'i' } }
                default { $out += [string]$c }
            }
        }
    }
    # digraph pass + double letter collapse
    $out = $out -replace 'th', 'θ' -replace 'sh', 'ʃ' -replace 'ch', 'tʃ' -replace 'dʒʒ', 'dʒ' -replace 'kk','k' -replace 'tt','t' -replace 'dd','d' -replace 'pp','p' -replace 'bb','b' -replace 'll','l' -replace 'mm','m' -replace 'nn','n' -replace 'ss','s' -replace 'gg','ɡ' -replace 'rr','r' -replace 'ff','f'
    return $out
}

# 3. Update Word interface: add optional phonetic
$raw = [IO.File]::ReadAllText($dataFile)
if ($raw -notmatch 'phonetic\s*\?\:') {
    $raw = $raw -replace "(export interface Word \{[\s\S]*?difficulty: 1 \| 2 \| 3;)", ('$1' + "`r`n  phonetic?: string;")
}

# 4. Replace each word entry with a version carrying phonetic:  en: 'xxx', zh: 'yyy', difficulty: D }  ->  en: 'xxx', zh: 'yyy', phonetic: '/ipa/', difficulty: D }
$re = [regex]::new("\{\s*en:\s*'([^']+)',\s*zh:\s*'([^']+)',\s*difficulty:\s*([123])\s*\}", [System.Text.RegularExpressions.RegexOptions]::Multiline)
$newRaw = $re.Replace($raw, {
    param($m)
    $en = $m.Groups[1].Value
    $zh = $m.Groups[2].Value
    $d  = $m.Groups[3].Value
    $ph = Get-Phonetic $en
    return "{ en: '$en', zh: '$zh', phonetic: `"/$ph/`", difficulty: $d }"
})
$count = ([regex]::Matches($newRaw, "phonetic: `/")).Count
Write-Host "Patched $count word entries with phonetics"

[IO.File]::WriteAllText($dataFile, $newRaw, [Text.Encoding]::UTF8)
Write-Host "Saved $dataFile"
