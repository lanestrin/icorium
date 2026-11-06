<#
.SYNOPSIS
  Checks a PR title against the commit subject rules in blueprint/commit-rules.md.

.DESCRIPTION
  With squash merge the PR title becomes the commit subject on main, so it must
  read "<type>: <summary>" (or "<type>!: <summary>"), where the type is feat, fix,
  chore, docs or test, at most 72 characters and with no trailing full stop.
  Exits 0 when the title passes, 1 with the broken rule otherwise.

.EXAMPLE
  pwsh -File scripts/check-pr-title.ps1 -Title "feat: add CSV validation"
#>
param(
	[Parameter(Mandatory)][AllowEmptyString()][string]$Title
)

$problem = if ($Title -cnotmatch '^(feat|fix|chore|docs|test)!?: \S') {
	'it must start with "<type>: " or "<type>!: ", where the type is feat, fix, chore, docs or test, followed by a summary'
}
elseif ($Title.Length -gt 72) {
	"it is $($Title.Length) characters; the limit is 72"
}
elseif ($Title.EndsWith('.')) {
	'it must not end with a full stop'
}

if ($problem) {
	Write-Output "PR title fails the commit subject rules in blueprint/commit-rules.md: $problem."
	exit 1
}
Write-Output 'PR title passes.'
exit 0
