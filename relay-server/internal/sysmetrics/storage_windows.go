//go:build !linux

package sysmetrics

// GetStorageInfo returns fallback disk space metrics on non-Linux platforms.
func GetStorageInfo(dataDir string) (float64, float64, int) {
	return 11.4, 0.1, 1
}
