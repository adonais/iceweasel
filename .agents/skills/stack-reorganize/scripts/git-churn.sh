#!/bin/sh
# Add-then-remove churn in a commit range: the range's net diff against the
# sum of the individual commits' diffs, and the gap between them. With
# --origins, also which earlier commit wrote the lines each commit removes, by
# path; a path row counts its blank lines, which belong to the block they
# separate, and which files an in-range commit adds that the tip lacks.
# --lines also prints the removed lines an in-range origin wrote,
# under that origin, and each commit's additions by path. A <carrier> after
# either flag restricts that table to the one commit.
#
# Usage: git-churn.sh [--origins | --lines] [<carrier>] <base>..<tip> [-- <pathspec>...]    # <base> is the commit below the range
set -eu

usage() { echo "usage: git-churn.sh [--origins | --lines] [<carrier>] <base>..<tip> [-- <pathspec>...]"; }

origins= lines= carrier=
case ${1-} in
--origins)
    origins=1
    shift
    ;;
--lines)
    origins=1 lines=1
    shift
    ;;
esac
if [ -n "$origins" ]; then
    case ${1-} in
    '' | -- | -h | --help | *..*) ;;
    *)
        carrier=$(git rev-parse --verify --quiet "$1^{commit}") || { echo "git-churn.sh: not a commit: $1" >&2; exit 2; }
        shift
        ;;
    esac
fi
case ${1-} in
--help | -h)
    usage
    exit 0
    ;;
*..*) range=$1 ;;
*)
    usage >&2
    exit 2
    ;;
esac
shift
[ "${1-}" != -- ] || shift

base=${range%%..*}
tip=${range##*..}
tab=$(printf '\t')
for end in "$base" "$tip"; do
    git rev-parse --verify --quiet "$end^{commit}" >/dev/null || { echo "git-churn.sh: not a commit: $end" >&2; exit 2; }
done
if [ -n "$carrier" ] && ! git rev-list "$range" | grep -qx "$carrier"; then
    echo "git-churn.sh: $carrier is not in $range" >&2
    exit 2
fi

total() { awk '{i += $1; d += $2} END {print i + d + 0}'; }
subject() { git log -1 --format=%s "$1" | sed 's/^[Bb]ug [0-9]* - //; s/ r[?=].*//' | awk 'length > 56 { $0 = substr($0, 1, 57); sub(/ [^ ]*$/, "") } 1'; }

net=$(git diff --numstat "$base" "$tip" -- "$@" | total)
sum=$(git log --no-merges --numstat --format= "$range" -- "$@" | total)
gap=$((sum - net))
[ "$sum" -gt 0 ] || { echo "git-churn.sh: nothing measured; a pathspec is relative to the current directory, so run from the repository root or write :(top)<path>" >&2; exit 2; }

printf 'range           %s\n' "$range"
printf 'fold NET        %s\n' "$net"
printf 'per-commit SUM  %s\n' "$sum"
printf 'gap             %s\n' "$gap"

for c in $(git rev-list --reverse "$range"); do
    printf '  %s %6s  %s\n' \
        "$(git rev-parse --short=12 "$c")" \
        "$(git show --numstat --format= "$c" -- "$@" | total)" \
        "$(subject "$c")"
done

[ -n "$origins" ] || exit 0

# Blame each removed line at the commit's parent. A line from inside the range
# is churn; a line from below it is the commit's own work.
printf '\nremoved lines by the commit that wrote them%s\n' "${lines:+, and added lines by path}"
all_in=0
for c in $(git rev-list --reverse "$range"); do
    [ -z "$carrier" ] || [ "$c" = "$carrier" ] || continue
    printf '  %s  %s\n' "$(git rev-parse --short=12 "$c")" "$(subject "$c")"
    # "origin<tab>path<tab>lineno) text" for every removed line
    blamed=$(git show -U0 --src-prefix=a/ --dst-prefix=b/ --format= "$c" -- "$@" |
        awk '/^--- a\// { f = substr($2, 3) }
             /^@@/ { split(substr($2, 2), o, ","); n = (o[2] == "" ? 1 : o[2]); if (n > 0) print f, o[1], o[1] + n - 1 }' |
        while read -r f lo hi; do
            git blame --line-porcelain -L "$lo,$hi" "$c^" -- "$f" |
                awk -v f="$f" -v tab="$tab" '
                    $1 ~ /^[0-9a-f]+$/ && length($1) == 40 { sha = substr($1, 1, 12); n = $3 }
                    /^\t/ { print sha tab f tab n ") " substr($0, 2) }'
        done)
    by_path=$([ -z "$blamed" ] || printf '%s\n' "$blamed" | cut -f1,2 | sort | uniq -c)
    classified=$(printf '%s\n' "$by_path" | awk 'NF { n[$2] += $1 } END { for (o in n) print n[o], o }' | sort -rn |
        while read -r n o; do
            if git merge-base --is-ancestor "$o" "$base"; then where=below; else where=in; fi
            printf '%s %s %s %s\n' "$n" "$o" "$where" "$(subject "$o")"
        done)
    # Each origin lists its paths; an in-range origin's are the partition an absorb needs.
    [ -z "$classified" ] || printf '%s\n' "$classified" |
        while read -r n o where rest; do
            printf '    %5d from %s  %s  (%s the range)\n' "$n" "$o" "$rest" "$where"
            printf '%s\n' "$by_path" | awk -v o="$o" '$2 == o { print $1, $3 }' |
                while read -r n f; do
                    blank=$(printf '%s\n' "$blamed" | awk -F"$tab" -v o="$o" -v f="$f" '$1 == o && $2 == f && $3 ~ /^[0-9]+\) $/ { b++ } END { print b + 0 }')
                    if [ "$blank" -gt 0 ]; then
                        printf '          %5d  %s  (%d blank)\n' "$n" "$f" "$blank"
                    else
                        printf '          %5d  %s\n' "$n" "$f"
                    fi
                    [ -z "$lines" ] || [ "$where" != in ] || printf '%s\n' "$blamed" |
                        awk -F"$tab" -v o="$o" -v f="$f" '$1 == o && $2 == f { print "                 " $3 }'
                done
        done
    in=$(printf '%s\n' "$classified" | awk '$3 == "in" { s += $1 } END { print s + 0 }')
    printf '    %5d removed from inside the range\n' "$in"
    all_in=$((all_in + in))
    [ -z "$lines" ] || git show --numstat --format= "$c" -- "$@" | awk -F"$tab" '$1 > 0 { printf "    %5d added  %s\n", $1, $3 }'
done
[ -n "$carrier" ] || printf '  %5d removed from inside the range in all\n' "$all_in"

# A file an in-range commit adds and the tip lacks was born and died inside the range.
dead=$(git log --reverse --diff-filter=A --format='commit %h' --name-only "$range" -- "$@" | while IFS= read -r line; do
    case $line in
    '') ;;
    'commit '*) c=${line#commit } ;;
    *) git cat-file -e "$tip:$line" 2>/dev/null || printf '  %s  %s\n' "$c" "$line" ;;
    esac
done)
[ -z "$dead" ] || printf '\nfiles born and removed inside the range, by the commit that added them\n%s\n' "$dead"
