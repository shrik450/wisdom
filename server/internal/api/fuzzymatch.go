package api

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/shrik450/wisdom/internal/workspace"
)

type FuzzyResult struct {
	Path  string `json:"path"`
	Score int    `json:"score"`
	IsDir bool   `json:"isDir"`
}

func isSegmentSeparator(r rune) bool {
	return r == '/' || r == '-' || r == '_' || r == '.'
}

// FuzzyMatch scores how well query matches candidate as a subsequence.
// Returns (score, true) on match, (0, false) if query is not a subsequence.
func FuzzyMatch(query, candidate string) (int, bool) {
	if query == "" {
		return 0, false
	}

	qRunes := []rune(strings.ToLower(query))
	cRunes := []rune(candidate)
	cLower := []rune(strings.ToLower(candidate))

	qLen := len(qRunes)
	cLen := len(cLower)

	// Forward scan: verify subsequence exists, find end position.
	qi := 0
	endPos := 0
	for ci := 0; ci < cLen && qi < qLen; ci++ {
		if cLower[ci] == qRunes[qi] {
			qi++
			endPos = ci
		}
	}
	if qi < qLen {
		return 0, false
	}

	// Backward scan from endPos: find tightest match window.
	qi = qLen - 1
	startPos := endPos
	for ci := endPos; ci >= 0 && qi >= 0; ci-- {
		if cLower[ci] == qRunes[qi] {
			startPos = ci
			qi--
		}
	}

	// Find last slash position for filename bonus.
	lastSlash := -1
	for i := cLen - 1; i >= 0; i-- {
		if cRunes[i] == '/' {
			lastSlash = i
			break
		}
	}

	// Score the match window.
	score := 0
	qi = 0
	consecutiveRun := 0
	// No position can equal -2, so the first match never looks consecutive.
	lastMatchPos := -2

	for ci := startPos; ci <= endPos && qi < qLen; ci++ {
		if cLower[ci] != qRunes[qi] {
			// Gap character inside match window.
			score--
			consecutiveRun = 0
			continue
		}

		// Base match score.
		score++

		// Consecutive bonus.
		if lastMatchPos == ci-1 {
			consecutiveRun++
			score += 3 * consecutiveRun
		} else {
			consecutiveRun = 0
		}

		// Segment start bonus.
		if ci == 0 || isSegmentSeparator(cRunes[ci-1]) {
			score += 8
		}

		// CamelCase boundary bonus.
		if ci > 0 && unicode.IsUpper(cRunes[ci]) && unicode.IsLower(cRunes[ci-1]) {
			score += 6
		}

		// Filename region bonus.
		if ci > lastSlash {
			score += 3
		}

		lastMatchPos = ci
		qi++
	}

	// Path length penalty: shorter paths preferred.
	score -= utf8.RuneCountInString(candidate) / 5

	return score, true
}

func FuzzySearch(query string, entries []workspace.WalkEntry, limit int) []FuzzyResult {
	if query == "" || limit <= 0 {
		return nil
	}

	var results []FuzzyResult

	for _, entry := range entries {
		score, ok := FuzzyMatch(query, entry.Path)
		if !ok {
			continue
		}
		results = append(results, FuzzyResult{
			Path:  entry.Path,
			Score: score,
			IsDir: entry.IsDir,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if len(results) > limit {
		results = results[:limit]
	}

	return results
}
